"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Bot, User, Send, Loader2,
  CheckCircle2, SkipForward, RefreshCw,
  Target, BookOpen, Wrench, BarChart3, FileText, Sun, Moon
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from 'next-themes';

const FIRST_QUESTION =
  "Welcome! Tell me about your background, the kind of role you are targeting, " +
  "and which technical area you want to practice most.";

const LottiePlayer = dynamic(
  () => import('@lottiefiles/react-lottie-player').then((mod) => mod.Player),
  { ssr: false, loading: () => <div className="w-full h-full bg-slate-100 rounded-xl animate-pulse" /> }
);

const LLM_API = 'http://localhost:8080/api/profile/analyze';
const PROFILE_API = 'http://localhost:8082/api/profile/me';

const LEVEL_COLORS = {
  easy: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  intermediate: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  advanced: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
};

export default function OnboardingPage() {
  const { user, setProfileComplete } = useAuth();
  const router = useRouter();
  const { setTheme } = useTheme();
  
  // Profile view state
  const [existingProfile, setExistingProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [mode, setMode] = useState('loading'); // 'loading' | 'profile' | 'onboarding'

  // Chat state
  const [messages, setMessages] = useState([
    { role: 'ai', text: FIRST_QUESTION },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnNumber, setTurnNumber] = useState(1);
  const [context, setContext] = useState('');
  const [completed, setCompleted] = useState(false);
  const [derivedProfile, setDerivedProfile] = useState(null);
  const [saving, setSaving] = useState(false);

  const chatRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch existing profile on mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const auth = JSON.parse(localStorage.getItem('auth') || '{}');
        if (!auth.token) {
          setMode('onboarding');
          setProfileLoading(false);
          return;
        }

        const res = await fetch(PROFILE_API, {
          headers: { 'Authorization': `Bearer ${auth.token}` },
        });

        if (res.ok && res.status !== 204) {
          const data = await res.json();
          if (data && data.targetRole) {
            setExistingProfile(data);
            setMode('profile');
          } else {
            setMode('onboarding');
          }
        } else {
          setMode('onboarding');
        }
      } catch (err) {
        console.warn('[Onboarding] Failed to fetch profile:', err.message);
        setMode('onboarding');
      } finally {
        setProfileLoading(false);
      }
    };

    fetchProfile();
  }, []);

  // Auto-scroll chat removed since we are using slide-based UI

  // Focus input after AI responds
  useEffect(() => {
    if (!loading && !completed && mode === 'onboarding' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [loading, completed, mode]);

  const saveProfile = async (profile) => {
    setSaving(true);
    try {
      const auth = JSON.parse(localStorage.getItem('auth') || '{}');
      const res = await fetch(PROFILE_API, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          targetRole: profile?.targetRole,
          preferredDomain: profile?.preferredDomain,
          preferredSubdomain: profile?.preferredSubdomain,
          inferredLevel: profile?.inferredLevel,
          summary: profile?.summary,
        }),
      });

      if (res.ok) {
        setProfileComplete?.();
        setExistingProfile(profile);
        setTimeout(() => {
          setMode('theme_select');
          setCompleted(false);
          setMessages([{ role: 'ai', text: FIRST_QUESTION }]);
          setTurnNumber(1);
          setContext('');
        }, 2000);
      } else {
        console.warn('[Onboarding] Failed to save profile:', res.status);
        setTimeout(() => router.push('/app/dashboard'), 3000);
      }
    } catch (err) {
      console.warn('[Onboarding] Save error:', err.message);
      setTimeout(() => router.push('/app/dashboard'), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault();
    const answer = input.trim();
    if (!answer || loading) return;

    setMessages(prev => [...prev, { role: 'user', text: answer }]);
    setInput('');
    setLoading(true);

    const currentQuestion = messages[messages.length - 1]?.text || FIRST_QUESTION;
    const newContext = context
      ? `${context}\nQ${turnNumber}: ${currentQuestion}\nA${turnNumber}: ${answer}`
      : `Q${turnNumber}: ${currentQuestion}\nA${turnNumber}: ${answer}`;

    try {
      const res = await fetch(LLM_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answerText: answer,
          turnNumber,
          previousContext: newContext,
          targetRole: null,
        }),
      });

      if (!res.ok) throw new Error('Analysis failed');
      const data = await res.json();

      setContext(newContext);

      if (data.completed) {
        setDerivedProfile(data.derivedProfile);
        setCompleted(true);
        setMessages(prev => [...prev, {
          role: 'ai',
          text: `Great, I've got a good picture of your background! Here's what I've gathered:\n\n` +
            `🎯 Role: ${data.derivedProfile?.targetRole || 'Not specified'}\n` +
            `📚 Domain: ${data.derivedProfile?.preferredDomain || 'Not specified'}\n` +
            `🔧 Focus: ${data.derivedProfile?.preferredSubdomain || 'Not specified'}\n` +
            `📊 Level: ${data.derivedProfile?.inferredLevel || 'Not specified'}\n\n` +
            `Saving your profile...`
        }]);

        await saveProfile(data.derivedProfile);
      } else {
        setTurnNumber(data.turnNumber || turnNumber + 1);
        setMessages(prev => [...prev, { role: 'ai', text: data.nextQuestion }]);
      }
    } catch (err) {
      console.error('[Onboarding] Error:', err);
      setMessages(prev => [...prev, {
        role: 'ai',
        text: "I had trouble processing that. Could you try again?"
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, turnNumber, context]);

  const handleSkip = () => {
    router.push('/app/dashboard');
  };

  const handleRedoProfile = () => {
    setExistingProfile(null);
    setMode('onboarding');
    setMessages([{ role: 'ai', text: FIRST_QUESTION }]);
    setTurnNumber(1);
    setContext('');
    setCompleted(false);
    setDerivedProfile(null);
  };

  const progressStep = completed ? 3 : Math.min(turnNumber, 3);

  return (
    <div className="h-full p-2 sm:p-4 lg:p-6 overflow-hidden flex flex-col items-center">
      
      {/* Main Container */}
      <div className="w-full max-w-[98%] xl:max-w-[1400px] flex flex-col h-full bg-white/90 dark:bg-slate-900/40 backdrop-blur-xl rounded-[2rem] border border-white/40 dark:border-white/10 shadow-2xl shadow-slate-200/50 dark:shadow-none overflow-hidden relative transition-colors duration-300">
        
        {profileLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : mode === 'theme_select' ? (
          // ── Theme Selection Mode ──
          <div className="flex flex-col h-full items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center mb-6">
              <Sparkles className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-slate-900 dark:text-white tracking-tight mb-4 text-center">
              Choose Your Theme
            </h2>
            <p className="text-base sm:text-lg text-slate-500 dark:text-slate-400 max-w-md text-center mb-10">
              How would you like your AI Interviewer experience to look?
            </p>
            
            <div className="flex flex-col sm:flex-row gap-6 w-full max-w-2xl justify-center">
              <button
                onClick={() => { setTheme('light'); setMode('profile'); }}
                className="flex-1 group relative overflow-hidden rounded-3xl border-2 border-slate-200 hover:border-indigo-500 bg-slate-50 p-6 text-left transition-all hover:shadow-xl hover:shadow-indigo-500/10"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center">
                    <Sun className="w-6 h-6 text-amber-500" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Light Mode</h3>
                <p className="text-sm text-slate-500">Clean, bright, and focused.</p>
              </button>

              <button
                onClick={() => { setTheme('dark'); setMode('profile'); }}
                className="flex-1 group relative overflow-hidden rounded-3xl border-2 border-slate-700 hover:border-indigo-500 bg-slate-950 p-6 text-left transition-all hover:shadow-xl hover:shadow-indigo-500/20"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 rounded-full bg-slate-800 shadow-sm flex items-center justify-center">
                    <Moon className="w-6 h-6 text-indigo-400" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Dark Mode</h3>
                <p className="text-sm text-slate-400">Radiant dark blue and glassy.</p>
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </div>
        ) : mode === 'profile' && existingProfile ? (
          // ── Profile View Mode ──
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-slate-100 dark:border-white/10 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md shrink-0 z-10 transition-colors duration-300">
              <div className="flex items-center gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-slate-900 dark:from-indigo-400 dark:to-white tracking-normal leading-normal">Your Profile</h1>
                </div>
              </div>
              <button
                onClick={() => router.push('/app/dashboard')}
                className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-white/5 transition-colors px-5 py-2 rounded-xl border border-slate-200 dark:border-white/10"
              >
                Back to Dashboard
              </button>
            </div>

            {/* Profile Card Area */}
            <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-transparent p-4 sm:p-8 scroll-smooth transition-colors duration-300">
              <div className="w-full mx-auto">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="bg-white rounded-[1.5rem] border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden"
                >
                  {/* Profile header banner */}
                  <div className="relative h-56 sm:h-72 overflow-hidden bg-[#e58a62]">
                    <img 
                      src="/profile_cover.png" 
                      alt="Autumn cover" 
                      className="absolute inset-0 w-full h-full object-cover opacity-90"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#cf734b]/80 to-transparent" />
                    
                    <div className="absolute bottom-4 left-6 sm:bottom-6 sm:left-8 flex items-end gap-5">
                      <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-white shadow-xl border-4 border-white/30 relative overflow-hidden flex items-center justify-center p-0">
                         <LottiePlayer 
                            autoplay 
                            loop 
                            src="/profile.json" 
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', transform: 'scale(1.15)' }}
                         />
                      </div>
                      <div className="pb-2">
                        <h2 className="text-3xl sm:text-4xl font-serif font-bold text-white tracking-tight drop-shadow-lg">
                          {user?.fullName || 'User'}
                        </h2>
                        <p className="text-sm font-medium text-white/90 drop-shadow mt-0.5">
                          {existingProfile?.targetRole || user?.email}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Profile content */}
                  <div className="pt-8 pb-8 px-6 sm:px-8 bg-white/60 backdrop-blur-md">
                    <div className="flex items-start justify-between mb-8">
                      <div>
                        <h3 className="text-xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-slate-900 tracking-normal leading-normal">Professional Details</h3>
                      </div>
                      {existingProfile.inferredLevel && (() => {
                        const level = existingProfile.inferredLevel?.toLowerCase() || 'easy';
                        const colors = LEVEL_COLORS[level] || LEVEL_COLORS.easy;
                        return (
                          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider bg-[#f3d9b1]/30 text-[#c27653] border border-[#f3d9b1]`}>
                            {level}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Profile fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ProfileField
                        icon={<Target className="h-5 w-5" />}
                        label="Target Role"
                        value={existingProfile.targetRole}
                        bgColor="bg-[#f9e9cd]"
                        iconColor="text-[#c27653]"
                      />
                      <ProfileField
                        icon={<BookOpen className="h-5 w-5" />}
                        label="Preferred Domain"
                        value={existingProfile.preferredDomain}
                        bgColor="bg-[#e9d5c4]"
                        iconColor="text-[#b46849]"
                      />
                      <ProfileField
                        icon={<Wrench className="h-5 w-5" />}
                        label="Focus Area"
                        value={existingProfile.preferredSubdomain}
                        bgColor="bg-[#d2e4df]"
                        iconColor="text-[#598377]"
                      />
                      <ProfileField
                        icon={<BarChart3 className="h-5 w-5" />}
                        label="Skill Level"
                        value={existingProfile.inferredLevel}
                        bgColor="bg-[#f3d9b1]"
                        iconColor="text-[#c27653]"
                      />

                      {existingProfile.summary && (
                        <div className="pt-4 md:col-span-2">
                          <div className="flex items-center gap-2 mb-3 px-1">
                            <FileText className="h-4 w-4 text-slate-400" />
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Summary</span>
                          </div>
                          <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-2xl p-5 border border-slate-100 shadow-inner">
                            {existingProfile.summary}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-8">
                      <button
                        onClick={handleRedoProfile}
                        className="w-full sm:w-56 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/60 backdrop-blur-md text-slate-700 text-sm font-bold hover:bg-white/80 transition-all border border-slate-200/50 shadow-md hover:shadow-lg"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Redo Profiling
                      </button>
                      <button
                        onClick={() => router.push('/app/dashboard')}
                        className="w-full sm:w-56 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900/80 backdrop-blur-md text-white text-sm font-bold hover:bg-slate-900 transition-all border border-slate-700/50 shadow-md hover:shadow-lg"
                      >
                        Go to Dashboard
                      </button>
                    </div>
                  </div>
                </motion.div>

                {existingProfile.updatedAt && (
                  <p className="text-center text-xs font-medium text-slate-400 mt-6 tracking-wide">
                    Last updated: {new Date(existingProfile.updatedAt).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'long', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          // ── Onboarding Chat Mode ──
          <div className="flex flex-col h-full bg-slate-50/30 dark:bg-transparent transition-colors duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-slate-100 dark:border-white/10 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md shrink-0 z-10 shadow-sm transition-colors duration-300">
              <div className="flex items-center gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-slate-900 dark:to-orange-200 tracking-normal leading-normal">Set up your profile</h1>
                </div>
              </div>

              <div className="flex items-center gap-6">
                {/* Progress */}
                <div className="hidden md:flex items-center gap-2">
                  {[1, 2, 3].map(step => (
                    <div key={step} className="flex items-center gap-1.5">
                      <div className={`
                        h-1.5 w-10 rounded-full transition-all duration-500
                        ${step <= progressStep
                          ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.4)]'
                          : 'bg-slate-200'}
                      `} />
                    </div>
                  ))}
                  <span className="text-xs font-bold text-slate-400 ml-2 tracking-widest">
                    {progressStep}/3
                  </span>
                </div>

                {/* Skip button */}
                {!completed && (
                  <button
                    onClick={handleSkip}
                    className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-all px-4 py-2 rounded-xl border border-slate-200 bg-white/60 hover:bg-white shadow-sm hover:shadow"
                  >
                    <SkipForward className="h-4 w-4" />
                    <span className="hidden sm:inline">Skip for now</span>
                  </button>
                )}
              </div>
            </div>

            {/* Slide Area */}
            <div className="flex-1 overflow-hidden relative bg-slate-50/50 dark:bg-transparent">
              <AnimatePresence mode="wait">
                {completed ? (
                  /* Completion card */
                  <motion.div
                    key="completion"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.5 }}
                    className="absolute inset-0 flex flex-col items-center justify-center p-6"
                  >
                    <div className="bg-emerald-50 border border-emerald-200 rounded-[1.5rem] p-10 shadow-xl shadow-emerald-100/50 max-w-lg w-full text-center">
                      <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                      </div>
                      <h3 className="text-2xl font-bold text-emerald-900 mb-3">Profile saved successfully!</h3>
                      <p className="text-emerald-700 text-sm mb-8">
                        Personalizing your interview environment...
                      </p>
                      <div className="flex flex-col items-center gap-4">
                        <div className="h-16 w-16 rounded-full overflow-hidden border-2 border-emerald-200 bg-white">
                          <LottiePlayer autoplay loop src="/profile.json" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.15)' }} />
                        </div>
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 text-emerald-500 animate-spin" />
                          <span className="text-xs text-emerald-700 font-bold uppercase tracking-wider">Preparing Workspace</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  /* Question Slide */
                  <motion.div
                    key={turnNumber}
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                    className="absolute inset-0 flex flex-col items-center justify-center p-4 sm:p-6"
                  >
                    <div className="w-full max-w-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 shadow-2xl shadow-slate-200/40 dark:shadow-none rounded-[2rem] p-5 sm:p-8 flex flex-col items-center text-center">
                      {/* AI Avatar */}
                      <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full overflow-hidden bg-white dark:bg-slate-800 shadow-lg border-4 border-white/50 dark:border-slate-700/50 mb-4 flex-shrink-0">
                        <LottiePlayer autoplay loop src="/ai_icon.json" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.2)' }} />
                      </div>
                      
                      {/* Question Text */}
                      <h2 className="text-xl sm:text-2xl font-serif font-bold text-slate-800 dark:text-slate-100 leading-snug mb-5">
                        {messages.filter(m => m.role === 'ai').pop()?.text || "Let's get started!"}
                      </h2>

                      {/* Input Form */}
                      <form onSubmit={handleSubmit} className="w-full">
                        <div className="relative">
                          <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                              }
                            }}
                            placeholder="Type your answer here..."
                            disabled={loading}
                            rows={2}
                            className="w-full resize-none rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm px-6 py-4 text-[15px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 disabled:opacity-50 transition-all hover:border-slate-300 dark:hover:border-slate-600 shadow-inner mb-4"
                          />
                        </div>
                        
                        <div className="flex flex-col items-center gap-2">
                          <button
                            type="submit"
                            disabled={loading || !input.trim()}
                            className={`
                              flex items-center justify-center gap-2 px-8 py-3 rounded-xl transition-all w-full sm:w-auto min-w-[200px] text-sm font-bold
                              ${loading || !input.trim()
                                ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 cursor-not-allowed border border-slate-200 dark:border-slate-700'
                                : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white shadow-md hover:shadow-lg hover:-translate-y-0.5'}
                            `}
                          >
                            {loading ? (
                              <>
                                <Loader2 className="h-5 w-5 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                Next Step
                                <Send className="h-4 w-4 ml-1" />
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileField({ icon, label, value, bgColor = "bg-[#f9e9cd]", iconColor = "text-[#c27653]" }) {
  if (!value || value === 'unknown') return null;

  return (
    <div className="flex items-center justify-between p-4 sm:p-5 rounded-[1.25rem] bg-white border border-slate-100 hover:border-[#f3d9b1] hover:shadow-md transition-all group">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-[1rem] ${bgColor} ${iconColor} shrink-0 transition-transform group-hover:scale-105`}>
          {icon}
        </div>
        <div>
          <p className="text-[14px] sm:text-[15px] font-medium text-[#5c5450] tracking-tight">{label}</p>
          <p className="text-sm sm:text-base font-bold text-[#3d3633] mt-0.5">{value}</p>
        </div>
      </div>
    </div>
  );
}
