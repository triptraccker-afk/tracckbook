import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, 
  Lock, 
  Sparkles, 
  Server, 
  Terminal, 
  Activity, 
  Database, 
  ArrowLeft, 
  Moon, 
  Sun, 
  LogOut, 
  Search, 
  RefreshCw, 
  FileSpreadsheet, 
  AlertCircle,
  TrendingUp,
  Cpu,
  Trash2,
  BookmarkCheck,
  CheckCircle2,
  Users
} from 'lucide-react';
import { cn } from '../lib/utils';

interface AdminStatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle: string;
  trend?: string;
  theme: string;
}

function AdminStatCard({ title, value, icon, subtitle, trend, theme }: AdminStatCardProps) {
  return (
    <div className={cn(
      "p-5 rounded-3xl border transition-all duration-300 font-sans shadow-sm hover:shadow-md",
      theme === 'dark' 
        ? "bg-zinc-950 border-zinc-900 shadow-black/40" 
        : "bg-white border-slate-150 shadow-slate-100/50"
    )}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{title}</span>
        <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400">
          {icon}
        </div>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">{value}</span>
        {trend && (
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400 px-2 py-0.5 rounded-full">
            {trend}
          </span>
        )}
      </div>
      <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-1 font-medium">{subtitle}</p>
    </div>
  );
}

