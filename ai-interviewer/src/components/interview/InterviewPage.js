"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MessageSquare, User, Bot, Code2, Send, Brain } from 'lucide-react';
import VideoCapture from '@/components/interview/VideoCapture';
import AudioStreamer from '@/components/interview/audioStreamer';
import InterviewConfig from '@/components/interview/InterviewConfig';
import EvaluationReport from '@/components/interview/EvaluationReport';
import CodeEditor from '@/components/interview/CodeEditor';

const LottiePlayer = dynamic(
  () => import('@lottiefiles/react-lottie-player').then((mod) => mod.Player),
  { ssr: false, loading: () => <div className="w-full h-full bg-slate-100 rounded-full animate-pulse" /> }
);

const SUBJECT_ICONS = {
  Python: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/python/python-original.svg",
  Java: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/java/java-original.svg",
  JavaScript: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg",
  Database: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/mysql/mysql-original.svg",
  "Soft Skills": () => <Brain className="w-5 h-5 text-slate-600" />
};

export default function InterviewPage() {
  const [isActive, setIsActive] = useState(false);
  const [isInterviewStarted, setIsInterviewStarted] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const socketRef = useRef(null);
  const audioStreamerRef = useRef(null);
  const sessionIdRef = useRef(null);
  const visualInitSentRef = useRef(false);

  const [evaluationReport, setEvaluationReport] = useState(null);
  const [reportId, setReportId] = useState(null);
  const [isEnding, setIsEnding] = useState(false);
  const [closingReceived, setClosingReceived] = useState(false);
  const [isTimerZero, setIsTimerZero] = useState(false);
  const [isConfigFinished, setIsConfigFinished] = useState(false);

  const isEndingRef = useRef(false);
  const sessionIdTimeoutRef = useRef(null);
  const timerSocketRef = useRef(null);

  const [currentAiMessage, setCurrentAiMessage] = useState("");
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [hasTranscript, setHasTranscript] = useState(false);
  const [messages, setMessages] = useState([]);
  const currentAiMessageRef = useRef("");
  const chatScrollRef = useRef(null);

  const [timeRemaining, setTimeRemaining] = useState(0);
  const timerRef = useRef(null);
  const hasAutoEnded = useRef(false);
  const codeContentRef = useRef('');

  const [interviewConfig, setInterviewConfig] = useState({
    subject: "Java",
    subtopic: "Core",
    difficulty: "Easy",
    time: 5,
    candidateName: "",
  });

  const onTimerZero = useCallback(() => {
    if (hasAutoEnded.current) return;
    hasAutoEnded.current = true;

    if (sessionIdTimeoutRef.current) {
      clearTimeout(sessionIdTimeoutRef.current);
      sessionIdTimeoutRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    audioStreamerRef.current?.signalTimerExpired();
    setAnalysis(null);
    setIsTimerZero(true);

    // Automatically trigger the end of the interview
    setTimeout(() => {
      audioStreamerRef.current?.signalResponseComplete("The interview time has expired. Conclude the interview immediately.");
    }, 100);

    if (!isEndingRef.current) {
      isEndingRef.current = true;
      setIsEnding(true);
      setClosingReceived(false);
    }
  }, []);

  useEffect(() => {
    if (isActive && isInterviewStarted && !isEnding && !evaluationReport) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            timerRef.current = null;
            if (!hasAutoEnded.current) {
              setTimeout(() => onTimerZero(), 0);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive, isInterviewStarted, isEnding, evaluationReport, onTimerZero]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isWarning = timeRemaining <= 30 && timeRemaining > 10;
  const isCritical = timeRemaining <= 10;
  const totalSeconds = interviewConfig.time * 60;
  const timerProgress = totalSeconds > 0 ? timeRemaining / totalSeconds : 0;

  const startInterview = () => {
    setIsInterviewStarted(true);
    setEvaluationReport(null);
    setReportId(null);
    setIsEnding(false);
    setClosingReceived(false);
    isEndingRef.current = false;
    setCurrentAiMessage("");
    setIsAiSpeaking(false);
    setHasTranscript(false);
    setMessages([]);
    currentAiMessageRef.current = "";
    hasAutoEnded.current = false;
    setTimeRemaining(interviewConfig.time * 60);
    sessionIdRef.current = null;
    visualInitSentRef.current = false;

    sessionIdTimeoutRef.current = setTimeout(() => {
      if (!sessionIdRef.current) {
        console.warn('[BUG-2 guard] session_id not received from audio bridge after 15 s.');
      }
    }, 15_000);

    const tws = new WebSocket('ws://localhost:8001/ws/timer');
    timerSocketRef.current = tws;
    tws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'timer_tick') {
        setTimeRemaining(msg.remaining);
      } else if (msg.type === 'timer_expired') {
        onTimerZero();
      } else if (msg.type === 'timer_reset') {
        onTimerZero();
        tws.close();
        timerSocketRef.current = null;
      }
    };
    tws.onerror = () => console.warn('[TimerSync] /ws/timer connection error - using local fallback.');
    tws.onclose = () => {
      timerSocketRef.current = null;
    };

    const visualSocket = new WebSocket('ws://localhost:8000/ws/visual-analysis');
    socketRef.current = visualSocket;

    visualSocket.onopen = () => {
      if (sessionIdRef.current) {
        visualSocket.send(JSON.stringify({ type: 'init', sessionId: sessionIdRef.current }));
        visualInitSentRef.current = true;
      }
    };
    visualSocket.onmessage = (event) => {
      setAnalysis(JSON.parse(event.data));
    };
    visualSocket.onclose = () => console.log('Visual-analysis WS closed.');

    setIsActive(true);
  };

  const handleFrame = useCallback((frameData) => {
    if (!visualInitSentRef.current) return;
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const base64Data = frameData.split(',')[1];
      socketRef.current.send(base64Data);
    }
  }, []);

  const handleEvaluation = (report) => {
    setEvaluationReport(report);
    setIsEnding(false);
    setClosingReceived(false);
    setIsTimerZero(false);
    setIsActive(false);
    setCurrentAiMessage("");
    setIsAiSpeaking(false);
    setTimeRemaining(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (timerSocketRef.current) {
      timerSocketRef.current.close();
      timerSocketRef.current = null;
    }

    // ── Persist report to user-service ──
    try {
      const auth = JSON.parse(localStorage.getItem('auth') || '{}');
      if (auth.token) {
        fetch('http://localhost:8082/api/reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth.token}`,
          },
          body: JSON.stringify({
            sessionId: sessionIdRef.current || `session-${Date.now()}`,
            subject: interviewConfig.subject,
            subtopic: interviewConfig.subtopic,
            difficulty: interviewConfig.difficulty,
            durationMinutes: interviewConfig.time,
            reportJson: report,
          }),
        })
          .then(async res => {
            if (res.ok) {
              const data = await res.json();
              console.log('[Report] Saved to database. ID:', data.id);
              setReportId(data.id);
            } else {
              console.warn('[Report] Failed to save:', res.status);
            }
          })
          .catch(err => console.warn('[Report] Save error:', err.message));
      }
    } catch (e) {
      console.warn('[Report] Could not persist report:', e.message);
    }
  };

  const handleStartAnotherInterview = () => {
    setEvaluationReport(null);
    setReportId(null);
    setIsEnding(false);
    setClosingReceived(false);
    setIsTimerZero(false);
    setIsConfigFinished(false);
    isEndingRef.current = false;
    setIsActive(false);
    setCurrentAiMessage("");
    setIsAiSpeaking(false);
    setTimeRemaining(0);
    setMessages([]);
    currentAiMessageRef.current = "";
    hasAutoEnded.current = false;
    sessionIdRef.current = null;
    visualInitSentRef.current = false;

    if (sessionIdTimeoutRef.current) {
      clearTimeout(sessionIdTimeoutRef.current);
      sessionIdTimeoutRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (timerSocketRef.current) {
      timerSocketRef.current.close();
      timerSocketRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setAnalysis(null);
  };

  const handleAiToken = useCallback((token) => {
    setIsAiSpeaking(true);
    currentAiMessageRef.current += token;
    setCurrentAiMessage(currentAiMessageRef.current);
  }, []);

  const handleAiTurnEnd = useCallback(() => {
    setIsAiSpeaking(false);
    // Move the completed AI message into chat history
    const completedText = currentAiMessageRef.current.trim();
    if (completedText) {
      setMessages(msgs => [...msgs, { role: 'interviewer', text: completedText }]);
    }
    currentAiMessageRef.current = "";
    setCurrentAiMessage("");
    if (isEndingRef.current) {
      setClosingReceived(true);
    }
  }, []);

  const handleUserTranscript = useCallback((text) => {
    setMessages(msgs => [...msgs, { role: 'user', text }]);
  }, []);

  // Auto-scroll chat when messages change
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, currentAiMessage]);

  // BUG FIX: Close the visual-analysis websocket as soon as the interview starts ending.
  // This triggers analysis-bridge to POST the behavioral report to the llm module
  // before the llm module times out waiting for it during evaluation.
  useEffect(() => {
    if (isEnding && socketRef.current) {
      console.log("Interview is ending, closing visual analysis websocket to trigger report generation...");
      socketRef.current.close();
      socketRef.current = null;
    }
  }, [isEnding]);

  const handleDoneClick = () => {
    const codeContent = codeContentRef.current?.trim() || '';
    audioStreamerRef.current?.signalResponseComplete(codeContent);
    setCurrentAiMessage("");
    setIsAiSpeaking(false);
    setHasTranscript(false); // disable button until next transcript arrives

    if (hasAutoEnded.current && !isEndingRef.current) {
      isEndingRef.current = true;
      setIsEnding(true);
      setClosingReceived(false);
    }
  };

  const handleEndSession = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    hasAutoEnded.current = true;
    setIsTimerZero(true);
    
    // Stop audio streamer timers
    audioStreamerRef.current?.signalTimerExpired();
    // Instantly wrap up
    setTimeout(() => {
      audioStreamerRef.current?.signalResponseComplete("The candidate had to leave early. Conclude the interview immediately.");
    }, 100);

    if (!isEndingRef.current) {
      isEndingRef.current = true;
      setIsEnding(true);
      setClosingReceived(false);
    }
  };

  const handleTranscriptReady = useCallback(() => {
    setHasTranscript(true);
  }, []);

  const handleSessionId = useCallback((sessionId) => {
    sessionIdRef.current = sessionId;

    if (sessionIdTimeoutRef.current) {
      clearTimeout(sessionIdTimeoutRef.current);
      sessionIdTimeoutRef.current = null;
    }

    const visualSocket = socketRef.current;
    if (visualSocket && visualSocket.readyState === WebSocket.OPEN) {
      visualSocket.send(JSON.stringify({ type: "init", sessionId }));
      visualInitSentRef.current = true;
      console.log("Visual-analysis init sent (from handleSessionId):", sessionId);
    }
  }, []);

  const [showIDE, setShowIDE] = useState(false);

  const showReport = Boolean(evaluationReport);
  const showConfig = !isActive && !showReport;

  if (isActive && !evaluationReport) {
    const domainIcon = SUBJECT_ICONS[interviewConfig.subject] || SUBJECT_ICONS['Python'];

    return (
      <div className="fixed inset-0 z-[100] bg-[#F4F6F9] dark:bg-transparent overflow-hidden flex flex-col font-sans transition-colors duration-300">
        
        {/* FULLSCREEN INITIALIZATION OVERLAY */}
        {!isInterviewStarted && (
          <div className="absolute inset-0 z-[200] bg-slate-900/60 dark:bg-slate-900/80 backdrop-blur-xl flex flex-col items-center justify-center">
            <div className="bg-white dark:bg-slate-900/50 p-12 rounded-[2.5rem] shadow-[0_0_80px_rgba(37,99,235,0.15)] dark:shadow-none border border-blue-50 dark:border-white/10 flex flex-col items-center max-w-lg text-center animate-in fade-in zoom-in-95 duration-500 backdrop-blur-xl">
              <div className="w-40 h-40 mb-2 flex items-center justify-center">
                <LottiePlayer
                  autoplay
                  loop
                  src="/ai_loading.json"
                  style={{ width: '100%', height: '100%', transform: 'scale(1.5)' }}
                />
              </div>
              <h2 className="text-3xl font-extrabold text-slate-800 dark:text-white mb-3 tracking-tight">Ready to Begin?</h2>
              <p className="text-base text-slate-500 dark:text-slate-300 mb-10 leading-relaxed max-w-sm">
                Your environment is loaded. Click below to start the interview and the AI will greet you immediately.
              </p>
              <button
                onClick={startInterview}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xl py-5 rounded-2xl shadow-xl shadow-blue-600/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3"
              >
                Start Interview
                <Send className="w-5 h-5 ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* Top Header Bar */}
        <header className="flex items-center justify-between px-6 py-4 bg-white/50 dark:bg-slate-900/40 backdrop-blur-md border-b border-slate-100 dark:border-white/10 shrink-0 transition-colors">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {typeof domainIcon === 'string' ? (
                <img src={domainIcon} alt={interviewConfig.subject} className="w-6 h-6" />
              ) : (
                domainIcon()
              )}
              <span className="text-xl font-serif text-slate-800 dark:text-slate-200 tracking-tight">Session</span>
            </div>
            <span className="px-3 py-1 bg-slate-200/50 dark:bg-white/10 text-slate-600 dark:text-slate-300 rounded-full text-xs font-semibold uppercase tracking-wider">
              {interviewConfig.subtopic}_{interviewConfig.subject.toLowerCase()}
            </span>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3">
            <div className={`
              h-2.5 w-2.5 rounded-full
              ${isCritical ? 'bg-red-500 animate-ping' : isWarning ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}
            `} />
            <div className={`font-mono text-xl font-bold tabular-nums ${isCritical ? 'text-red-600 dark:text-red-400' : isWarning ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200'}`}>
              {formatTime(timeRemaining)}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-sm font-semibold">
              <span className="text-slate-400 dark:text-slate-500">Difficulty: </span>
              <span className="text-orange-600 dark:text-orange-400">{interviewConfig.difficulty}</span>
            </div>
            <button
              onClick={handleEndSession}
              className="px-5 py-2.5 rounded-xl bg-white dark:bg-white/10 border border-slate-200 dark:border-white/20 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-white/20 transition-all shadow-sm dark:shadow-none text-sm"
            >
              End Session
            </button>
          </div>
        </header>

        {/* Main Split Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 p-6 min-h-0 overflow-hidden">
          
          {/* Left Column: AI & User */}
          <div className="flex flex-col gap-6 h-full min-h-0">
            {/* AI Interviewer Card */}
            <div className="bg-white dark:bg-slate-900/40 dark:backdrop-blur-xl rounded-3xl border border-transparent dark:border-white/10 p-6 flex flex-col items-center justify-center shadow-sm dark:shadow-none flex-1 relative overflow-hidden min-h-0">
              <div className="absolute inset-0 bg-gradient-to-b from-blue-50/20 dark:from-blue-900/20 to-transparent pointer-events-none" />
              <div className="w-32 h-32 lg:w-40 lg:h-40 flex items-center justify-center rounded-full bg-blue-50/50 dark:bg-blue-500/10 mb-6 relative z-10 shrink-0">
                <LottiePlayer
                  autoplay
                  loop
                  src="/ai_icon.json"
                  style={{ width: '100%', height: '100%', transform: 'scale(1.2)' }}
                />
              </div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-1 z-10">AI Interviewer</h3>
              <p className="text-xs font-bold tracking-widest text-blue-500 dark:text-blue-400 uppercase z-10">
                {isAiSpeaking ? 'Speaking...' : 'Listening...'}
              </p>
            </div>

            {/* User Camera Card */}
            <div className="bg-white dark:bg-slate-900/40 dark:backdrop-blur-xl border border-transparent dark:border-white/10 rounded-3xl p-4 shadow-sm dark:shadow-none flex-1 flex flex-col min-h-0">
              <div className="w-full flex-1 rounded-2xl overflow-hidden bg-slate-900 shadow-inner relative">
                <VideoCapture isActive={isActive} onFrame={handleFrame} analysis={analysis} />
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col relative h-full overflow-hidden">
            
            {/* Chat Area */}
            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto p-8 flex flex-col gap-6"
            >
              {messages.length === 0 && !currentAiMessage && (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 gap-3">
                  <Bot className="w-10 h-10 opacity-50" />
                  <p className="text-sm font-medium">The interview conversation will appear here</p>
                </div>
              )}

              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div className={`
                    flex h-10 w-10 shrink-0 items-center justify-center rounded-full
                    ${msg.role === 'user'
                      ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                      : 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400'}
                  `}>
                    {msg.role === 'user' ? <User className="h-5 w-5" /> : <span className="font-bold text-sm">AI</span>}
                  </div>
                  <div className={`
                    max-w-[75%] rounded-3xl px-6 py-4 text-base leading-relaxed
                    ${msg.role === 'user'
                      ? 'bg-blue-600 dark:bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-[#F9FAFB] dark:bg-white/5 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-white/10 rounded-tl-sm'}
                  `}>
                    {msg.text}
                  </div>
                </div>
              ))}

              {currentAiMessage && (
                <div className="flex gap-4 flex-row">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400">
                    <span className="font-bold text-sm">AI</span>
                  </div>
                  <div className="max-w-[75%] rounded-3xl rounded-tl-sm px-6 py-4 text-base leading-relaxed bg-[#F9FAFB] dark:bg-white/5 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-white/10 shadow-sm dark:shadow-none">
                    {currentAiMessage}
                    <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-slate-400 dark:bg-slate-500 align-text-bottom" />
                  </div>
                </div>
              )}

              {isAiSpeaking && !currentAiMessage && (
                <div className="flex gap-4 flex-row">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400">
                    <span className="font-bold text-sm">AI</span>
                  </div>
                  <div className="rounded-3xl rounded-tl-sm px-6 py-4 bg-[#F9FAFB] dark:bg-white/5 border border-slate-100 dark:border-white/10 shadow-sm dark:shadow-none">
                    <div className="flex gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* IDE Overlay / Slide-up */}
            {showIDE && (
              <div className="absolute bottom-[88px] left-0 right-0 h-3/5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-white/10 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.5)] z-10 flex flex-col">
                <div className="flex items-center justify-between px-6 py-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-white/10">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2"><Code2 className="w-4 h-4 text-indigo-500" /> Code Editor</span>
                  <button onClick={() => setShowIDE(false)} className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white px-2 py-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Close</button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <CodeEditor
                    subject={interviewConfig.subject}
                    onCodeChange={(code) => { codeContentRef.current = code; }}
                    collapsed={false}
                  />
                </div>
              </div>
            )}

            {/* Footer Controls */}
            <div className="border-t border-slate-100 dark:border-white/10 bg-white/50 dark:bg-slate-900/40 backdrop-blur-xl px-8 py-5 flex items-center justify-between relative z-20">
              <div className="flex items-center gap-4">
                <AudioStreamer
                  ref={audioStreamerRef}
                  isActive={isActive && isInterviewStarted}
                  config={interviewConfig}
                  onEvaluation={handleEvaluation}
                  onAiToken={handleAiToken}
                  onAiTurnEnd={handleAiTurnEnd}
                  onSessionId={handleSessionId}
                  onTranscriptReady={handleTranscriptReady}
                  onUserTranscript={handleUserTranscript}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowIDE(!showIDE)}
                  className={`flex items-center gap-2 px-5 py-3 rounded-full font-semibold transition-all ${showIDE ? 'bg-indigo-100 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-300' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20'}`}
                >
                  <Code2 className="w-4 h-4" />
                  <span className="text-sm">IDE</span>
                </button>
                <button
                  onClick={handleDoneClick}
                  disabled={!hasTranscript || isAiSpeaking}
                  className={`flex items-center justify-center w-12 h-12 rounded-full transition-all ${
                    hasTranscript && !isAiSpeaking
                      ? 'bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-400 dark:hover:bg-slate-500 cursor-pointer shadow-sm hover:scale-105'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                  }`}
                >
                  <Send className="w-5 h-5 ml-1" />
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-50 dark:bg-transparent transition-colors duration-300 p-4 sm:p-8 text-slate-800 dark:text-slate-200 font-sans">
      <div className="mb-6 flex w-full max-w-[1400px] justify-end">
        {showReport && (
          <button
            onClick={handleStartAnotherInterview}
            className="rounded-full bg-blue-600 px-5 py-2.5 font-medium text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700"
          >
            Start another interview
          </button>
        )}
      </div>

      <div
        className={`
          w-full gap-6
          ${showReport
            ? 'flex flex-col items-center w-full max-w-6xl mx-auto'
            : showConfig
              ? 'flex flex-col items-center justify-center max-w-4xl mx-auto mt-10'
              : 'hidden'}
        `}
      >
        {showConfig && (
          <div className="w-full">
            <InterviewConfig 
              onChange={setInterviewConfig} 
              onFinish={() => {
                setIsConfigFinished(true);
                setIsActive(true);
              }}
              disabled={isActive || showReport} 
            />
          </div>
        )}

        {showReport && (
          <div className="w-full bg-white dark:bg-transparent rounded-3xl shadow-sm dark:shadow-none overflow-hidden">
            <EvaluationReport report={evaluationReport} compact={false} reportId={reportId} />
          </div>
        )}
      </div>
    </main>
  );
}
