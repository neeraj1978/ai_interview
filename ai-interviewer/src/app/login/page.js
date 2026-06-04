"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, ShieldCheck, CheckCircle, Mail, AlertCircle, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const FullScreenVideoLoader = ({ isVisible }) => (
  <AnimatePresence>
    {isVisible && (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md rounded-3xl"
      >
        <div className="w-32 h-32 rounded-full overflow-hidden mb-4 shadow-2xl shadow-black/50 border border-white/10">
          <video autoPlay loop muted playsInline className="w-full h-full object-cover">
            <source src="/loading.mp4" type="video/mp4" />
          </video>
        </div>
        <p className="text-white/70 font-medium tracking-widest text-sm uppercase">Please wait...</p>
      </motion.div>
    )}
  </AnimatePresence>
);

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [passwordInvalid, setPasswordInvalid] = useState(false);

  // OTP verification state
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);

  const { login, register, sendRegistrationOtp } = useAuth();
  const router = useRouter();

  const switchMode = (toRegister) => {
    setIsRegister(toRegister);
    setError('');
    setFieldErrors({});
    setOtpSent(false);
    setOtp('');
    setOtpError('');
    setResendCountdown(0);
  };

  // Resend countdown timer
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  const handleSendOtp = async () => {
    setOtpError('');
    setError('');

    if (!fullName.trim()) { setError('Please enter your full name.'); return; }
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (!password) { setError('Please enter a password.'); return; }

    setOtpLoading(true);
    try {
      await sendRegistrationOtp(email);
      setOtpSent(true);
      setResendCountdown(60);
    } catch (err) {
      setOtpError(err.error || err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    // Check password strength
    const passRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-=\[\]{};':"\\|,.<>\/?]).{8,64}$/;
    if (isRegister && !passRegex.test(password)) {
      setPasswordInvalid(true);
      setError('Password does not meet requirements.');
      return;
    } else {
      setPasswordInvalid(false);
    }
    
    // If registering and OTP is not sent yet, send OTP first
    if (isRegister && !otpSent) {
      handleSendOtp();
      return;
    }

    if (isRegister && !otp.trim()) {
      setError('Please enter the verification code.');
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        await register(fullName, email, password, otp);
        router.push('/app/onboarding');
      } else {
        await login(email, password);
        const authData = JSON.parse(localStorage.getItem('auth') || '{}');
        router.push(authData.profileComplete ? '/app/dashboard' : '/app/onboarding');
      }
    } catch (err) {
      if (err.details) {
        setFieldErrors(err.details);
      } else if (err.error) {
        setError(err.error);
      } else if (err.message) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-8 bg-background font-sans selection:bg-white/20 selection:text-white">
      {/* Video Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        >
          <source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-[#06141f]/80 backdrop-blur-md" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="relative z-10 w-full max-w-5xl flex flex-col lg:flex-row liquid-glass rounded-[2rem] sm:rounded-[3rem] overflow-hidden shadow-2xl border border-white/10"
      >
        {/* Left Image Panel Inside Card */}
        <div className="hidden lg:flex lg:w-1/2 relative bg-black/20 p-12 items-center justify-center">
          <img src="/register.png" alt="Concept" className="w-full h-auto max-w-md object-contain drop-shadow-2xl" />
        </div>

        {/* Right Form Panel Inside Card */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center py-12 px-6 sm:px-12 lg:px-16 relative">
          
          <FullScreenVideoLoader isVisible={loading || otpLoading || forgotLoading} />

          <div className="mb-10">
            <Link
              href="/"
              className="inline-flex items-center text-sm font-medium text-white/50 hover:text-white mb-6 transition-colors"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to home
            </Link>

            <h2 
              className="text-4xl sm:text-5xl font-normal text-white mb-2 drop-shadow-lg"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              {isRegister && otpSent ? (
                <>
                  Verify your{' '}
                  <em className="not-italic text-white/60">
                    email
                  </em>
                </>
              ) : isRegister ? (
                <>
                  Create your{' '}
                  <em className="not-italic text-white/60">
                    account
                  </em>
                </>
              ) : (
                <>
                  Sign in to your{' '}
                  <em className="not-italic text-white/60">
                    account
                  </em>
                </>
              )}
            </h2>
            <p className="mt-2 text-sm text-white/70">
              {isRegister && otpSent 
                ? 'We sent a verification code to your email.'
                : isRegister 
                  ? 'Already have an account? ' 
                  : 'Don\'t have an account? '}
              
              {!(isRegister && otpSent) && (
                <button
                  type="button"
                  onClick={() => switchMode(!isRegister)}
                  className="font-semibold text-white hover:text-white/80 transition-colors"
                >
                  {isRegister ? 'Sign in' : 'Create one'}
                </button>
              )}
            </p>
          </div>

          <div className="relative">

          {/* Error banner outside of forms so it applies to both */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl bg-red-900/20 backdrop-blur-sm border border-red-500/30 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {!otpSent ? (
              <motion.div
                key="main-form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                {/* Animated Tab Indicator */}
                <div className="relative flex mb-8 bg-white/5 rounded-xl p-1 backdrop-blur-sm border border-white/10">
                  <button
                    type="button"
                    onClick={() => switchMode(false)}
                    className={`relative z-10 flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors duration-200 ${
                      !isRegister ? 'text-black' : 'text-white/50 hover:text-white/90'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode(true)}
                    className={`relative z-10 flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors duration-200 ${
                      isRegister ? 'text-black' : 'text-white/50 hover:text-white/90'
                    }`}
                  >
                    Create Account
                  </button>
                  <motion.div
                    className="absolute inset-y-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-sm"
                    initial={false}
                    animate={{
                      left: isRegister ? 'calc(50% + 2px)' : '4px'
                    }}
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                  />
                </div>

                <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Full Name (register only) - Animated */}
            <AnimatePresence initial={false}>
              {isRegister && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="pb-1">
                    <label htmlFor="fullName" className="block text-sm font-medium text-white/90">
                      Full Name
                    </label>
                    <div className="mt-1">
                      <input
                        id="fullName"
                        type="text"
                        required={isRegister}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className={`block w-full rounded-xl border px-4 py-3 bg-white/5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-sm transition-all ${
                          fieldErrors.fullName
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                            : 'border-white/10 focus:border-white/30 focus:ring-white/20 hover:border-slate-300'
                        }`}
                        placeholder="John Doe"
                      />
                      {fieldErrors.fullName && (
                        <p className="mt-1 text-xs text-red-400">{fieldErrors.fullName}</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-white/90">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`block w-full rounded-xl border px-4 py-3 bg-white/5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-sm transition-all ${
                    fieldErrors.email
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                      : 'border-white/10 focus:border-white/30 focus:ring-white/20 hover:border-slate-300'
                  }`}
                  placeholder="you@example.com"
                />
                {fieldErrors.email && (
                  <p className="mt-1 text-xs text-red-400">{fieldErrors.email}</p>
                )}
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-white/90">
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`block w-full rounded-xl border px-4 py-3 pr-12 bg-white/5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-sm transition-all ${
                    fieldErrors.password
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                      : 'border-white/10 focus:border-white/30 focus:ring-white/20 hover:border-slate-300'
                  }`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-white/40 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-400">{fieldErrors.password}</p>
              )}
            </div>

            {/* Hints (register only) - Animated */}
            <AnimatePresence initial={false}>
              {isRegister && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden space-y-5"
                >

                  <AnimatePresence>
                    {passwordInvalid && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex flex-col gap-2 rounded-xl bg-red-900/20 border border-red-500/30 px-4 py-3 mt-4"
                      >
                        <p className="text-xs text-red-400 font-medium flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4" />
                          Password Requirements:
                        </p>
                        <ul className="text-xs space-y-1">
                          <li className={`flex items-center gap-2 transition-colors ${password.length >= 8 ? 'text-emerald-400' : 'text-white/50'}`}>
                            {password.length >= 8 ? <Check className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-current" />}
                            At least 8 characters
                          </li>
                          <li className={`flex items-center gap-2 transition-colors ${/[A-Z]/.test(password) ? 'text-emerald-400' : 'text-white/50'}`}>
                            {/[A-Z]/.test(password) ? <Check className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-current" />}
                            One uppercase letter
                          </li>
                          <li className={`flex items-center gap-2 transition-colors ${/\d/.test(password) ? 'text-emerald-400' : 'text-white/50'}`}>
                            {/\d/.test(password) ? <Check className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-current" />}
                            One number
                          </li>
                          <li className={`flex items-center gap-2 transition-colors ${/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) ? 'text-emerald-400' : 'text-white/50'}`}>
                            {/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) ? <Check className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-current" />}
                            One special character
                          </li>
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={loading || otpLoading}
                    className="w-full flex justify-center py-4 px-4 rounded-2xl shadow-sm text-sm font-semibold text-black bg-white hover:bg-white/90 border border-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-colors mt-6 disabled:opacity-50"
                  >
                    {(loading || otpLoading) ? 'Processing...' : (isRegister ? 'Continue' : 'Sign In')}
                  </motion.button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="otp-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <form className="space-y-6" onSubmit={handleSubmit}>
                  <div className="rounded-xl bg-emerald-50/80 backdrop-blur-sm border border-emerald-200/50 p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle className="h-6 w-6 text-emerald-500" />
                      <p className="text-base font-medium text-emerald-800">
                        Verification code sent to <strong>{email}</strong>
                      </p>
                    </div>

                    <label htmlFor="otp" className="block text-sm font-medium text-black/90 mb-2">
                      Enter 6-digit code
                    </label>
                    <input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="block w-full rounded-xl border border-black/10 bg-white text-black px-4 py-4 text-center text-2xl tracking-[0.5em] font-mono placeholder-slate-300 focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/20 transition-all hover:border-slate-400"
                      placeholder="000000"
                      autoComplete="one-time-code"
                    />

                    <div className="flex items-center justify-between mt-4">
                      <button
                        type="button"
                        onClick={() => { setOtpSent(false); setOtp(''); setOtpError(''); }}
                        className="text-sm font-medium text-black/50 hover:text-black/90 transition-colors"
                      >
                        Change email
                      </button>
                      <button
                        type="button"
                        disabled={resendCountdown > 0 || otpLoading}
                        onClick={handleSendOtp}
                        className="text-sm font-medium text-black hover:text-black/80 transition-colors disabled:text-black/40 disabled:cursor-not-allowed"
                      >
                        {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend code'}
                      </button>
                    </div>

                    {otpError && (
                      <p className="mt-3 text-sm text-red-600 text-center">{otpError}</p>
                    )}
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={loading || otpLoading}
                    className="w-full flex justify-center py-4 px-4 rounded-2xl shadow-sm text-sm font-semibold text-black bg-white hover:bg-white/90 border border-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-colors mt-6 disabled:opacity-50"
                  >
                    {(loading || otpLoading) ? 'Processing...' : 'Create Account'}
                  </motion.button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

            {/* Forgot password (login only) */}
            <AnimatePresence initial={false}>
              {!isRegister && !showForgot && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => { setShowForgot(true); setForgotEmail(email); }}
                      className="text-sm font-medium text-white hover:text-white/80 transition-colors"
                    >
                      Forgot your password?
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Forgot password inline form */}
            <AnimatePresence initial={false}>
              {!isRegister && showForgot && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-xl bg-slate-50/80 backdrop-blur-sm border border-white/10 p-4 mt-1">
                    {forgotSent ? (
                      <div className="text-center py-2">
                        <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                        <p className="text-sm font-medium text-white">Check your email</p>
                        <p className="text-xs text-white/50 mt-1">If an account exists, we sent a reset link.</p>
                        <button
                          type="button"
                          onClick={() => { setShowForgot(false); setForgotSent(false); setForgotError(''); }}
                          className="text-xs font-medium text-white hover:text-white/80 mt-3 transition-colors"
                        >
                          Back to sign in
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-white/90 mb-3">Reset your password</p>
                        {forgotError && (
                          <p className="text-xs text-red-400 mb-2">{forgotError}</p>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="email"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            placeholder="Enter your email"
                            className="flex-1 rounded-lg border border-white/10 bg-white/5 text-white px-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all"
                          />
                          <button
                            type="button"
                            disabled={forgotLoading || !forgotEmail}
                            onClick={async () => {
                              setForgotLoading(true);
                              setForgotError('');
                              try {
                                const res = await fetch('http://localhost:8082/api/auth/forgot-password', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ email: forgotEmail }),
                                });
                                if (res.ok) {
                                  setForgotSent(true);
                                } else {
                                  setForgotError('Something went wrong. Try again.');
                                }
                              } catch {
                                setForgotError('Unable to connect. Try again.');
                              } finally {
                                setForgotLoading(false);
                              }
                            }}
                            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 transition-all disabled:opacity-50"
                          >
                            {forgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                            Send
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setShowForgot(false); setForgotError(''); }}
                          className="text-xs font-medium text-white/50 hover:text-white/90 mt-2 transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>


        </div>
        </div>
      </motion.div>
    </div>
  );
}
