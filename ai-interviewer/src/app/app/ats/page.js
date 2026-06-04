"use client";

import { useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  FileSearch, Upload, Sparkles, Target, AlertTriangle,
  CheckCircle2, XCircle, ChevronRight, Loader2,
  FileText, Clipboard, ArrowRight, TrendingUp, Zap, BookOpen
} from 'lucide-react';

const LottiePlayer = dynamic(
  () => import('@lottiefiles/react-lottie-player').then((mod) => mod.Player),
  { ssr: false }
);

const LLM_BASE = 'http://localhost:8080';

const ScoreGauge = ({ score }) => {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (circumference * score) / 100;

  const getColor = (s) => {
    if (s >= 90) return { stroke: '#10b981', text: 'text-emerald-500 dark:text-emerald-400', bg: 'from-emerald-500/20', label: 'Excellent' };
    if (s >= 70) return { stroke: '#3b82f6', text: 'text-blue-500 dark:text-blue-400', bg: 'from-blue-500/20', label: 'Good' };
    if (s >= 50) return { stroke: '#f59e0b', text: 'text-amber-500 dark:text-amber-400', bg: 'from-amber-500/20', label: 'Needs Work' };
    return { stroke: '#ef4444', text: 'text-red-500 dark:text-red-400', bg: 'from-red-500/20', label: 'Poor' };
  };

  const color = getColor(score);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-44 h-44">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r={radius} className="stroke-slate-100 dark:stroke-slate-800" strokeWidth="10" fill="transparent" />
          <circle
            cx="80" cy="80" r={radius}
            stroke={color.stroke}
            strokeWidth="10"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-black ${color.text}`}>{score}</span>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-0.5">/100</span>
        </div>
      </div>
      <span className={`mt-3 px-4 py-1.5 rounded-full text-sm font-bold ${color.text} bg-gradient-to-r ${color.bg} to-transparent border border-current/10`}>
        {color.label}
      </span>
    </div>
  );
};

const KeywordPill = ({ word, type }) => {
  const styles = {
    matched: 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30',
    missing: 'bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${styles[type]}`}>
      {type === 'matched' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {word}
    </span>
  );
};

const ImprovementCard = ({ item, index }) => {
  const categoryIcons = {
    'Keywords': Target,
    'Formatting': FileText,
    'Content': BookOpen,
    'Structure': Zap,
  };
  const Icon = categoryIcons[item.category] || ChevronRight;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 p-5 hover:shadow-md hover:border-indigo-200 dark:border-indigo-500/30 transition-all group">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0 group-hover:bg-indigo-100 transition-colors">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">{item.category}</span>
          </div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">{item.issue}</p>
          <p className="text-sm text-slate-500 leading-relaxed">{item.suggestion}</p>
        </div>
      </div>
    </div>
  );
};

