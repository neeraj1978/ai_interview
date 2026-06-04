"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, Loader2, ShieldCheck, CheckCircle, XCircle } from 'lucide-react';

import { Suspense } from 'react';

const API_BASE = 'http://localhost:8082';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [step, setStep] = useState('validating'); // validating | form | success | error
  const [errorMessage, setErrorMessage] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setStep('error');
      setErrorMessage('No reset token provided. Please request a new password reset link.');
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/verify-reset-token?token=${token}`);
        if (res.ok) {
          setStep('form');
        } else {
          const data = await res.json();
          setStep('error');
          setErrorMessage(data.message || 'This reset link is invalid or has expired.');
        }
      } catch {
        setStep('error');
        setErrorMessage('Unable to verify the reset link. Please try again later.');
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();

      if (res.ok) {
        setStep('success');
      } else {
        if (data.details?.newPassword) {
          setFormError(data.details.newPassword);
        } else {
          setFormError(data.message || 'Failed to reset password. Please try again.');
        }
      }
    } catch {
      setFormError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-center bg-slate-50 overflow-hidden py-12 sm:px-6 lg:px-8 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/4 rounded-full bg-indigo-200/50 blur-[120px] w-[800px] h-[800px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 rounded-full bg-sky-200/50 blur-[120px] w-[600px] h-[600px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative sm:mx-auto sm:w-full sm:max-w-md z-10"
      >
        <Link
          href="/login"
          className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-indigo-600 mb-6 transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to sign in
        </Link>

        {/* Validating */}
        {step === 'validating' && (
          <div className="bg-white/70 backdrop-blur-xl py-12 px-4 shadow-2xl shadow-indigo-900/5 sm:rounded-3xl sm:px-10 border border-white/50 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-500 mx-auto mb-4" />
            <p className="text-sm text-slate-600">Verifying your reset link...</p>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="bg-white/70 backdrop-blur-xl py-10 px-4 shadow-2xl shadow-indigo-900/5 sm:rounded-3xl sm:px-10 border border-white/50 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 mb-4">
              <XCircle className="h-7 w-7 text-red-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Invalid Reset Link</h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">{errorMessage}</p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-all active:scale-[0.98]"
            >
              Back to Sign In
            </Link>
          </div>
        )}

        {/* Reset Form */}
        {step === 'form' && (
          <>
            <h2 className="text-center text-4xl font-extrabold tracking-tight text-slate-900 mb-2">
              Set a new{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-sky-500">
                password
              </span>
            </h2>
            <p className="mt-2 text-center text-sm text-slate-600 mb-8">
              Enter your new password below to regain access to your account.
            </p>

            <div className="bg-white/70 backdrop-blur-xl py-8 px-4 shadow-2xl shadow-indigo-900/5 sm:rounded-3xl sm:px-10 border border-white/50">
              <AnimatePresence>
                {formError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mb-6"
                  >
                    <div className="rounded-xl bg-red-50/80 backdrop-blur-sm border border-red-100 px-4 py-3 text-sm text-red-700">
                      {formError}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <form className="space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700">
                    New Password
                  </label>
                  <div className="mt-1 relative">
                    <input
                      id="newPassword"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="block w-full rounded-xl border border-slate-200 bg-white/80 text-slate-900 px-4 py-3 pr-12 placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm transition-all hover:border-slate-300"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 hover:text-indigo-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-slate-700">
                    Confirm New Password
                  </label>
                  <div className="mt-1">
                    <input
                      id="confirmNewPassword"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="block w-full rounded-xl border border-slate-200 bg-white/80 text-slate-900 px-4 py-3 placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm transition-all hover:border-slate-300"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-xl bg-indigo-50/50 backdrop-blur-sm border border-indigo-100/50 px-4 py-3">
                  <ShieldCheck className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-indigo-700 leading-relaxed">
                    Password must be 8–64 characters with at least <strong>1 uppercase</strong>, <strong>1 lowercase</strong>, <strong>1 digit</strong>, and <strong>1 special character</strong> (@#$%^&amp;+=!*)
                  </p>
                </div>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="group relative flex w-full justify-center items-center rounded-full bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition-all hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    'Reset Password'
                  )}
                </motion.button>
              </form>
            </div>
          </>
        )}

        {/* Success */}
        {step === 'success' && (
          <div className="bg-white/70 backdrop-blur-xl py-10 px-4 shadow-2xl shadow-indigo-900/5 sm:rounded-3xl sm:px-10 border border-white/50 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 mb-4">
              <CheckCircle className="h-7 w-7 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Password Reset Successful</h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              Your password has been updated. You can now sign in with your new password.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-all active:scale-[0.98]"
            >
              Go to Sign In
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
