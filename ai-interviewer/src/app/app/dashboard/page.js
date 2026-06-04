"use client";

import { useState, useEffect } from 'react';
import { LayoutDashboard, TrendingUp, Award, BarChart3, Clock, Loader2, Mic, RefreshCw, X, ChevronRight, History, Download, Target, Brain } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import EvaluationReport from '@/components/interview/EvaluationReport';

const API_BASE = 'http://localhost:8082';

const COLOR_MAP = {
  indigo: { bg: 'bg-[#f0ebff]', icon: 'text-indigo-600', border: 'border-[#e0d6ff]' },
  emerald: { bg: 'bg-[#ebfef3]', icon: 'text-emerald-600', border: 'border-[#bbf7d0]' },
  amber: { bg: 'bg-[#fff9e6]', icon: 'text-amber-600', border: 'border-[#fef08a]' },
  sky: { bg: 'bg-[#ebf7ff]', icon: 'text-sky-600', border: 'border-[#bae6fd]' },
};

// Distinct colors for per-subject chart lines
const SUBJECT_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const SUBJECT_ICONS = {
  Python: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/python/python-original.svg",
  Java: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/java/java-original.svg",
  JavaScript: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg",
  Database: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/mysql/mysql-original.svg",
  "Soft Skills": () => <Brain className="w-5 h-5 text-slate-600" />
};

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [allReports, setAllReports] = useState([]);
  const [allReportsLoading, setAllReportsLoading] = useState(true);
  const [chartSubjectFilter, setChartSubjectFilter] = useState('All');

  const openReport = async (reportId) => {
    setReportLoading(true);
    setReportModalOpen(true);
    try {
      const auth = JSON.parse(localStorage.getItem('auth') || '{}');
      const res = await fetch(`${API_BASE}/api/reports/${reportId}`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (!res.ok) throw new Error('Failed to load report');
      const data = await res.json();
      setSelectedReport(data);
    } catch (e) {
      console.error('[Dashboard] Failed to load report:', e.message);
      setReportModalOpen(false);
    } finally {
      setReportLoading(false);
    }
  };

  const closeReport = () => {
    setReportModalOpen(false);
    setSelectedReport(null);
  };

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    setAllReportsLoading(true);
    try {
      const auth = JSON.parse(localStorage.getItem('auth') || '{}');
      const headers = { Authorization: `Bearer ${auth.token}` };
      const [statsRes, reportsRes] = await Promise.all([
        fetch(`${API_BASE}/api/reports/stats`, { headers }),
        fetch(`${API_BASE}/api/reports`, { headers }),
      ]);
      if (!statsRes.ok) throw new Error('Failed to load dashboard');
      setStats(await statsRes.json());
      if (reportsRes.ok) setAllReports(await reportsRes.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setAllReportsLoading(false);
    }
  };

  useEffect(() => {
    try {
      const auth = JSON.parse(localStorage.getItem('auth') || '{}');
      if (auth.user?.fullName) {
        setFirstName(auth.user.fullName.trim().split(' ')[0]);
      } else if (auth.user?.name) {
        setFirstName(auth.user.name.trim().split(' ')[0]);
      } else if (auth.fullName) {
        setFirstName(auth.fullName.trim().split(' ')[0]);
      } else if (auth.name) {
        setFirstName(auth.name.trim().split(' ')[0]);
      }
    } catch (e) {}
    fetchDashboard();
  }, []);

  const openHistory = () => {
    setHistoryOpen(true);
  };

  const downloadPdf = async (e, reportId) => {
    e.stopPropagation();
    try {
      const auth = JSON.parse(localStorage.getItem('auth') || '{}');
      const res = await fetch(`${API_BASE}/api/reports/${reportId}/pdf`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `interview-report-${reportId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF download failed:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 sm:p-10 max-w-6xl mx-auto">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm text-red-700 mb-4">{error}</p>
          <button onClick={fetchDashboard} className="text-sm font-semibold text-red-600 hover:underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const hasData = stats && stats.totalInterviews > 0;

  // Find best subject
  let bestSubject = '—';
  if (stats?.subjectBreakdown) {
    let maxAvg = -1;
    for (const [subject, data] of Object.entries(stats.subjectBreakdown)) {
      if (data.averageScore > maxAvg) {
        maxAvg = data.averageScore;
        bestSubject = subject;
      }
    }
  }

  // Last session info
  let lastSession = '—';
  if (stats?.recentReports?.length > 0) {
    const dt = new Date(stats.recentReports[0].createdAt);
    lastSession = dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Derive chart data
  const chartSource = [...allReports].reverse(); // oldest first
  const uniqueSubjects = [...new Set(allReports.map(r => r.subject).filter(Boolean))];
  const chartSubjects = ['All', ...uniqueSubjects];

  // Build a color map: subject → color (stable across renders)
  const subjectColorMap = {};
  uniqueSubjects.forEach((s, i) => { subjectColorMap[s] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });

  const isMultiLine = chartSubjectFilter === 'All' && uniqueSubjects.length > 1;

  let chartData, singleLineColor;

  if (isMultiLine) {
    // Group reports by subject, each subject gets its own score column
    const grouped = {};
    for (const r of chartSource) {
      if (!r.subject) continue;
      if (!grouped[r.subject]) grouped[r.subject] = [];
      grouped[r.subject].push(r);
    }
    const maxLen = Math.max(...Object.values(grouped).map(a => a.length));
    chartData = [];
    for (let i = 0; i < maxLen; i++) {
      const point = { name: `#${i + 1}` };
      for (const [subject, reports] of Object.entries(grouped)) {
        if (reports[i]) {
          point[subject] = reports[i].overallScore != null ? reports[i].overallScore : null;
          point[`${subject}_date`] = new Date(reports[i].createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        }
      }
      chartData.push(point);
    }
  } else {
    // Single subject filter
    const filtered = chartSubjectFilter === 'All'
      ? chartSource
      : chartSource.filter(r => r.subject === chartSubjectFilter);
    chartData = filtered.map((r, index) => ({
      name: `#${index + 1}`,
      date: new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      score: r.overallScore != null ? r.overallScore : 0,
      subject: r.subject
    }));
    singleLineColor = chartSubjectFilter !== 'All' ? (subjectColorMap[chartSubjectFilter] || '#4f46e5') : '#4f46e5';
  }

  const statCards = [
    { label: 'Total Interviews', value: hasData ? stats.totalInterviews : '—', icon: BarChart3, color: 'indigo' },
    { label: 'Average Score', value: hasData && stats.averageScore ? stats.averageScore : '—', icon: TrendingUp, color: 'emerald' },
    { label: 'Best Subject', value: hasData ? bestSubject : '—', icon: Award, color: 'amber' },
    { label: 'Last Session', value: hasData ? lastSession : '—', icon: Clock, color: 'sky' },
  ];

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-transparent flex flex-col transition-colors duration-300">
      <div className="flex-1 flex flex-col items-center pt-16 sm:pt-24 px-6 max-w-5xl mx-auto w-full">
        {/* Welcome Section */}
        <div className="text-center mb-10 w-full">
          <h2 className="text-center text-4xl sm:text-6xl font-serif text-slate-800 dark:text-white tracking-tight mb-4 inline-block">
            Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-rose-500">{firstName || 'Candidate'}</span>.
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base font-medium max-w-lg mx-auto">
            Ready to conquer your next interview? Let&apos;s sharpen those skills and track your progress.
          </p>
        </div>

        {/* Action Button */}
        <Link
          href="/app/interview"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 dark:bg-indigo-600 px-8 py-3.5 text-sm font-bold text-white hover:bg-slate-800 dark:hover:bg-indigo-700 hover:-translate-y-0.5 transition-all mb-20 shadow-lg shadow-slate-900/20 dark:shadow-indigo-900/20"
        >
          Start New Interview <span className="ml-1 opacity-70">→</span>
        </Link>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full mb-16">
          {statCards.map((stat, idx) => {
            const gradients = [
              'from-indigo-400 to-indigo-500',
              'from-emerald-400 to-emerald-500',
              'from-amber-400 to-amber-500',
              'from-sky-400 to-sky-500'
            ];
            const textColors = [
              'text-indigo-400',
              'text-emerald-400',
              'text-amber-400',
              'text-sky-400'
            ];
            return (
              <div key={stat.label} className="bg-white dark:bg-slate-900/40 dark:backdrop-blur-xl rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none border border-slate-100 dark:border-white/10 flex flex-col items-center justify-center text-center relative overflow-hidden transition-transform hover:-translate-y-1">
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradients[idx % 4]}`}></div>
                <div className={`${textColors[idx % 4]} mb-2`}>
                  <stat.icon className="h-6 w-6 mx-auto" />
                </div>
                <p className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 tracking-[0.2em] mb-4 uppercase">{stat.label}</p>
                <p className={`text-3xl font-serif font-bold text-slate-800 dark:text-white ${stat.label === 'Last Session' && stat.value !== '—' ? 'text-xl' : ''}`}>{stat.value}</p>
              </div>
            );
          })}
        </div>

      {hasData && allReports.length > 0 && (
        <div className="mb-10 w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 dark:backdrop-blur-xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-xl sm:text-2xl font-serif font-bold text-slate-800 dark:text-white mb-1">Performance Trend</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {chartSubjectFilter === 'All'
                  ? `All ${chartData.length} interview${chartData.length !== 1 ? 's' : ''}`
                  : `${chartData.length} ${chartSubjectFilter} interview${chartData.length !== 1 ? 's' : ''}`
                }
              </p>
            </div>
          </div>
          {/* Subject filter pills */}
          <div className="flex flex-wrap gap-2 mb-4">
            {chartSubjects.map((s) => (
              <button
                key={s}
                onClick={() => setChartSubjectFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  chartSubjectFilter === s
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="h-[300px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, bottom: 25, left: 15 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  dy={10}
                  label={{ value: 'Interview Timeline', position: 'insideBottom', offset: -15, fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                />
                <YAxis 
                  domain={[0, 100]} 
                  ticks={[0, 20, 40, 60, 80, 100]}
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  dx={-10}
                  label={{ value: 'Score: X / 100', angle: -90, position: 'insideLeft', offset: -5, fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '4px' }}
                  formatter={(value, name) => value != null ? [`${value}/100`, name] : null}
                  labelFormatter={(label) => `Interview ${label}`}
                />
                {isMultiLine ? (
                  uniqueSubjects.map((subject) => (
                    <Line
                      key={subject}
                      type="monotone"
                      dataKey={subject}
                      name={subject}
                      stroke={subjectColorMap[subject]}
                      strokeWidth={2.5}
                      dot={{ r: 3.5, strokeWidth: 2, fill: '#fff', stroke: subjectColorMap[subject] }}
                      activeDot={{ r: 5, strokeWidth: 0, fill: subjectColorMap[subject] }}
                      connectNulls={false}
                      animationDuration={1500}
                    />
                  ))
                ) : (
                  <Line 
                    type="monotone" 
                    dataKey="score" 
                    stroke={singleLineColor}
                    strokeWidth={3} 
                    dot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: singleLineColor }}
                    activeDot={{ r: 6, strokeWidth: 0, fill: singleLineColor }}
                    animationDuration={1500}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        {/* Color legend for multi-line mode */}
          {isMultiLine && (
            <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-slate-100 dark:border-white/10">
              {uniqueSubjects.map((subject) => (
                <div key={subject} className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: subjectColorMap[subject] }} />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{subject}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!hasData ? (
        /* Empty state */
        <div className="rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 p-16 text-center max-w-4xl mx-auto mt-4 mb-12 shadow-[inset_0_2px_20px_rgba(0,0,0,0.02)]">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-100 dark:border-indigo-500/30 mb-6 shadow-sm">
            <Mic className="h-10 w-10 text-indigo-500 dark:text-indigo-400" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">No interviews yet</h3>
          <p className="text-base text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed mb-8 font-medium">
            Complete your first interview to see your performance data here. Your scores, subjects, and trends will populate automatically.
          </p>
          <Link
            href="/app/interview"
            className="inline-flex items-center rounded-2xl bg-slate-900 dark:bg-indigo-600 px-8 py-4 text-sm font-bold tracking-wide text-white shadow-lg shadow-slate-900/20 dark:shadow-indigo-900/20 hover:bg-slate-800 dark:hover:bg-indigo-700 transition-all hover:-translate-y-0.5 active:scale-[0.98]"
          >
            <Mic className="h-5 w-5 mr-3 opacity-70" />
            Start an Interview
          </Link>
        </div>
      ) : (
        <>
          {/* Subject Breakdown */}
          {stats?.subjectBreakdown && Object.keys(stats.subjectBreakdown).length > 0 && (
            <div className="mb-10 w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 dark:backdrop-blur-xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none">
              <h3 className="text-xl sm:text-2xl font-serif font-bold text-slate-800 dark:text-white mb-6">Per-Subject Breakdown</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(stats.subjectBreakdown).map(([subject, data]) => {
                  const domainIcon = SUBJECT_ICONS[subject] || SUBJECT_ICONS['Python'];
                  return (
                  <div key={subject} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {typeof domainIcon === 'string' ? (
                          <img src={domainIcon} alt={subject} className="w-5 h-5" />
                        ) : (
                          domainIcon()
                        )}
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{subject}</span>
                      </div>
                      <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{data.count} interview{data.count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-slate-900 dark:text-white">{parseFloat(Number(data.averageScore).toFixed(1))}</span>
                      <span className="text-sm text-slate-400 dark:text-slate-500 pb-0.5">avg score</span>
                    </div>
                    <div className="mt-3 h-2 w-full bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          data.averageScore >= 80 ? 'bg-emerald-500' :
                          data.averageScore >= 60 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(data.averageScore, 100)}%` }}
                      />
                    </div>
                  </div>
                )})}
              </div>
            </div>
          )}

          {/* Recent Reports */}
          {stats?.recentReports?.length > 0 && (
            <div className="w-full">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl sm:text-2xl font-serif font-bold text-slate-800 dark:text-white">Recent Interviews</h3>
                {allReports.length > 5 && (
                  <button onClick={openHistory} className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
                    View All
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {allReports.slice(0, 5).map((report) => {
                  const domainIcon = SUBJECT_ICONS[report.subject] || SUBJECT_ICONS['Python'];
                  return (
                  <div
                    key={report.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openReport(report.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') openReport(report.id); }}
                    className="w-full flex items-center justify-between rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-5 py-4 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-500/50 transition-all cursor-pointer text-left group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-white/5 shadow-sm">
                        {typeof domainIcon === 'string' ? (
                          <img src={domainIcon} alt={report.subject} className="w-5 h-5" />
                        ) : (
                          domainIcon()
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white leading-none mb-1">
                          {report.subject} {report.subtopic ? `— ${report.subtopic}` : ''}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {report.difficulty} · {report.durationMinutes} min
                          {report.skillLevel ? ` · ${report.skillLevel}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => downloadPdf(e, report.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 dark:bg-white/10 text-slate-400 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        title="Download PDF"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <div className="relative text-right ml-2 min-w-[70px] h-[36px] flex items-center justify-end">
                        <div className="absolute inset-y-0 right-0 flex flex-col justify-center opacity-100 group-hover:opacity-0 transition-opacity duration-200 pointer-events-none">
                          <p className="text-xs font-medium text-slate-400 whitespace-nowrap">
                            {new Date(report.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric', month: 'short'
                            })}
                          </p>
                        </div>
                        <div className="absolute inset-y-0 right-0 flex flex-col items-end justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
                          <span className={`text-[13px] font-bold leading-tight ${
                            report.overallScore >= 80 ? 'text-emerald-600' :
                            report.overallScore >= 60 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            Score: {report.overallScore != null ? parseFloat(Number(report.overallScore).toFixed(1)) : '—'}
                          </span>
                          {report.hireRecommendation && (
                            <span className={`text-[11px] font-semibold leading-tight mt-0.5 ${
                              report.hireRecommendation === 'Yes' ? 'text-emerald-600' :
                              report.hireRecommendation === 'No' ? 'text-red-600' : 'text-amber-600'
                            }`}>
                              {report.hireRecommendation === 'Yes' ? '✓ Hire' :
                               report.hireRecommendation === 'No' ? '✗ No Hire' : '~ Maybe'}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-500 group-hover:text-indigo-500 transition-colors shrink-0 ml-1" />
                    </div>
                  </div>
                )})}
              </div>
            </div>
          )}
        </>
      )}

      {/* Report Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeReport}
          />
          {/* Modal content */}
          <div className="relative z-10 w-full max-w-5xl max-h-[90vh] overflow-y-auto mt-[5vh] mx-4 rounded-3xl bg-slate-50 dark:bg-slate-900 dark:border dark:border-white/10 shadow-2xl">
            {/* Close button */}
            <button
              onClick={closeReport}
              className="sticky top-4 float-right mr-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 dark:bg-white/10 backdrop-blur-sm border border-slate-200 dark:border-white/10 shadow-sm hover:bg-slate-100 dark:hover:bg-white/20 transition-colors"
            >
              <X className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </button>

            {reportLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : selectedReport?.reportJson ? (
              <div className="pb-8">
                <EvaluationReport report={selectedReport.reportJson} reportId={selectedReport.id} />
              </div>
            ) : (
              <div className="py-24 text-center text-sm text-slate-500 dark:text-slate-400">
                Report data not available.
              </div>
            )}
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setHistoryOpen(false)}
          />
          <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto mt-[5vh] mx-4 rounded-3xl bg-white dark:bg-slate-900 dark:border dark:border-white/10 shadow-2xl">
            {/* Header */}
            <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-100 dark:border-white/10 rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-500/20">
                  <History className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Interview History</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{allReports.length} session{allReports.length !== 1 ? 's' : ''} total</p>
                </div>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
              >
                <X className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {allReportsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                </div>
              ) : allReports.length === 0 ? (
                <div className="py-16 text-center">
                  <Mic className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">No interview sessions found.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {allReports.map((report) => {
                    const domainIcon = SUBJECT_ICONS[report.subject] || SUBJECT_ICONS['Python'];
                    return (
                    <div
                      key={report.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => { setHistoryOpen(false); openReport(report.id); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { setHistoryOpen(false); openReport(report.id); } }}
                      className="w-full flex items-center justify-between rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-5 py-4 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-500/50 hover:bg-white dark:hover:bg-white/10 transition-all cursor-pointer text-left group"
                    >
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-white/5 shadow-sm">
                            {typeof domainIcon === 'string' ? (
                              <img src={domainIcon} alt={report.subject} className="w-5 h-5" />
                            ) : (
                              domainIcon()
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white leading-none mb-1">
                              {report.subject} {report.subtopic ? `— ${report.subtopic}` : ''}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {report.difficulty} · {report.durationMinutes} min
                              {report.skillLevel ? ` · ${report.skillLevel}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadPdf(e, report.id); }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-white/10 text-slate-400 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors border border-slate-200 dark:border-white/5"
                            title="Download PDF"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <div className="relative text-right ml-2 min-w-[70px] h-[36px] flex items-center justify-end">
                            <div className="absolute inset-y-0 right-0 flex flex-col justify-center opacity-100 group-hover:opacity-0 transition-opacity duration-200 pointer-events-none">
                              <p className="text-xs font-medium text-slate-400 whitespace-nowrap">
                                {new Date(report.createdAt).toLocaleDateString('en-IN', {
                                  day: 'numeric', month: 'short', year: 'numeric'
                                })}
                              </p>
                            </div>
                            <div className="absolute inset-y-0 right-0 flex flex-col items-end justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
                              <span className={`text-[13px] font-bold leading-tight ${
                                report.overallScore >= 80 ? 'text-emerald-600' :
                                report.overallScore >= 60 ? 'text-amber-600' : 'text-red-600'
                              }`}>
                                Score: {report.overallScore != null ? parseFloat(Number(report.overallScore).toFixed(1)) : '—'}
                              </span>
                              {report.hireRecommendation && (
                                <span className={`text-[11px] font-semibold leading-tight mt-0.5 ${
                                  report.hireRecommendation === 'Yes' ? 'text-emerald-600' :
                                  report.hireRecommendation === 'No' ? 'text-red-600' : 'text-amber-600'
                                }`}>
                                  {report.hireRecommendation === 'Yes' ? '✓ Hire' :
                                   report.hireRecommendation === 'No' ? '✗ No Hire' : '~ Maybe'}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-500 group-hover:text-indigo-500 transition-colors shrink-0 ml-1" />
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
