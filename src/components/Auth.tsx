import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Eye,
  EyeOff,
  Loader2, 
  AlertCircle,
  CheckCircle2,
  ArrowLeft
} from 'lucide-react';
import { cn } from '../lib/utils';

type AuthMode = 'signin' | 'signup' | 'forgot';

export default function Auth({ 
  theme = 'light', 
}: { 
  theme?: string;
  onRecoveryComplete?: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=signup') || hash.includes('error_code=otp_expired')) {
      setMode('signin');
      if (hash.includes('error_code=otp_expired')) {
        setError('Link expired. Please try signing up again or contact support.');
      } else {
        setSuccess('Email confirmed! You can now login.');
      }
    }
  }, []);

  const getPasswordRequirements = (pass: string) => {
    return [
      { label: '6+ characters', met: pass.length >= 6, key: 'length' },
      { label: 'Capital letter', met: /[A-Z]/.test(pass), key: 'capital' },
      { label: 'Number', met: /[0-9]/.test(pass), key: 'number' },
      { label: 'Special char', met: /[^A-Za-z0-9]/.test(pass), key: 'special' },
      { label: 'Alphabet', met: /[a-zA-Z]/.test(pass), key: 'alpha' },
    ];
  };

  const passwordReqs = getPasswordRequirements(password);
  const isPasswordStrong = passwordReqs.every(req => req.met);

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    
    if (mode === 'signup') {
      if (!isPasswordStrong) {
        setError('Please meet all password requirements');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    
    const redirectTo = window.location.origin;

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        setSuccess('Account created! Please check your email.');
      } else if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${redirectTo}/resetpassword`,
        });
        if (error) throw error;
        setSuccess('Sent! Check your email.');
      }
    } catch (err: any) {
      setError(err.message || 'Error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn(
      "min-h-screen flex items-center justify-center p-3 transition-colors duration-300",
      theme === 'dark' ? "bg-black" : "bg-[#f3f7ff]"
    )}>
      <div 
        className={cn(
          "w-full max-w-[300px] rounded-[20px] p-4 sm:p-7 shadow-lg border",
          theme === 'dark' ? "bg-zinc-950 border-zinc-800" : "bg-white border-white/50"
        )}
      >
        <div className="text-center mb-4">
          <div className="flex flex-col items-center justify-center mb-2">
            <div className="flex items-center gap-1.5 font-bold text-2xl">
              <span className="text-[#3b82f6]">Track</span>
              <span className={theme === 'dark' ? "text-slate-100" : "text-slate-800"}>Book</span>
            </div>
          </div>
          <p className={cn(
            "text-[9px] font-medium mt-1",
            theme === 'dark' ? "text-slate-400" : "text-black"
          )}>
            {mode === 'signin' ? 'Welcome back! Login to continue.' : 
             mode === 'signup' ? 'Join us to start tracking.' : 
             'Reset your password.'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-3">
          {error && (
            <div 
              key="error"
              className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 p-2 rounded-lg flex items-start gap-2 text-[10px] font-medium border border-rose-100 dark:border-rose-900/30"
            >
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div 
              key="success"
              className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 p-2 rounded-lg flex items-start gap-2 text-[10px] font-medium border border-emerald-100 dark:border-emerald-900/30"
            >
              <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}
          
          <div className="space-y-3">
            {mode === 'signup' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold ml-1 dark:text-slate-300">Full Name</label>
                <input
                  type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                  placeholder="EX: Siva"
                  className={cn("w-full border rounded-lg py-2 px-3 text-xs", theme === 'dark' ? "bg-zinc-900 border-zinc-800 text-slate-100" : "bg-white border-slate-200")}
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-bold ml-1 dark:text-slate-300">Email</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="Example: siva@gmail.com"
                className={cn("w-full border rounded-lg py-2 px-3 text-xs", theme === 'dark' ? "bg-zinc-900 border-zinc-800 text-slate-100" : "bg-white border-slate-200")}
              />
            </div>

            {mode !== 'forgot' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold ml-1 dark:text-slate-300">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className={cn("w-full border rounded-lg py-2 px-3 text-xs pr-9", theme === 'dark' ? "bg-zinc-900 border-zinc-800 text-slate-100" : "bg-white border-slate-200")}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Eye size={14} /></button>
                </div>
              </div>
            )}

            {mode === 'signup' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold ml-1 dark:text-slate-300">Confirm Password</label>
                <input
                  type={showConfirmPassword ? "text" : "password"} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm Password"
                  className={cn("w-full border rounded-lg py-2 px-3 text-xs", theme === 'dark' ? "bg-zinc-900 border-zinc-800 text-slate-100" : "bg-white border-slate-200")}
                />
              </div>
            )}
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full rounded-lg py-2.5 font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin mx-auto" size={18} /> : (mode === 'signin' ? 'Login' : mode === 'signup' ? 'Sign Up' : 'Reset')}
          </button>
        </form>

        <div className="mt-5 text-center space-y-2 text-[11px]">
          {mode === 'signin' && (
            <button type="button" onClick={() => setMode('forgot')} className="text-blue-500 font-bold block w-full">Forgot password?</button>
          )}

          <p className="dark:text-slate-400">
            {mode === 'signin' ? "Don't have an account? " : "Already have an account? "}
            <button 
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="text-blue-500 font-bold"
            >
              {mode === 'signin' ? 'Sign up' : 'Login'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