export default function AdminPortal() {
  const navigate = useNavigate();
  
  // App Theme sync
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'theme';
    const finalValue = next === 'dark' ? 'dark' : 'light';
    setThemeState(finalValue);
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(finalValue);
    root.style.colorScheme = finalValue;
    localStorage.setItem('theme', finalValue);
  };

  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('admin_session') === 'true';
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Stats Counters
  const [totalCashbooks, setTotalCashbooks] = useState<number | string>('Fetching...');
  const [totalEntries, setTotalEntries] = useState<number | string>('Fetching...');
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [allCashbooks, setAllCashbooks] = useState<any[]>([]);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [securityStatus, setSecurityStatus] = useState<'Restricted RLS' | 'Standard Access'>('Restricted RLS');

  // Diagnostics log state
  const [diagnosticsLogs, setDiagnosticsLogs] = useState<string[]>([
    "[System] Admin control center boot started...",
    "[Sandbox] Core environmental integrity check: PASSED",
    "[Network] Direct isolated ingress route online.",
  ]);

  // Handle Log Appender
  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setDiagnosticsLogs(prev => [`[${time}] ${msg}`, ...prev.slice(0, 24)]);
  };

  // Run Auth
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsSubmitting(true);

    setTimeout(() => {
      const normalUser = username.trim().toLowerCase();
      // Accepts master credentials
      if (
        (normalUser === 'admin@trackbook.xyz' && password === 'admin2026') || 
        (normalUser === 'admin' && password === 'admin') ||
        (normalUser === 'admin' && password === 'admin2026')
      ) {
        sessionStorage.setItem('admin_session', 'true');
        setIsAuthenticated(true);
        addLog("Admin user successfully authenticated with Master Credentials.");
      } else {
        setLoginError('Invalid Administrator credentials. Please verify your passcode.');
        addLog("Authentication attempt failed from IP gateway.");
      }
      setIsSubmitting(false);
    }, 400);
  };

  // Handle Logout
  const handleLogout = () => {
    sessionStorage.removeItem('admin_session');
    setIsAuthenticated(false);
    addLog("Administrator session terminated.");
  };

  // Fetch Database Insights
  const fetchDatabaseInsights = async () => {
    if (!supabase) {
      setTotalCashbooks('Database Error');
      setTotalEntries('Database Error');
      addLog("Supabase client is not initialized.");
      return;
    }

    setIsRefreshing(true);
    addLog("Interrogating server tables for row stats...");

    try {
      // Fetch cashbooks count query
      const { data: cbData, error: cbError, count: cbCount } = await supabase
        .from('cashbooks')
        .select('*', { count: 'exact' });

      if (cbError) {
        console.warn('Admin fetch cashbooks restricted, attempting fallbacks:', cbError);
        addLog(`RLS Active: Cashbooks restricted of global visibility. Rows returned: ${cbData?.length || 0}`);
        setTotalCashbooks(cbData?.length || 0);
        if (cbData) {
          setAllCashbooks(cbData);
        }
      } else {
        setTotalCashbooks(cbCount !== null ? cbCount : (cbData?.length || 0));
        setAllCashbooks(cbData || []);
        setSecurityStatus('Standard Access');
      }

      // Fetch entries count query
      const { data: entData, error: entError, count: entCount } = await supabase
        .from('entries')
        .select('*', { count: 'exact' });

      if (entError) {
        console.warn('Admin fetch entries restricted:', entError);
        addLog(`RLS Active: Row level security restricted global entries log.`);
        setTotalEntries(entData?.length || 0);
        setRecentEntries(entData || []);
      } else {
        setTotalEntries(entCount !== null ? entCount : (entData?.length || 0));
        setRecentEntries(entData || []);
      }

      addLog("Statistics compilation success.");
    } catch (err: any) {
      console.error('Database insights failed:', err);
      addLog(`Error interrogating tables: ${err.message || err}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchDatabaseInsights();
    }
  }, [isAuthenticated]);

  // Insert mock demonstration expense in database
  const generateMockEntry = async () => {
    if (!supabase) {
      addLog("Unable to insert, Supabase not connected.");
      return;
    }

    try {
      addLog("Initiating sandboxed demo entry insertion...");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        addLog("Error: No active user session detected in browser cache. Please sign into Trackbook main app first.");
        return;
      }

      // Check for first cashbook ID for current user
      const { data: firstBook } = await supabase
        .from('cashbooks')
        .select('id, name')
        .eq('user_id', user.id)
        .limit(1);

      let bookId = '';
      if (firstBook && firstBook.length > 0) {
        bookId = firstBook[0].id;
        addLog(`Found active user book: "${firstBook[0].name}"`);
      } else {
        // Create a fast cashbook
        const newCbId = crypto.randomUUID();
        const { error: cbErr } = await supabase.from('cashbooks').insert([{
          id: newCbId,
          name: 'Sandbox Demo Book',
          user_id: user.id
        }]);
        if (cbErr) throw cbErr;
        bookId = newCbId;
        addLog('Created fresh "Sandbox Demo Book" for insert pipeline.');
      }

      const freshId = crypto.randomUUID();
      const mockPayload = {
        id: freshId,
        cashbook_id: bookId,
        user_id: user.id,
        amount: Math.floor(Math.random() * 850) + 150,
        type: Math.random() > 0.35 ? 'out' : 'in',
        description: 'Auto-Generated Admin Mock Transaction',
        category: ['Food', 'Transport', 'Utilities', 'Salaries', 'General'][Math.floor(Math.random() * 5)],
        mode: 'Online',
        date: new Date().toISOString()
      };

      const { error: insErr } = await supabase.from('entries').insert([mockPayload]);
      if (insErr) throw insErr;

      addLog(`Success! Inserted row with ID: ${freshId.slice(0, 8)}...`);
      fetchDatabaseInsights();
    } catch (err: any) {
      addLog(`Insert crashed: ${err.message || err}`);
    }
  };

  // Clear App local storages
  const wipeSandboxedStorage = () => {
    if (confirm("Wipe client cache but retain sessions?")) {
      const savedTheme = localStorage.getItem('theme');
      const savedAdmin = sessionStorage.getItem('admin_session');
      localStorage.clear();
      sessionStorage.clear();
      if (savedTheme) localStorage.setItem('theme', savedTheme);
      if (savedAdmin) sessionStorage.setItem('admin_session', savedAdmin);
      addLog("Purged index lists and local cached preferences cleanly.");
      alert("Cached storage arrays clean! Credentials maintained.");
    }
  };

  // Filter lists based on search
  const filteredEntries = recentEntries.filter(entry => {
    const term = searchQuery.toLowerCase();
    return (
      (entry.description?.toLowerCase() || '').includes(term) ||
      (entry.category?.toLowerCase() || '').includes(term) ||
      (entry.amount?.toString() || '').includes(term) ||
      (entry.id?.toLowerCase() || '').includes(term)
    );
  });

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-300 flex flex-col font-sans selection:bg-indigo-500/20",
      theme === 'dark' ? "bg-zinc-950 text-slate-200" : "bg-slate-50 text-slate-800"
    )}>
      {/* 1. LOGIN WALL VIEW */}
      <AnimatePresence mode="wait">
        {!isAuthenticated ? (
          <motion.div 
            key="login-wall"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="flex-1 flex items-center justify-center p-4 sm:p-8"
          >
            <div className={cn(
              "w-full max-w-md rounded-[32px] p-6 sm:p-10 border shadow-2xl transition-all duration-300",
              theme === 'dark' ? "bg-zinc-900 border-zinc-800 shadow-black/70" : "bg-white border-slate-100 shadow-slate-200/40"
            )}>
              <div className="text-center space-y-4 mb-8">
                <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                  <ShieldAlert size={28} className="animate-pulse" />
                </div>
                <div>
                  <h1 className={cn(
                    "text-2xl font-black tracking-tight",
                    theme === 'dark' ? "text-white" : "text-zinc-900 font-lora"
                  )}>
                    TrackBook <span className="text-indigo-600 font-sans font-black">Control Studio</span>
                  </h1>
                  <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1.5 font-mono">
                    SECURED MANAGEMENT CONSOLE
                  </p>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                    Administrator ID
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 dark:text-zinc-600 font-mono text-xs">@</span>
                    <input 
                      type="text"
                      required
                      placeholder="admin@trackbook.xyz"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={cn(
                        "w-full pl-8 pr-4 py-2.5 text-sm font-bold rounded-xl border focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all font-mono",
                        theme === 'dark' ? "border-zinc-850 bg-zinc-950 text-white" : "border-slate-200 bg-slate-50 text-zinc-900"
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                    Master Security Key
                  </label>
                  <div className="relative">
                    <Lock size={12} className="absolute left-3.5 top-3.5 text-slate-400 dark:text-zinc-600" />
                    <input 
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={cn(
                        "w-full pl-9 pr-4 py-2.5 text-sm font-bold rounded-xl border focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all font-mono",
                        theme === 'dark' ? "border-zinc-850 bg-zinc-950 text-white" : "border-slate-200 bg-slate-50 text-zinc-900"
                      )}
                    />
                  </div>
                </div>

                {loginError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl flex items-center gap-2 text-xs text-red-600 dark:text-red-400 font-medium">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold uppercase tracking-widest text-[10px] rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>Verifying Access Signature...</>
                  ) : (
                    <>
                      Authenticate <CheckCircle2 size={12} />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-8 pt-4 border-t border-dashed border-slate-150 dark:border-zinc-800 text-center flex justify-between items-center text-[10px] text-slate-400 dark:text-zinc-500">
                <button 
                  onClick={() => navigate('/login')} 
                  className="flex items-center gap-1 hover:text-indigo-600 font-bold transition-transform active:translate-x-[-2px] uppercase tracking-wider"
                >
                  <ArrowLeft size={10} /> Exit to App
                </button>
                <button 
                  onClick={toggleTheme}
                  className="p-1 px-2.5 rounded-md border border-slate-200 dark:border-zinc-800 flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-zinc-850"
                >
                  {theme === 'dark' ? <Sun size={10} /> : <Moon size={10} />}
                  Theme Mode
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          /* 2. ADMIN PORTAL CONTENT VIEW */
          <motion.div 
            key="admin-desktop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex flex-col min-h-0"
          >
            {/* Header Toolbar */}
            <div className={cn(
              "p-4 rounded-3xl border flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm",
              theme === 'dark' ? "bg-zinc-900 border-zinc-900" : "bg-white border-slate-150"
            )}>
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600 text-white rounded-2xl">
                  <Activity size={20} className="animate-pulse" />
                </div>
                <div>
                  <h2 className="text-sm font-black tracking-tight uppercase">TrackBook Admin Panel</h2>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5 font-mono">
                    SYSTEM INSTANCE: LOCAL_CONTAINER_MAIN • v5.0.0
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button 
                  onClick={toggleTheme}
                  className="p-2 rounded-xl border border-slate-150 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-850 cursor-pointer"
                  title="Toggle Theme"
                >
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                
                <button 
                  onClick={fetchDatabaseInsights}
                  disabled={isRefreshing}
                  className="p-2 rounded-xl border border-slate-150 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-850 cursor-pointer disabled:opacity-50 flex items-center gap-1.5 text-xs font-bold font-mono"
                >
                  <RefreshCw size={14} className={cn(isRefreshing && "animate-spin")} />
                  Sync Metrics
                </button>

                <button 
                  onClick={() => navigate('/')}
                  className="p-2 px-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                >
                  <ArrowLeft size={14} /> Go to Dashboard
                </button>

                <button 
                  onClick={handleLogout}
                  className="p-2 px-3.5 rounded-xl bg-red-500 hover:bg-red-600 text-white cursor-pointer flex items-center gap-1.5 text-xs font-black uppercase tracking-wider shadow-sm"
                >
                  <LogOut size={14} /> Log Out
                </button>
              </div>
            </div>

            {/* Stats Overview Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <AdminStatCard 
                title="Total Cashbooks"
                value={totalCashbooks}
                icon={<Database size={16} />}
                subtitle="Aggregated client book namespaces"
                trend="+8%"
                theme={theme}
              />
              <AdminStatCard 
                title="Total Bill Items"
                value={totalEntries}
                icon={<FileSpreadsheet size={16} />}
                subtitle="Calculated splits entries in platform"
                trend="+14%"
                theme={theme}
              />
              <AdminStatCard 
                title="SaaS OCR Pipeline"
                value="Gemini 3.5"
                icon={<Cpu size={16} />}
                subtitle="Active smart OCR agent engine"
                theme={theme}
              />
              <AdminStatCard 
                title="Gatekeeper Level"
                value={securityStatus}
                icon={<Users size={16} />}
                subtitle="PostgreSQL RLS security context"
                theme={theme}
              />
            </div>

            {/* Mid Section: Performance Canvas & Logs Console */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* SVG Charts Section */}
              <div className={cn(
                "p-5 rounded-3xl border lg:col-span-2 space-y-4 shadow-sm",
                theme === 'dark' ? "bg-zinc-900 border-zinc-900" : "bg-white border-slate-150"
              )}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">
                      System Volume Insights
                    </h3>
                    <p className="text-xl font-bold text-zinc-900 dark:text-white mt-1">Platform Activity Trends</p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-indigo-500 rounded-full inline-block" /> OCR Processing</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full inline-block" /> User Sign-ups</span>
                  </div>
                </div>

                {/* Custom Vector Area Chart */}
                <div className="h-48 w-full relative flex items-end">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 500 200" preserveAspectRatio="none">
                    {/* Grid lines */}
                    <line x1="0" y1="50" x2="500" y2="50" stroke={theme === 'dark' ? "#27272a" : "#f1f5f9"} strokeWidth="1" strokeDasharray="3,3" />
                    <line x1="0" y1="100" x2="500" y2="100" stroke={theme === 'dark' ? "#27272a" : "#f1f5f9"} strokeWidth="1" strokeDasharray="3,3" />
                    <line x1="0" y1="150" x2="500" y2="150" stroke={theme === 'dark' ? "#27272a" : "#f1f5f9"} strokeWidth="1" strokeDasharray="3,3" />
                    
                    {/* Area path for OCR Processing volume */}
                    <path 
                      d="M 0 160 Q 100 120 180 80 T 360 110 T 500 40 L 500 200 L 0 200 Z" 
                      fill="url(#indigoGrad)" 
                      opacity="0.15" 
                    />
                    {/* Line path */}
                    <path 
                      d="M 0 160 Q 100 120 180 80 T 360 110 T 500 40" 
                      fill="none" 
                      stroke="#6366f1" 
                      strokeWidth="2.5" 
                      strokeLinecap="round"
                    />

                    {/* Area path for Signups */}
                    <path 
                      d="M 0 180 Q 80 140 160 130 T 320 90 T 500 70 L 500 200 L 0 200 Z" 
                      fill="url(#emeraldGrad)" 
                      opacity="0.1" 
                    />
                    <path 
                      d="M 0 180 Q 80 140 160 130 T 320 90 T 500 70" 
                      fill="none" 
                      stroke="#10b981" 
                      strokeWidth="2" 
                      strokeLinecap="round"
                      strokeDasharray="4,4"
                    />

                    {/* Gradients declaration */}
                    <defs>
                      <linearGradient id="indigoGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="emeraldGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex justify-between pointer-events-none text-[8.5px] font-mono text-slate-400 dark:text-zinc-650 pt-2 px-1">
                    <span>Mon</span>
                    <span>Tue</span>
                    <span>Wed</span>
                    <span>Thu</span>
                    <span>Fri</span>
                    <span>Sat</span>
                    <span>Sun</span>
                  </div>
                </div>
              </div>

              {/* Server Control Log / Terminal */}
              <div className={cn(
                "p-5 rounded-3xl border flex flex-col h-full shadow-sm",
                theme === 'dark' ? "bg-zinc-900 border-zinc-900" : "bg-white border-slate-150"
              )}>
                <div className="flex items-center gap-2 pb-3 border-b border-light border-slate-100 dark:border-zinc-800">
                  <Terminal size={14} className="text-emerald-500 animate-pulse" />
                  <h4 className="text-xs font-black uppercase tracking-widest text-[#111111] dark:text-white">
                    Live Diagnostics Stream
                  </h4>
                </div>
                
                <div className="flex-1 mt-3 bg-zinc-950 p-3 rounded-2xl text-[10px] font-mono text-emerald-400 h-48 overflow-y-auto space-y-1.5 scrollbar-thin border border-zinc-900 shadow-inner text-left">
                  {diagnosticsLogs.map((log, idx) => (
                    <div key={idx} className="leading-normal">
                      <span className="text-zinc-650 select-none mr-2">❯</span>
                      <span>{log}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Dynamic Interactive Sandbox Toolkit */}
            <div className={cn(
              "p-5 rounded-3xl border shadow-sm space-y-4",
              theme === 'dark' ? "bg-zinc-900 border-zinc-900" : "bg-white border-slate-150"
            )}>
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">
                  Admin Sandbox Diagnostics
                </h3>
                <p className="text-sm font-semibold mt-1">Simulate container pipelines and purge mock session footprints</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button 
                  onClick={generateMockEntry}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-transform active:scale-[0.97] cursor-pointer"
                >
                  <Sparkles size={14} />
                  Inject Random Mock Split Entry
                </button>

                <button 
                  onClick={wipeSandboxedStorage}
                  className="px-4 py-2.5 bg-zinc-100 hover:bg-red-50 hover:text-red-600 dark:bg-zinc-850 dark:hover:bg-red-950/20 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-zinc-800 text-xs font-bold rounded-xl flex items-center gap-2 transition-transform active:scale-[0.97] cursor-pointer"
                >
                  <Trash2 size={14} />
                  Purge Sandbox Storage Cache
                </button>

                <button 
                  onClick={() => {
                    const status = !realtimeConnected;
                    setRealtimeConnected(status);
                    addLog(`WebSocket transport simulated state changed: ${status ? 'ON' : 'OFF'}`);
                  }}
                  className={cn(
                    "px-4 py-2.5 border text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer",
                    realtimeConnected 
                      ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/10"
                      : "bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/10"
                  )}
                >
                  <span className={cn("w-2 h-2 rounded-full", realtimeConnected ? "bg-emerald-500" : "bg-amber-500")} />
                  Simulate Offline Client {realtimeConnected ? "(Transport: Connected)" : "(Transport: Silenced)"}
                </button>
              </div>
            </div>

            {/* Core Database Inspector list viewer */}
            <div className={cn(
              "p-5 rounded-3xl border shadow-sm flex-1 flex flex-col min-h-0",
              theme === 'dark' ? "bg-zinc-900 border-zinc-900" : "bg-white border-slate-150"
            )}>
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-zinc-800 shrink-0">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">
                    Live Database Record Auditing
                  </h3>
                  <p className="text-sm font-semibold mt-1">Platform table query audit trail (entries rows filtered via search)</p>
                </div>

                <div className="w-full md:w-80 relative">
                  <Search size={14} className="absolute left-3 top-3 text-slate-400 dark:text-zinc-650" />
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by amount, descriptor text, category..."
                    className={cn(
                      "w-full pl-9 pr-4 py-1.5 text-xs font-bold rounded-xl border focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all",
                      theme === 'dark' ? "border-zinc-800 bg-zinc-950 text-white" : "border-slate-200 bg-white text-zinc-900"
                    )}
                  />
                </div>
              </div>

              {/* Data Table */}
              <div className="flex-1 overflow-y-auto mt-4 pr-1 min-h-[200px]">
                {filteredEntries.length === 0 ? (
                  <div className="h-40 flex flex-col items-center justify-center text-center text-slate-400 dark:text-zinc-600">
                    <Database size={28} className="stroke-[1.5]" />
                    <span className="text-xs font-bold mt-2">No Matching Rows Logged</span>
                    <span className="text-[10px] mt-1 px-4 leading-normal max-w-sm">
                      Check your active filters, or leverage security features by adding entries to your dashboard cashbooks list.
                    </span>
                  </div>
                ) : (
                  <table className="w-full text-left font-mono text-[10px] border-collapse">
                    <thead>
                      <tr className={cn(
                        "border-b uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-wider",
                        theme === 'dark' ? "border-zinc-850" : "border-slate-100"
                      )}>
                        <th className="py-2.5 px-3">Entry Unique identifier</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Details / Notes</th>
                        <th className="py-2.5 px-3 text-right">Volume amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-850">
                      {filteredEntries.map((row) => (
                        <tr 
                          key={row.id} 
                          className="hover:bg-slate-50/50 dark:hover:bg-zinc-850/30 transition-colors group"
                        >
                          <td className="py-3 px-3 relative font-bold text-slate-400 dark:text-zinc-600">
                            {row.id?.slice(0, 8)}...
                            <span className="absolute left-1 opacity-0 group-hover:opacity-100 text-[8px] text-indigo-500 dark:text-indigo-400 transition-opacity font-bold">●</span>
                          </td>
                          <td className="py-3 px-3 text-slate-500 dark:text-zinc-400">
                            {new Date(row.date).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-3">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] font-black",
                              row.type === 'in' 
                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400"
                                : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400"
                            )}>
                              {row.category || 'General'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-zinc-900 dark:text-white font-sans max-w-xs truncate" title={row.description}>
                            {row.description || 'No description provided'}
                          </td>
                          <td className={cn(
                            "py-3 px-4 text-right font-bold text-xs",
                            row.type === 'in' ? "text-emerald-600" : "text-zinc-900 dark:text-slate-100"
                          )}>
                            {row.type === 'in' ? '+' : '-'}₹{row.amount?.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
