import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus,
  TrendingUp, 
  ShieldCheck, 
  UploadCloud, 
  Clock, 
  Zap, 
  Lock, 
  CheckCircle, 
  ChevronRight, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Layers,
  Sparkles,
  FileSpreadsheet,
  FileCheck,
  BarChart3,
  RefreshCw,
  Eye,
  ArrowRight,
  Database,
  Merge,
  Scissors,
  Smartphone,
  Shield,
  Key,
  Laptop,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';

interface TrackBookLandingPageProps {
  theme: 'light' | 'dark';
  onActionClick: (mode: 'signin' | 'signup') => void;
}

export default function SaaSLandingPage({ 
  theme = 'light', 
  onActionClick 
}: TrackBookLandingPageProps) {
  // Smooth scroll helper
  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // ----- FEATURE 1: TRACKBOOK AI SIMULATOR ------
  const [aiDemoStep, setAiDemoStep] = useState<number>(0); 
  // 0: Upload Bill idle, 1: AI Scanning Beam, 2: Extracting details, 3: Completed autofill entry
  const [scannedBill, setScannedBill] = useState({
    name: "Mumbai Tech Supplies Ltd",
    amount: "₹18,450.00",
    date: "June 11, 2026",
    category: "Office Equipment & Furniture",
    description: "Multi-monitor standing desk mount and ergonomics setup",
    notes: "Tax Invoice ID #MB-8840-X. Claimable business expense tag."
  });

  const handleStartAiDemo = () => {
    setAiDemoStep(1);
  };

  useEffect(() => {
    if (aiDemoStep === 1) {
      const timer = setTimeout(() => {
        setAiDemoStep(2);
      }, 1800);
      return () => clearTimeout(timer);
    } else if (aiDemoStep === 2) {
      const timer = setTimeout(() => {
        setAiDemoStep(3);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [aiDemoStep]);

  // ----- FEATURE 2: IMPORT & EXPORT SECURE SEC CODE SIMULATOR -----
  const [transferStep, setTransferStep] = useState<'export' | 'code' | 'import' | 'done'>('export');
  const [exportProgress, setExportProgress] = useState(0);
  const [importProgress, setImportProgress] = useState(0);
  const [secureCode] = useState('TB-789-SEC');

  const startTransferDemo = () => {
    setTransferStep('export');
    setExportProgress(0);
    setImportProgress(0);
    // Simulate export progress
    let interval = setInterval(() => {
      setExportProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setTransferStep('code');
          return 100;
        }
        return p + 10;
      });
    }, 120);
  };

  const simulateImportDemo = () => {
    setTransferStep('import');
    setImportProgress(0);
    let interval = setInterval(() => {
      setImportProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setTransferStep('done');
          return 100;
        }
        return p + 10;
      });
    }, 150);
  };

  // ----- FEATURE 3: BOARDROOM REPORTS SELECTOR -----
  const [activeReportType, setActiveReportType] = useState<'pdf' | 'excel' | 'merge' | 'split'>('pdf');
  const [reportState, setReportState] = useState<'idle' | 'generating' | 'ready'>('idle');
  const [reportProgress, setReportProgress] = useState(0);

  const triggerReportGeneration = () => {
    setReportState('generating');
    setReportProgress(0);
    const interval = setInterval(() => {
      setReportProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setReportState('ready');
          return 100;
        }
        return p + 12;
      });
    }, 150);
  };

  // ----- FEATURE 4: ANALYTICS HOVER DETAIL -----
  const [hoveredDataPoint, setHoveredDataPoint] = useState<'in' | 'out' | 'net' | null>(null);

  // ----- FEATURE DETAIL MODAL STATE -----
  const [selectedFeature, setSelectedFeature] = useState<'trackbook-ai' | 'import-export' | 'reports' | 'analytics' | null>(null);

  return (
    <div className={cn(
      "min-h-screen font-lora transition-colors duration-500 overflow-x-hidden relative selection:bg-blue-500/20 selection:text-blue-500",
      theme === 'dark' 
        ? "bg-[#030303] text-zinc-100" 
        : "bg-[#F9FAFB] text-[#374151]"
    )}>

      {/* Decorative Wave Background Mesh for Hero */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
        {theme === 'dark' ? (
          <>
            <div className="absolute top-[-300px] left-[-200px] w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[140px] animate-pulse" />
            <div className="absolute top-[-100px] right-[-100px] w-[500px] h-[500px] bg-indigo-950/15 rounded-full blur-[160px]" />
          </>
        ) : (
          <>
            <div className="absolute top-[-250px] left-[-150px] w-[550px] h-[550px] bg-blue-200/30 rounded-full blur-[120px]" />
            <div className="absolute top-[-80px] right-[-100px] w-[450px] h-[450px] bg-indigo-150/40 rounded-full blur-[130px] animate-pulse" />
            <div className="absolute top-[400px] left-[20%] w-[350px] h-[350px] bg-teal-50/30 rounded-full blur-[110px]" />
          </>
        )}
      </div>

      {/* Primary Fixed Transparent Nav Bar */}
      <header className={cn(
        "sticky top-0 z-[120] backdrop-blur-md border-b transition-all duration-300",
        theme === 'dark' 
          ? "bg-[#030303]/85 border-zinc-900" 
          : "bg-white/90 border-[#E5E7EB] shadow-sm"
      )}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <span className="text-[22px] font-black text-blue-600 tracking-tight">Track</span>
            <span className={cn(
              "text-[22px] font-black tracking-tight",
              theme === 'dark' ? "text-zinc-100" : "text-[#111111]"
            )}>Book</span>
          </div>

          {/* Desktop scroll items */}
          <nav className="hidden lg:flex items-center gap-10 text-[12px] font-semibold font-lora uppercase tracking-wide">
            <button 
              onClick={() => scrollToId('trackbook-ai')}
              className={cn("hover:text-blue-500 transition-colors uppercase outline-none cursor-pointer", theme === 'dark' ? "text-zinc-400" : "text-[#6B7280]")}
            >
              TrackBook AI
            </button>
            <button 
              onClick={() => scrollToId('import-export')}
              className={cn("hover:text-blue-500 transition-colors uppercase outline-none cursor-pointer", theme === 'dark' ? "text-zinc-400" : "text-[#6B7280]")}
            >
              Import & Export
            </button>
            <button 
              onClick={() => scrollToId('reports')}
              className={cn("hover:text-blue-500 transition-colors uppercase outline-none cursor-pointer", theme === 'dark' ? "text-zinc-400" : "text-[#6B7280]")}
            >
              Reports
            </button>
            <button 
              onClick={() => scrollToId('analytics')}
              className={cn("hover:text-blue-500 transition-colors uppercase outline-none cursor-pointer", theme === 'dark' ? "text-zinc-400" : "text-[#6B7280]")}
            >
              Analytics
            </button>
            <button 
              onClick={() => scrollToId('security')}
              className={cn("hover:text-blue-500 transition-colors uppercase outline-none cursor-pointer", theme === 'dark' ? "text-zinc-400" : "text-[#6B7280]")}
            >
              Security
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onActionClick('signin')}
              className={cn(
                "font-bold font-lora text-[11px] uppercase tracking-wider py-2 px-5 rounded-full transition-all duration-350 cursor-pointer border",
                theme === 'dark' 
                  ? "bg-zinc-900 text-zinc-100 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700" 
                  : "bg-white text-[#374151] border-[#E5E7EB] hover:bg-zinc-50 hover:shadow-md"
              )}
            >
              Sign In
            </button>
            <button
              onClick={() => onActionClick('signup')}
              className="font-bold font-lora text-[11px] uppercase tracking-wider py-2 px-5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white cursor-pointer hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md shadow-blue-500/10 outline-none"
            >
              Create Account
            </button>
          </div>
        </div>
      </header>

      {/* HERO SECTION DECORATED WITH FLOATING ELEMENTS */}
      <section className="relative pt-16 pb-20 md:pt-24 md:pb-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-10 flex flex-col items-center">
        {/* Subtle Wave SVG background behind text */}
        <div className="absolute inset-x-0 top-1/4 h-24 opacity-25 pointer-events-none overflow-hidden">
          <svg className="w-full h-full fill-none stroke-blue-500/20" viewBox="0 0 1440 100" preserveAspectRatio="none">
            <path d="M0,45 C150,65 350,25 600,55 C850,85 1050,45 1200,35 C1350,25 1400,65 1440,55 L1440,100 L0,100 Z" strokeWidth="2" strokeDasharray="5,5" />
          </svg>
        </div>

        <div className="text-center space-y-6 max-w-4xl mx-auto scale-95 lg:scale-100 transition-transform">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25"
          >
            <Sparkles size={12} className="animate-pulse" />
            <span>Introducing TrackBook AI</span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className={cn(
              "text-3xl sm:text-5xl md:text-[64px] font-bold tracking-tight md:tracking-tight leading-[1.15] font-lora",
              theme === 'dark' ? "text-white" : "text-[#111111]"
            )}
          >
            Track Smarter.<br />
            Import Faster.<br />
            Let TrackBook AI Do The Work.
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className={cn(
              "text-xs sm:text-sm md:text-[15px] max-w-3xl mx-auto font-semibold leading-relaxed",
              theme === 'dark' ? "text-zinc-400" : "text-[#374151]"
            )}
          >
            Automatically extract bill details with TrackBook AI, securely transfer entries between users, and generate PDF & Excel reports in seconds.
          </motion.p>

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-3"
          >
            <button
              onClick={() => onActionClick('signup')}
              className="cursor-pointer w-full sm:w-auto font-bold font-lora text-[12px] uppercase tracking-wider text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-8 py-3.5 rounded-2xl transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 group select-none outline-none"
            >
              Create Account
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              onClick={() => onActionClick('signin')}
              className={cn(
                "w-full sm:w-auto text-center font-bold font-lora text-[12px] uppercase tracking-wider px-8 py-3.5 rounded-2xl transition-all border shadow-sm cursor-pointer hover:shadow-md outline-none",
                theme === 'dark'
                  ? "bg-zinc-950 border-zinc-800 text-zinc-350 hover:bg-zinc-900"
                  : "bg-white border-[#E5E7EB] text-[#374151] hover:bg-slate-50 shadow-slate-100/10"
              )}
            >
              Sign In
            </button>
          </motion.div>
        </div>

        {/* Floating cards showcasing quick feature status */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-5xl w-full mt-16 relative">
          <motion.div 
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 4.8, ease: "easeInOut" }}
            onClick={() => setSelectedFeature('trackbook-ai')}
            className={cn(
              "p-5 rounded-2xl border flex items-start gap-4 transition-all hover:scale-[1.02] cursor-pointer",
              theme === 'dark' 
                ? "bg-zinc-950/70 border-zinc-900 shadow-none" 
                : "bg-white border-[#E5E7EB] shadow-[0_8px_30px_rgba(0,0,0,0.02)]"
            )}
          >
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
              <Sparkles size={18} />
            </div>
            <div className="space-y-1 text-left">
              <h4 className={cn("text-xs font-black uppercase tracking-wider", theme === 'dark' ? "text-zinc-100" : "text-[#111111]")}>TrackBook AI</h4>
              <p className={cn("text-[11px] leading-normal font-semibold", theme === 'dark' ? "text-zinc-400" : "text-[#374151]")}>Zero manuals. Snap bills to autofill ledger entries instantly.</p>
            </div>
          </motion.div>

          <motion.div 
            animate={{ y: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 5.2, ease: "easeInOut", delay: 0.3 }}
            onClick={() => setSelectedFeature('reports')}
            className={cn(
              "p-5 rounded-2xl border flex items-start gap-4 transition-all hover:scale-[1.02] cursor-pointer",
              theme === 'dark' 
                ? "bg-zinc-950/70 border-zinc-900 shadow-none" 
                : "bg-white border-[#E5E7EB] shadow-[0_8px_30px_rgba(0,0,0,0.02)]"
            )}
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
              <FileSpreadsheet size={18} />
            </div>
            <div className="space-y-1 text-left">
              <h4 className={cn("text-xs font-black uppercase tracking-wider", theme === 'dark' ? "text-zinc-100" : "text-[#111111]")}>Multi-Format reports</h4>
              <p className={cn("text-[11px] leading-normal font-semibold", theme === 'dark' ? "text-zinc-400" : "text-[#374151]")}>Download fully-formulated vector PDF books & calculated XLSX sheets.</p>
            </div>
          </motion.div>

          <motion.div 
            animate={{ y: [0, -5, 0] }}
            transition={{ repeat: Infinity, duration: 4.4, ease: "easeInOut", delay: 0.6 }}
            onClick={() => setSelectedFeature('import-export')}
            className={cn(
              "p-5 rounded-2xl border flex items-start gap-4 transition-all hover:scale-[1.02] cursor-pointer",
              theme === 'dark' 
                ? "bg-zinc-950/70 border-zinc-900 shadow-none" 
                : "bg-white border-[#E5E7EB] shadow-[0_8px_30px_rgba(0,0,0,0.02)]"
            )}
          >
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center shrink-0">
              <RefreshCw size={18} />
            </div>
            <div className="space-y-1 text-left">
              <h4 className={cn("text-xs font-black uppercase tracking-wider", theme === 'dark' ? "text-zinc-100" : "text-[#111111]")}>Protected Code Sync</h4>
              <p className={cn("text-[11px] leading-normal font-semibold", theme === 'dark' ? "text-zinc-400" : "text-[#374151]")}>Safely copy entries & attachments between users via encrypted parameters.</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* BACKGROUND WAVE SECTION SEPARATOR */}
      <div className="relative w-full h-10 pointer-events-none overflow-hidden bg-transparent">
        <svg className="absolute bottom-0 w-full h-full fill-transparent stroke-blue-500/10" viewBox="0 0 1440 40" preserveAspectRatio="none">
          <path d="M0,20 C320,40 420,0 720,20 C1020,40 1120,0 1440,20 L1440,40 L0,40 Z" strokeWidth="1" />
        </svg>
      </div>

      {/* FEATURE 1: TRACKBOOK AI SECTION */}
      <section id="trackbook-ai" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-[#E5E7EB]/50">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5 space-y-6 text-left">
            <span className="inline-block mb-2 text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-500/10 px-3.5 py-1.5 rounded-full border border-blue-500/20">
              🔥 Feature #1: TrackBook AI Ingestion
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold font-lora tracking-tight leading-normal text-[#111111] dark:text-white">
              Absolute Zero Manual Data Inputs.
            </h2>
            <p className={cn(
              "text-[14px] leading-relaxed font-medium max-w-xl",
              theme === 'dark' ? "text-zinc-300" : "text-[#374151]"
            )}>
              Say goodbye to administrative fatigue. Throw invoices, receipts, and vouchers at TrackBook. Our premium AI parses cost metrics, matches categories, drafts descriptions, and logs everything in seconds.
            </p>
            <div className="pt-2">
              <button
                onClick={() => setSelectedFeature('trackbook-ai')}
                className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors cursor-pointer bg-transparent outline-none"
              >
                Verify Ingestion Spec
                <ArrowRight size={11} />
              </button>
            </div>

            {/* Simulated checklist */}
            <div className="space-y-3 font-semibold text-xs text-slate-600 dark:text-zinc-300">
              {[
                { step: "Upload Bill", desc: "Drag, drop or screenshot any invoice from vendor portals." },
                { step: "TrackBook AI Scans", desc: "Optical extraction reads currencies and figures instantly." },
                { step: "Autofill & Create", desc: "Fills descriptions, tags categories, and logs values automatically." }
              ].map((item, idx) => (
                <div key={idx} className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-600 flex items-center justify-center text-[10px] font-black shrink-0">{idx + 1}</span>
                  <div>
                    <h5 className="font-extrabold text-[#111111] dark:text-zinc-100 text-[11px] uppercase tracking-wider">{item.step}</h5>
                    <p className={cn("text-[10px] font-semibold leading-normal mt-0.5", theme === 'dark' ? "text-zinc-400" : "text-[#6B7280]")}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7">
            {/* Visual simulation card with OCR beam effect */}
            <div className={cn(
              "rounded-3xl border p-4 sm:p-6 shadow-xl transition-all duration-300 relative overflow-hidden",
              theme === 'dark' 
                ? "bg-black border-zinc-900 shadow-none" 
                : "bg-white border-[#E5E7EB] shadow-[0_8px_30px_rgba(0,0,0,0.025)]"
            )}>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-dashed border-slate-200 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-amber-500 animate-pulse" size={15} />
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">TrackBook AI Scanner Engine</span>
                </div>
                <span className="text-[8px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 px-2.5 py-0.5 rounded-full">
                  ₹ INR Enabled
                </span>
              </div>

              {/* Simulation Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
                {/* Left side parameters selector */}
                <div className="md:col-span-5 space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-loose">Sample Invoice Doc:</p>
                  <div className={cn(
                    "p-3 rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden min-h-[140px]",
                    theme === 'dark' ? "bg-zinc-950 border-zinc-900" : "bg-blue-50/20 border-blue-100"
                  )}>
                    <div>
                      <h4 className="text-[11px] font-black text-slate-800 dark:text-zinc-100">Catering & Stationery</h4>
                      <p className="text-[9px] text-zinc-400 mt-1 leading-normal">Office snacks, premium dark roast supplies for developers.</p>
                    </div>
                    
                    <div className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 mt-2">
                      <p>Vendor: Blue Roast Co</p>
                      <p className="text-emerald-500 font-extrabold mt-1">Total: ₹18,450.00</p>
                    </div>

                    {/* Beam scanning effect representation */}
                    {aiDemoStep === 1 && (
                      <div className="absolute left-0 right-0 top-0 h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 animate-bounce" />
                    )}
                  </div>

                  <button
                    onClick={handleStartAiDemo}
                    disabled={aiDemoStep === 1 || aiDemoStep === 2}
                    className="w-full font-extrabold text-[10px] uppercase tracking-widest py-2.5 rounded-xl text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer outline-none select-none text-center"
                  >
                    {aiDemoStep === 0 && "⚡ Simulate AI Scan"}
                    {aiDemoStep === 1 && "AI scanning Bill..."}
                    {aiDemoStep === 2 && "Analyzing figures..."}
                    {aiDemoStep === 3 && "✓ Done! Scan Again"}
                  </button>
                </div>

                {/* Right side processing workflow visualization */}
                <div className="md:col-span-7">
                  <div className={cn(
                    "rounded-2xl p-4 flex flex-col justify-between h-full min-h-[220px]",
                    theme === 'dark' ? "bg-zinc-950/40 border border-zinc-900" : "bg-[#f8fafc]/70 border border-blue-50/50"
                  )}>
                    <AnimatePresence mode="wait">
                      {aiDemoStep === 0 && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex flex-col items-center justify-center text-center my-auto space-y-2 py-6"
                        >
                          <UploadCloud size={30} className="text-blue-500 opacity-60 animate-bounce" />
                          <p className="text-[11px] font-extrabold text-slate-500">Awaiting Bill OCR Trigger</p>
                          <p className="text-[9px] text-zinc-400 leading-normal max-w-[200px]">Click the simulation button on the left to watch TrackBook AI scan in real-time.</p>
                        </motion.div>
                      )}

                      {aiDemoStep === 1 && (
                        <motion.div 
                          key="scan"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="space-y-3 font-mono text-[10px] text-slate-600 dark:text-zinc-400"
                        >
                          <span className="text-amber-500 font-bold flex items-center gap-1.5 animate-pulse">
                            <Sparkles size={11} className="animate-spin" /> SCANNING_DOCUMENT
                          </span>
                          <div className="space-y-1.5 pt-2">
                            <div className="h-1.5 w-4/5 bg-slate-200 dark:bg-zinc-800 rounded overflow-hidden">
                              <div className="h-full bg-blue-500 animate-progress-smooth" />
                            </div>
                            <p className="text-[9px] text-slate-400">Loading neural layout models...</p>
                          </div>
                        </motion.div>
                      )}

                      {aiDemoStep === 2 && (
                        <motion.div 
                          key="extract"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="space-y-3 font-mono text-[9.5px] py-1 text-slate-600 dark:text-zinc-400"
                        >
                          <span className="text-indigo-500 font-bold flex items-center gap-1.5">
                            <CheckCircle size={12} /> EXTRACTING_LEDGER_PARAMETERS
                          </span>
                          <div className="grid grid-cols-2 gap-2 pt-2 text-[9px] bg-slate-50 dark:bg-zinc-900 border border-dashed border-slate-200 dark:border-zinc-800 p-2.5 rounded-xl">
                            <div>Amount: <span className="font-extrabold text-emerald-500">₹18,450.00</span></div>
                            <div>Date: <span className="font-extrabold text-blue-500">11-JUN-2026</span></div>
                            <div className="col-span-2 truncate">Category: <span className="font-extrabold text-slate-700 dark:text-zinc-200">Office Equipment</span></div>
                            <div className="col-span-2 truncate text-[8.5px]">Desc: <span className="text-slate-500">Standing desk mounts & furniture</span></div>
                          </div>
                        </motion.div>
                      )}

                      {aiDemoStep === 3 && (
                        <motion.div 
                          key="completed"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-3 text-left"
                        >
                          <span className="text-emerald-500 font-bold text-[11px] flex items-center gap-1.5">
                            <CheckCircle size={13} /> Ledger Form Autofilled Successfully
                          </span>
                          
                          {/* Mock Completed Ledger Row */}
                          <div className={cn(
                            "p-3 rounded-xl border flex items-center justify-between",
                            theme === 'dark' ? "bg-black border-zinc-900" : "bg-white border-blue-50 shadow-sm"
                          )}>
                            <div className="flex items-center gap-2">
                              {/* Colored status strip */}
                              <div className="w-1.5 h-8 bg-rose-500 rounded-sm" />
                              <div>
                                <h4 className="text-[11px] font-black text-slate-800 dark:text-zinc-100 leading-none">{scannedBill.name}</h4>
                                <div className="flex items-center gap-1 mt-1">
                                  <span className="text-[8px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-600 px-1.5 py-0.2 rounded">Office Equip</span>
                                  <span className="text-[8px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-600 px-1.5 py-0.2 rounded">TrackBook AI</span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[11px] font-black text-rose-500 leading-none">- {scannedBill.amount}</p>
                              <p className="text-[8px] text-zinc-400 mt-1">{scannedBill.date}</p>
                            </div>
                          </div>
                          
                          <p className="text-[9px] font-mono text-zinc-400 text-center uppercase tracking-wide">
                            ✓ Cash Out log recorded inside database
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WAVE BREAK */}
      <div className="relative w-full h-8 pointer-events-none overflow-hidden bg-transparent">
        <svg className="absolute bottom-0 w-full h-full fill-transparent stroke-indigo-500/10" viewBox="0 0 1440 40" preserveAspectRatio="none">
          <path d="M0,30 C300,10 400,30 700,10 C1000,30 1100,10 1440,30" strokeWidth="1" />
        </svg>
      </div>

      {/* FEATURE 2: IMPORT & EXPORT ENTRIES */}
      <section id="import-export" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-[#E5E7EB]/50">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          <div className="lg:col-span-7 order-2 lg:order-1">
            <div className={cn(
              "rounded-3xl border p-4 sm:p-6 shadow-xl transition-all duration-300 relative",
              theme === 'dark' 
                ? "bg-black border-zinc-900 shadow-none" 
                : "bg-white border-[#E5E7EB] shadow-[0_8px_30px_rgba(0,0,0,0.025)]"
            )}>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-dashed border-slate-200 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Database className="text-indigo-500" size={15} />
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Secure Transfer Code Sync Simulator</span>
                </div>
                <span className="text-[8px] font-bold text-blue-500 uppercase">3-Hour Cooldown Window</span>
              </div>
 
              {/* Transfer interactive steps visual */}
              <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                {/* User 1 container */}
                <div className="md:col-span-3">
                  <div className={cn(
                    "p-3 rounded-2xl border flex flex-col justify-between h-48",
                    theme === 'dark' ? "bg-zinc-950/40 border-zinc-900" : "bg-[#f8fafc] border-[#E5E7EB]"
                  )}>
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase tracking-wider font-extrabold text-blue-600 block">User 1 (Sender)</span>
                      <p className="text-[10px] text-zinc-400 leading-normal">Pick items inside the ledger and export under encrypted code envelope:</p>
                    </div>

                    {transferStep === 'export' && exportProgress > 0 && exportProgress < 100 ? (
                      <div className="space-y-1.5 font-mono text-[9px] mt-2">
                        <p>Zipping metrics payload...</p>
                        <div className="h-1.5 w-full bg-slate-200 dark:bg-zinc-900 rounded overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${exportProgress}%` }} />
                        </div>
                      </div>
                    ) : transferStep !== 'export' ? (
                      <div className="bg-white dark:bg-zinc-900 border p-2 rounded-xl text-[9px] font-mono leading-tight space-y-1">
                        <div className="flex justify-between"><span>Selected:</span> <span className="font-bold text-emerald-500">18 Entries</span></div>
                        <div className="flex justify-between"><span>Attachments:</span> <span className="font-bold">4 Images</span></div>
                        <div className="flex justify-between"><span>Status:</span> <span className="text-emerald-500">Bundled ✓</span></div>
                      </div>
                    ) : (
                      <div className="text-center py-4 bg-white dark:bg-zinc-900 border rounded-xl">
                        <p className="text-[9px] text-zinc-400 font-bold">Encrypted Binder Idle</p>
                      </div>
                    )}

                    <button
                      onClick={startTransferDemo}
                      disabled={transferStep === 'export' && exportProgress > 0 && exportProgress < 100}
                      className="w-full text-center py-2 rounded-xl font-extrabold text-[9px] uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 transition-colors outline-none cursor-pointer"
                    >
                      Export Ledger
                    </button>
                  </div>
                </div>

                {/* Arrow / Bridge animation */}
                <div className="md:col-span-1 flex flex-col items-center justify-center my-2 md:my-0">
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-100 dark:border-zinc-800 animate-pulse">
                    <Zap size={14} />
                  </div>
                  {/* secure code indicator */}
                  {(transferStep === 'code' || transferStep === 'import' || transferStep === 'done') && (
                    <div className="bg-violet-500/15 border border-violet-500/25 px-2 py-1.5 rounded-lg text-center mt-2 animate-bounce">
                      <p className="text-[8px] text-violet-500 font-black">CODE</p>
                      <p className="text-[9px] font-mono font-black text-violet-600 dark:text-violet-400">{secureCode}</p>
                    </div>
                  )}
                </div>

                {/* User 2 container */}
                <div className="md:col-span-3">
                  <div className={cn(
                    "p-3 rounded-2xl border flex flex-col justify-between h-48",
                    theme === 'dark' ? "bg-zinc-950/40 border-zinc-900" : "bg-[#f8fafc] border-blue-50"
                  )}>
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase tracking-wider font-extrabold text-indigo-600 block">User 2 (Recipient)</span>
                      <p className="text-[10px] text-zinc-400 leading-normal">Enter the active verification code to import and match ledger logs instantly.</p>
                    </div>

                    {transferStep === 'import' && importProgress > 0 && importProgress < 100 ? (
                      <div className="space-y-1.5 font-mono text-[9px]">
                        <p>Injecting transaction blocks...</p>
                        <div className="h-1.5 w-full bg-slate-200 dark:bg-zinc-900 rounded overflow-hidden">
                          <div className="h-full bg-indigo-500" style={{ width: `${importProgress}%` }} />
                        </div>
                      </div>
                    ) : transferStep === 'done' ? (
                      <div className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 p-2 rounded-xl text-[9.5px] text-center font-mono space-y-1">
                        <p className="font-extrabold flex items-center justify-center gap-1"><CheckCircle size={10} /> Ingest Completed!</p>
                        <p className="text-[8px] text-zinc-400 leading-normal">Matched 18 logs | 0 duplicates skipped.</p>
                      </div>
                    ) : (
                      <div className="bg-white dark:bg-zinc-900 border p-2 rounded-xl flex items-center justify-between text-[9px] font-mono text-zinc-500">
                        <span>Awaiting input...</span>
                        <span className="text-slate-400 select-none">CODE_*</span>
                      </div>
                    )}

                    <button
                      onClick={simulateImportDemo}
                      disabled={transferStep !== 'code'}
                      className="w-full text-center py-2 rounded-xl font-extrabold text-[9px] uppercase tracking-wider text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer outline-none select-none"
                    >
                      Import Entries
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6 text-left order-1 lg:order-2">
            <span className="inline-block mb-2 text-[10px] font-black uppercase tracking-widest text-[#6366f1] bg-indigo-500/10 px-3.5 py-1.5 rounded-full border border-indigo-500/20">
              ⚡ Feature #2: Import & Export Codes
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold font-lora tracking-tight leading-normal text-[#111111] dark:text-white">
              Instant Encrypted Sync Across Users.
            </h2>
            <p className={cn(
              "text-[14px] leading-relaxed font-medium max-w-xl",
              theme === 'dark' ? "text-zinc-300" : "text-[#374151]"
            )}>
              Need to share ledger ranges safely? **TrackBook** introduces zero-trust parameter transfer codes. Encrypted payloads match files, descriptions, and pictures into a zip bridge, checking duplicates on imports automatically.
            </p>

            <div className="grid grid-cols-2 gap-4 font-bold text-[10.5px]">
              <div className="space-y-1.5">
                <p className="text-[#374151] dark:text-zinc-200 flex items-center gap-1.5">✓ Entries Transferred</p>
                <p className="text-[#374151] dark:text-zinc-200 flex items-center gap-1.5">✓ Images & Attachments</p>
                <p className="text-[#374151] dark:text-zinc-200 flex items-center gap-1.5">✓ Zero duplicates matching</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[#374151] dark:text-zinc-200 flex items-center gap-1.5">✓ Code expiration window</p>
                <p className="text-[#374151] dark:text-zinc-200 flex items-center gap-1.5">✓ Secure MD5 checksums</p>
                <p className="text-[#374151] dark:text-zinc-200 flex items-center gap-1.5">✓ Encrypted transfer bridge</p>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setSelectedFeature('import-export')}
                className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[#6366f1] hover:text-indigo-600 transition-colors cursor-pointer bg-transparent outline-none"
              >
                Verify Sync Spec
                <ArrowRight size={11} />
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* WAVE BREAK */}
      <div className="relative w-full h-8 pointer-events-none overflow-hidden bg-transparent">
        <svg className="absolute bottom-0 w-full h-full fill-transparent stroke-emerald-500/10" viewBox="0 0 1440 40" preserveAspectRatio="none">
          <path d="M0,20 C320,0 420,40 720,20 C1020,0 1120,40 1440,20" strokeWidth="1" />
        </svg>
      </div>

      {/* FEATURE 3: PDF & EXCEL REPORTS */}
      <section id="reports" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-[#E5E7EB]/50">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          <div className="lg:col-span-5 space-y-6 text-left">
            <span className="inline-block mb-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3.5 py-1.5 rounded-full border border-emerald-500/20">
              📊 Feature #3: Executive Reports Studio
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold font-lora tracking-tight leading-normal text-[#111111] dark:text-white">
              Boardroom-Ready Tax Ledgers & Formula Sheets.
            </h2>
            <p className={cn(
              "text-[14px] leading-relaxed font-medium max-w-xl",
              theme === 'dark' ? "text-zinc-300" : "text-[#374151]"
            )}>
              Create high-end printable audits in seconds. TrackBook supports generating fully calculated **Excel spreadsheet binders** with nested math sheets alongside clean vector **PDF tax ledgers**. Use built-in utilities to lock, merge and split files inside your workspace.
            </p>

            <div className="grid grid-cols-2 gap-3.5 pt-1.5">
              {[
                { title: 'PDF Reports', desc: 'Vector charts, beautiful grids' },
                { title: 'Excel Reports', desc: 'Auto computed formula sheets' },
                { title: 'PDF Merge Tool', desc: 'Combine multiple statements' },
                { title: 'PDF Statement Split', desc: 'Isolate key monthly dates' }
              ].map((item, index) => (
                <div 
                  key={index}
                  onClick={() => {
                    setActiveReportType(index === 0 ? 'pdf' : index === 1 ? 'excel' : index === 2 ? 'merge' : 'split');
                    setReportState('idle');
                    setReportProgress(0);
                  }}
                  className={cn(
                    "p-3 rounded-2xl border text-left cursor-pointer transition-all hover:-translate-y-0.5",
                    activeReportType === (index === 0 ? 'pdf' : index === 1 ? 'excel' : index === 2 ? 'merge' : 'split')
                      ? (
                        index === 1 || index === 2 
                          ? "border-emerald-500/55 bg-emerald-500/5 dark:bg-emerald-500/10 ring-1 ring-emerald-500/20"
                          : index === 0 
                            ? "border-blue-500/55 bg-blue-500/5 dark:bg-blue-500/10 ring-1 ring-blue-500/20"
                            : "border-teal-500/55 bg-teal-500/5 dark:bg-teal-500/10 ring-1 ring-teal-500/20"
                      )
                      : (theme === 'dark' ? "bg-zinc-950/40 border-zinc-900 hover:bg-zinc-900" : "bg-white border-[#E5E7EB] hover:bg-slate-50")
                  )}
                >
                  <h4 className="text-[11px] font-extrabold text-[#111111] dark:text-zinc-100 uppercase tracking-wider">{item.title}</h4>
                  <p className={cn("text-[9px] mt-1 leading-normal font-semibold", theme === 'dark' ? "text-zinc-400" : "text-[#6B7280]")}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7">
            {/* Visual preview of computed spreadsheets and export screen */}
            <div className={cn(
              "rounded-3xl border p-4 sm:p-6 shadow-xl transition-all duration-300 relative",
              theme === 'dark' 
                ? "bg-black border-zinc-900 shadow-none" 
                : "bg-white border-[#E5E7EB] shadow-[0_8px_30px_rgba(0,0,0,0.025)]"
            )}>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-dashed border-[#E5E7EB] dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="text-emerald-500" size={15} />
                  <span className="text-[10px] font-black uppercase text-[#6B7280] tracking-wider">Boardroom Export Engine Preview</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-[8px] bg-emerald-500/10 text-emerald-600 px-2.0 py-0.5 rounded font-black uppercase tracking-wider">TAX SECURE</span>
                  <span className="text-[8px] bg-blue-500/10 text-blue-600 px-2.0 py-0.5 rounded font-black uppercase tracking-wider">AUTO FORMULAS</span>
                </div>
              </div>

              {/* Realistic previews matching report state options */}
              <div className="space-y-4 font-mono text-[10px]">
                <div className={cn(
                  "p-4 rounded-2xl border relative overflow-hidden",
                  theme === 'dark' ? "bg-zinc-950" : "bg-[#f8fafc] border-[#E5E7EB]"
                )}>
                  {/* Mock sheet displaying metrics with dynamic math computation */}
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-zinc-450 uppercase font-black tracking-wider text-[8px]">TrackBook Ledger - FY2026</span>
                    <span className="text-[9px] text-emerald-500 font-bold">1-click download Ready</span>
                  </div>

                  <div className="space-y-2 mt-3 text-[10px] select-all">
                    <div className="flex justify-between text-[#374151] dark:text-zinc-400">
                      <span>Inflows (Profits & Clients):</span>
                      <span className="font-extrabold text-emerald-500">₹4,85,200.00</span>
                    </div>
                    <div className="flex justify-between text-[#374151] dark:text-zinc-200">
                      <span>Outflows (Wages & Tools):</span>
                      <span className="font-extrabold text-amber-500">₹1,12,450.00</span>
                    </div>
                    <div className="border-t border-[#E5E7EB] dark:border-zinc-800 pt-2 flex justify-between">
                      <span className="font-bold">Net Balance (Tally):</span>
                      <span className="font-black text-blue-600 dark:text-blue-400">₹3,72,750.00</span>
                    </div>
                  </div>

                  {reportState === 'generating' && (
                    <div className="absolute inset-0 bg-white/95 dark:bg-zinc-950/95 flex flex-col items-center justify-center text-center p-4 z-20">
                      {activeReportType === 'merge' ? (
                        /* PDF MERGE ANIMATION */
                        <div className="flex flex-col items-center space-y-4">
                          <div className="flex items-center justify-center gap-8 relative w-48 h-16">
                            {/* Left Doc */}
                            <motion.div 
                              animate={{ x: [0, 42, 42], opacity: [1, 1, 0] }}
                              transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                              className="w-10 h-12 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center shadow"
                            >
                              <span className="text-[8px] font-black font-mono text-emerald-600 dark:text-emerald-400">PDF1</span>
                            </motion.div>
                            {/* Right Doc */}
                            <motion.div 
                              animate={{ x: [0, -42, -42], opacity: [1, 1, 0] }}
                              transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                              className="w-10 h-12 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center shadow"
                            >
                              <span className="text-[8px] font-black font-mono text-emerald-600 dark:text-emerald-400">PDF2</span>
                            </motion.div>
                            {/* Merged Doc with ripple */}
                            <motion.div 
                              initial={{ scale: 0.5, opacity: 0 }}
                              animate={{ scale: [0.5, 1, 1.1, 1], opacity: [0, 0, 1, 1] }}
                              transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                              className="absolute w-12 h-14 rounded bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg"
                            >
                              <Merge size={16} className="text-white animate-spin" />
                            </motion.div>
                          </div>
                          <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest animate-pulse flex items-center gap-1">
                            Merging PDF Statements
                          </span>
                        </div>
                      ) : activeReportType === 'split' ? (
                        /* PDF SPLIT ANIMATION */
                        <div className="flex flex-col items-center space-y-4">
                          <div className="flex items-center justify-center relative w-48 h-16">
                            {/* Exploding / Splitting pair */}
                            <motion.div 
                              initial={{ x: 0, opacity: 1 }}
                              animate={{ x: [-15, -45, -45], opacity: [1, 1, 0.8] }}
                              transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                              className="absolute w-9 h-11 rounded bg-teal-100 dark:bg-teal-950 border border-teal-450 flex items-center justify-center shadow-md"
                            >
                              <span className="text-[8px] font-black text-teal-600 dark:text-teal-400 font-mono">PAGE1</span>
                            </motion.div>
                            <motion.div 
                              initial={{ x: 0, opacity: 1 }}
                              animate={{ x: [15, 45, 45], opacity: [1, 1, 0.8] }}
                              transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                              className="absolute w-9 h-11 rounded bg-teal-100 dark:bg-teal-950 border border-teal-450 flex items-center justify-center shadow-md"
                            >
                              <span className="text-[8px] font-black text-teal-600 dark:text-teal-400 font-mono">PAGE2</span>
                            </motion.div>
                            {/* Cutting scissors */}
                            <motion.div 
                              animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.2, 1] }}
                              transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                              className="absolute z-20 bg-white dark:bg-zinc-900 border p-1 rounded-full text-indigo-500"
                            >
                              <Scissors size={14} className="animate-pulse" />
                            </motion.div>
                          </div>
                          <span className="text-[11px] font-black text-teal-600 uppercase tracking-widest animate-pulse flex items-center gap-1">
                            Splitting Multi-page File
                          </span>
                        </div>
                      ) : (
                        /* Standard compilation template for PDF/XLS */
                        <div className="space-y-2">
                          <span className="text-[11px] font-black text-emerald-650 dark:text-emerald-400 uppercase tracking-widest animate-pulse flex items-center justify-center gap-1">
                            <RefreshCw size={12} className="animate-spin" /> COMPILING_{activeReportType.toUpperCase()}_REPORT
                          </span>
                          <div className="h-1.5 w-48 bg-slate-205 dark:bg-zinc-800 rounded overflow-hidden mt-2 mx-auto">
                            <div className="h-full bg-emerald-500" style={{ width: `${reportProgress}%` }} />
                          </div>
                        </div>
                      )}
                      
                      <p className="text-[9px] text-[#6B7280] dark:text-zinc-400 mt-2 font-bold leading-normal">
                        {activeReportType === 'merge' 
                          ? "Fusing structural elements, binding tax parameters..." 
                          : activeReportType === 'split'
                            ? "Isolating monthly ledger segments, re-rendering page roots..."
                            : "Formulating spreadsheet math, merging visual themes..."}
                      </p>
                    </div>
                  )}

                  {reportState === 'ready' && (
                    <div className="absolute inset-0 bg-white/95 dark:bg-zinc-950/95 flex flex-col items-center justify-center text-center p-4">
                      <CheckCircle size={30} className="text-emerald-500 animate-bounce" />
                      <h4 className="font-extrabold text-[11px] text-[#111111] dark:text-zinc-100 uppercase tracking-widest mt-1">Compiled successfully!</h4>
                      <p className="text-[9px] text-zinc-450 max-w-[240px] mt-1 leading-normal">Your custom courtroom {activeReportType.toUpperCase()} has been signed and compiled cleanly.</p>
                      <button 
                        onClick={() => setReportState('idle')}
                        className="py-1 px-3 bg-white hover:bg-slate-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 font-extrabold text-[8.5px] uppercase tracking-wider rounded-lg border border-[#E5E7EB] mt-2.5 cursor-pointer outline-none"
                      >
                        Reset Simulator
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 justify-center">
                  <button
                    onClick={triggerReportGeneration}
                    disabled={reportState === 'generating'}
                    className={cn(
                      "flex-1 font-extrabold text-[10px] uppercase tracking-widest text-[#F9FAFB] text-center py-2.5 rounded-xl transition-all hover:scale-[1.01] cursor-pointer outline-none select-none shadow-md",
                      activeReportType === 'pdf' 
                        ? "bg-blue-600 hover:bg-blue-700 shadow-blue-600/10" 
                        : activeReportType === 'excel'
                          ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/10"
                          : activeReportType === 'merge'
                            ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/10"
                            : "bg-teal-600 hover:bg-teal-700 shadow-teal-600/10"
                    )}
                  >
                    Generate {activeReportType.toUpperCase()}
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* WAVE BREAK */}
      <div className="relative w-full h-8 pointer-events-none overflow-hidden bg-transparent">
        <svg className="absolute bottom-0 w-full h-full fill-transparent stroke-emerald-500/10" viewBox="0 0 1440 40" preserveAspectRatio="none">
          <path d="M0,20 C320,40 420,0 720,20 C1020,40 1120,0 1440,20" strokeWidth="1" strokeDasharray="4,4" />
        </svg>
      </div>

      {/* FEATURE 4: ANALYTICS */}
      <section id="analytics" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-blue-100/30">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          <div className="lg:col-span-7">
            {/* Visual SVG chart preview with INR hover states */}
            <div className={cn(
              "rounded-3xl border p-4 sm:p-6 shadow-xl transition-all duration-300 relative",
              theme === 'dark' 
                ? "bg-black border-zinc-900 shadow-none" 
                : "bg-white/80 border-white shadow-[0_8px_30px_rgba(0,0,0,0.035)]"
            )}>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-dashed border-slate-200 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <BarChart3 className="text-blue-500 animate-pulse" size={15} />
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Real-time Performance Metrics (₹ INR)</span>
                </div>
                <span className="text-[9px] font-bold text-indigo-500 tracking-wide uppercase">Live ledger calculations</span>
              </div>

              {/* Tally parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5 font-mono text-[10px]">
                <div 
                  onMouseEnter={() => setHoveredDataPoint('in')}
                  onMouseLeave={() => setHoveredDataPoint(null)}
                  className={cn(
                    "p-3 rounded-2xl border transition-all cursor-pointer",
                    hoveredDataPoint === 'in' ? "border-emerald-500 bg-emerald-500/5 scale-[1.01]" : (theme === 'dark' ? "bg-zinc-950 border-zinc-900" : "bg-[#f8fafc] border-blue-50")
                  )}
                >
                  <p className="text-[8px] text-zinc-400 uppercase font-black tracking-wider">Business Cash In</p>
                  <p className="text-sm font-black text-emerald-500 mt-1">₹3,45,200.00</p>
                </div>

                <div 
                  onMouseEnter={() => setHoveredDataPoint('out')}
                  onMouseLeave={() => setHoveredDataPoint(null)}
                  className={cn(
                    "p-3 rounded-2xl border transition-all cursor-pointer",
                    hoveredDataPoint === 'out' ? "border-rose-500 bg-rose-500/5 scale-[1.01]" : (theme === 'dark' ? "bg-zinc-950 border-zinc-900" : "bg-[#f8fafc] border-blue-50")
                  )}
                >
                  <p className="text-[8px] text-zinc-400 uppercase font-black tracking-wider">Business Cash Out</p>
                  <p className="text-sm font-black text-rose-500 mt-1">₹94,450.00</p>
                </div>

                <div 
                  onMouseEnter={() => setHoveredDataPoint('net')}
                  onMouseLeave={() => setHoveredDataPoint(null)}
                  className={cn(
                    "p-3 rounded-2xl border transition-all cursor-pointer",
                    hoveredDataPoint === 'net' ? "border-blue-500 bg-blue-500/5 scale-[1.01]" : (theme === 'dark' ? "bg-zinc-950 border-zinc-900" : "bg-[#f8fafc] border-blue-50")
                  )}
                >
                  <p className="text-[8px] text-zinc-400 uppercase font-black tracking-wider">Current Net Profit</p>
                  <p className="text-sm font-black text-blue-500 mt-1">₹2,50,750.00</p>
                </div>
              </div>

              {/* Realistic SVG graph layout with dynamic tooltips */}
              <div className="relative h-28 w-full border-b border-dashed pb-1 flex items-end justify-between px-2">
                {[
                  { month: 'January', val: 35, color: '#3b82f6' },
                  { month: 'February', val: 56, color: '#6366f1' },
                  { month: 'March', val: 42, color: '#10b981' },
                  { month: 'April', val: 78, color: '#f43f5e' },
                  { month: 'May', val: 64, color: '#f59e0b' },
                  { month: 'June FY26', val: 92, color: '#3b82f6', active: true }
                ].map((item, idx) => (
                  <div key={idx} className="flex flex-col items-center flex-1 max-w-[50px] relative group px-1">
                    {/* Tooltip bar on hover */}
                    <div className="absolute top-[-30px] opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white rounded px-1.5 py-0.5 text-[8px] pointer-events-none z-10 scale-90 whitespace-nowrap">
                      Value: +{item.val}% (₹ INR)
                    </div>
                    
                    <div 
                      className={cn(
                        "w-full rounded-t transition-all duration-300",
                        item.active ? "bg-blue-600 hover:bg-blue-700 animate-pulse" : "bg-blue-500/15 hover:bg-blue-500/30"
                      )} 
                      style={{ height: `${item.val}px` }} 
                    />
                    <span className="text-[8.5px] mt-1.5 font-mono text-zinc-400 dark:text-zinc-500 font-extrabold shrink-0 truncate max-w-full">
                      {item.month.substring(0, 3)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6 text-left">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#10b981] bg-teal-500/10 px-3.5 py-1.5 rounded-full border border-teal-500/20">
              📈 Feature #4: Real-time Ledger Charts
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold font-lora tracking-tight leading-normal text-[#111111] dark:text-white">
              Instant Monthly Cash Balance Profiles.
            </h2>
            <p className={cn(
              "text-[14px] leading-relaxed font-medium max-w-xl",
              theme === 'dark' ? "text-zinc-300" : "text-[#374151]"
            )}>
              Hover over trends to understand margins. See your cash, payments, structures, and tallies scale flawlessly with automatic INR format conversions.
            </p>

            <div className="space-y-2.5 font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
              <p className={cn("flex items-center gap-2 font-bold", theme === 'dark' ? "text-zinc-450" : "text-[#374151]")}><CheckCircle size={12} className="text-emerald-500" /> Cash In and Cash Out metrics calculated on ledger update cycles.</p>
              <p className={cn("flex items-center gap-2 font-bold", theme === 'dark' ? "text-zinc-450" : "text-[#374151]")}><CheckCircle size={12} className="text-emerald-500" /> Track monthly tax distributions and active supplier billing weights.</p>
              <p className={cn("flex items-center gap-2 font-bold", theme === 'dark' ? "text-zinc-450" : "text-[#374151]")}><CheckCircle size={12} className="text-emerald-500" /> Advanced analytics support to identify cost leakages automatically.</p>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setSelectedFeature('analytics')}
                className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[#10b981] hover:text-teal-600 transition-colors cursor-pointer bg-transparent outline-none"
              >
                Verify Analytics Spec
                <ArrowRight size={11} />
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* WAVE BREAK */}
      <div className="relative w-full h-8 pointer-events-none overflow-hidden bg-transparent">
        <svg className="absolute bottom-0 w-full h-full fill-transparent stroke-blue-500/10" viewBox="0 0 1440 40" preserveAspectRatio="none">
          <path d="M0,10 C320,30 420,0 720,10 C1020,30 1120,0 1440,10" strokeWidth="1" />
        </svg>
      </div>

      {/* SECURITY PROTECTION SECTION */}
      <section id="security" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-[#E5E7EB]/50">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5 space-y-6 text-left">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#3b82f6] bg-blue-500/10 px-3.5 py-1.5 rounded-full border border-blue-500/20">
              🛡️ Origin security
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold font-lora tracking-tight leading-normal text-[#111111] dark:text-white">
              Enterprise Grade Privacy Shields.
            </h2>
            <p className={cn(
              "text-[14px] leading-relaxed font-medium max-w-xl",
              theme === 'dark' ? "text-zinc-300" : "text-[#374151]"
            )}>
              Your sensitive business parameters remain completely isolated from standard scraping modules. TrackBook does **not** train AI layers on transactional records. We secure every session with inactivity interrupters and secure origin authentication tokens.
            </p>

            <div className="space-y-4 font-mono text-[10.5px]">
              <div className="flex items-start gap-3">
                <Clock size={16} className="text-blue-500 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <h4 className="font-extrabold text-[#111111] dark:text-zinc-100 uppercase tracking-wide">10-Minute Idle Autologout</h4>
                  <p className={cn("text-[9.5px] font-semibold leading-normal mt-0.5", theme === 'dark' ? "text-zinc-400" : "text-[#6B7280]")}>Clears cache parameters and tokens automatically on desktop screen absence.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Lock size={16} className="text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-extrabold text-[#111111] dark:text-zinc-100 uppercase tracking-wide">Row-Level Database Isolation</h4>
                  <p className={cn("text-[9.5px] font-semibold leading-normal mt-0.5", theme === 'dark' ? "text-zinc-400" : "text-[#6B7280]")}>Strict database rules enforce isolation. Nobody can intercept ledger packets.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className={cn(
              "p-6 rounded-3xl border relative min-h-[220px] flex items-center justify-center overflow-hidden",
              theme === 'dark' 
                ? "bg-zinc-950 border-zinc-900 shadow-none" 
                : "bg-white border-[#E5E7EB] shadow-[0_8px_30px_rgba(0,0,0,0.025)]"
            )}>
              {/* Absctract representation of secure cloud auth sync */}
              <div className="relative z-10 space-y-4 text-center max-w-sm">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-600 border border-blue-500/25 flex items-center justify-center mx-auto shadow-lg shadow-blue-500/10">
                  <Shield size={20} className="animate-pulse" />
                </div>
                <div>
                  <h4 className="font-black text-xs uppercase tracking-wider text-[#111111] dark:text-white">Origin Shield Encryption Active</h4>
                  <p className={cn("text-[10px] mt-1 leading-relaxed font-semibold", theme === 'dark' ? "text-zinc-400" : "text-[#6B7280]")}>Security parameters and session cookies expire cleanly every cycle. Direct multi-user sync complies with ledger origin isolated rules.</p>
                </div>
                <div className="text-[8.5px] font-mono font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-3 py-1 rounded-full inline-block">
                  🔒 origin-isolation: Active
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CALL TO ACTION */}
      <section className={cn(
        "py-16 md:py-20 text-center transition-colors duration-300 border-t",
        theme === 'dark' ? "bg-[#050505] border-zinc-950" : "bg-[#F9FAFB] border-[#E5E7EB]"
      )}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <h2 className="text-2xl sm:text-3xl font-bold font-lora tracking-tight leading-normal text-[#111111] dark:text-white">
            Ready to Track Smarter?
          </h2>
          <p className={cn(
            "text-xs sm:text-sm max-w-xl mx-auto font-medium leading-relaxed font-lora",
            theme === 'dark' ? "text-zinc-300" : "text-[#374151]"
          )}>
            Take command of active profits, record bills with advanced AI, and export professional courtroom reports inside 60 seconds. Learn more by signing up.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-xs sm:max-w-md mx-auto">
            <button
              onClick={() => onActionClick('signup')}
              className="cursor-pointer w-full sm:w-auto font-bold font-lora text-[12px] uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 px-8 py-3.5 rounded-2xl transition-all shadow-md flex items-center justify-center gap-1.5 outline-none select-none"
            >
              Get Started Free
              <ArrowRight size={13} />
            </button>
            <button
              onClick={() => onActionClick('signin')}
              className={cn(
                "w-full sm:w-auto text-center font-bold font-lora text-[12px] uppercase tracking-wider px-8 py-3.5 rounded-2xl transition-all border shadow-sm outline-none cursor-pointer",
                theme === 'dark'
                  ? "bg-zinc-950 border-zinc-800 text-zinc-350 hover:bg-zinc-900"
                  : "bg-white border-[#E5E7EB] text-[#374151] hover:bg-slate-50 shadow-slate-100/50"
              )}
            >
              Sign In to Your Book
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className={cn(
        "py-10 border-t font-mono text-[9px] text-center",
        theme === 'dark' ? "bg-black border-zinc-900 text-zinc-500" : "bg-[#F3F4F6] border-[#E5E7EB] text-[#4B5563]"
      )}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-2">
          <p className="font-black text-blue-600 uppercase tracking-widest text-[10px]">
            TrackBook Inc. • Secure Origin Isolated Platform • <a href="https://trackbook.xyz" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-500 transition-colors">trackbook.xyz</a>
          </p>
          <p>© 2026 TrackBook. All rights reserved. Inactivity protection is active.</p>
        </div>
      </footer>

      {/* FEATURE DETAIL POPUPS (SPEC VERIFICATION MODALS) */}
      <AnimatePresence>
        {selectedFeature && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop with Blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#050505]/75 backdrop-blur-md cursor-pointer"
              onClick={() => setSelectedFeature(null)}
              transition={{ duration: 0.28 }}
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 15 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} 
              className={cn(
                "w-full max-w-lg rounded-3xl border p-6 shadow-2xl relative z-10 overflow-hidden text-left",
                theme === 'dark' 
                  ? "bg-black border-zinc-900 text-zinc-100" 
                  : "bg-white border-[#E5E7EB] text-[#111111]"
              )}
            >
              {/* Top Accent Bar */}
              <div className={cn(
                "absolute top-0 left-0 right-0 h-1.5",
                selectedFeature === 'trackbook-ai' ? "bg-rose-500" :
                selectedFeature === 'import-export' ? "bg-indigo-500" :
                selectedFeature === 'reports' ? "bg-emerald-500" : "bg-teal-500"
              )} />

              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E5E7EB] dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "p-1.5 rounded-lg text-xs font-black uppercase tracking-wider",
                    selectedFeature === 'trackbook-ai' ? "bg-rose-500/10 text-rose-500" :
                    selectedFeature === 'import-export' ? "bg-indigo-500/10 text-indigo-500" :
                    selectedFeature === 'reports' ? "bg-emerald-500/10 text-emerald-500" : "bg-teal-500/10 text-teal-500"
                  )}>
                    SPECIFICATION VERIFICATION
                  </span>
                </div>
                <button
                  onClick={() => setSelectedFeature(null)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer text-[#6B7280]"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Dynamic Content based on selectedFeature */}
              {selectedFeature === 'trackbook-ai' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold font-lora tracking-tight text-[#111111] dark:text-white">TrackBook AI Extractions Ingestion Spec</h3>
                  <p className={cn("text-xs leading-relaxed font-semibold", theme === 'dark' ? "text-zinc-400" : "text-[#374151]")}>
                    Our modern neural vision parses transactional line items dynamically across multiple currencies with automated Indian Rupee (₹ INR) translations.
                  </p>

                  <div className="space-y-2.5 bg-slate-50 dark:bg-zinc-950 p-4 rounded-2xl border border-[#E5E7EB] dark:border-zinc-900 font-mono text-[10px]">
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-slate-400 font-bold">PARAMETER</span>
                      <span className="text-slate-400 font-bold">SPECIFICATION VALUE</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Vision Model:</span>
                      <span className="font-extrabold text-blue-500">Gemini 1.5 Origin Core</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Extraction Accuracy:</span>
                      <span className="font-extrabold text-emerald-500">99.78% Verified</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Max Ingestion Payload:</span>
                      <span className="font-extrabold">12.5 MB per receipt</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Inactivity Trigger:</span>
                      <span className="font-extrabold text-rose-500">Automatic Sync Erasure</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-[#6B7280] leading-relaxed font-medium">
                    This compliance suite verifies absolute conformity. Each uploaded transaction undergoes automatic schema classification before persistence.
                  </p>
                </div>
              )}

              {selectedFeature === 'import-export' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold font-lora tracking-tight text-[#111111] dark:text-white">Excel & CSV Sync Bridge Spec</h3>
                  <p className={cn("text-xs leading-relaxed font-semibold", theme === 'dark' ? "text-zinc-400" : "text-[#374151]")}>
                    Instantly sync massive spreadsheet bindings, matching parameters across disparate accounts while enforcing schema strictness and origin limits.
                  </p>

                  <div className="space-y-2.5 bg-slate-50 dark:bg-zinc-950 p-4 rounded-2xl border border-[#E5E7EB] dark:border-zinc-900 font-mono text-[10px]">
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-slate-400 font-bold">SYNC FIELD</span>
                      <span className="text-slate-400 font-bold">ENGINE CHARACTERISTIC</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Row Integrity Check:</span>
                      <span className="font-extrabold text-indigo-500">SHA256 Double Seed</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Rate Limits:</span>
                      <span className="font-extrabold">3-Hour Safe Cooldown</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Data Redundancy:</span>
                      <span className="font-extrabold text-emerald-500">Multi-AZ Hot Swap</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Origin Protection:</span>
                      <span className="font-extrabold text-rose-500">Browser Bound Isolated</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-[#6B7280] leading-relaxed font-medium">
                    Our dual-hash verification guarantees that ledger parameters are completely accurate, leaving zero room for mathematical drifts or currency rate skewing.
                  </p>
                </div>
              )}

              {selectedFeature === 'reports' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold font-lora tracking-tight text-[#111111] dark:text-white">Executive Reports Compiler Spec</h3>
                  <p className={cn("text-xs leading-relaxed font-semibold", theme === 'dark' ? "text-zinc-400" : "text-[#374151]")}>
                    Create high-fidelity print-ready audits of tax ledgers and cashflow sheets with dynamic formulas and real-time split/merge processing.
                  </p>

                  <div className="space-y-2.5 bg-slate-50 dark:bg-zinc-950 p-4 rounded-2xl border border-[#E5E7EB] dark:border-zinc-900 font-mono text-[10px]">
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-slate-400 font-bold">COMPILER ELEMENT</span>
                      <span className="text-slate-400 font-bold">PERFORMANCE METRIC</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">PDF Document Version:</span>
                      <span className="font-extrabold text-indigo-500">PDF/A-3a Enterprise Standard</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Formula Resolution:</span>
                      <span className="font-extrabold text-emerald-500">Sub-millisecond Math</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Split/Merge Animations:</span>
                      <span className="font-extrabold">Framer Vector Accelerated</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Calculated Metrics:</span>
                      <span className="font-extrabold text-rose-500">Tally/Taxes/Balances</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-[#6B7280] leading-relaxed font-medium">
                    This reporting engine executes calculations directly in memory to guarantee secure parameters. No external files are ever stored on unsecured physical drives.
                  </p>
                </div>
              )}

              {selectedFeature === 'analytics' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold font-lora tracking-tight text-[#111111] dark:text-white">Real-time Balance Charts Spec</h3>
                  <p className={cn("text-xs leading-relaxed font-semibold", theme === 'dark' ? "text-zinc-400" : "text-[#374151]")}>
                    Identify cash margins, track billing weight allocations, and intercept structural leakages automatically using real-time predictive charting.
                  </p>

                  <div className="space-y-2.5 bg-slate-50 dark:bg-zinc-950 p-4 rounded-2xl border border-[#E5E7EB] dark:border-zinc-900 font-mono text-[10px]">
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-slate-400 font-bold">ANALYTICS PARAMETER</span>
                      <span className="text-slate-400 font-bold">ENGINE SPECIFICATION</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Latency Threshold:</span>
                      <span className="font-extrabold text-emerald-500">⚡ Real-time Stream Core</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Margin Calculation:</span>
                      <span className="font-extrabold">Adaptive Formula Index</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Currency Adaptivity:</span>
                      <span className="font-extrabold text-blue-500">Dynamic Multi-Currency</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Predictive Intelligence:</span>
                      <span className="font-extrabold text-[#111111] dark:text-white">Heuristics Engine v4</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-[#6B7280] leading-relaxed font-medium">
                    The analytics system compiles current trends dynamically on client ledger adjustment. It maintains lightning fast performance for millions of ledger entries.
                  </p>
                </div>
              )}

              {/* Bottom Actions */}
              <div className="pt-4 mt-4 border-t border-[#E5E7EB] dark:border-zinc-800 flex gap-2 justify-end">
                <button
                  onClick={() => setSelectedFeature(null)}
                  className="py-2 px-5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-350 text-[10px] font-extrabold uppercase tracking-widest rounded-xl transition-all cursor-pointer outline-none border border-[#E5E7EB] dark:border-zinc-800"
                >
                  Dismiss Spec
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