export default function AtsPage() {
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('paste');
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      const text = await file.text();
      setResumeText(text);
    } else if (file.type === 'application/pdf') {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map(item => item.str).join(' ') + '\n';
        }
        const extracted = fullText.trim();
        if (extracted) {
          setResumeText(extracted);
        } else {
          setError('PDF appears to be image-based (no selectable text). Please paste text instead.');
        }
      } catch (err) {
        console.error('PDF extraction failed:', err);
        setError('Failed to extract text from PDF. Please paste text instead.');
      }
    } else {
      setError('Unsupported file type. Please upload a .txt or .pdf file.');
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setResumeText(text);
    } catch (err) {
      setError('Unable to read clipboard. Please paste manually.');
    }
  };

  const handleAnalyze = async () => {
    if (!resumeText.trim()) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${LLM_BASE}/api/ats/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText: resumeText.trim(),
          jobDescription: jobDescription.trim() || null,
        }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const text = await res.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (parseErr) {
        // Try to extract JSON from potential markdown wrapping
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch (e) {
            throw new Error('Invalid response from ATS analyzer.');
          }
        } else {
          throw new Error('Invalid response from ATS analyzer.');
        }
      }

      if (parsed && parsed.error) {
        throw new Error(parsed.error);
      }
      setResult(parsed);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setResumeText('');
    setJobDescription('');
    setError(null);
  };

  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto">

      {!result ? (
        /* ─── INPUT VIEW ─── */
        <div className="flex items-center justify-center min-h-[600px] mb-10">
          <div className="bg-white dark:bg-slate-900/80 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none border border-slate-100 dark:border-white/10 p-6 sm:p-10 w-full overflow-hidden relative backdrop-blur-xl">
            {analyzing ? (
              <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-500">
                <div className="w-64 h-64 sm:w-80 sm:h-80 opacity-90 mb-6 drop-shadow-xl">
                  <LottiePlayer src="/resume_loading.json" autoplay loop style={{ width: '100%', height: '100%' }} />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Analyzing Resume...</h3>
                <p className="text-slate-500 dark:text-slate-400">Please wait while we evaluate your profile against ATS systems.</p>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row gap-8 lg:gap-16 items-center">
                {/* Left side: Form */}
                <div className="flex-1 w-full space-y-6">
                  <div className="text-center md:text-left mb-6">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-1.5">Resume Analyzer</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Upload your resume and optionally add a target role for best results.</p>
                  </div>

                  {/* Dropzone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center h-44 sm:h-48 rounded-[1.5rem] border-[1.5px] border-dashed transition-all cursor-pointer group ${
                      resumeText ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800/50 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className={`p-3 rounded-full mb-3 transition-colors ${resumeText ? 'bg-indigo-100 dark:bg-indigo-500/30 text-indigo-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/20 group-hover:text-indigo-500'}`}>
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className={`text-sm font-semibold transition-colors ${resumeText ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'}`}>
                      {resumeText ? 'Resume Uploaded' : 'Click/Drag Resume'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-medium">PDF, DOCX, TXT</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.txt,.docx"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    {resumeText && (
                      <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/20 px-3 py-1 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {resumeText.length} chars loaded
                      </div>
                    )}
                  </div>

                  {/* Role */}
                  <div>
                    <input
                      type="text"
                      placeholder="Target Job Role (e.g. Developer)"
                      className="w-full px-5 py-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all shadow-sm"
                    />
                  </div>

                  {/* Job Description */}
                  <div>
                    <textarea
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder="Job Description (Optional)"
                      className="w-full h-28 px-5 py-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none transition-all shadow-sm"
                    />
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/20 p-4 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                    </div>
                  )}

                  {/* Button */}
                  <div className="pt-2">
                    <button
                      onClick={handleAnalyze}
                      disabled={!resumeText.trim()}
                      className={`w-full py-4 rounded-[1rem] text-sm font-bold transition-all ${
                        resumeText.trim()
                          ? 'bg-[#8993a4] hover:bg-[#7a8494] text-white shadow-lg shadow-[#8993a4]/20'
                          : 'bg-[#9ba3af] text-white/90 cursor-not-allowed opacity-80'
                      }`}
                    >
                      Analyze Resume
                    </button>
                  </div>
                </div>

                {/* Right side: Illustration */}
                <div className="flex-1 w-full hidden md:flex items-center justify-center p-4">
                  <div className="w-full max-w-[420px] drop-shadow-xl">
                    <LottiePlayer src="/resume_image.json" autoplay loop style={{ width: '100%', height: 'auto' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ─── RESULTS VIEW ─── */
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Score + Summary Header */}
          <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900/80 dark:to-slate-800/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none backdrop-blur-xl p-8">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <ScoreGauge score={result.ats_score || 0} />
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">ATS Analysis Complete</h2>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{result.summary}</p>
                {result.keyword_analysis?.match_percentage != null && (
                  <div className="mt-4 flex items-center gap-3 justify-center md:justify-start">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-sm font-semibold">
                      <Target className="w-4 h-4" />
                      {result.keyword_analysis.match_percentage}% Keyword Match
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Keywords */}
          {result.keyword_analysis && (
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 shadow-sm p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Keyword Analysis
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Matched Keywords ({result.keyword_analysis.matched?.length || 0})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {(result.keyword_analysis.matched || []).map((kw, i) => (
                      <KeywordPill key={i} word={kw} type="matched" />
                    ))}
                    {(!result.keyword_analysis.matched || result.keyword_analysis.matched.length === 0) && (
                      <p className="text-sm text-slate-400 italic">No keywords matched</p>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-red-700 dark:text-red-400 mb-3 flex items-center gap-1.5">
                    <XCircle className="w-4 h-4" />
                    Missing Keywords ({result.keyword_analysis.missing?.length || 0})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {(result.keyword_analysis.missing || []).map((kw, i) => (
                      <KeywordPill key={i} word={kw} type="missing" />
                    ))}
                    {(!result.keyword_analysis.missing || result.keyword_analysis.missing.length === 0) && (
                      <p className="text-sm text-slate-400 italic">No missing keywords detected</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Strengths + Formatting Issues */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Strengths */}
            {result.strengths && result.strengths.length > 0 && (
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/20/50 p-6">
                <h3 className="text-sm font-bold text-emerald-800 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Strengths
                </h3>
                <ul className="space-y-2.5">
                  {result.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Formatting Issues */}
            {result.formatting_issues && result.formatting_issues.length > 0 && (
              <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/20/50 p-6">
                <h3 className="text-sm font-bold text-amber-800 dark:text-amber-400 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Formatting Issues
                </h3>
                <ul className="space-y-2.5">
                  {result.formatting_issues.map((issue, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-400">
                      <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Section Analysis */}
          {result.section_analysis && (
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 shadow-sm p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Section Analysis
              </h3>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Present Sections</h4>
                  <div className="flex flex-wrap gap-2">
                    {(result.section_analysis.present || []).map((s, i) => (
                      <span key={i} className="px-3 py-1 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 rounded-full text-xs font-semibold">
                        ✓ {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Missing Sections</h4>
                  <div className="flex flex-wrap gap-2">
                    {(result.section_analysis.missing || []).map((s, i) => (
                      <span key={i} className="px-3 py-1 bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30 rounded-full text-xs font-semibold">
                        ✗ {s}
                      </span>
                    ))}
                    {(!result.section_analysis.missing || result.section_analysis.missing.length === 0) && (
                      <span className="text-sm text-slate-400 italic">All key sections present</span>
                    )}
                  </div>
                </div>
              </div>
              {result.section_analysis.feedback && (
                <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-white/5 rounded-xl p-4 border border-slate-100 dark:border-white/5">
                  {result.section_analysis.feedback}
                </p>
              )}
            </div>
          )}

          {/* Improvements */}
          {result.improvements && result.improvements.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                Improvement Suggestions
              </h3>
              <div className="space-y-3">
                {result.improvements.map((item, i) => (
                  <ImprovementCard key={i} item={item} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Action Verbs */}
          {result.action_verbs && (
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 shadow-sm p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                Action Verb Analysis
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                {result.action_verbs.strong_verbs_found?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-2">Strong Verbs Found</h4>
                    <div className="flex flex-wrap gap-2">
                      {result.action_verbs.strong_verbs_found.map((v, i) => (
                        <span key={i} className="px-3 py-1 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 rounded-lg text-xs font-semibold">
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {result.action_verbs.weak_verbs_to_replace?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-2">Weak Verbs to Replace</h4>
                    <div className="space-y-2">
                      {result.action_verbs.weak_verbs_to_replace.map((v, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="px-2 py-0.5 bg-red-50 dark:bg-red-500/20 text-red-600 border border-red-200 dark:border-red-500/30 rounded-md line-through text-xs font-medium">
                            {v.current}
                          </span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 rounded-md text-xs font-semibold">
                            {v.suggested}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reset button */}
          <div className="flex justify-center pt-4">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-white/10 px-6 py-3 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:bg-slate-800 transition-colors"
            >
              Analyze Another Resume
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
