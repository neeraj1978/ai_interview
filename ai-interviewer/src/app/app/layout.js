"use client";

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/context/AuthContext';
import {
  Menu, X, Mic, LayoutDashboard, BookOpen, LogOut,
  ChevronDown, BrainCircuit, Loader2, FileSearch, UserCircle, Sun, Moon
} from 'lucide-react';
import { useTheme } from 'next-themes';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
  { label: 'Interview', href: '/app/interview', icon: Mic },
  { label: 'Guidance', href: '/app/guidance', icon: BookOpen },
  { label: 'ATS Check', href: '/app/ats', icon: FileSearch },
];

const LottiePlayer = dynamic(
  () => import('@lottiefiles/react-lottie-player').then((mod) => mod.Player),
  { ssr: false, loading: () => <div className="w-full h-full bg-slate-100 rounded-full animate-pulse" /> }
);

export default function AppLayout({ children }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [loading, isAuthenticated, router]);

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    const handler = () => setProfileOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [profileOpen]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!isAuthenticated) return null; // Will redirect via useEffect

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const initials = user?.fullName
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-slate-950 dark:via-[#081021] dark:to-black overflow-hidden transition-colors duration-300">
      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50
          w-64 bg-white dark:bg-[#0a0f1c]/80 dark:backdrop-blur-xl border-r border-slate-200 dark:border-white/10
          flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo header */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-slate-100 dark:border-white/5 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">AI Interviewer</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-200
                  ${isActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'}
                `}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout at bottom */}
        <div className="p-3 border-t border-slate-100 dark:border-white/5 shrink-0">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            Log out
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 z-10">
        {/* Top bar */}
        <header className="h-16 bg-white/80 dark:bg-[#0a0f1c]/60 backdrop-blur-md border-b border-slate-200 dark:border-white/10 flex items-center justify-between px-4 sm:px-6 shrink-0 z-20 transition-colors duration-300">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <Menu className="h-5 w-5 text-slate-600 dark:text-slate-300" />
          </button>

          {/* Page title (desktop) */}
          <div className="hidden lg:block">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {NAV_ITEMS.find(item => pathname.startsWith(item.href))?.label || 'AI Interviewer'}
            </h2>
          </div>

          <div className="relative ml-auto flex items-center gap-3">
            {/* Theme Toggle */}
            {mounted && (
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors"
                aria-label="Toggle Dark Mode"
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
            )}

            {/* User profile button */}
            <button
              onClick={(e) => { e.stopPropagation(); setProfileOpen(!profileOpen); }}
              className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-white/10 shadow-sm">
                <LottiePlayer 
                  src="/profile.json" 
                  className="w-full h-full transform scale-150"
                  autoplay 
                  loop 
                />
              </div>
              <span className="hidden sm:block text-sm font-medium text-slate-700 dark:text-slate-200 max-w-[120px] truncate">
                {user?.fullName?.split(' ')[0]}
              </span>
              <ChevronDown className={`hidden sm:block h-4 w-4 text-slate-400 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Profile dropdown */}
            {profileOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-white/10 py-1 z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-3 border-b border-slate-100 dark:border-white/10">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user?.fullName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{user?.email}</p>
                </div>
                <Link
                  href="/app/onboarding"
                  onClick={() => setProfileOpen(false)}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
                >
                  <UserCircle className="h-4 w-4" />
                  {user?.profileComplete ? 'Edit Profile' : 'Complete Profile'}
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
