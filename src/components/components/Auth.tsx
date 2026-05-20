import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Eye,
  EyeOff,
  Loader2, 
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  LogOut
} from 'lucide-react';
import { cn } from '../lib/utils';

type AuthMode = 'signin' | 'signup' | 'forgot';

export default function Auth({ 
  theme = 'light', 
  onRecoveryComplete 
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
    // Handle redirect modes
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    
    if (hash.includes('type=signup') || hash.includes('error_code=otp_expired')) {
      setMode('signin');
      if (hash.includes('error_code=otp_expired')) {
        setError('Link expired. Please try signing up again or contact support.');
      } else {
        setSuccess('Email confirmed! You can now login.');
      }
    }
  }, []);

  const [testingConnection, setTestingConnection] = useState(false);

  const testConnection = async () => {
    if (!supabase) return;
    setTestingConnection(true);
    try {
      await supabase.from('cashbooks').select('id').limit(1);
    } catch (err: any) {
      console.error('Connection check failed:', err);
    } finally {
      setTestingConnection(false);
    }
  };

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

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Auto-login for testing if credentials match provided ones (Optional, but helps user)
    if (email === 'sivasaiprasadkaki@gmail.com' && password === 'Siva@123') {
       console.log('Using test credentials...');
    }

    if (!supabase) {
      setError('Supabase is not configured. Please check your environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).');
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
    
    console.log(`Attempting ${mode} for ${email}...`);

    const redirectTo = window.location.origin;

    try {
      if (mode === 'signup') {
        console.log('Signing up...');
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              full_name: fullName,
            },
          },
        });
        if (error) throw error;
        setSuccess('Account created! Please check your email for verification.');
      } else if (mode === 'signin') {
        console.log('Signing in...');
        const { error, data } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          console.error('SignIn Error Details:', error);
          throw error;
        }
        console.log('SignIn Success:', data);
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${redirectTo}/resetpassword`,
        });
        if (error) throw error;
        setSuccess('Password reset link sent to your email!');
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.message?.includes('Email not confirmed')) {
        setError('Email not confirmed. Please check your inbox or spam folder for the verification link.');
      } else if (err.message?.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please try again.');
      } else {
        setError(err.message || 'An error occurred during authentication.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn(
      "min-h-screen flex items-center justify-center p-3 font-sans transition-colors duration-300",
      theme === 'dark' ? "bg-black" : "bg-[#f3f7ff]"
    )}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "w-full max-w-[300px] rounded-[20px] p-4 sm:p-7 shadow-[0_10px_40px_rgba(0,0,0,0.04)] border transition-colors duration-300",
          theme === 'dark' ? "bg-zinc-950 border-zinc-800 shadow-none" : "bg-white border-white/50"
        )}
      >
        <div className="text-center mb-4">
          <div className="flex flex-col items-center justify-center mb-2 font-outfit">
            <div className="flex items-center gap-1.5">
              <span className="text-[24px] font-black text-[#3b82f6] dark:text-blue-400 tracking-tight">Track</span>
              <span className={cn(
                "text-[24px] font-black tracking-tight transition-colors duration-300",
                theme === 'dark' ? "text-slate-100" : "text-slate-800"
              )}>Book</span>
            </div>
          </div>

          <p className={cn(
            "text-[9px] font-medium mt-1 leading-relaxed transition-colors duration-300",
            theme === 'dark' ? "text-slate-400" : "text-black"
          )}>
            {mode === 'signin' ? 'Welcome back! Please login to continue.' : 
             mode === 'signup' ? 'Join us to start tracking your expenses.' : 
             'Reset your forgotten password.'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-3">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 p-2 rounded-lg flex items-start gap-2 text-[10px] font-medium border border-rose-100 dark:border-rose-900/30 overflow-hidden"
              >
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}

            {success && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 p-2 rounded-lg flex items-start gap-2 text-[10px] font-medium border border-emerald-100 dark:border-emerald-900/30 overflow-hidden"
              >
                <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
                <span>{success}</span>
              </motion.div>
            )}
          </AnimatePresence>
          
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-1"
          >
            {mode === 'signup' && (
              <div className="space-y-1 mb-3">
                <label className={cn(
                  "text-[10px] font-bold ml-1 transition-colors duration-300",
                  theme === 'dark' ? "text-slate-300" : "text-black"
                )}>Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  className={cn(
                    "w-full border focus:border-[#3b82f6] rounded-lg py-2 px-3.5 outline-none transition-all text-xs font-medium placeholder:text-[#cbd5e1]",
                    theme === 'dark' ? "bg-zinc-900 border-zinc-800 text-slate-100" : "bg-white border-[#e2e8f0] text-slate-800"
                  )}
                />
              </div>
            )}

            {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && (
              <div className="space-y-1">
                <label className={cn(
                  "text-[10px] font-bold ml-1 transition-colors duration-300",
                  theme === 'dark' ? "text-slate-300" : "text-black"
                )}>Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className={cn(
                    "w-full border focus:border-[#3b82f6] rounded-lg py-2 px-3.5 outline-none transition-all text-xs font-medium placeholder:text-[#cbd5e1]",
                    theme === 'dark' ? "bg-zinc-900 border-zinc-800 text-slate-100" : "bg-white border-[#e2e8f0] text-slate-800"
                  )}
                />
              </div>
            )}
          </motion.div>

          {mode !== 'forgot' && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-3"
            >
              <div className="space-y-1">
                <label className={cn(
                  "text-[10px] font-bold ml-1 transition-colors duration-300",
                  theme === 'dark' ? "text-slate-300" : "text-black"
                )}>
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className={cn(
                      "w-full border focus:border-[#3b82f6] rounded-lg py-2 px-3.5 outline-none transition-all text-xs font-medium placeholder:text-[#cbd5e1] pr-9",
                      theme === 'dark' ? "bg-zinc-900 border-zinc-800 text-slate-100" : "bg-white border-[#e2e8f0] text-slate-800"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#cbd5e1] hover:text-[#3b82f6] transition-colors"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                
                {/* Password Strength Indicator */}
                <AnimatePresence>
                  {mode === 'signup' && password.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className={cn(
                        "mt-2 p-2 rounded-lg border overflow-hidden",
                        theme === 'dark' ? "bg-zinc-900/50 border-zinc-800" : "bg-slate-50 border-slate-100"
                      )}
                    >
                      <p className={cn(
                        "text-[9px] font-bold mb-1.5 flex items-center gap-1",
                        theme === 'dark' ? "text-slate-400" : "text-slate-500"
                      )}>
                        {isPasswordStrong ? (
                          <CheckCircle2 size={10} className="text-emerald-500" />
                        ) : (
                          <AlertCircle size={10} className="text-amber-500" />
                        )}
                        Security Requirements
                      </p>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                        {passwordReqs.map((req) => (
                          <div key={req.key} className="flex items-center gap-1.5">
                            <div className={cn(
                              "w-1 h-1 rounded-full",
                              req.met ? "bg-emerald-500" : (theme === 'dark' ? "bg-zinc-700" : "bg-slate-300")
                            )} />
                            <span className={cn(
                              "text-[8px] font-medium",
                              req.met ? (theme === 'dark' ? "text-emerald-400" : "text-emerald-600") : (theme === 'dark' ? "text-slate-500" : "text-slate-400")
                            )}>
                              {req.label}
                            </span>
                          </div>
                        ))}
                      </div>
                      {!isPasswordStrong && (
                        <p className="text-[8px] text-rose-500 font-bold mt-2 italic">
                          Missing: {passwordReqs.filter(r => !r.met).map(r => r.label).join(', ')}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {mode === 'signup' && (
              <div className="space-y-1">
                <label className={cn(
                  "text-[10px] font-bold ml-1 transition-colors duration-300",
                  theme === 'dark' ? "text-slate-300" : "text-black"
                )}>Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    className={cn(
                      "w-full border focus:border-[#3b82f6] rounded-lg py-2 px-3.5 outline-none transition-all text-xs font-medium placeholder:text-[#cbd5e1] pr-9",
                      theme === 'dark' ? "bg-zinc-900 border-zinc-800 text-slate-100" : "bg-white border-[#e2e8f0] text-slate-800"
                    )}
                  />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#cbd5e1] hover:text-[#3b82f6] transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className={cn(
              "w-full rounded-lg py-2.5 font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-2 text-sm border cursor-pointer",
              theme === 'dark' 
                ? "bg-blue-900/20 hover:bg-blue-900/30 text-blue-400 border-blue-900/50" 
                : "bg-[#eff6ff] hover:bg-[#e0edff] text-[#3b82f6] border-[#dbeafe]"
            )}
          >
            {loading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              mode === 'signin' ? 'Login' : 
              mode === 'signup' ? 'Sign Up' : 
              'Reset Password'
            )}
          </motion.button>
        </form>

        <div className="mt-5 text-center space-y-2.5">
          {mode === 'signin' && (
            <button 
              type="button"
              onClick={() => setMode('forgot')}
              className="block w-full text-[#3b82f6] font-bold hover:underline text-[11px] cursor-pointer"
            >
              Forgot password?
            </button>
          )}

          {mode === 'signin' ? (
            <div className="space-y-2">
              <p className={cn(
                "font-medium text-[11px] transition-colors duration-300",
                theme === 'dark' ? "text-slate-400" : "text-black"
              )}>
                Don't have an account?{' '}
                <button 
                  onClick={() => setMode('signup')}
                  className="text-[#3b82f6] font-bold hover:underline cursor-pointer"
                >
                  Sign up
                </button>
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className={cn(
                "font-medium text-[11px] transition-colors duration-300",
                theme === 'dark' ? "text-slate-400" : "text-black"
              )}>
                Already have an account?{' '}
                <button 
                  onClick={() => setMode('signin')}
                  className="text-[#3b82f6] font-bold hover:underline cursor-pointer"
                >
                  Login
                </button>
              </p>
              {mode === 'forgot' && (
                <button 
                  onClick={() => setMode('signin')}
                  className={cn(
                    "flex items-center gap-1 font-bold hover:text-[#3b82f6] transition-colors mx-auto text-[11px]",
                    theme === 'dark' ? "text-slate-400" : "text-black"
                  )}
                >
                  <ArrowLeft size={12} />
                  Back to Login
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
