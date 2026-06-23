import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  LogOut,
  Phone,
  Key,
  Mail
} from 'lucide-react';
import { cn } from '../lib/utils';

type AuthMode = 'signin' | 'signup' | 'forgot';

export default function Auth({ 
  theme = 'light', 
  isDesktop = false,
  onRecoveryComplete 
}: { 
  theme?: string;
  isDesktop?: boolean;
  onRecoveryComplete?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<AuthMode>(() => {
    const path = window.location.pathname;
    if (path === '/register') return 'signup';
    if (path === '/forgot') return 'forgot';
    return 'signin';
  });

  // Bidirectional routing sync
  useEffect(() => {
    const path = location.pathname;
    if (path === '/register' && mode !== 'signup') {
      setMode('signup');
    } else if (path === '/forgot' && mode !== 'forgot') {
      setMode('forgot');
    } else if (path === '/login' && mode !== 'signin') {
      setMode('signin');
    }
  }, [location.pathname]);

  useEffect(() => {
    const path = window.location.pathname;
    if (mode === 'signup' && path !== '/register') {
      navigate('/register');
    } else if (mode === 'signin' && path !== '/login') {
      navigate('/login');
    } else if (mode === 'forgot' && path !== '/forgot') {
      navigate('/forgot');
    }
  }, [mode, navigate]);
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [sandboxMode, setSandboxMode] = useState(false);
  const [sandboxCode, setSandboxCode] = useState('');
  const [sandboxEmail, setSandboxEmail] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Clear error and success messages when the auth view/mode switches
  // but keep the url redirect messages (hash type=signup or error_code=otp_expired) on mount
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=signup') || hash.includes('error_code=otp_expired')) {
      return;
    }
    setError(null);
    setSuccess(null);
  }, [mode]);

  const [rememberMe, setRememberMe] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('supabase_remember_me');
      return saved === null ? true : saved === 'true';
    }
    return true;
  });

  useEffect(() => {
    localStorage.setItem('supabase_remember_me', rememberMe ? 'true' : 'false');
  }, [rememberMe]);

  useEffect(() => {
    // Check if user was logged out due to inactivity
    const reason = sessionStorage.getItem('logout_reason');
    if (reason === 'inactivity') {
      setError('You were logged out due to inactivity.');
      sessionStorage.removeItem('logout_reason');
    }

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

  const handleSendPhoneOtp = async () => {
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    if (!phoneNumber) {
      setError('Please enter a valid phone number.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let formattedPhone = phoneNumber.trim();
      if (!formattedPhone.startsWith('+')) {
        setError('Please include your country code starting with + (e.g. +919876543210 or +12345678900).');
        setLoading(false);
        return;
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
      });

      if (otpError) {
        if (otpError.message?.toLowerCase().includes('provider') || otpError.message?.toLowerCase().includes('unsupported') || otpError.message?.toLowerCase().includes('not configured')) {
          console.log('Activating Sandbox/Emulator mode due to unsupported phone provider...');
          
          // Check if profile exists for this phone number
          const { data: profileData, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('phone', formattedPhone)
            .maybeSingle();

          if (profileErr) {
            console.error('Profile lookup error:', profileErr);
          }

          if (mode === 'signin' && !profileData) {
            setError('No registered account found with this phone number. Please sign up or link your phone number from your Profile Settings first.');
            setLoading(false);
            return;
          }

          setSandboxMode(true);
          setSandboxCode('123456');
          if (profileData) {
            setSandboxEmail(profileData.email || `phone_${formattedPhone.replace(/[^0-9]/g, '')}@sandbox.com`);
          } else {
            setSandboxEmail(`phone_${formattedPhone.replace(/[^0-9]/g, '')}@sandbox.com`);
          }
          setPhoneOtpSent(true);
          setSuccess('🔒 Sandbox Mode Enabled: Enter mock code 123456 to verify.');
          setLoading(false);
          return;
        }
        throw otpError;
      }

      setSandboxMode(false);
      setPhoneOtpSent(true);
      setSuccess('Verification code sent to ' + formattedPhone);
    } catch (err: any) {
      console.error('Phone OTP send error:', err);
      setError(err.message || 'Failed to send verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    if (!phoneOtp) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let formattedPhone = phoneNumber.trim();
      
      if (sandboxMode) {
        if (phoneOtp.trim() !== sandboxCode) {
          throw new Error('Incorrect or expired verification code (Sandbox).');
        }

        // Try to sign in with password first
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: sandboxEmail,
          password: 'PhoneLoginFallback123!',
        });

        if (signInError) {
          if (mode === 'signup') {
            // Sign up new user
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
              email: sandboxEmail,
              password: 'PhoneLoginFallback123!',
              options: {
                data: {
                  full_name: fullName || 'Phone User',
                }
              }
            });

            if (signUpError) throw signUpError;

            // Upsert profiles
            if (signUpData?.user) {
              await supabase.from('profiles').upsert({
                id: signUpData.user.id,
                email: sandboxEmail,
                full_name: fullName || 'Phone User',
                phone: formattedPhone,
                phone_verified: true,
              }, { onConflict: 'id' });
            }
            setSuccess('Account created and logged in successfully (Sandbox)!');
          } else {
            throw signInError;
          }
        } else {
          setSuccess('Logged in successfully (Sandbox)!');
          // Sync profiles
          if (data?.user) {
            await supabase.from('profiles').upsert({
              id: data.user.id,
              email: data.user.email || null,
              full_name: data.user.user_metadata?.full_name || 'Phone User',
              phone: formattedPhone,
              phone_verified: true,
            }, { onConflict: 'id' });
          }
        }
      } else {
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          phone: formattedPhone,
          token: phoneOtp.trim(),
          type: 'sms',
        });

        if (verifyError) throw verifyError;

        setSuccess('Logged in successfully!');
        
        // Attempt profiles table sync
        if (data?.user) {
          try {
            await supabase.from('profiles').upsert({
              id: data.user.id,
              email: data.user.email || null,
              full_name: data.user.user_metadata?.full_name || '',
              phone: formattedPhone,
              phone_verified: true,
            }, { onConflict: 'id' });
          } catch (dbErr) {
            console.warn('Profiles table sync failed (might not exist yet):', dbErr);
          }
        }
      }
    } catch (err: any) {
      console.error('Phone OTP verification error:', err);
      setError(err.message || 'Incorrect or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const redirectTo = 'https://trackbook.xyz';
      console.log("OAuth redirect:", redirectTo);
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTo
        }
      });
      
      if (data?.url) {
        console.log("Exact URL being sent to Google OAuth:", data.url);
      }
      
      if (error) throw error;
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      setError(err.message || 'Google Sign-In failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    const demoEmail = 'demo@example.com';
    const demoPassword = 'DemoPassword123!';
    
    try {
      console.log('Attempting demo login...');
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: demoEmail,
        password: demoPassword,
      });
      
      if (signInError) {
        console.log('Demo user does not exist or password mismatch. Creating demo user...');
        // Let's sign up the demo user
        const { error: signUpError } = await supabase.auth.signUp({
          email: demoEmail,
          password: demoPassword,
          options: {
            data: {
              full_name: 'Demo Account',
            }
          }
        });
        
        if (signUpError) {
          throw signUpError;
        }
        
        // Try signin again
        const { error: retryError } = await supabase.auth.signInWithPassword({
          email: demoEmail,
          password: demoPassword,
        });
        
        if (retryError) {
          throw retryError;
        }
      }
      setSuccess('Logged in successfully to demo session!');
    } catch (err: any) {
      console.error('Demo login rescue failed:', err);
      setError(err.message || 'Demo login failed. Please try standard Sign Up instead.');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoSignUpAndLogin = async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      console.log('Auto-registering credentials...');
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || 'Quick User',
          }
        }
      });
      
      if (signUpError) {
        if (
          signUpError.message?.toLowerCase().includes('already registered') || 
          signUpError.message?.toLowerCase().includes('already exists') || 
          signUpError.status === 422
        ) {
          setError('This email is already registered. Please sign in or use Forgot Password.');
          return;
        }
        throw signUpError;
      }

      // --- Console Logs requested by User ---
      console.log('[Response Security Inspection - AutoSignUp]');
      console.log(' - data:', data);
      console.log(' - data.user:', data?.user);
      console.log(' - data.user.identities:', data?.user?.identities);
      console.log(' - error:', signUpError);

      let isExistingUser = false;
      if (data?.user) {
        const identities = data.user.identities || [];
        if (identities.length === 0) {
          isExistingUser = true;
          console.log('[Signup Segregation - AutoSignUp] Existing User detected via empty identities array.');
        } else {
          const createdAt = data.user.created_at ? new Date(data.user.created_at).getTime() : 0;
          const now = Date.now();
          const timeDiffSec = Math.abs(now - createdAt) / 1000;
          console.log(`[Signup Segregation - AutoSignUp] Evaluation: timeDiffSec=${timeDiffSec}s, identitiesCount=${identities.length}`);
          if (timeDiffSec > 12) {
            isExistingUser = true;
            console.log('[Signup Segregation - AutoSignUp] Existing User detected via stale created_at time.');
          }
        }
      } else {
        isExistingUser = true;
      }

      if (isExistingUser) {
        setError('This email is already registered. Please sign in or use Forgot Password.');
        return;
      }
      
      // Attempt login
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (signInError) {
        if (signInError.message?.includes('Email not confirmed')) {
          setSuccess('Account registered! If confirmation is required, please check your inbox.');
        } else {
          throw signInError;
        }
      } else {
        setSuccess('Account registered and logged in successfully!');
      }
    } catch (err: any) {
      console.error('Auto signup failed:', err);
      setError(err.message || 'Failed to auto-register account. Please use the Sign Up tab.');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (loginMethod === 'phone') {
      if (!phoneOtpSent) {
        await handleSendPhoneOtp();
      } else {
        await handleVerifyPhoneOtp();
      }
      return;
    }
    
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
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              full_name: fullName,
            },
          },
        });
        
        // --- Console Logs requested by User ---
        console.log('[Response Security Inspection - SignUp] signUp returned:');
        console.log(' - data:', data);
        console.log(' - data.user:', data?.user);
        console.log(' - data.user.identities:', data?.user?.identities);
        console.log(' - error:', error);

        if (error) {
          if (
            error.message?.toLowerCase().includes('already registered') || 
            error.message?.toLowerCase().includes('already exists') || 
            error.status === 422
          ) {
            setError('This email is already registered. Please sign in or use Forgot Password.');
            return;
          }
          throw error;
        }

        // --- Supabase Response Validation & Segregation ---
        let isExistingUser = false;
        
        if (data?.user) {
          const identities = data.user.identities || [];
          
          // 1. If identities array is empty, GoTrue is suppressing the identities to prevent enumeration
          if (identities.length === 0) {
            isExistingUser = true;
            console.log('[Signup Segregation] Existing User detected via empty identities array.');
          } else {
            // 2. If identities has elements, check if the account is older than 12 seconds
            const createdAt = data.user.created_at ? new Date(data.user.created_at).getTime() : 0;
            const now = Date.now();
            const timeDiffSec = Math.abs(now - createdAt) / 1000;
            console.log(`[Signup Segregation] Evaluation: timeDiffSec=${timeDiffSec}s, identitiesCount=${identities.length}`);
            
            if (timeDiffSec > 12) {
              isExistingUser = true;
              console.log('[Signup Segregation] Existing User detected via stale created_at time (stale unconfirmed or confirmed user info).');
            }
          }
        } else {
          // If no user is returned, it shouldn't be counted as a success
          console.log('[Signup Segregation] Sign up did not return a user object.');
          isExistingUser = true;
        }

        if (isExistingUser) {
          setError('This email is already registered. Please sign in or use Forgot Password.');
          return;
        }

        console.log('[Signup Segregation] Genuinely New User signed up.');
        setSuccess('Account created! Please check your email for verification.');

      } else if (mode === 'signin') {
        console.log('Signing in...');
        const { error, data } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          const isCredsError = error.message?.toLowerCase().includes('invalid login credentials') || 
                               error.message?.toLowerCase().includes('invalid_credential') || 
                               error.message?.toLowerCase().includes('invalid_creds');
          if (!isCredsError) {
            console.error('SignIn Error Details:', error);
          } else {
            console.log('SignIn expected credential failure:', error.message);
          }
          throw error;
        }
        console.log('SignIn Success:', data);
      } else if (mode === 'forgot') {
        console.log('Current Origin:', window.location.origin);
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/resetpassword`
        });

        if (error) {
          console.error('SUPABASE RESET PASSWORD ERROR:', error);
          setError(error.message);
          return;
        }

        setSuccess('Password reset link sent successfully. Check your email.');
      }
    } catch (err: any) {
      const isCredsError = err.message?.toLowerCase().includes('invalid login credentials') || 
                           err.message?.toLowerCase().includes('invalid_credential') || 
                           err.message?.toLowerCase().includes('invalid_creds');
      if (!isCredsError) {
        console.error('Auth error:', err);
      } else {
        console.log('Auth expected credential error:', err.message);
      }
      if (mode === 'forgot') {
        setError(err.message || 'An error occurred while sending the recovery email.');
      } else if (err.message?.includes('Email not confirmed')) {
        setError('Email not confirmed. Please check your inbox or spam folder for the verification link.');
      } else if (
        err.message?.toLowerCase().includes('invalid login credentials') || 
        err.message?.toLowerCase().includes('invalid credential') ||
        err.message?.toLowerCase().includes('invalid_creds')
      ) {
        setError('Incorrect email or password. Please try again.');
      } else {
        setError(err.message || 'An error occurred during authentication.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn(
      "min-h-screen flex items-center justify-center p-4 font-lora transition-colors duration-300",
      theme === 'dark' ? "bg-[#030303]" : "bg-gradient-to-br from-blue-50/40 via-white to-indigo-50/30"
    )}>
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={cn(
          "w-full max-w-[400px] rounded-[32px] p-6 sm:p-9 border transition-all duration-350 relative overflow-hidden",
          theme === 'dark' 
            ? "bg-[#0a0a0a]/65 border-zinc-900/80 backdrop-blur-2xl shadow-none" 
            : "bg-white/80 border-blue-100/50 backdrop-blur-2xl shadow-[0_20px_50px_rgba(59,130,246,0.06)]"
        )}
      >
        {/* Glow effect decorative element */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="text-center mb-6">
          <div className="flex flex-col items-center justify-center mb-3 font-lora">
            <div className="flex items-center">
              <span className="text-[22px] font-black text-blue-650 text-blue-600 tracking-tight">Track</span>
              <span className={cn(
                "text-[22px] font-black tracking-tight transition-colors duration-300",
                theme === 'dark' ? "text-slate-100" : "text-slate-900"
              )}>Book</span>
            </div>
          </div>

          <p className={cn(
            "text-[11px] font-semibold tracking-wide uppercase transition-colors duration-350 opacity-80",
            theme === 'dark' ? "text-slate-400" : "text-slate-500"
          )}>
            {mode === 'signin' ? 'Welcome Back Premium Suite' : 
             mode === 'signup' ? 'Initiate Private Accountant Access' : 
             'Verify Code Reset'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-rose-500/10 text-rose-600 dark:text-rose-450 p-3 rounded-2xl flex flex-col gap-1.5 text-[10px] font-bold border border-rose-500/20 overflow-hidden shadow-sm"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5 text-rose-500" />
                  <span className="flex-1 leading-normal">{error}</span>
                </div>
                
                {mode === 'signin' && (error.includes('Incorrect email or password') || error.includes('INVALID_CREDS')) && email && password && (
                  <div className="mt-2 pt-2 border-t border-rose-500/20">
                    <p className="text-[9px] text-rose-700 dark:text-rose-400 mb-1.5 leading-normal font-bold">
                      💡 Account not found or wrong password?
                    </p>
                    <button
                      type="button"
                      onClick={handleAutoSignUpAndLogin}
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white py-1.5 px-2.5 rounded-lg font-black text-[9px] uppercase tracking-wider transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      ✨ Create Account & Login instantly
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {success && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-emerald-500/10 text-emerald-605 text-emerald-600 dark:text-emerald-400 p-3 rounded-2xl flex items-start gap-2 text-[10px] font-bold border border-emerald-500/20 overflow-hidden"
              >
                <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                <span>{success}</span>
              </motion.div>
            )}
          </AnimatePresence>
          
          {mode !== 'forgot' && (
            <div className="flex bg-slate-100/55 dark:bg-zinc-950/45 p-1 rounded-2xl mb-4 border border-blue-50/10 dark:border-zinc-900/55">
              <button
                type="button"
                onClick={() => { setLoginMethod('email'); setError(null); setSuccess(null); }}
                className={cn(
                  "flex-1 py-2 text-[10px] font-extrabold uppercase tracking-widest rounded-xl transition-all cursor-pointer",
                  loginMethod === 'email' 
                    ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-100 dark:border-zinc-800" 
                    : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => { setLoginMethod('phone'); setError(null); setSuccess(null); }}
                className={cn(
                  "flex-1 py-2 text-[10px] font-extrabold uppercase tracking-widest rounded-xl transition-all cursor-pointer",
                  loginMethod === 'phone' 
                    ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-100 dark:border-zinc-800" 
                    : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                Phone OTP
              </button>
            </div>
          )}

          {loginMethod === 'phone' && mode !== 'forgot' ? (
            <motion.div
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-4"
            >
              {mode === 'signup' && (
                <div className="space-y-1">
                  <label className={cn(
                    "text-[10px] font-extrabold ml-1 uppercase tracking-wider transition-colors duration-300",
                    theme === 'dark' ? "text-slate-400" : "text-slate-500"
                  )}>Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className={cn(
                      "w-full border rounded-2xl py-3 px-4 outline-none transition-all text-xs font-semibold placeholder:text-[#94a3b8]/60 focus:ring-4",
                      theme === 'dark' 
                        ? "bg-zinc-950/50 border-zinc-800 text-slate-100 focus:border-[#3b82f6] focus:ring-blue-950/40" 
                        : "bg-slate-50/50 border-blue-100 text-slate-800 focus:border-[#3b82f6] focus:ring-blue-100/50"
                    )}
                  />
                </div>
              )}

              {!phoneOtpSent ? (
                <div className="space-y-1">
                  <label className={cn(
                    "text-[10px] font-extrabold ml-1 uppercase tracking-wider transition-colors duration-300",
                    theme === 'dark' ? "text-slate-400" : "text-slate-500"
                  )}>Phone Number</label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      required
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+919876543210 or +1234567890"
                      className={cn(
                        "w-full border rounded-2xl py-3 pl-10 pr-4 outline-none transition-all text-xs font-semibold placeholder:text-[#94a3b8]/60 focus:ring-4",
                        theme === 'dark' 
                          ? "bg-zinc-950/50 border-zinc-800 text-slate-100 focus:border-[#3b82f6] focus:ring-blue-950/40" 
                          : "bg-slate-50/50 border-blue-100 text-slate-800 focus:border-[#3b82f6] focus:ring-blue-100/50"
                      )}
                    />
                  </div>
                  <span className="text-[8.5px] font-medium text-slate-400 dark:text-slate-500 block mt-1 ml-1 leading-normal">
                    Must include country code starting with +
                  </span>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className={cn(
                    "text-[10px] font-extrabold ml-1 uppercase tracking-wider transition-colors duration-300",
                    theme === 'dark' ? "text-slate-400" : "text-slate-500"
                  )}>Verification Code</label>
                  <div className="relative">
                    <Key size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={phoneOtp}
                      onChange={(e) => setPhoneOtp(e.target.value)}
                      placeholder="Enter 6-digit code"
                      className={cn(
                        "w-full border rounded-2xl py-3 pl-10 pr-4 outline-none transition-all text-xs font-semibold placeholder:text-[#94a3b8]/60 tracking-widest focus:ring-4 text-center font-mono",
                        theme === 'dark' 
                          ? "bg-zinc-950/50 border-zinc-800 text-slate-100 focus:border-[#3b82f6] focus:ring-blue-950/40" 
                          : "bg-slate-50/50 border-blue-100 text-slate-800 focus:border-[#3b82f6] focus:ring-blue-100/50"
                      )}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-2 px-1">
                    <button
                      type="button"
                      onClick={() => setPhoneOtpSent(false)}
                      className="text-[9.5px] font-bold text-blue-600 hover:underline cursor-pointer bg-transparent outline-none"
                    >
                      Change Number
                    </button>
                    <button
                      type="button"
                      onClick={handleSendPhoneOtp}
                      className="text-[9.5px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:underline cursor-pointer bg-transparent outline-none"
                    >
                      Resend Code
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <>
              <motion.div 
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="space-y-1"
              >
                {mode === 'signup' && (
                  <div className="space-y-1 mb-3">
                    <label className={cn(
                      "text-[10px] font-extrabold ml-1 uppercase tracking-wider transition-colors duration-300",
                      theme === 'dark' ? "text-slate-400" : "text-slate-500"
                    )}>Full Name</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter your full name"
                      className={cn(
                        "w-full border rounded-2xl py-3 px-4 outline-none transition-all text-xs font-semibold placeholder:text-[#94a3b8]/60 focus:ring-4",
                        theme === 'dark' 
                          ? "bg-zinc-950/50 border-zinc-800 text-slate-100 focus:border-[#3b82f6] focus:ring-blue-950/40" 
                          : "bg-slate-50/50 border-blue-100 text-slate-800 focus:border-[#3b82f6] focus:ring-blue-100/50"
                      )}
                    />
                  </div>
                )}

                {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && (
                  <div className="space-y-1">
                    <label className={cn(
                      "text-[10px] font-extrabold ml-1 uppercase tracking-wider transition-colors duration-300",
                      theme === 'dark' ? "text-slate-400" : "text-slate-500"
                    )}>Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      className={cn(
                        "w-full border rounded-2xl py-3 px-4 outline-none transition-all text-xs font-semibold placeholder:text-[#94a3b8]/60 focus:ring-4",
                        theme === 'dark' 
                          ? "bg-zinc-950/50 border-zinc-800 text-slate-100 focus:border-[#3b82f6] focus:ring-blue-950/40" 
                          : "bg-slate-50/50 border-blue-100 text-slate-800 focus:border-[#3b82f6] focus:ring-blue-100/50"
                      )}
                    />
                  </div>
                )}
              </motion.div>

              {mode !== 'forgot' && (
                <motion.div 
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 }}
                  className="space-y-3 animate-none"
                >
                  <div className="space-y-1">
                    <label className={cn(
                      "text-[10px] font-extrabold ml-1 uppercase tracking-wider transition-colors duration-300",
                      theme === 'dark' ? "text-slate-400" : "text-slate-500"
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
                          "w-full border rounded-2xl py-3 px-4 outline-none transition-all text-xs font-semibold placeholder:text-[#94a3b8]/60 pr-11 focus:ring-4",
                          theme === 'dark' 
                            ? "bg-zinc-950/50 border-zinc-800 text-slate-100 focus:border-[#3b82f6] focus:ring-blue-950/40" 
                            : "bg-slate-50/50 border-blue-100 text-slate-800 focus:border-[#3b82f6] focus:ring-blue-100/50"
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#3b82f6] transition-colors cursor-pointer"
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </>
          )}

          {mode === 'signin' && (
            <div className="flex items-center gap-2.5 px-1 py-1.5 select-none text-left">
              <input
                id="remember_me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => {
                  setRememberMe(e.target.checked);
                  localStorage.setItem('supabase_remember_me', e.target.checked ? 'true' : 'false');
                }}
                className={cn(
                  "w-4 h-4 rounded-md border cursor-pointer focus:ring-0 focus:ring-offset-0 transition-colors duration-150 shrink-0",
                  theme === 'dark' 
                    ? "bg-zinc-900 border-zinc-800 text-blue-500 checked:bg-blue-600 focus:border-blue-500" 
                    : "bg-white border-blue-200 text-blue-550 checked:bg-blue-600 focus:border-blue-500"
                )}
              />
              <label 
                htmlFor="remember_me" 
                className={cn(
                  "text-[10.5px] font-extrabold cursor-pointer transition-colors duration-300 select-none",
                  theme === 'dark' ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Remember this device for 30 days.
              </label>
            </div>
          )}

          <motion.button
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl py-3.5 font-extrabold tracking-wider uppercase transition-all flex items-center justify-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed mt-3 text-xs cursor-pointer bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/10 border-none outline-none"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              loginMethod === 'phone' ? (
                phoneOtpSent ? 'Verify & Login' : 'Send Verification Code'
              ) : (
                mode === 'signin' ? 'Verify & Authenticate' : 
                mode === 'signup' ? 'Create Secure Account' : 
                'Reset Password'
              )
            )}
          </motion.button>

          {mode !== 'forgot' && (
            <div className="space-y-3 mt-4">
              <div className="flex items-center justify-between text-slate-300 dark:text-zinc-800">
                <div className="h-[1px] bg-slate-200 dark:bg-zinc-850 flex-1" />
                <span className="text-[9px] font-extrabold uppercase tracking-wider px-3 select-none text-slate-400">or continue with</span>
                <div className="h-[1px] bg-slate-200 dark:bg-zinc-850 flex-1" />
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="button"
                onClick={handleGoogleLogin}
                className={cn(
                  "w-full rounded-2xl py-3 px-4 border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm",
                  theme === 'dark'
                    ? "bg-zinc-950/20 border-zinc-850 hover:bg-zinc-900/40 text-slate-200"
                    : "bg-white border-blue-100 hover:bg-slate-50 text-slate-700"
                )}
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </motion.button>
            </div>
          )}

        </form>

        <div className="mt-6 text-center space-y-3 pt-2 border-t border-dashed border-slate-200/60 dark:border-zinc-900">
          {mode === 'signin' && (
            <button 
              type="button"
              onClick={() => setMode('forgot')}
              className="block w-full text-blue-600 font-extrabold hover:underline text-[10.5px] cursor-pointer outline-none bg-transparent"
            >
              Recover forgotten password
            </button>
          )}

          {mode === 'signin' ? (
            <div className="space-y-2">
              <p className={cn(
                "font-semibold text-[10.5px] transition-colors duration-300",
                theme === 'dark' ? "text-slate-400" : "text-slate-500"
              )}>
                Need a new account?{' '}
                <button 
                  onClick={() => setMode('signup')}
                  className="text-blue-600 font-extrabold hover:underline cursor-pointer bg-transparent outline-none"
                >
                  Create one now
                </button>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className={cn(
                "font-semibold text-[10.5px] transition-colors duration-300",
                theme === 'dark' ? "text-slate-400" : "text-slate-500"
              )}>
                Already registered?{' '}
                <button 
                  onClick={() => setMode('signin')}
                  className="text-blue-600 font-extrabold hover:underline cursor-pointer bg-transparent outline-none"
                >
                  Login instead
                </button>
              </p>
              {mode === 'forgot' && (
                <button 
                  onClick={() => setMode('signin')}
                  className={cn(
                    "flex items-center gap-1 font-extrabold hover:text-[#3b82f6] transition-colors mx-auto text-[10.5px] bg-transparent outline-none",
                    theme === 'dark' ? "text-slate-400" : "text-slate-600"
                  )}
                >
                  <ArrowLeft size={12} />
                  Back to Sign In
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
