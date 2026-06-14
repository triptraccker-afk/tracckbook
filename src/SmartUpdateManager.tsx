import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, RefreshCw, X, ArrowRight, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

// Hardcoded running client version.
// When the server deploy serves a higher/different version in /version.json,
// a mobile client will notice that RUNNING_VERSION !== server_version.
const RUNNING_VERSION = '1.2.5';

export default function SmartUpdateManager({ theme }: { theme: 'light' | 'dark' }) {
  const [showPopup, setShowPopup] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string[]>([]);
  const isMobileRef = useRef(false);

  // Helper to check if strictly mobile screen
  const checkIsMobile = useCallback(() => {
    if (typeof window !== 'undefined') {
      const isMobileSize = window.innerWidth < 768; // Mobile breakpoint
      isMobileRef.current = isMobileSize;
      return isMobileSize;
    }
    return false;
  }, []);

  const checkForUpdates = useCallback(async () => {
    // 1. Strictly mobile screen verification
    if (!checkIsMobile()) {
      setShowPopup(false);
      return;
    }

    try {
      // Add dynamic cache-breaker timestamp query param to bypass intermediate CDNs / browser caches
      const response = await fetch(`/version.json?_t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) return;

      const data = await response.json();
      const deployedVersion = data?.version;
      const notes = data?.releaseNotes || [];

      if (!deployedVersion) return;

      // 2. Fetch last acknowledged version from localStorage
      const acknowledgedVersion = localStorage.getItem('trackbook_acknowledged_version');

      // 3. Show popup if:
      // - The deployed version is different from our local running package code AND
      // - The user hasn't already dismissed/acknowledged this exact deployed version
      if (deployedVersion !== RUNNING_VERSION && deployedVersion !== acknowledgedVersion) {
        setServerVersion(deployedVersion);
        setReleaseNotes(notes);
        setShowPopup(true);
      } else {
        setShowPopup(false);
      }
    } catch (error) {
      console.warn('[Update Checker] Could not poll version.json safely:', error);
    }
  }, [checkIsMobile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Verify Is Mobile Screen
    const isMobileSize = checkIsMobile();

    // Store the current running version to localStorage as requested for integrity check
    localStorage.setItem('trackbook_current_version', RUNNING_VERSION);

    // Initial check for one-time update success popup
    const successShownVersion = localStorage.getItem('trackbook_update_success_shown_version');
    const acknowledgedVersion = localStorage.getItem('trackbook_acknowledged_version');

    // ONLY show success popup on Mobile when:
    // - we are on mobile screen size
    // - the last success shown version doesn't match this current version
    // - the user previously acknowledged this version (meaning they upgraded to it)
    if (isMobileSize) {
      if (successShownVersion !== RUNNING_VERSION) {
        if (acknowledgedVersion === RUNNING_VERSION) {
          setShowSuccessPopup(true);
        } else if (!successShownVersion) {
          // New device or pristine state - initialize flags so they aren't flashed with updated notice on pristine run
          localStorage.setItem('trackbook_update_success_shown_version', RUNNING_VERSION);
          localStorage.setItem('trackbook_acknowledged_version', RUNNING_VERSION);
        }
      }
    }

    // Initial check for new updates
    checkForUpdates();

    // Resize listener for active responsiveness
    const handleResize = () => {
      const liveMobile = window.innerWidth < 768;
      if (!liveMobile) {
        // If resized to desktop, immediately hide both alerts
        setShowPopup(false);
        setShowSuccessPopup(false);
      }
      isMobileRef.current = liveMobile;
    };

    window.addEventListener('resize', handleResize);

    // Light-weight polling system: checks every 3.5 minutes
    const intervalId = setInterval(() => {
      checkForUpdates();
    }, 3.5 * 60 * 1000);

    // Event listener when application gains focus (e.g. app switcher, tab returning)
    const handleFocus = () => {
      checkForUpdates();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('focus', handleFocus);
      clearInterval(intervalId);
    };
  }, [checkForUpdates, checkIsMobile]);

  const handleUpdateNow = async () => {
    if (!serverVersion) return;

    // Persist verified version acknowledgement to eliminate double alerts or prompts
    localStorage.setItem('trackbook_acknowledged_version', serverVersion);
    
    // Smooth vibration feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([60, 40, 60]); } catch (e) {}
    }

    // Clear bundle Cache Storage safely without deleting offline user databases or login token credentials
    if ('caches' in window) {
      try {
        const cacheKeys = await caches.keys();
        await Promise.all(
          cacheKeys.map(key => caches.delete(key))
        );
        console.log('[Update System] Successfully cleared stale static asset caches.');
      } catch (e) {
        console.warn('[Update System] Error clearing asset cache:', e);
      }
    }

    // Hard reload the window to force retrieval of latest production deployment bundle
    window.location.reload();
  };

  const handleLater = () => {
    if (!serverVersion) return;

    // Save as acknowledged so they aren't bothered with repeated reminders for this version
    localStorage.setItem('trackbook_acknowledged_version', serverVersion);
    setShowPopup(false);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(20); } catch (e) {}
    }
  };

  const handleDismissSuccess = () => {
    // Record that success was shown for this running version
    localStorage.setItem('trackbook_update_success_shown_version', RUNNING_VERSION);
    setShowSuccessPopup(false);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(20); } catch (e) {}
    }
  };

  return (
    <AnimatePresence>
      {/* 1. NEW UPDATE AVAILABLE MODAL */}
      {showPopup && (
        <div className="fixed inset-x-0 bottom-0 z-[999] p-4 pointer-events-none flex flex-col items-center justify-end">
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className={cn(
              "w-full max-w-md rounded-2xl p-5 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.3)] border pointer-events-auto backdrop-blur-xl relative overflow-hidden",
              theme === 'dark'
                ? "bg-zinc-950/95 border-zinc-800 text-white"
                : "bg-white/95 border-slate-200 text-slate-800"
            )}
          >
            {/* Top Glowing Gradient Accent */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 shrink-0">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-extrabold tracking-widest text-indigo-500 font-mono">
                    System Upgrade • v{serverVersion}
                  </span>
                  <button
                    onClick={handleLater}
                    className="p-1 -mr-1.5 -mt-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="text-[17px] font-black tracking-tight font-sans leading-snug">
                  New Update Available
                </h3>
                <p className={cn(
                  "text-[13px] font-medium leading-relaxed font-sans",
                  theme === 'dark' ? "text-slate-300" : "text-slate-500"
                )}>
                  TrackBook has new improvements and performance upgrades.
                </p>
              </div>
            </div>

            {/* Release notes block (Optional system) */}
            {releaseNotes.length > 0 && (
              <div className={cn(
                "mt-4 p-3 rounded-xl border space-y-2 text-xs",
                theme === 'dark'
                  ? "bg-zinc-900/40 border-zinc-800/60"
                  : "bg-slate-50/70 border-slate-100"
              )}>
                <p className="font-extrabold uppercase tracking-widest text-[9px] text-slate-400 font-mono">
                  What's New:
                </p>
                <div className="space-y-1.5 leading-snug font-medium">
                  {releaseNotes.map((note, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <ArrowRight className="w-3 h-3 text-indigo-500 mt-0.5 shrink-0" />
                      <p className={theme === 'dark' ? "text-slate-200" : "text-slate-600"}>
                        {note}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA Option Actions */}
            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={handleLater}
                className={cn(
                  "flex-1 py-2.5 px-4 rounded-xl text-xs font-bold leading-none cursor-pointer border transition-colors",
                  theme === 'dark'
                    ? "bg-zinc-900/50 hover:bg-zinc-900 border-zinc-800 text-slate-300"
                    : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
                )}
              >
                Later
              </button>

              <button
                onClick={handleUpdateNow}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold leading-none cursor-pointer shadow-lg shadow-indigo-500/10 flex items-center justify-center gap-2 transition-colors border border-indigo-600"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Update Now
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 2. ONE-TIME SUCCESS POPUP */}
      {showSuccessPopup && (
        <div className="fixed inset-x-0 bottom-0 z-[999] p-4 pointer-events-none flex flex-col items-center justify-end">
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className={cn(
              "w-full max-w-md rounded-2xl p-5 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.3)] border pointer-events-auto backdrop-blur-xl relative overflow-hidden",
              theme === 'dark'
                ? "bg-zinc-950/95 border-zinc-800 text-white"
                : "bg-white/95 border-slate-200 text-slate-800"
            )}
          >
            {/* Top Glowing Gradient Accent (Success Green-Emerald Theme) */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500" />

            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
                <CheckCircle2 className="w-5 h-5 animate-bounce" />
              </div>
              
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-extrabold tracking-widest text-emerald-500 font-mono">
                    Upgrade Successful • Premium
                  </span>
                  <button
                    onClick={handleDismissSuccess}
                    className="p-1 -mr-1.5 -mt-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="text-[17px] font-black tracking-tight font-sans leading-snug">
                  TrackBook is now updated
                </h3>
                <p className={cn(
                  "text-[13px] font-medium leading-relaxed font-sans",
                  theme === 'dark' ? "text-slate-300" : "text-slate-500"
                )}>
                  You are using the latest version.
                </p>
              </div>
            </div>

            {/* Premium Release details for what's new in the system */}
            <div className={cn(
              "mt-4 p-3.5 rounded-xl border space-y-2 text-xs",
              theme === 'dark'
                ? "bg-zinc-900/40 border-zinc-800/60"
                : "bg-slate-50/70 border-slate-100"
            )}>
              <p className="font-extrabold uppercase tracking-widest text-[9.5px] text-zinc-400 font-mono">
                Recent Improvements:
              </p>
              <div className="space-y-2 leading-relaxed font-medium">
                <div className="flex items-start gap-2.5">
                  <span className="text-indigo-500 font-black shrink-0 mt-0.5">→</span>
                  <p className={theme === 'dark' ? "text-slate-200" : "text-slate-600"}>
                    <strong className={theme === 'dark' ? "text-white" : "text-slate-800"}>Import Shared Entries</strong> feature added
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="text-indigo-500 font-black shrink-0 mt-0.5">→</span>
                  <p className={theme === 'dark' ? "text-slate-200" : "text-slate-600"}>
                    New <strong className={theme === 'dark' ? "text-white" : "text-slate-800"}>Download Center</strong> added for background PDF exports
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="text-indigo-500 font-black shrink-0 mt-0.5">→</span>
                  <p className={theme === 'dark' ? "text-slate-200" : "text-slate-600"}>
                    <strong className={theme === 'dark' ? "text-white" : "text-slate-800"}>AI features</strong> arriving in the next couple of days
                  </p>
                </div>
              </div>
            </div>

            {/* CTA Continue Actions */}
            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={handleDismissSuccess}
                className="w-full py-2.5 px-4 rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold leading-none cursor-pointer shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 transition-colors border border-emerald-600"
              >
                Continue
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

