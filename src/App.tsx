import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { Loader2 } from 'lucide-react';
import { cn } from './lib/utils';
import SmartUpdateManager from './components/SmartUpdateManager';
import AutoLogoutManager from './components/AutoLogoutManager';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/Login'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

function NavigationHandler({ 
  session, 
  setSession, 
  setLoading 
}: { 
  session: any; 
  setSession: (s: any) => void; 
  setLoading: (l: boolean) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Get initial session with timeout safety
    const sessionTimeout = setTimeout(() => {
      console.warn('Auth session lookup taking too long, forcing load completion...');
      setLoading(false);
    }, 5000); // 5 second safety net

    supabase.auth.getSession().then((res) => {
      clearTimeout(sessionTimeout);
      const session = res?.data?.session || null;
      setSession(session);
      setLoading(false);
      
      // If we have a recovery token in the hash, ensure we are on the reset page
      const hash = window.location.hash;
      if (hash && (hash.includes('type=recovery') || hash.includes('access_token='))) {
        if (location.pathname !== '/resetpassword') {
          navigate('/resetpassword' + hash, { replace: true });
        }
      }
    }).catch(err => {
      console.error('Auth session lookup failed:', err);
      clearTimeout(sessionTimeout);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      
      if (event === 'PASSWORD_RECOVERY') {
        console.log('Password recovery event detected');
        if (location.pathname !== '/resetpassword') {
          navigate('/resetpassword', { replace: true });
        }
      } else if (event === 'SIGNED_IN' && location.pathname === '/login') {
        navigate('/', { replace: true });
      } else if (event === 'SIGNED_OUT') {
        navigate('/login', { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, location.pathname, setSession, setLoading]);

  return null;
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  // Theme handling
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.style.colorScheme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  // PWA Install Prompt handling
  useEffect(() => {
    // Force cache clear for v5 update
    const CURRENT_VERSION = '5.0.0';
    const savedVersion = localStorage.getItem('app_version');
    
    if (savedVersion !== CURRENT_VERSION) {
      console.log('New version detected, clearing cache and local data...');
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for(let registration of registrations) registration.unregister();
        });
      }
      localStorage.clear(); // Clear all potentially corrupt local storage
      localStorage.setItem('app_version', CURRENT_VERSION);
      // Hard reload once to kill old service worker control
      setTimeout(() => window.location.reload(), 500);
    }

    const handleBeforeInstallPrompt = (e: any) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later.
      console.log('PWA install prompt available');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const suspenseFallback = (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-indigo-600 animate-duration-1000" size={40} />
        <p className="text-sm font-medium text-slate-500 animate-pulse">Loading view...</p>
      </div>
    </div>
  );

  return (
    <Router>
      <SmartUpdateManager theme={theme} />
      <AutoLogoutManager session={session} />
      <NavigationHandler 
        session={session} 
        setSession={setSession} 
        setLoading={setLoading} 
      />
      
      <Suspense fallback={suspenseFallback}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login theme={theme} initialMode="signin" />} />
          <Route path="/register" element={<Login theme={theme} initialMode="signup" />} />
          <Route path="/forgot" element={<Login theme={theme} initialMode="forgot" />} />
          <Route path="/signup" element={<Navigate to="/register" replace />} />
          <Route path="/resetpassword" element={<ResetPassword />} />

          {/* Protected Routes */}
          <Route 
            path="/" 
            element={
              session ? (
                <Dashboard session={session} theme={theme} setTheme={setTheme} />
              ) : (
                // If we are still loading initial session, show a loader
                loading ? (
                  <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="animate-spin text-indigo-600" size={40} />
                      <p className="text-sm font-medium text-slate-500 animate-pulse">Initializing app...</p>
                    </div>
                  </div>
                ) : <Navigate to="/login" replace />
              )
            } 
          />
          <Route 
            path="/cashbooks" 
            element={
              session ? (
                <Dashboard session={session} theme={theme} setTheme={setTheme} />
              ) : (
                loading ? (
                  <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="animate-spin text-indigo-600" size={40} />
                      <p className="text-sm font-medium text-slate-500 animate-pulse">Initializing app...</p>
                    </div>
                  </div>
                ) : <Navigate to="/login" replace />
              )
            } 
          />
          <Route 
            path="/cashbooks/:bookSlug" 
            element={
              session ? (
                <Dashboard session={session} theme={theme} setTheme={setTheme} />
              ) : (
                loading ? (
                  <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="animate-spin text-indigo-600" size={40} />
                      <p className="text-sm font-medium text-slate-500 animate-pulse">Initializing app...</p>
                    </div>
                  </div>
                ) : <Navigate to="/login" replace />
              )
            } 
          />
          <Route 
            path="/cashbooks/:bookSlug/:tabName" 
            element={
              session ? (
                <Dashboard session={session} theme={theme} setTheme={setTheme} />
              ) : (
                loading ? (
                  <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="animate-spin text-indigo-600" size={40} />
                      <p className="text-sm font-medium text-slate-500 animate-pulse">Initializing app...</p>
                    </div>
                  </div>
                ) : <Navigate to="/login" replace />
              )
            } 
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
