"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import GuidanceConfig from '@/components/guidance/GuidanceConfig';
import GuidanceAudioStreamer from '@/components/guidance/GuidanceAudioStreamer';
import ChatHistory from '@/components/guidance/ChatHistory';
import { BookOpen, Clock, LogOut, Sparkles } from 'lucide-react';

export default function GuidancePage() {
  const [isActive, setIsActive] = useState(false);
  const audioStreamerRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [currentAiMessage, setCurrentAiMessage] = useState("");
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [hasTranscript, setHasTranscript] = useState(false);

  // Frontend-only elapsed timer (counts up)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);

  const [guidanceConfig, setGuidanceConfig] = useState({
    subject: "Java",
    subtopic: "Core",
  });

  // ── Elapsed timer (frontend-only, counts up) ──
  useEffect(() => {
    if (isActive) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ── Session controls ──

  const startSession = () => {
    setMessages([]);
    setCurrentAiMessage("");
    currentAiMessageRef.current = "";
    setIsAiSpeaking(false);
    setElapsedSeconds(0);
    setIsActive(true);
  };

  const endSession = () => {
    audioStreamerRef.current?.signalEndSession();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsActive(false);
    setCurrentAiMessage("");
    setIsAiSpeaking(false);
  };

  const handleDoneClick = () => {
    audioStreamerRef.current?.signalResponseComplete();
    setHasTranscript(false); // disable button until next transcript arrives
    setCurrentAiMessage("");
    setIsAiSpeaking(false);
  };

  // Ref to accumulate AI tokens — avoids reading stale state in callbacks
  const currentAiMessageRef = useRef("");

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
      setMessages(msgs => [...msgs, { role: 'teacher', text: completedText }]);
    }
    currentAiMessageRef.current = "";
    setCurrentAiMessage("");
  }, []);

  const handleSessionId = useCallback((sessionId) => {
    console.log("Guidance session ID:", sessionId);
  }, []);

  const handleSessionEnded = useCallback(() => {
    setIsActive(false);
    setCurrentAiMessage("");
    setIsAiSpeaking(false);
    setHasTranscript(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleTranscriptReady = useCallback(() => {
    setHasTranscript(true);
  }, []);

  const handleUserTranscript = useCallback((text) => {
    setMessages(msgs => [...msgs, { role: 'student', text }]);
  }, []);

  const showConfig = !isActive;

  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-50 dark:bg-transparent p-6 sm:p-12 text-slate-800 dark:text-slate-200 font-sans transition-colors duration-300">
      {/* Active Session Header Controls */}
      {isActive && (
        <div className="mb-6 flex w-full max-w-4xl justify-end animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-4">
            {/* Elapsed timer */}
            <div className="flex items-center gap-2 rounded-full bg-white dark:bg-slate-900/40 dark:backdrop-blur-md border border-slate-200 dark:border-white/10 px-4 py-2 shadow-sm">
              <Clock className="h-4 w-4 text-emerald-500" />
              <span className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                {formatTime(elapsedSeconds)}
              </span>
            </div>

            <button
              onClick={endSession}
              className="flex items-center gap-2 rounded-full bg-red-50 dark:bg-red-500/20 border border-red-200 dark:border-red-500/30 px-5 py-2 text-sm font-semibold text-red-600 dark:text-red-400 transition-all hover:bg-red-100 dark:hover:bg-red-500/30 hover:shadow-sm active:scale-95"
            >
              <LogOut className="h-4 w-4" />
              End Session
            </button>
          </div>
        </div>
      )}

      {showConfig ? (
        <div className="flex w-full flex-1 flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500">
          <GuidanceConfig 
            onChange={setGuidanceConfig} 
            disabled={isActive} 
            onFinish={startSession}
          />
        </div>
      ) : (
        <div className="w-full max-w-4xl flex flex-col gap-6 animate-in slide-in-from-bottom-8 duration-500">
          {/* Chat history card */}
          <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 dark:backdrop-blur-xl p-2 shadow-xl shadow-slate-200/50 dark:shadow-none flex-1 min-h-[500px] flex flex-col overflow-hidden relative">
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white dark:from-slate-900/80 to-transparent z-10 pointer-events-none" />
            <div className="flex-1 overflow-y-auto px-4 py-6 relative z-0">
              <ChatHistory
                messages={messages}
                isAiSpeaking={isAiSpeaking}
                currentAiMessage={currentAiMessage}
              />
            </div>
          </div>

          {/* Audio streamer + controls */}
          {isActive && (
            <div className="mt-4 flex items-center justify-center gap-4">
              <GuidanceAudioStreamer
                ref={audioStreamerRef}
                isActive={isActive}
                config={guidanceConfig}
                onAiToken={handleAiToken}
                onAiTurnEnd={handleAiTurnEnd}
                onSessionId={handleSessionId}
                onSessionEnded={handleSessionEnded}
                onTranscriptReady={handleTranscriptReady}
                onUserTranscript={handleUserTranscript}
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-4 mt-2">
            <button
              onClick={handleDoneClick}
              disabled={!hasTranscript || isAiSpeaking}
              className={`rounded-full px-10 py-4 font-bold shadow-xl transition-all active:scale-95 text-lg ${
                hasTranscript && !isAiSpeaking
                  ? 'bg-emerald-600 text-white shadow-emerald-600/30 hover:bg-emerald-700 hover:scale-105 cursor-pointer'
                  : 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-slate-500 shadow-none cursor-not-allowed'
              }`}
            >
              Done Speaking
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
