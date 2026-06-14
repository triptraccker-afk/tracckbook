import React, { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function AutoLogoutManager({ session }: { session: any }) {
  const navigate = useNavigate();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only monitor on stable sessions
    if (!session || !supabase) return;

    // "Desktop users only"
    // Use responsive detection (screen width >= 1024px) combined with absence of touch capabilities
    const checkIsDesktop = () => {
      const isLargeScreen = window.innerWidth >= 1024;
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      return isLargeScreen && !hasTouch;
    };

    if (!checkIsDesktop()) {
      console.log('[AutoLogout] Mobile/Tablet touch user detected. Inactivity timer bypassed.');
      return;
    }

    const handleInactivityLogout = async () => {
      console.warn('[AutoLogout] User inactive for 10 minutes. Triggering secure automatic logout...');
      try {
        if (supabase) {
          await supabase.auth.signOut();
        }
      } catch (err) {
        console.error('[AutoLogout] Supabase signOut error:', err);
      } finally {
        // Clear session references
        localStorage.removeItem('supabase_remember_me');
        sessionStorage.setItem('logout_reason', 'inactivity');
        navigate('/login', { replace: true });
        // Force window location replace to be doubly safe and clear state structures completely
        window.location.reload();
      }
    };

    const resetTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      // "If no activity for 10 minutes"
      // 10 minutes = 10 * 60 * 1000 = 600,000 ms
      const timeoutMs = 10 * 60 * 1000;
      timerRef.current = setTimeout(handleInactivityLogout, timeoutMs);
    };

    // Register initial reset
    resetTimer();

    // Listeners for "mouse movement, keyboard activity, clicks, scrolling"
    const interactionEvents = ['mousemove', 'keydown', 'click', 'scroll'];

    const handleEvent = () => {
      resetTimer();
    };

    interactionEvents.forEach(type => {
      window.addEventListener(type, handleEvent, { passive: true });
    });

    console.log('[AutoLogout] Inactivity timer established for Desktop user (10-minute timeout).');

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      interactionEvents.forEach(type => {
        window.removeEventListener(type, handleEvent);
      });
    };
  }, [session, navigate]);

  return null;
}
