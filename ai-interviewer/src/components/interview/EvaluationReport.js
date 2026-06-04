"use client";

import React from 'react';
import { 
  CheckCircle2, AlertCircle, 
  TrendingUp, Activity, Target, MessageSquare, 
  Brain, UserCheck, Award, Calculator,
  Download, BookOpen
} from 'lucide-react';

const ScoreRing = ({ score, label, max = 100 }) => {
  const percentage = (score / max) * 100;
  // Determine color based on percentage
  const getColor = (pct) => {
    if (pct >= 80) return "text-emerald-500";
    if (pct >= 60) return "text-amber-500";
    return "text-red-500";
  };
  
  const colorClass = getColor(percentage);

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-gray-100 dark:border-white/10">
      <div className="relative w-20 h-20 mb-3">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r="40"
            className="text-slate-200 stroke-current"
            strokeWidth="8" fill="transparent"
          />
          <circle
            cx="50" cy="50" r="40"
            className={`${colorClass} stroke-current transition-all duration-1000 ease-out`}
            strokeWidth="8" fill="transparent"
            strokeDasharray="251.2"
            strokeDashoffset={251.2 - (251.2 * percentage) / 100}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-slate-800 dark:text-slate-200">{parseFloat(score.toFixed(1))}</span>
        </div>
      </div>
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">{label}</span>
    </div>
  );
};

const SectionHeader = ({ icon: Icon, title }) => (
  <div className="flex items-center gap-3 mb-6 border-b border-gray-100 dark:border-white/10 pb-4">
    <div className="p-2 bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 rounded-xl">
      <Icon className="w-5 h-5" />
    </div>
    <h3 className="text-xl font-serif font-bold text-slate-900 dark:text-white tracking-tight">{title}</h3>
  </div>
);

