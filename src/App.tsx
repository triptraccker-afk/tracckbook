import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import { Loader2, AlertCircle } from 'lucide-react';
import { getApiUrl } from './lib/api';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [backendReady, setBackendReady] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    console.log('App sequence starting (App.tsx)...');

    if (!supabase) {
      setLoading(false);
      return;
    }

    // Get initial session with timeout safety
    const sessionTimeout = setTimeout(() => {
      console.warn('Auth session lookup taking too long, forcing load completion...');
      setLoading(false);
    }, 5000); // 5 second safety net

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(sessionTimeout);
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
  }, [navigate, location.pathname]);

  // Theme handling
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.style.colorScheme = theme;
    localStorage.setItem('theme', theme);
    
    // Update theme-color meta tag for mobile browser headers
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff');
    }
  }, [theme]);

  // PWA Install Prompt handling
  useEffect(() => {
    // Force cache clear for v8.1 update - critical for network fixes and cache purging
    const CURRENT_VERSION = '8.1.0';
    const savedVersion = localStorage.getItem('app_version');
    
    if (savedVersion !== CURRENT_VERSION) {
      console.log('New version detected (v8.1), clearing cache and local data...');
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for(let registration of registrations) registration.unregister();
        });
      }
      localStorage.clear();
      localStorage.setItem('app_version', CURRENT_VERSION);
      // Hard reload once to kill old control
      setTimeout(() => window.location.reload(), 200);
    }

    const handleBeforeInstallPrompt = (e: any) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later.
      console.log('PWA install prompt available');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Global click listener for haptic feedback
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Broad selector for interactive elements
      const clickable = target.closest('button, a, [role="button"], input[type="submit"], .cursor-pointer');
      
      // Also check computed style as a fallback for elements with "cursor-pointer" class or pointer style
      const style = window.getComputedStyle(target);
      const isPointer = style.cursor === 'pointer';

      if (clickable || isPointer) {
        import('./lib/utils').then(({ vibrate }) => {
          vibrate(25); // Light subtle tap
        });
      }
    };

    window.addEventListener('click', handleGlobalClick);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('click', handleGlobalClick);
    };
  }, []);

  // Protected Route Rendering Logic
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-indigo-600" size={40} />
          <p className="text-sm font-medium text-slate-500 animate-pulse">Initializing TrackBook...</p>
        </div>
      </div>
    );
  }

  if (!session && location.pathname !== '/login' && location.pathname !== '/resetpassword') {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login theme={theme} />} />
        <Route path="/resetpassword" element={<ResetPassword />} />

        {/* Home / Dashboard */}
        <Route 
          path="/" 
          element={<Dashboard session={session} theme={theme} setTheme={setTheme} />} 
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
