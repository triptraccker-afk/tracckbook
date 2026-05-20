/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://chbbaswtawmbmyquoiac.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoYmJhc3d0YXdtYm15cXVvaWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjE5MTcsImV4cCI6MjA5MDY5NzkxN30.4qNJG7rjpEJ9vfyiGy_mteUI9_X1I6dNekEuXV26Xic';

const isConfigured = (url: string | undefined, key: string | undefined) => {
  if (!url || !key) return false;
  if (url === 'your_supabase_url' || key === 'your_supabase_anon_key') return false;
  return true;
};

export const supabase = isConfigured(supabaseUrl, supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

if (!supabase) {
  console.warn('Supabase configuration missing or using placeholders:', {
    url: supabaseUrl ? (supabaseUrl === 'your_supabase_url' ? 'Placeholder' : 'Present') : 'Missing',
    key: supabaseAnonKey ? (supabaseAnonKey === 'your_supabase_anon_key' ? 'Placeholder' : 'Present') : 'Missing'
  });
}
