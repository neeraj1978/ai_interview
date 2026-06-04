"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Monitor, Coffee, FileCode2, Database, Brain, ArrowRight, ArrowLeft, CheckCircle2, ChevronRight, Settings2, Users, MessageSquare, ShieldCheck, Handshake } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const SUBJECT_SUBTOPICS = {
  Python:     ["Core", "Scikit-learn", "Django", "FastAPI", "Pandas"],
  Java:       ["Core", "Spring", "Spring Boot", "Hibernate"],
  JavaScript: ["Core", "Node.js", "React", "Next.js", "TypeScript"],
  Database:   ["SQL", "NoSQL", "Redis", "Cassandra", "MongoDB"],
  "Soft Skills": ["Leadership", "Communication", "Conflict Resolution", "Teamwork"],
};

const SUBJECT_ICONS = {
  Python: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/python/python-original.svg",
  Java: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/java/java-original.svg",
  JavaScript: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg",
  Database: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/mysql/mysql-original.svg",
  "Soft Skills": () => <Brain className="w-5 h-5 text-slate-600" />
};

const SUBTOPIC_ICONS = {
  // Python
  "Core": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/c/c-plain.svg",
  "Scikit-learn": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/scikitlearn/scikitlearn-original.svg",
  "Django": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/django/django-plain.svg",
  "FastAPI": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/fastapi/fastapi-original.svg",
  "Pandas": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/pandas/pandas-original.svg",
  // Java
  "Spring": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/spring/spring-original.svg",
  "Spring Boot": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/spring/spring-original.svg",
  "Hibernate": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/hibernate/hibernate-original.svg",
  // JavaScript
  "Node.js": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nodejs/nodejs-original.svg",
  "React": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/react/react-original.svg",
  "Next.js": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nextjs/nextjs-original.svg",
  "TypeScript": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/typescript/typescript-original.svg",
  // Database
  "SQL": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/azuresqldatabase/azuresqldatabase-original.svg",
  "NoSQL": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/mongodb/mongodb-original.svg",
  "Redis": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/redis/redis-original.svg",
  "Cassandra": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/apache/apache-original.svg",
  "MongoDB": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/mongodb/mongodb-original.svg",
  // Soft Skills
  "Leadership": () => <Handshake className="w-5 h-5 text-slate-600" />,
  "Communication": () => <MessageSquare className="w-5 h-5 text-slate-600" />,
  "Conflict Resolution": () => <ShieldCheck className="w-5 h-5 text-slate-600" />,
  "Teamwork": () => <Users className="w-5 h-5 text-slate-600" />,
};

const DIFFICULTIES = [
  { id: "Easy", desc: "Basic concepts & definitions" },
  { id: "Intermediate", desc: "Practical application & scenarios" },
  { id: "Advanced", desc: "Complex problems & system design" }
];

