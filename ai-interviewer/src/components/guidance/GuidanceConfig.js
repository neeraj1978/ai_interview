"use client";

import { useState, useEffect } from 'react';
import { BookOpen, CheckCircle2, ChevronRight, ArrowLeft, Monitor, Database, Settings2, Code2, Network, Cpu, BrainCircuit, Search } from 'lucide-react';
import dynamic from 'next/dynamic';

const LottiePlayer = dynamic(
  () => import('@lottiefiles/react-lottie-player').then((mod) => mod.Player),
  { ssr: false }
);

const SUBJECTS = {
  "Java": ["Core", "Collections", "Multithreading", "Spring Boot", "JPA/Hibernate", "Streams API", "Custom"],
  "Python": ["Core", "Django", "Flask", "Data Structures", "OOP", "Pandas/NumPy", "Custom"],
  "JavaScript": ["Core", "React", "Node.js", "Next.js", "TypeScript", "DOM/Browser APIs", "Custom"],
  "Database": ["SQL Fundamentals", "NoSQL", "PostgreSQL", "MongoDB", "Redis", "Database Design", "Custom"],
  "Data Structures": ["Arrays & Strings", "Linked Lists", "Trees & Graphs", "Stacks & Queues", "Hashing", "Sorting & Searching", "Custom"],
  "System Design": ["Fundamentals", "Scalability", "Caching", "Load Balancing", "Microservices", "Message Queues", "Custom"],
  "Operating Systems": ["Processes & Threads", "Memory Management", "File Systems", "Scheduling", "Deadlocks", "Virtualization", "Custom"],
  "Networking": ["TCP/IP", "HTTP/HTTPS", "DNS", "REST APIs", "WebSockets", "Security", "Custom"],
  "Custom": [],
};

const SUBJECT_ICONS = {
  "Java": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/java/java-original.svg",
  "Python": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/python/python-original.svg",
  "JavaScript": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg",
  "Database": "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/mysql/mysql-original.svg",
  "Data Structures": () => <Code2 className="w-6 h-6 text-slate-600" />,
  "System Design": () => <Monitor className="w-6 h-6 text-slate-600" />,
  "Operating Systems": () => <Cpu className="w-6 h-6 text-slate-600" />,
  "Networking": () => <Network className="w-6 h-6 text-slate-600" />,
  "Custom": () => <Search className="w-6 h-6 text-slate-600" />
};

