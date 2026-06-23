import React from 'react';
import { motion } from 'motion/react';
import { Construction, Sparkles, X, Chrome } from 'lucide-react';
import { cn } from '../lib/utils';

interface PhoneComingSoonModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'login' | 'link';
  theme: 'light' | 'dark';
  onContinueWithGmail?: () => void;
}

export const PhoneComingSoonModal: React.FC<PhoneComingSoonModalProps> = ({
  isOpen,
  onClose,
  type,
  theme,
  onContinueWithGmail,
}) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 select-none">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
      />

      {/* Main Glassmorphism Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 15 }}
        transition={{ type: "spring", duration: 0.5, bounce: 0.25 }}
        className={cn(
          "relative w-full max-w-[420px] rounded-3xl border p-6 sm:p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden",
          isDark 
            ? "bg-zinc-950/85 border-zinc-800/80 text-slate-100 backdrop-blur-xl" 
            : "bg-white/90 border-slate-200/80 text-slate-800 backdrop-blur-xl"
        )}
      >
        {/* Decorative ambient glowing background blobs */}
        <div className="absolute -top-12 -left-12 w-28 h-28 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-28 h-28 bg-purple-500/10 dark:bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button Top Right */}
        <button
          onClick={onClose}
          className={cn(
            "absolute top-4 right-4 p-2 rounded-full transition-all cursor-pointer border",
            isDark 
              ? "border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-slate-400 hover:text-slate-100" 
              : "border-slate-150 bg-slate-50/50 hover:bg-slate-100 text-slate-400 hover:text-slate-700"
          )}
        >
          <X size={15} />
        </button>

        {/* Content Section */}
        <div className="flex flex-col items-center text-center relative z-10">
          
          {/* Glowing icon container matching the reference image */}
          <div className="relative mb-6">
            {/* Outer pulsating circles */}
            <div className="absolute inset-0 scale-150 rounded-full bg-indigo-500/5 dark:bg-indigo-500/10 animate-pulse duration-1000" />
            <div className="absolute inset-0 scale-125 rounded-full bg-purple-500/5 dark:bg-purple-500/10 animate-pulse duration-700" />
            
            {/* Icon Circle */}
            <div className={cn(
              "relative flex items-center justify-center w-16 h-16 rounded-2xl shadow-lg border",
              isDark 
                ? "bg-gradient-to-br from-indigo-950/50 to-zinc-950 border-indigo-500/30 text-indigo-400" 
                : "bg-gradient-to-br from-indigo-50/80 to-white border-indigo-100 text-indigo-600"
            )}>
              <Construction size={28} className="animate-bounce duration-1000" />
              
              {/* Floating sparkles on corners */}
              <Sparkles className="absolute -bottom-1 -right-1 text-amber-500 w-4 h-4" />
            </div>
          </div>

          {/* Development Status Badge */}
          <span className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-3.5 border",
            isDark 
              ? "bg-emerald-950/40 border-emerald-900/50 text-emerald-400" 
              : "bg-emerald-50 border-emerald-200/50 text-emerald-700"
          )}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            Under Construction
          </span>

          {/* Heading */}
          <h3 className={cn(
            "text-lg sm:text-xl font-extrabold tracking-tight mb-4",
            isDark ? "text-slate-100" : "text-slate-900"
          )}>
            {type === 'login' ? '🚧 Phone Authentication Coming Soon' : '🚧 Mobile Number Linking Coming Soon'}
          </h3>

          {/* Message Text with Premium custom structure */}
          <div className={cn(
            "text-xs leading-relaxed font-semibold max-w-[340px] mb-6 space-y-3.5",
            isDark ? "text-slate-400" : "text-slate-500"
          )}>
            {type === 'login' ? (
              <>
                <p>
                  Phone number authentication is currently under development and is <span className="font-extrabold text-indigo-500 dark:text-indigo-400">95% complete</span>.
                </p>
                <div className={cn(
                  "p-3 rounded-2xl text-left space-y-1.5 border",
                  isDark ? "bg-zinc-900/40 border-zinc-800/60" : "bg-slate-50 border-slate-150"
                )}>
                  <p className="font-bold text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">For now, please continue using:</p>
                  <p className="text-emerald-600 dark:text-emerald-400 font-extrabold">✓ Gmail Login</p>
                  <p className="text-emerald-600 dark:text-emerald-400 font-extrabold">✓ Email Login</p>
                </div>
                <p className="text-[11px] italic text-slate-400/80">
                  We are working on secure OTP verification and will release it soon.
                </p>
              </>
            ) : (
              <>
                <p>
                  Mobile number linking is currently under development and is approximately <span className="font-extrabold text-indigo-500 dark:text-indigo-400">95% complete</span>.
                </p>
                <div className={cn(
                  "p-3 rounded-2xl text-left space-y-1.5 border",
                  isDark ? "bg-zinc-900/40 border-zinc-800/60" : "bg-slate-50 border-slate-150"
                )}>
                  <p className="font-bold text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Your account remains fully secure using:</p>
                  <p className="text-emerald-600 dark:text-emerald-400 font-extrabold">✓ Gmail Authentication</p>
                  <p className="text-emerald-600 dark:text-emerald-400 font-extrabold">✓ Email Authentication</p>
                </div>
                <p className="text-[11px] italic text-slate-400/80">
                  Phone verification will be available in an upcoming update.
                </p>
              </>
            )}
          </div>

          {/* Development Progress Bar Visualizer */}
          <div className="w-full mb-8">
            <div className="flex justify-between text-[11px] font-bold mb-2">
              <span className={isDark ? "text-slate-500" : "text-slate-400"}>Feature Progress</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-black">95%</span>
            </div>
            
            {/* The animated, glowing bar */}
            <div className={cn(
              "w-full h-2.5 rounded-full relative overflow-hidden",
              isDark ? "bg-zinc-900" : "bg-slate-100"
            )}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "95%" }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 relative overflow-hidden"
              >
                {/* Shining animation inside the progress bar */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
              </motion.div>
            </div>
            
            {/* Real status line */}
            <p className={cn(
              "text-[10px] font-bold mt-2",
              isDark ? "text-slate-500" : "text-slate-400"
            )}>
              Status: <span className="italic">Final OTP provider integration pending.</span>
            </p>
          </div>

          {/* Action Buttons */}
          <div className="w-full flex flex-col gap-3">
            {type === 'login' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onContinueWithGmail) onContinueWithGmail();
                  }}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-lg shadow-indigo-600/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Chrome size={13} className="text-white shrink-0" />
                  Continue with Gmail
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className={cn(
                    "w-full py-3 px-4 rounded-2xl font-extrabold text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer border",
                    isDark 
                      ? "bg-transparent border-zinc-800 text-slate-400 hover:text-slate-200 hover:bg-zinc-900/50" 
                      : "bg-slate-50 border-slate-150 text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"
                  )}
                >
                  Close
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-lg shadow-indigo-600/20 active:scale-95"
              >
                Got It
              </button>
            )}
          </div>

        </div>
      </motion.div>
    </div>
  );
};
