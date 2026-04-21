import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter as Router } from 'react-router-dom';
import { AlertCircle, RefreshCw } from 'lucide-react';
import App from './App';
import './index.css';

console.log('App starting (main.tsx) version 1.0.2...');

interface EBProps { children: ReactNode; }
interface EBState { hasError: boolean; error: Error | null; }

class ErrorBoundary extends Component<EBProps, EBState> {
  constructor(props: EBProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-xl border border-slate-200 dark:border-slate-800 text-center">
            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="text-rose-600 dark:text-rose-400" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Something went wrong</h1>
            <p className="text-slate-600 dark:text-slate-400 mb-8 text-sm">An unexpected error occurred.</p>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 mb-8 text-left overflow-auto max-h-32">
              <code className="text-xs text-rose-600 dark:text-rose-400 break-all">{this.state.error?.message || 'Unknown error'}</code>
            </div>
            <button onClick={() => window.location.reload()} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 font-bold transition-all flex items-center justify-center gap-2">
              <RefreshCw size={18} /> Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
/* React version check removed to avoid default import issues */
if (typeof window !== 'undefined') {
  (window as any).ReactLoaded = true;
}

const container = document.getElementById('root');
console.log('Root container:', container);

if (!container) {
  console.error('Root element not found!');
  throw new Error('Root element not found');
}

console.log('Mounting App...');
try {
  const root = createRoot(container);
  root.render(
    <ErrorBoundary>
      <Router>
        <App />
      </Router>
    </ErrorBoundary>,
  );
  console.log('App mounted successfully');
} catch (error) {
  console.error('Failed to mount app:', error);
}