const ProgressBar = ({ label, score, max = 100 }) => {
  const percentage = (score / max) * 100;
  const getColor = (pct) => {
    if (pct >= 80) return "bg-emerald-50 dark:bg-emerald-500/200";
    if (pct >= 60) return "bg-amber-50 dark:bg-amber-500/200";
    return "bg-red-50 dark:bg-red-500/200";
  };

  return (
    <div className="mb-4">
      <div className="flex justify-between mb-1.5">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
        <span className="text-sm font-bold text-slate-900 dark:text-white">{parseFloat(score.toFixed(1))}/{max}</span>
      </div>
      <div className="h-2 w-full bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-1000 ${getColor(percentage)}`} 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

const Badge = ({ children, type = "neutral" }) => {
  const colors = {
    success: "bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30",
    warning: "bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
    danger: "bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30",
    info: "bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30",
    neutral: "bg-slate-50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 border-gray-200"
  };
  
  return (
    <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${colors[type]}`}>
      {children}
    </span>
  );
};

const toNum = (value) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};


/**
 * Normalizes a contribution entry from the score_breakdown (handles snake_case/camelCase).
 */
const normalizeContribution = (entry) => {
  if (!entry) return null;
  return {
    parameter: entry.parameter ?? 'Unknown',
    rawScore: Number(entry.rawScore ?? entry.raw_score ?? 0),
    weight: Number(entry.weight ?? 0),
    weightedContribution: Number(entry.weightedContribution ?? entry.weighted_contribution ?? 0),
  };
};

const normalizeReport = (report) => {
  // Normalize the score breakdown if present
  const rawBreakdown = report.scoreBreakdown ?? report.score_breakdown;
  let scoreBreakdown = null;
  if (rawBreakdown) {
    scoreBreakdown = {
      accuracy: normalizeContribution(rawBreakdown.accuracy),
      depth: normalizeContribution(rawBreakdown.depth),
      problemSolving: normalizeContribution(rawBreakdown.problemSolving ?? rawBreakdown.problem_solving),
      clarity: normalizeContribution(rawBreakdown.clarity),
      confidence: normalizeContribution(rawBreakdown.confidence),
      formula: rawBreakdown.formula ?? '',
      computedScore: Number(rawBreakdown.computedScore ?? rawBreakdown.computed_score ?? 0),
    };
  }

  return {
    overallScore: Number(report.overallScore ?? report.overall_score ?? 0),
    technicalScores: {
      accuracy: toNum(report.technicalScores?.accuracy ?? report.technical_scores?.accuracy),
      depth: toNum(report.technicalScores?.depth ?? report.technical_scores?.depth),
      problemSolving: toNum(report.technicalScores?.problemSolving ?? report.technical_scores?.problem_solving),
    },
    communicationScores: {
      clarity: toNum(report.communicationScores?.clarity ?? report.communication_scores?.clarity),
      confidence: toNum(report.communicationScores?.confidence ?? report.communication_scores?.confidence),
    },
    behavioralSummary: {
      confidenceLevel: report.behavioralSummary?.confidenceLevel ?? report.behavioral_summary?.confidence_level ?? "Med",
      observations: report.behavioralSummary?.observations ?? report.behavioral_summary?.observations ?? "No behavioral summary available.",
    },
    strengths: report.strengths ?? [],
    weaknesses: report.weaknesses ?? [],
    missedConcepts: report.missedConcepts ?? report.missed_concepts ?? [],
    questionAnalysis: report.questionAnalysis ?? report.question_analysis ?? [],
    finalVerdict: {
      skillLevel: report.finalVerdict?.skillLevel ?? report.final_verdict?.skill_level ?? "N/A",
      hireRecommendation: report.finalVerdict?.hireRecommendation ?? report.final_verdict?.hire_recommendation ?? "Maybe",
      summary: report.finalVerdict?.summary ?? report.final_verdict?.summary ?? "Evaluation summary unavailable.",
    },
    studyPlan: (report.studyPlan ?? report.study_plan ?? []).map(d => ({
      day: d.day,
      topic: d.topic,
      focus: d.focus,
      tasks: d.tasks ?? [],
    })),
    scoreBreakdown,
  };
};

const CompactList = ({ title, icon: Icon, items, itemClass = "text-slate-700 dark:text-slate-300" }) => (
  <section>
    <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">
      <Icon className="w-4 h-4 text-blue-600" />
      {title}
    </h4>
    <ul className="space-y-2">
      {items.length > 0 ? items.slice(0, 3).map((item, index) => (
        <li key={index} className={`text-xs leading-relaxed ${itemClass}`}>
          {item}
        </li>
      )) : (
        <li className="text-xs text-slate-400">No items reported.</li>
      )}
    </ul>
  </section>
);

/* ─────────────────────────────────────────────────────────────────
 * ScoreBreakdownSection — shows exactly how the overall score
 * was calculated using the weighted-average formula.
 * ────────────────────────────────────────────────────────────── */

const weightColors = {
  'Technical Accuracy': { bg: 'bg-blue-50 dark:bg-blue-500/20', text: 'text-blue-700 dark:text-blue-400', bar: 'bg-blue-500 dark:bg-blue-500', border: 'border-blue-100 dark:border-blue-500/30' },
  'Depth of Knowledge': { bg: 'bg-violet-50 dark:bg-violet-500/20', text: 'text-violet-700 dark:text-violet-400', bar: 'bg-violet-500 dark:bg-violet-500', border: 'border-violet-100 dark:border-violet-500/30' },
  'Problem Solving': { bg: 'bg-amber-50 dark:bg-amber-500/20', text: 'text-amber-700 dark:text-amber-400', bar: 'bg-amber-500 dark:bg-amber-500', border: 'border-amber-100 dark:border-amber-500/30' },
  'Clarity': { bg: 'bg-emerald-50 dark:bg-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-500 dark:bg-emerald-500', border: 'border-emerald-100 dark:border-emerald-500/30' },
  'Presence & Confidence': { bg: 'bg-rose-50 dark:bg-rose-500/20', text: 'text-rose-700 dark:text-rose-400', bar: 'bg-rose-500 dark:bg-rose-500', border: 'border-rose-100 dark:border-rose-500/30' },
};

const ScoreBreakdownSection = ({ breakdown, compact = false }) => {
  if (!breakdown) return null;

  const parameters = [
    breakdown.accuracy,
    breakdown.depth,
    breakdown.problemSolving,
    breakdown.clarity,
    breakdown.confidence,
  ].filter(Boolean);

  if (parameters.length === 0) return null;

  const total = breakdown.computedScore;

  if (compact) {
    return (
      <section>
        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">
          <Calculator className="w-4 h-4 text-blue-600" />
          Score Breakdown
        </h4>
        <div className="space-y-2">
          {parameters.map((p, i) => {
            const colors = weightColors[p.parameter] ?? { bg: 'bg-slate-50 dark:bg-slate-900/40', text: 'text-slate-700 dark:text-slate-300', bar: 'bg-slate-50 dark:bg-slate-900/400', border: 'border-slate-100 dark:border-white/10' };
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${colors.bar} shrink-0`} />
                <span className="text-slate-600 flex-1 truncate">{p.parameter}</span>
                <span className="text-slate-400">{p.rawScore}/10</span>
                <span className="text-slate-400">×</span>
                <span className="font-semibold text-slate-500 dark:text-slate-400">{Math.round(p.weight * 100)}%</span>
                <span className="text-slate-400">=</span>
                <span className={`font-bold ${colors.text}`}>{p.weightedContribution.toFixed(1)}</span>
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-100 dark:border-white/10">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Total</span>
            <span className="text-sm font-black text-slate-900 dark:text-white">{total.toFixed(1)} / 100</span>
          </div>
        </div>
      </section>
    );
  }

  // ── Full (expanded) view ──
  return (
    <section>
      <SectionHeader icon={Calculator} title="How Your Score Was Calculated" />

      {/* Formula banner */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-5 mb-6 font-mono text-xs leading-relaxed overflow-x-auto">
        <span className="text-blue-400 font-bold">Final Score</span>
        <span className="text-slate-400"> = ( </span>
        {parameters.map((p, i) => {
          const colors = weightColors[p.parameter];
          return (
            <span key={i}>
              {i > 0 && <span className="text-slate-500 dark:text-slate-400"> + </span>}
              <span className="text-slate-400">{p.weight.toFixed(2)}</span>
              <span className="text-slate-500 dark:text-slate-400"> × </span>
              <span className={colors ? 'text-white font-bold' : 'text-white'}>{p.rawScore}</span>
            </span>
          );
        })}
        <span className="text-slate-400"> ) × 10 = </span>
        <span className="text-emerald-400 font-black text-sm">{total.toFixed(1)}</span>
      </div>

      {/* Parameter cards */}
      <div className="space-y-3">
        {parameters.map((p, i) => {
          const colors = weightColors[p.parameter] ?? { bg: 'bg-slate-50 dark:bg-slate-900/40', text: 'text-slate-700 dark:text-slate-300', bar: 'bg-slate-50 dark:bg-slate-900/400', border: 'border-slate-100 dark:border-white/10' };
          const maxContribution = p.weight * 10 * 10; // maximum possible contribution
          const fillPct = maxContribution > 0 ? (p.weightedContribution / maxContribution) * 100 : 0;
          return (
            <div key={i} className={`rounded-2xl border ${colors.border} ${colors.bg} p-4 transition-all hover:shadow-md`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${colors.bar}`} />
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{p.parameter}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Score: <span className="font-bold text-slate-700 dark:text-slate-300">{p.rawScore}</span>/10
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Weight: <span className="font-bold text-slate-700 dark:text-slate-300">{Math.round(p.weight * 100)}%</span>
                  </span>
                  <span className={`text-sm font-black ${colors.text}`}>
                    +{p.weightedContribution.toFixed(1)}
                  </span>
                </div>
              </div>
              {/* Contribution bar */}
              <div className="h-1.5 w-full bg-white dark:bg-slate-900/20/60 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${colors.bar}`}
                  style={{ width: `${fillPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div className="mt-4 flex items-center justify-between bg-slate-100 dark:bg-white/10 rounded-2xl p-5 border border-gray-200 dark:border-white/10">
        <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Computed Overall Score</span>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-black text-slate-900 dark:text-white">{total.toFixed(1)}</span>
          <span className="text-lg text-slate-400 font-medium">/ 100</span>
        </div>
      </div>
    </section>
  );
};

const DAY_COLORS = [
  'border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/20', 'border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/20',
  'border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/20', 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/20',
  'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/20', 'border-cyan-200 dark:border-cyan-500/30 bg-cyan-50 dark:bg-cyan-500/20',
  'border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/20',
];

const StudyPlanSection = ({ studyPlan, missedConcepts = [], weaknesses = [], compact = false }) => {
  const defaultPlan = [
    { day: 1, topic: 'Core Concepts Review', focus: missedConcepts[0] || 'Brush up on fundamentals' },
    { day: 2, topic: 'Addressing Weaknesses', focus: weaknesses[0] || 'Focus on problem-solving speed' },
    { day: 3, topic: 'Deep Dive & Practice', focus: missedConcepts[1] || 'Implement practical examples' },
    { day: 4, topic: 'Advanced Application', focus: weaknesses[1] || 'Explore edge cases and optimizations' },
    { day: 5, topic: 'Communication Prep', focus: 'Practice explaining technical concepts out loud' },
    { day: 6, topic: 'Timed Assessment', focus: 'Simulate interview environment with a timer' },
    { day: 7, topic: 'Final Review', focus: 'Review notes and consolidate learning' }
  ];
  const plan = studyPlan && studyPlan.length > 0 ? studyPlan : defaultPlan;

  if (compact) {
    return (
      <section>
        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">
          <BookOpen className="w-4 h-4 text-blue-600" />
          7-Day Study Plan
        </h4>
        <div className="space-y-2">
          {plan.slice(0, 3).map((day, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="shrink-0 w-12 font-bold text-blue-600">Day {day.day}</span>
              <span className="text-slate-700 dark:text-slate-300">{day.topic}</span>
            </div>
          ))}
          {plan.length > 3 && (
            <p className="text-xs text-slate-400 italic">+{plan.length - 3} more days...</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="pt-6 border-t border-gray-100 dark:border-white/10">
      <SectionHeader icon={BookOpen} title="7-Day Personalized Study Plan" />
      <div className="space-y-3">
        {plan.map((day, i) => (
          <div key={i} className={`rounded-2xl border ${DAY_COLORS[i % DAY_COLORS.length]} p-5 transition-all hover:shadow-md`}>
            <div className="flex items-center gap-3 mb-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-slate-900/20 border border-gray-200 text-sm font-black text-slate-800 dark:text-slate-200 shadow-sm">
                {day.day}
              </span>
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{day.topic}</h4>
                {day.focus && <p className="text-xs text-slate-500 dark:text-slate-400">{day.focus}</p>}
              </div>
            </div>
            {day.tasks && day.tasks.length > 0 && (
              <ul className="ml-11 space-y-1">
                {day.tasks.map((task, j) => (
                  <li key={j} className="text-sm text-slate-700 dark:text-slate-300 flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">•</span>
                    {task}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

const DownloadPdfButton = ({ reportId }) => {
  const [isDownloading, setIsDownloading] = React.useState(false);

  const handleDownload = async () => {
    if (!reportId) {
      window.print();
      return;
    }
    
    setIsDownloading(true);
    try {
      const auth = JSON.parse(localStorage.getItem('auth') || '{}');
      const res = await fetch(`http://localhost:8082/api/reports/${reportId}/pdf`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      
      if (!res.ok) throw new Error('PDF fetch failed');
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `interview-report-${reportId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF download error:', err);
      alert('Could not generate PDF. Please try again later or use the browser print function.');
      window.print();
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={isDownloading}
      className={`flex items-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-bold transition-all shadow-md print:hidden ${
        isDownloading ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700'
      }`}
    >
      <Download className={`w-4 h-4 ${isDownloading ? 'animate-bounce' : ''}`} />
      {isDownloading ? 'Downloading...' : 'Download PDF'}
    </button>
  );
};

function CompactEvaluationReport({ report }) {
  const confidenceType = report.behavioralSummary.confidenceLevel === "High"
    ? "success"
    : report.behavioralSummary.confidenceLevel === "Low"
      ? "danger"
      : "warning";

  return (
    <aside className="bg-white dark:bg-slate-900/20 rounded-3xl shadow-2xl shadow-slate-200/50 border border-gray-100 dark:border-white/10 overflow-hidden animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="p-5 bg-slate-900 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Evaluation</p>
            <h2 className="text-2xl font-serif font-bold tracking-tight text-white mt-1">Interview Report</h2>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black leading-none">{parseFloat(report.overallScore.toFixed(1))}</div>
            <div className="text-xs font-semibold text-blue-200">/100</div>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-6 max-h-[680px] overflow-y-auto">
        <section className="bg-blue-50 dark:bg-blue-500/20/70 rounded-2xl p-4 border border-blue-100">
          <div className="flex items-center justify-between gap-3 mb-3">
            <Badge type="info">{report.finalVerdict.skillLevel}</Badge>
            <Badge type={report.finalVerdict.hireRecommendation === "Yes" ? "success" : report.finalVerdict.hireRecommendation === "No" ? "danger" : "warning"}>
              {report.finalVerdict.hireRecommendation}
            </Badge>
          </div>
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{report.finalVerdict.summary}</p>
        </section>

        <section>
          <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">
            <Brain className="w-4 h-4 text-blue-600" />
            Scores
          </h4>
          <ProgressBar label="Accuracy" score={report.technicalScores.accuracy * 10} max={100} />
          <ProgressBar label="Depth" score={report.technicalScores.depth * 10} max={100} />
          <ProgressBar label="Problem Solving" score={report.technicalScores.problemSolving * 10} max={100} />
          <ProgressBar label="Clarity" score={report.communicationScores.clarity * 10} max={100} />
          <ProgressBar label="Confidence" score={report.communicationScores.confidence * 10} max={100} />
        </section>

        <section className="bg-slate-50 dark:bg-slate-900/40 rounded-2xl p-4 border border-gray-100 dark:border-white/10">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Behavior</span>
            <Badge type={confidenceType}>{report.behavioralSummary.confidenceLevel}</Badge>
          </div>
          <p className="text-xs leading-relaxed text-slate-600">{report.behavioralSummary.observations}</p>
        </section>

        <ScoreBreakdownSection breakdown={report.scoreBreakdown} compact />

        <CompactList title="Strengths" icon={TrendingUp} items={report.strengths} itemClass="text-emerald-700 dark:text-emerald-400" />
        <CompactList title="Improvements" icon={Target} items={report.weaknesses} itemClass="text-amber-700 dark:text-amber-400" />

        {report.missedConcepts.length > 0 && (
          <section>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">Missed Concepts</h4>
            <div className="flex flex-wrap gap-2">
              {report.missedConcepts.map((concept, index) => (
                <span key={index} className="px-2.5 py-1 bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-400 border border-red-100 rounded-xl text-xs font-semibold">
                  {concept}
                </span>
              ))}
            </div>
          </section>
        )}

        <StudyPlanSection studyPlan={report.studyPlan} compact />

        <DownloadPdfButton reportId={report.reportId} />
      </div>
    </aside>
  );
}

export default function EvaluationReport({ report, compact = false, reportId = null }) {
  if (!report) return null;

  const normalizedReport = { ...normalizeReport(report), reportId };

  if (compact) {
    return <CompactEvaluationReport report={normalizedReport} />;
  }

  report = normalizedReport;

  return (
    <div className="w-full bg-white dark:bg-slate-900/20 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 dark:border-white/10 overflow-hidden mt-8 mb-16 animate-in fade-in slide-in-from-bottom-8 duration-700">
      
      {/* Header Banner */}
      <div className="bg-slate-900 p-8 sm:p-12 relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-8">
        {/* Subtle Background Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-slate-800 rounded-full blur-3xl opacity-50 -mr-20 -mt-20 pointer-events-none" />
        
        <div className="relative z-10">
          <h2 className="text-3xl sm:text-4xl font-serif font-bold text-white mb-2 tracking-tight">Interview Evaluation</h2>
          <p className="text-slate-400 font-medium text-lg">Comprehensive analysis & feedback</p>
        </div>
        
        <div className="relative z-10 bg-slate-800/80 backdrop-blur-sm border border-slate-700 p-6 rounded-3xl flex items-center gap-6 shadow-inner">
          <div>
            <p className="text-slate-400 text-sm font-bold mb-1 uppercase tracking-wider">Overall Score</p>
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-black text-white">{parseFloat(report.overallScore.toFixed(1))}</span>
              <span className="text-xl text-slate-500 dark:text-slate-400 font-medium">/100</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 sm:p-12 space-y-12">
        
        {/* Final Verdict Section */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="col-span-2 bg-slate-50 dark:bg-slate-900/40 rounded-3xl p-8 border border-slate-200 dark:border-white/10">
            <h3 className="text-slate-900 dark:text-white font-serif font-bold text-2xl mb-4 flex items-center gap-3">
              <Award className="w-7 h-7 text-slate-700 dark:text-slate-300" />
              Executive Summary
            </h3>
            <p className="text-slate-700 dark:text-slate-300 text-lg leading-relaxed">
              {report.finalVerdict.summary}
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <div className="bg-slate-50 dark:bg-slate-900/40 p-6 rounded-3xl border border-gray-100 dark:border-white/10 flex-1 flex flex-col justify-center">
              <span className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-wider mb-2 block">Skill Level</span>
              <span className="text-2xl font-black text-slate-800 dark:text-slate-200">{report.finalVerdict.skillLevel}</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/40 p-6 rounded-3xl border border-gray-100 dark:border-white/10 flex-1 flex flex-col justify-center">
              <span className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-wider mb-2 block">Hire Recommendation</span>
              <div className="flex items-center gap-2">
                {report.finalVerdict.hireRecommendation === "Yes" ? (
                  <Badge type="success"><span className="text-lg">Strong Yes</span></Badge>
                ) : report.finalVerdict.hireRecommendation === "Maybe" ? (
                  <Badge type="warning"><span className="text-lg">Borderline</span></Badge>
                ) : (
                  <Badge type="danger"><span className="text-lg">Not Recommended</span></Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Score Breakdown Section — shows how the overall score was computed */}
        <ScoreBreakdownSection breakdown={report.scoreBreakdown} />

        <div className="grid md:grid-cols-2 gap-12">
          {/* Left Column: Metrics */}
          <div className="space-y-10">
            {/* Technical Skills */}
            <section>
              <SectionHeader icon={Brain} title="Technical Proficiency" />
              <div className="space-y-6">
                <ProgressBar label="Accuracy" score={report.technicalScores.accuracy * 10} max={100} />
                <ProgressBar label="Depth of Knowledge" score={report.technicalScores.depth * 10} max={100} />
                <ProgressBar label="Problem Solving" score={report.technicalScores.problemSolving * 10} max={100} />
              </div>
            </section>

            {/* Communication & Behavior */}
            <section>
              <SectionHeader icon={MessageSquare} title="Communication & Presence" />
              <div className="grid grid-cols-2 gap-4 mb-6">
                <ScoreRing score={report.communicationScores.clarity * 10} label="Clarity" max={100} />
                <ScoreRing score={report.communicationScores.confidence * 10} label="Confidence" max={100} />
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/40 p-5 rounded-2xl border border-gray-100 dark:border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Behavioral Note</span>
                  <Badge type={report.behavioralSummary.confidenceLevel === "High" ? "success" : report.behavioralSummary.confidenceLevel === "Med" ? "warning" : "danger"}>
                    {report.behavioralSummary.confidenceLevel} Confidence
                  </Badge>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{report.behavioralSummary.observations}</p>
              </div>
            </section>
          </div>

          {/* Right Column: Feedback */}
          <div className="space-y-10">
            {/* Strengths & Weaknesses */}
            <section>
              <SectionHeader icon={Activity} title="Key Feedback" />
              
              <div className="space-y-6">
                <div>
                  <h4 className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold mb-3">
                    <TrendingUp className="w-5 h-5" /> Main Strengths
                  </h4>
                  <ul className="space-y-2">
                    {report.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-slate-700 dark:text-slate-300 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold mb-3">
                    <Target className="w-5 h-5" /> Areas for Improvement
                  </h4>
                  <ul className="space-y-2">
                    {report.weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-slate-700 dark:text-slate-300 text-sm">
                        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {report.missedConcepts && report.missedConcepts.length > 0 && (
                  <div>
                    <h4 className="text-slate-800 dark:text-slate-200 font-bold mb-3">Missed Concepts</h4>
                    <div className="flex flex-wrap gap-2">
                      {report.missedConcepts.map((mc, i) => (
                        <span key={i} className="px-3 py-1.5 bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-400 border border-red-100 rounded-xl text-xs font-semibold">
                          {mc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* Question Analysis Q&A log */}
        {report.questionAnalysis && report.questionAnalysis.length > 0 && (
          <section className="pt-6 border-t border-gray-100 dark:border-white/10">
            <SectionHeader icon={UserCheck} title="Detailed Question Analysis" />
            <div className="space-y-4">
              {report.questionAnalysis.map((qa, i) => (
                <div key={i} className="bg-slate-50 dark:bg-slate-900/40 border border-gray-100 dark:border-white/10 rounded-2xl p-6 transition-all hover:shadow-md hover:border-blue-100">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <h4 className="text-slate-800 dark:text-slate-200 font-medium text-lg flex-1">
                      <span className="text-blue-500 font-bold mr-2">Q:</span>
                      {qa.question}
                    </h4>
                    <div>
                      <Badge type={qa.rating === "Correct" ? "success" : qa.rating === "Partial" ? "warning" : "danger"}>
                        {qa.rating}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-slate-600 text-sm pl-7 border-l-2 border-slate-200 dark:border-white/10 ml-2">
                    <span className="font-semibold text-slate-500 dark:text-slate-400 uppercase text-xs mr-2">Feedback:</span>
                    {qa.justification}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 7-Day Study Plan */}
        <StudyPlanSection studyPlan={report.studyPlan} missedConcepts={report.missedConcepts} weaknesses={report.weaknesses} />

        {/* PDF Download */}
        <div className="pt-6 border-t border-gray-100 dark:border-white/10 flex justify-center print:hidden">
          <DownloadPdfButton reportId={reportId} />
        </div>

      </div>
    </div>
  );
}
