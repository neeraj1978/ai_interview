"use client";

import { useEffect, useRef } from 'react';
import { User, GraduationCap } from 'lucide-react';

export default function ChatHistory({ messages, isAiSpeaking, currentAiMessage }) {
  const scrollRef = useRef(null);

  // Auto-scroll to bottom on new messages or streaming tokens
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentAiMessage]);

  return (
    <div
      ref={scrollRef}
      className="flex flex-col gap-5 overflow-y-auto w-full h-full pb-10 pt-4 scroll-smooth"
    >
      {messages.length === 0 && !currentAiMessage && (
        <div className="text-center py-12">
          <GraduationCap className="mx-auto h-10 w-10 text-slate-200 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-400 dark:text-slate-500">Your conversation will appear here</p>
        </div>
      )}

      {messages.map((msg, index) => (
        <div
          key={index}
          className={`flex gap-2.5 ${msg.role === 'student' ? 'flex-row-reverse' : 'flex-row'}`}
        >
          {/* Avatar */}
          <div className={`
            flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm border
            ${msg.role === 'student'
              ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/30'
              : 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/30'}
          `}>
            {msg.role === 'student'
              ? <User className="h-5 w-5" />
              : <GraduationCap className="h-5 w-5" />
            }
          </div>

          <div className={`
            max-w-[85%] rounded-3xl px-6 py-4 text-base leading-relaxed shadow-sm
            ${msg.role === 'student'
              ? 'bg-emerald-600 dark:bg-emerald-700 text-white rounded-tr-md'
              : 'bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-slate-700 dark:text-slate-200 rounded-tl-md'}
          `}>
            {msg.text}
          </div>
        </div>
      ))}

      {/* Streaming AI message (in-progress) */}
      {currentAiMessage && (
        <div className="flex gap-2.5 flex-row">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm border bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/30">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="max-w-[85%] rounded-3xl rounded-tl-md px-6 py-4 text-base leading-relaxed bg-white dark:bg-white/5 border border-indigo-100 dark:border-indigo-500/30 text-slate-700 dark:text-slate-200 shadow-sm">
            {currentAiMessage}
            <span className="ml-1 inline-block h-5 w-1 animate-pulse bg-indigo-500 align-text-bottom" />
          </div>
        </div>
      )}

      {/* Typing indicator (waiting for response, no tokens yet) */}
      {isAiSpeaking && !currentAiMessage && (
        <div className="flex gap-2.5 flex-row">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm border bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/30">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="rounded-3xl rounded-tl-md px-6 py-5 bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 shadow-sm">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-indigo-300 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="h-2.5 w-2.5 rounded-full bg-indigo-300 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="h-2.5 w-2.5 rounded-full bg-indigo-300 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