export default function GuidanceConfig({ onChange, disabled, onFinish }) {
  const [step, setStep] = useState(1);
  const [subject, setSubject] = useState("");
  const [isCustomSubject, setIsCustomSubject] = useState(false);
  const [customSubjectText, setCustomSubjectText] = useState("");

  const [subtopic, setSubtopic] = useState("");
  const [isCustomSubtopic, setIsCustomSubtopic] = useState(false);
  const [customSubtopicText, setCustomSubtopicText] = useState("");

  useEffect(() => {
    const finalSubject = isCustomSubject ? customSubjectText : subject;
    const finalSubtopic = isCustomSubtopic ? customSubtopicText : subtopic;
    onChange?.({ subject: finalSubject || "Java", subtopic: finalSubtopic || "Core" });
  }, [subject, isCustomSubject, customSubjectText, subtopic, isCustomSubtopic, customSubtopicText, onChange]);

  const handleNext = () => {
    if (step === 1) {
      if (isCustomSubject && !customSubjectText.trim()) return;
      if (!isCustomSubject && !subject) return;
      setStep(2);
    } else if (step === 2) {
      if (isCustomSubtopic && !customSubtopicText.trim()) return;
      if (!isCustomSubtopic && !subtopic) return;
      onFinish?.();
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubjectSelect = (s) => {
    if (s === "Custom") {
      setIsCustomSubject(true);
      setSubject("");
    } else {
      setIsCustomSubject(false);
      setSubject(s);
    }
  };

  const handleSubtopicSelect = (st) => {
    if (st === "Custom") {
      setIsCustomSubtopic(true);
      setSubtopic("");
    } else {
      setIsCustomSubtopic(false);
      setSubtopic(st);
    }
  };

  const currentSubtopics = isCustomSubject ? [] : (SUBJECTS[subject] || []);

  const isNextDisabled = () => {
    if (disabled) return true;
    if (step === 1) return isCustomSubject ? !customSubjectText.trim() : !subject;
    if (step === 2) return isCustomSubtopic ? !customSubtopicText.trim() : (!subtopic && currentSubtopics.length > 0);
    return false;
  };

  return (
    <div className="w-full max-w-4xl mx-auto rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 dark:backdrop-blur-xl p-6 sm:p-8 shadow-xl shadow-slate-200/40 dark:shadow-none transition-colors duration-300">
      
      <div className="relative mb-6 flex flex-col items-center justify-center text-center pt-2">
        {step > 1 && (
          <button 
            onClick={handleBack}
            disabled={disabled}
            className="absolute left-0 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        
        <div className="mb-2 flex items-center justify-center">
          <LottiePlayer autoplay loop src="/gudebook.json" style={{ width: 90, height: 90 }} />
        </div>
        
        <h2 className="text-3xl sm:text-4xl font-serif font-bold text-slate-900 dark:text-white tracking-tight mb-2">
          AI Guidance Setup
        </h2>
        <p className="text-base text-slate-500 dark:text-slate-400 font-medium">
          {step === 1 ? "What would you like to study today?" : "Select a specific subtopic"}
        </p>

        <div className="absolute right-0 top-4 flex items-center gap-2">
          <div className={`h-2.5 w-8 rounded-full transition-all ${step >= 1 ? 'bg-emerald-500' : 'bg-slate-200'}`} />
          <div className={`h-2.5 w-8 rounded-full transition-all ${step >= 2 ? 'bg-emerald-500' : 'bg-slate-200'}`} />
        </div>
      </div>

      {step === 1 && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {Object.keys(SUBJECTS).map((s) => {
              const isSelected = (!isCustomSubject && subject === s) || (isCustomSubject && s === "Custom");
              const iconObj = SUBJECT_ICONS[s];
              
              return (
                <button
                  key={s}
                  onClick={() => handleSubjectSelect(s)}
                  disabled={disabled}
                  className={`
                    relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 p-4 transition-all duration-200 min-h-[110px]
                    ${isSelected 
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/20 shadow-md shadow-emerald-100 dark:shadow-none' 
                      : 'border-slate-100 dark:border-white/5 bg-white dark:bg-white/5 hover:border-emerald-200 dark:hover:border-emerald-500/50 hover:bg-slate-50 dark:hover:bg-white/10 hover:shadow-sm'
                    }
                  `}
                >
                  {isSelected && (
                    <div className="absolute top-3 right-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    </div>
                  )}
                  
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all ${isSelected ? 'bg-white dark:bg-white/10 shadow-sm dark:shadow-none' : 'bg-slate-50 dark:bg-white/5 group-hover:bg-white dark:group-hover:bg-white/10 group-hover:shadow-sm dark:group-hover:shadow-none'}`}>
                    {typeof iconObj === 'string' ? (
                      <img src={iconObj} alt={s} className="w-6 h-6" />
                    ) : iconObj ? (
                      iconObj()
                    ) : (
                      <BrainCircuit className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  
                  <span className={`text-sm font-bold text-center leading-tight ${isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                    {s}
                  </span>
                </button>
              );
            })}
          </div>

          {isCustomSubject && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <input
                type="text"
                placeholder="e.g. Kotlin, Docker, GraphQL..."
                value={customSubjectText}
                onChange={(e) => setCustomSubjectText(e.target.value)}
                disabled={disabled}
                autoFocus
                className="w-full rounded-2xl border-2 border-emerald-500 bg-white dark:bg-slate-900/50 px-6 py-4 text-lg font-medium text-slate-800 dark:text-white shadow-sm outline-none placeholder:text-slate-300 dark:placeholder:text-slate-500 focus:ring-4 focus:ring-emerald-500/10"
              />
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            {currentSubtopics.map((st) => {
              const isSelected = (!isCustomSubtopic && subtopic === st) || (isCustomSubtopic && st === "Custom");
              return (
                <button
                  key={st}
                  onClick={() => handleSubtopicSelect(st)}
                  disabled={disabled}
                  className={`
                    relative flex items-center justify-between rounded-xl border-2 px-5 py-4 transition-all duration-200
                    ${isSelected 
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/20 shadow-md shadow-emerald-100 dark:shadow-none' 
                      : 'border-slate-100 dark:border-white/5 bg-white dark:bg-white/5 hover:border-emerald-200 dark:hover:border-emerald-500/50 hover:bg-slate-50 dark:hover:bg-white/10 hover:shadow-sm'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold ${isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                      {st}
                    </span>
                  </div>
                  {isSelected && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                </button>
              );
            })}
            
            {/* Fallback Custom Subtopic if list was empty (i.e. custom subject chosen) */}
            {currentSubtopics.length === 0 && (
               <button
                 onClick={() => handleSubtopicSelect("Custom")}
                 disabled={disabled}
                 className={`
                   relative flex items-center justify-between rounded-xl border-2 px-5 py-4 transition-all duration-200
                   ${isCustomSubtopic 
                     ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/20 shadow-md shadow-emerald-100 dark:shadow-none' 
                     : 'border-slate-100 dark:border-white/5 bg-white dark:bg-white/5 hover:border-emerald-200 dark:hover:border-emerald-500/50 hover:bg-slate-50 dark:hover:bg-white/10 hover:shadow-sm'
                   }
                 `}
               >
                 <span className={`text-sm font-bold ${isCustomSubtopic ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                   Custom Subtopic
                 </span>
                 {isCustomSubtopic && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
               </button>
            )}
          </div>
          
          {isCustomSubtopic && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <input
                type="text"
                placeholder="e.g. Authentication, Basic Syntax, Hooks..."
                value={customSubtopicText}
                onChange={(e) => setCustomSubtopicText(e.target.value)}
                disabled={disabled}
                autoFocus
                className="w-full rounded-2xl border-2 border-emerald-500 bg-white dark:bg-slate-900/50 px-6 py-4 text-lg font-medium text-slate-800 dark:text-white shadow-sm outline-none placeholder:text-slate-300 dark:placeholder:text-slate-500 focus:ring-4 focus:ring-emerald-500/10"
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <button
          onClick={handleNext}
          disabled={isNextDisabled()}
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-8 py-3.5 font-bold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 hover:shadow-emerald-600/30 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
        >
          {step === 2 ? 'Start Guidance Session' : 'Continue'}
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

    </div>
  );
}
