/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://chbbaswtawmbmyquoiac.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoYmJhc3d0YXdtYm15cXVvaWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjE5MTcsImV4cCI6MjA5MDY5NzkxN30.4qNJG7rjpEJ9vfyiGy_mteUI9_X1I6dNekEuXV26Xic';

const isConfigured = (url: string | undefined, key: string | undefined) => {
  if (!url || !key) return false;
  if (url === 'your_supabase_url' || key === 'your_supabase_anon_key') return false;
  return true;
};

export const clearSupabaseAuthStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.endsWith('-auth-token'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => {
        localStorage.removeItem(k);
        console.warn(`[Supabase Safety] Cleaned up corrupt session key: ${k}`);
      });
    } catch (e) {
      console.error('[Supabase Safety] Error clearing storage:', e);
    }
  }
};

const createWrappedSupabaseClient = () => {
  if (!isConfigured(supabaseUrl, supabaseAnonKey)) return null;

  const client = createClient(supabaseUrl, supabaseAnonKey);

  // Wrap getSession to handle refresh token invalidation and prevent null-destructure crashes
  const originalGetSession = client.auth.getSession.bind(client.auth);
  client.auth.getSession = async () => {
    try {
      const res = await originalGetSession();
      if (res?.error) {
        const errMsg = res.error.message || '';
        if (
          errMsg.includes('Invalid Refresh Token') || 
          errMsg.includes('Refresh Token Not Found') ||
          errMsg.includes('invalid_grant') ||
          errMsg.includes('Refresh token')
        ) {
          console.warn('[Supabase Auth Safety] Invalid refresh token detected from getSession, auto-clearing corrupt local storage.');
          clearSupabaseAuthStorage();
          res.data = { session: null };
        }
      }
      return res;
    } catch (err: any) {
      console.error('[Supabase Auth Safety] getSession threw exception:', err);
      const errMsg = err?.message || '';
      if (
        errMsg.includes('Invalid Refresh Token') || 
        errMsg.includes('Refresh Token Not Found') ||
        errMsg.includes('invalid_grant') ||
        errMsg.includes('Refresh token')
      ) {
        clearSupabaseAuthStorage();
      }
      return { data: { session: null }, error: err };
    }
  };

  return client;
};

export const supabase = createWrappedSupabaseClient();

if (!supabase) {
  console.warn('Supabase configuration missing or using placeholders:', {
    url: supabaseUrl ? (supabaseUrl === 'your_supabase_url' ? 'Placeholder' : 'Present') : 'Missing',
    key: supabaseAnonKey ? (supabaseAnonKey === 'your_supabase_anon_key' ? 'Placeholder' : 'Present') : 'Missing'
  });
}