const InterviewConfig = ({ onChange, onFinish, disabled }) => {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  
  const [subject, setSubject] = useState("");
  const [isCustomSubject, setIsCustomSubject] = useState(false);
  const [customSubjectText, setCustomSubjectText] = useState("");

  const [subtopic, setSubtopic] = useState("");
  const [isCustomSubtopic, setIsCustomSubtopic] = useState(false);
  const [customSubtopicText, setCustomSubtopicText] = useState("");

  const [difficulty, setDifficulty] = useState("");
  const [duration, setDuration] = useState(15);
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [candidateName, setCandidateName] = useState(user?.fullName || "Candidate");

  // Propagate config to parent on every change, even if not finished
  useEffect(() => {
    const finalSubject = isCustomSubject ? customSubjectText : subject;
    const finalSubtopic = isCustomSubtopic ? customSubtopicText : subtopic;
    onChange({ 
      subject: finalSubject, 
      subtopic: finalSubtopic, 
      difficulty: difficulty || "Intermediate", 
      time: duration, 
      candidateName 
    });
  }, [subject, isCustomSubject, customSubjectText, subtopic, isCustomSubtopic, customSubtopicText, difficulty, duration, candidateName, onChange]);

  const handleNext = () => {
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const getSubtopics = () => {
    if (isCustomSubject) return [];
    return SUBJECT_SUBTOPICS[subject] || [];
  };

  const canProceed = () => {
    if (step === 1) return isCustomSubject ? customSubjectText.trim().length > 0 : subject.length > 0;
    if (step === 2) return isCustomSubtopic ? customSubtopicText.trim().length > 0 : subtopic.length > 0;
    if (step === 3) return difficulty.length > 0;
    return true;
  };

  return (
    <div className="w-full bg-white dark:bg-slate-900/40 dark:backdrop-blur-xl rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-none border border-slate-100 dark:border-white/10 overflow-hidden flex flex-col items-center p-8 sm:p-12 animate-in fade-in zoom-in-95 duration-500 transition-colors">
      
      {/* Header */}
      <div className="text-center mb-10 w-full max-w-2xl">
        <h2 className="text-3xl sm:text-4xl font-serif font-bold text-slate-900 dark:text-white tracking-tight mb-3">
          Configure Session
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base">
          Select your expertise area. The difficulty will dynamically adapt based on your answers.
        </p>
      </div>

      {/* Main Wizard Card */}
      <div className="w-full max-w-2xl bg-white dark:bg-white/5 rounded-3xl border border-slate-100 dark:border-white/5 shadow-sm p-6 sm:p-10 relative overflow-hidden">
        
        {/* Stepper Progress */}
        <div className="flex items-center gap-2 mb-10">
          {[1, 2, 3, 4].map((s) => (
            <div 
              key={s} 
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                s <= step ? 'bg-slate-800 dark:bg-indigo-500' : 'bg-slate-100 dark:bg-white/10'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Core Domain */}
        {step === 1 && (
          <div className="animate-in slide-in-from-right-4 fade-in duration-300">
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6">Select Core Domain</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.keys(SUBJECT_ICONS).map((s) => {
                const IconOrUrl = SUBJECT_ICONS[s];
                const isSelected = !isCustomSubject && subject === s;
                return (
                  <button
                    key={s}
                    disabled={disabled}
                    onClick={() => { setSubject(s); setIsCustomSubject(false); }}
                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                      isSelected 
                        ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/20 shadow-sm dark:shadow-none' 
                        : 'border-slate-100 dark:border-white/5 hover:border-indigo-200 dark:hover:border-indigo-500/50 hover:bg-slate-50 dark:hover:bg-white/10'
                    }`}
                  >
                    <div className={`p-2 flex items-center justify-center rounded-xl ${isSelected ? 'bg-indigo-100 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-300' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'}`}>
                      {typeof IconOrUrl === 'string' ? (
                        <img src={IconOrUrl} alt={s} className="w-5 h-5" />
                      ) : (
                        <IconOrUrl />
                      )}
                    </div>
                    <span className={`font-semibold ${isSelected ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>{s}</span>
                  </button>
                );
              })}
              
              {/* Custom Subject Card */}
              <button
                disabled={disabled}
                onClick={() => { setIsCustomSubject(true); setSubject(""); }}
                className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                  isCustomSubject 
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/20 shadow-sm dark:shadow-none' 
                    : 'border-slate-100 dark:border-white/5 hover:border-indigo-200 dark:hover:border-indigo-500/50 hover:bg-slate-50 dark:hover:bg-white/10'
                }`}
              >
                <div className={`p-2 flex items-center justify-center rounded-xl ${isCustomSubject ? 'bg-indigo-100 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-300' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'}`}>
                  <Settings2 className="w-5 h-5" />
                </div>
                <span className={`font-semibold ${isCustomSubject ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>Custom...</span>
              </button>
            </div>

            {isCustomSubject && (
              <div className="mt-6 animate-in fade-in slide-in-from-top-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Custom Domain Name</label>
                <input
                  type="text"
                  placeholder="e.g. C++, Go, Ruby..."
                  value={customSubjectText}
                  onChange={(e) => setCustomSubjectText(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                />
              </div>
            )}
          </div>
        )}

        {/* Step 2: Subtopic */}
        {step === 2 && (
          <div className="animate-in slide-in-from-right-4 fade-in duration-300">
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6">Select Sub-domain</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {getSubtopics().map((st) => {
                const isSelected = !isCustomSubtopic && subtopic === st;
                const iconUrl = st === "Core" ? SUBJECT_ICONS[subject] : SUBTOPIC_ICONS[st];
                return (
                  <button
                    key={st}
                    disabled={disabled}
                    onClick={() => { setSubtopic(st); setIsCustomSubtopic(false); }}
                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                      isSelected 
                        ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/20 shadow-sm dark:shadow-none' 
                        : 'border-slate-100 dark:border-white/5 hover:border-indigo-200 dark:hover:border-indigo-500/50 hover:bg-slate-50 dark:hover:bg-white/10'
                    }`}
                  >
                    <div className={`flex items-center justify-center p-1.5 rounded-lg flex-shrink-0 ${isSelected ? 'bg-indigo-100 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-300' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'}`}>
                      {typeof iconUrl === 'string' ? (
                        <img src={iconUrl} alt={st} className="w-5 h-5" />
                      ) : typeof iconUrl === 'function' ? (
                        React.createElement(iconUrl)
                      ) : (
                        <div className={`w-2 h-2 rounded-full m-1.5 ${isSelected ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-slate-400 dark:bg-slate-500'}`} />
                      )}
                    </div>
                    <span className={`font-semibold ${isSelected ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>{st}</span>
                  </button>
                );
              })}
              
              {/* Custom Subtopic Card */}
              <button
                disabled={disabled}
                onClick={() => { setIsCustomSubtopic(true); setSubtopic(""); }}
                className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                  isCustomSubtopic 
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/20 shadow-sm dark:shadow-none' 
                    : 'border-slate-100 dark:border-white/5 hover:border-indigo-200 dark:hover:border-indigo-500/50 hover:bg-slate-50 dark:hover:bg-white/10'
                }`}
              >
                <div className={`flex items-center justify-center p-1.5 rounded-lg flex-shrink-0 ${isCustomSubtopic ? 'bg-indigo-100 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-300' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'}`}>
                  <div className={`w-2 h-2 rounded-full m-1.5 ${isCustomSubtopic ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-slate-400 dark:bg-slate-500'}`} />
                </div>
                <span className={`font-semibold ${isCustomSubtopic ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>Custom...</span>
              </button>
            </div>

            {isCustomSubtopic && (
              <div className="mt-6 animate-in fade-in slide-in-from-top-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Custom Sub-domain Name</label>
                <input
                  type="text"
                  placeholder="e.g. Hooks, Multithreading..."
                  value={customSubtopicText}
                  onChange={(e) => setCustomSubtopicText(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                />
              </div>
            )}
          </div>
        )}

        {/* Step 3: Difficulty */}
        {step === 3 && (
          <div className="animate-in slide-in-from-right-4 fade-in duration-300">
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6">Select Difficulty</h3>
            <div className="flex flex-col gap-3">
              {DIFFICULTIES.map((d) => {
                const isSelected = difficulty === d.id;
                return (
                  <button
                    key={d.id}
                    disabled={disabled}
                    onClick={() => setDifficulty(d.id)}
                    className={`flex flex-col p-5 rounded-2xl border-2 text-left transition-all ${
                      isSelected 
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-500/20 shadow-sm dark:shadow-none' 
                        : 'border-slate-100 dark:border-white/5 hover:border-indigo-200 dark:hover:border-indigo-500/50 hover:bg-slate-50 dark:hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className={`font-bold text-lg ${isSelected ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-200'}`}>
                        {d.id}
                      </span>
                      {isSelected && <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
                    </div>
                    <span className={`text-sm ${isSelected ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      {d.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: Duration */}
        {step === 4 && (
          <div className="animate-in slide-in-from-right-4 fade-in duration-300">
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Set Duration</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">Choose how long you want the interview to last.</p>
            
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-3xl p-8 border border-slate-100 dark:border-white/10 text-center relative">
              <div className="text-6xl font-black text-slate-900 dark:text-white mb-2 tabular-nums tracking-tighter">
                {duration}
              </div>
              <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-8">
                Minutes
              </div>

              <input 
                type="range" 
                min="5" 
                max="30" 
                step="1"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              
              <div className="flex justify-between text-xs font-bold text-slate-400 dark:text-slate-500 mt-3 px-1 mb-6">
                <span>5m</span>
                <span>15m</span>
                <span>30m</span>
              </div>

              {/* Custom Duration Checkbox/Input */}
              <div className="pt-6 border-t border-slate-100 dark:border-white/10 flex flex-col items-center gap-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCustomDuration}
                    onChange={(e) => setIsCustomDuration(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Use Custom Duration
                </label>
                
                {isCustomDuration && (
                  <div className="flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={duration}
                      onChange={(e) => setDuration(Math.max(1, Math.min(120, Number(e.target.value))))}
                      className="w-24 px-4 py-2 rounded-xl border-2 border-indigo-200 dark:border-indigo-500/50 bg-white dark:bg-slate-900/50 text-center font-bold text-lg focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                    />
                    <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">minutes</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="mt-10 pt-6 border-t border-slate-100 dark:border-white/10 flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={step === 1 || disabled}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-colors ${
              step === 1 ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          
          {step < 4 ? (
            <button
              onClick={handleNext}
              disabled={!canProceed() || disabled}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-slate-900 dark:bg-indigo-600 text-white text-sm font-bold shadow-md hover:bg-slate-800 dark:hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onChange && onFinish ? () => {
                const finalSubject = isCustomSubject ? customSubjectText : subject;
                const finalSubtopic = isCustomSubtopic ? customSubtopicText : subtopic;
                onChange({ subject: finalSubject, subtopic: finalSubtopic, difficulty, time: duration, candidateName });
                onFinish();
              } : undefined}
              disabled={disabled}
              className="text-sm font-semibold text-white flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 transition-all px-5 py-2.5 rounded-full shadow-lg"
            >
              <CheckCircle2 className="w-4 h-4" />
              Setup Complete
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

export default InterviewConfig;
