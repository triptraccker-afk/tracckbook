import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Auth from '../components/Auth';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  FileSpreadsheet, 
  BarChart3, 
  CheckCircle, 
  ArrowRight, 
  Upload, 
  Download, 
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function Login({ 
  theme = 'light',
  initialMode = 'signin'
}: { 
  theme: 'light' | 'dark';
  initialMode?: 'signin' | 'signup' | 'forgot';
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isDesktop, setIsDesktop] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    // Detect desktop (>= 1024px) responsive boundary without touch
    const handleResize = () => {
      const largeScreen = window.innerWidth >= 1024;
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsDesktop(largeScreen && !hasTouch);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      if (!supabase) return;
      const res = await supabase.auth.getSession();
      const session = res?.data?.session || null;
      if (session) {
        navigate('/');
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && event !== 'PASSWORD_RECOVERY') {
        navigate('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Slideshow interval for desktop left-side showcase
  useEffect(() => {
    if (!isDesktop) return;
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % 3);
    }, 6000);
    return () => clearInterval(interval);
  }, [isDesktop]);

  const hasLogoutReason = sessionStorage.getItem('logout_reason') !== null;

  // Showcase slide assets & state representations
  const slides = [
    {
      title: "Hero AI Receipt scanning",
      tagline: "TrackBook AI Extraction Engine",
      description: "Take quick snapshots of invoices on your smartphone or drop them on your screen. TrackBook parses amounts, dates, and categories instantly.",
      icon: Sparkles,
      color: "from-amber-500/20 to-orange-500/20 text-amber-500",
      content: (
        <div className="space-y-4 font-mono text-[11px] h-full flex flex-col justify-between">
          <div className="flex items-center justify-between border-b pb-2 text-slate-400 dark:text-zinc-500 border-dashed border-slate-200 dark:border-zinc-800">
            <span>RECEIPT_OCR_SCANNER</span>
            <span className="text-blue-500 font-extrabold animate-pulse">Scanning...</span>
          </div>
          
          {/* Animated Scanning representation */}
          <div className="relative rounded-2xl border p-4 bg-white dark:bg-zinc-950 border-slate-100 dark:border-zinc-900 shadow-md flex-1 flex flex-col justify-center gap-3">
            <div className="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 shadow-lg animate-bounce" style={{ animationDuration: '3s' }} />
            
            <div className="flex justify-between text-slate-500">
              <span>Vendor Name:</span>
              <span className="font-extrabold text-slate-800 dark:text-slate-200">Mumbai Broadband Ltd</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Bill Reference:</span>
              <span className="font-extrabold text-slate-800 dark:text-slate-200">#MB-44850-2026</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span className="text-amber-500 font-bold flex items-center gap-1">★ Net Captured:</span>
              <span className="font-black text-emerald-600 text-xs">₹3,499.00</span>
            </div>
          </div>
          
          <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 border border-emerald-500/15 p-2 rounded-xl flex items-center gap-2">
            <CheckCircle size={14} />
            <span>Successfully created cash outflow item without manual inputs!</span>
          </div>
        </div>
      )
    },
    {
      title: "Clean Import & Export Hub",
      tagline: "Move your books without boundaries",
      description: "Bring historical transactions directly from Excel spreadsheet logs or CSV sheets. Download professionally formatted boardroom PDF and XLSX books in 1-click.",
      icon: FileSpreadsheet,
      color: "from-emerald-500/20 to-teal-500/20 text-emerald-500",
      content: (
        <div className="space-y-4 font-mono text-[11px] h-full flex flex-col justify-between">
          <div className="flex items-center justify-between border-b pb-2 text-slate-400 dark:text-zinc-500 border-dashed border-slate-200 dark:border-zinc-800">
            <span>LEDGER_DATA_MIGRATOR</span>
            <span className="text-emerald-500 font-bold">System Online</span>
          </div>

          <div className="grid grid-cols-2 gap-3 flex-1 items-center">
            <div className="p-3 border rounded-xl bg-white dark:bg-zinc-950 border-slate-100 dark:border-zinc-900 shadow-sm flex flex-col items-center justify-center text-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-500/10 mb-1">
                <Upload size={14} className="animate-bounce" />
              </div>
              <span className="font-black text-[9px] text-slate-800 dark:text-slate-200">Excel / CSV Import</span>
              <span className="text-[8px] text-slate-400">Maps custom tables</span>
            </div>

            <div className="p-3 border rounded-xl bg-white dark:bg-zinc-950 border-slate-100 dark:border-zinc-900 shadow-sm flex flex-col items-center justify-center text-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/10 mb-1">
                <Download size={14} />
              </div>
              <span className="font-black text-[9px] text-slate-800 dark:text-slate-200">XLSX & PDF Export</span>
              <span className="text-[8px] text-slate-400">1-click direct download</span>
            </div>
          </div>

          <div className="bg-blue-550/10 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/15 p-2 rounded-xl flex items-center justify-center gap-2">
            <span>Supports bulk row ingestions up to 10MB formats</span>
          </div>
        </div>
      )
    },
    {
      title: "Real-time Cash Analytics",
      tagline: "Always know your direct net margin",
      description: "Watch weekly cash-flow proportions, category allocations, payment trends, and monthly reports recalculate instantly. No bookkeeping experience needed.",
      icon: BarChart3,
      color: "from-indigo-500/20 to-blue-500/20 text-indigo-500",
      content: (
        <div className="space-y-4 font-mono text-[11px] h-full flex flex-col justify-between">
          <div className="flex items-center justify-between border-b pb-2 text-slate-400 dark:text-zinc-500 border-dashed border-slate-200 dark:border-zinc-800">
            <span>ANALYTICS_REPORT_STUDIO</span>
            <span className="text-indigo-500 font-bold">₹ INR Defaults</span>
          </div>

          <div className="space-y-2 flex-1 flex flex-col justify-center">
            {/* Net monthly bar indicators with Rupee symbols */}
            <div className="space-y-1.5 bg-white dark:bg-zinc-950 border p-3 rounded-2xl">
              <div className="flex justify-between text-slate-500">
                <span>Total Cash Inflow:</span>
                <span className="font-extrabold text-emerald-500">₹2,85,450.00</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Total Cash Outflow:</span>
                <span className="font-extrabold text-rose-500">₹94,110.00</span>
              </div>
              <div className="border-t border-slate-100 dark:border-zinc-900 pt-1.5 flex justify-between">
                <span className="font-bold text-indigo-550 text-blue-500">Net Business Margin:</span>
                <span className="font-black text-blue-600 dark:text-blue-400">₹1,91,340.00</span>
              </div>
            </div>
          </div>

          <div className="h-6 flex items-center justify-between px-3 text-[9px] text-slate-400 font-bold">
            <span>Jan 85%</span>
            <span>Feb 92%</span>
            <span>Mar 96%</span>
            <span className="text-emerald-500">Apr 100% ✓</span>
          </div>
        </div>
      )
    }
  ];

  const handleSlideChange = (index: number) => {
    setActiveSlide(index);
  };

  return (
    <div className={cn(
      "min-h-screen font-sans transition-colors duration-300 relative",
      theme === 'dark' ? "bg-black" : "bg-[#f8fafc]"
    )}>
      {/* Show Auth on Desktop has the full split-layout screen */}
      {isDesktop ? (
        <div className="flex flex-row min-h-screen">
          
          {/* LEFT SIDE: Feature Showcase Grid (60% width, 55% on xl) */}
          <div className={cn(
            "w-[60%] xl:w-[55%] flex flex-col justify-between p-12 relative overflow-hidden border-r shrink-0",
            theme === 'dark' 
              ? "bg-zinc-950/20 border-zinc-950" 
              : "bg-gradient-to-br from-[#eff6ff] via-white to-[#f5f3ff] border-slate-100 shadow-[20px_0_50px_-20px_rgba(0,0,0,0.015)]"
          )}>
            {/* Header decoration */}
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-1.5 selection:bg-blue-300 cursor-pointer" onClick={() => navigate('/')}>
                <span className="text-[20px] font-extrabold text-blue-600 tracking-tight">Track</span>
                <span className={cn(
                  "text-[20px] font-extrabold tracking-tight",
                  theme === 'dark' ? "text-slate-100" : "text-slate-900"
                )}>Book</span>
              </div>
              
              <button
                type="button"
                onClick={() => navigate('/')}
                className={cn(
                  "flex items-center gap-1.5 bg-white dark:bg-zinc-900 px-3.5 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all active:scale-95 cursor-pointer shadow-sm",
                  theme === 'dark' ? "border-zinc-800" : "border-slate-150"
                )}
              >
                ← Back to Home
              </button>
            </div>

            {/* Slide Body Container */}
            <div className="my-auto max-w-xl mx-auto w-full py-10 relative z-10 space-y-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSlide}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-widest border inline-block",
                      slides[activeSlide].color
                    )}>
                      {slides[activeSlide].tagline}
                    </span>
                    <h2 className={cn(
                      "text-3xl font-extrabold tracking-tight leading-tight",
                      theme === 'dark' ? "text-white" : "text-slate-900"
                    )}>
                      {slides[activeSlide].title}
                    </h2>
                    <p className={cn(
                      "text-xs leading-relaxed font-medium transition-colors",
                      theme === 'dark' ? "text-zinc-400" : "text-slate-500"
                    )}>
                      {slides[activeSlide].description}
                    </p>
                  </div>

                  {/* Rich Mockup Canvas container */}
                  <div className={cn(
                    "rounded-3xl border p-5 shadow-xl transition-all duration-300 min-h-[220px]",
                    theme === 'dark' ? "bg-black border-zinc-900" : "bg-white border-slate-150 shadow-slate-100/40"
                  )}>
                    {slides[activeSlide].content}
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Progress Slider Selector dots */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-zinc-900/50">
                <div className="flex items-center gap-2">
                  {slides.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleSlideChange(index)}
                      className={cn(
                        "h-2 rounded-full transition-all duration-300 cursor-pointer",
                        activeSlide === index 
                          ? "w-8 bg-blue-600" 
                          : (theme === 'dark' ? "w-2 bg-zinc-800 hover:bg-zinc-700" : "w-2 bg-slate-200 hover:bg-slate-350")
                      )}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveSlide((prev) => (prev - 1 + 3) % 3)}
                    type="button"
                    className={cn(
                      "p-1.5 rounded-lg border cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900 transition-colors",
                      theme === 'dark' ? "border-zinc-850" : "border-slate-200"
                    )}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => setActiveSlide((prev) => (prev + 1) % 3)}
                    type="button"
                    className={cn(
                      "p-1.5 rounded-lg border cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900 transition-colors",
                      theme === 'dark' ? "border-zinc-850" : "border-slate-200"
                    )}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Footer metrics info */}
            <div className="text-[10px] font-mono text-slate-450 flex items-center justify-between relative z-10 border-t border-slate-100 dark:border-zinc-900/50 pt-4">
              <span>TrackBook Inc. Safe Origin Sandbox Layout</span>
              <span className="text-emerald-500 font-bold shrink-0">₹ INR Localized ✓</span>
            </div>
          </div>

          {/* RIGHT SIDE: Dedicated Auth Box area (40% width, 45% on xl) */}
          <div className={cn(
            "w-[40%] xl:w-[45%] flex flex-col justify-center items-center p-8 relative overflow-y-auto shrink-0",
            theme === 'dark' ? "bg-black" : "bg-white shadow-[inset_1px_0_0_0_rgba(148,163,184,0.1)]"
          )}>
            {hasLogoutReason && (
              <div className="w-full max-w-[380px] sm:max-w-[420px] mb-4 p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs flex items-center gap-2 font-black border border-rose-100 dark:border-rose-900/30">
                <AlertCircle size={16} className="text-rose-500 shrink-0" />
                <span>You were logged out due to inactivity.</span>
              </div>
            )}
            
            {/* The actual direct structured Auth form */}
            <Auth theme={theme} isDesktop={true} />
          </div>

        </div>
      ) : (
        /* Mobile Layout remains simple, lightweight and super fast (Rule 11) */
        <div className={cn(
          "relative min-h-screen flex flex-col pb-12",
          theme === 'dark' ? "bg-zinc-950" : "bg-slate-50"
        )}>
          {/* Mobile Simplified Navbar */}
          <div className="w-full flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-900/50 bg-white/50 dark:bg-black/50 backdrop-blur-md">
            <div className="flex items-center gap-1 cursor-pointer" onClick={() => navigate('/')}>
              <span className="text-[18px] font-extrabold text-blue-600 tracking-tight">Track</span>
              <span className={cn(
                "text-[18px] font-extrabold tracking-tight",
                theme === 'dark' ? "text-slate-100" : "text-slate-900"
              )}>Book</span>
            </div>
            
            <button
              type="button"
              onClick={() => navigate('/')}
              className={cn(
                "flex items-center gap-1 bg-white dark:bg-zinc-900 px-3.5 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all cursor-pointer shadow-sm",
                theme === 'dark' ? "border-zinc-800" : "border-slate-200"
              )}
            >
              Back to Home
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
              <Auth theme={theme} isDesktop={false} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
