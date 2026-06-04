"use client";

import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { LineChart, Eye, Sparkles } from 'lucide-react';

export default function EntryPage() {
  const { scrollY } = useScroll();
  
  // Dynamically calculate blur and darkening overlay based on scroll position
  // 0 scroll = 2px blur (baseline), 500 scroll = 16px blur
  const dynamicBlur = useTransform(scrollY, [0, 500], [2, 20]);
  const backdropFilter = useTransform(dynamicBlur, blur => `blur(${blur}px)`);
  // Darken slightly more as we scroll down to make features pop
  const overlayOpacity = useTransform(scrollY, [0, 500], [0.4, 0.7]);

  return (
    <main className="relative min-h-screen w-full bg-background text-foreground font-body overflow-hidden">
      
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
        <motion.div 
          className="absolute inset-0 bg-[#06141f]"
          style={{ 
            opacity: overlayOpacity,
            backdropFilter: backdropFilter,
            WebkitBackdropFilter: backdropFilter
          }} 
        />
      </div>

      {/* Navigation Bar */}
      <nav className="relative z-10 flex flex-row justify-between px-8 py-6 max-w-7xl mx-auto items-center">
        <Link 
          href="/" 
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          AI Interviewer<sup className="text-xs">®</sup>
        </Link>
        
        <div className="hidden md:flex items-center gap-8">
          <Link href="/" className="text-sm text-foreground hover:text-white transition-colors">Home</Link>
          <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</Link>
        </div>

        <Link 
          href="/login" 
          className="liquid-glass rounded-full px-6 py-2.5 text-sm text-foreground hover:scale-[1.03] transition-transform"
        >
          Register
        </Link>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-32 pb-40 py-[90px]">
        <h1 
          className="text-5xl sm:text-7xl md:text-8xl leading-[0.95] tracking-[-2.46px] max-w-7xl font-normal text-foreground animate-fade-rise mx-auto"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          Where <em className="not-italic text-muted-foreground">dreams</em> rise <em className="not-italic text-muted-foreground">through the silence.</em>
        </h1>
        
        <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mt-8 leading-relaxed animate-fade-rise-delay mx-auto">
          We're designing tools for deep thinkers, bold creators, and quiet rebels. Amid the chaos, we build digital spaces for sharp focus and inspired work.
        </p>

        <Link 
          href="/login" 
          className="liquid-glass rounded-full px-14 py-5 text-base text-foreground mt-12 hover:scale-[1.03] cursor-pointer animate-fade-rise-delay-2 transition-transform inline-flex"
        >
          Begin Journey
        </Link>
      </section>

      {/* Features Section - Premium Cinematic */}
      <section id="features" className="relative z-10 w-full px-6 py-32 mt-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto mb-24">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-5xl lg:text-7xl font-normal text-white drop-shadow-2xl"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              The tools for your <em className="not-italic text-white/60">masterpiece</em>
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="mt-8 text-lg sm:text-xl text-white/50 font-light leading-relaxed max-w-2xl mx-auto"
            >
              Our AI evaluates your responses, tracks your body language, and provides actionable guidance in a completely distraction-free space.
            </motion.p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-10">
            {[
              {
                title: "Real-time Analytics",
                description: "Receive instant feedback on your tone, pace, and clarity. Adjust your approach on the fly with live scoring.",
                icon: LineChart,
                delay: 0.1
              },
              {
                title: "Behavioral Insights",
                description: "Our vision AI evaluates body language and presence, ensuring you project confidence in every answer.",
                icon: Eye,
                delay: 0.2
              },
              {
                title: "Interactive Guidance",
                description: "Stuck on a concept? Access our AI teacher via the Guidance section to clarify doubts without feeling judged.",
                icon: Sparkles,
                delay: 0.3
              }
            ].map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.8, delay: feature.delay, ease: [0.21, 0.47, 0.32, 0.98] }}
                className="group relative rounded-3xl p-[1px] overflow-hidden"
              >
                {/* Glowing border effect */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                
                <div className="relative h-full bg-[#0a1a2a]/60 backdrop-blur-xl border border-white/5 rounded-3xl p-10 hover:bg-[#0d2238]/80 transition-colors duration-500 flex flex-col items-center text-center">
                  <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent rounded-3xl pointer-events-none" />
                  
                  <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(255,255,255,0.05)] group-hover:scale-110 group-hover:bg-white/10 group-hover:shadow-[0_0_40px_rgba(255,255,255,0.1)] transition-all duration-500">
                    <feature.icon className="w-7 h-7 text-white/70 group-hover:text-white transition-colors duration-500" />
                  </div>
                  
                  <h3 
                    className="text-3xl font-normal text-white mb-4 tracking-wide"
                    style={{ fontFamily: "'Instrument Serif', serif" }}
                  >
                    {feature.title}
                  </h3>
                  
                  <p className="text-white/50 text-base leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-white/5 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-6 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 opacity-50">
            <span 
              className="text-lg text-foreground"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              AI Interviewer®
            </span>
          </div>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} AI Interviewer. All rights reserved.</p>
        </div>
      </footer>

    </main>
  );
}
