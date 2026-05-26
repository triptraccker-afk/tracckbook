import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DownloadCloud, 
  X, 
  Loader2, 
  CheckCircle, 
  AlertTriangle, 
  Trash2, 
  RefreshCw, 
  Info,
  Layers
} from 'lucide-react';
import { backgroundExportManager, ExportTask } from '../services/exportManager';
import { cn } from '../lib/utils';

// Responsive and reactive named export for Download Center Trigger
export function DownloadCenterTrigger({ 
  theme, 
  isOpen, 
  setIsOpen 
}: { 
  theme: 'light' | 'dark'; 
  isOpen: boolean; 
  setIsOpen: (open: boolean) => void; 
}) {
  const [activeCount, setActiveCount] = useState(0);
  const [averageProgress, setAverageProgress] = useState(0);

  useEffect(() => {
    const handleUpdate = () => {
      setActiveCount(backgroundExportManager.getActiveTasksCount());
      const tasks = backgroundExportManager.getTaskList();
      const avg = tasks.length > 0
        ? Math.round(tasks.reduce((acc, t) => acc + (t.status === 'completed' ? 100 : t.progress), 0) / tasks.length)
        : 0;
      setAverageProgress(avg);
    };

    handleUpdate();
    return backgroundExportManager.subscribe(handleUpdate);
  }, []);

  const handleVibrate = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(30);
      } catch (e) {}
    }
  };

  return (
    <button
      id="btn-download-center-trigger"
      onClick={() => { handleVibrate(); setIsOpen(!isOpen); }}
      className={cn(
        "relative p-2.5 rounded-xl shadow-sm border outline-none transition-all cursor-pointer flex items-center justify-center group shrink-0",
        isOpen 
          ? "bg-indigo-600 border-indigo-600 text-white" 
          : theme === 'dark' 
          ? "bg-zinc-950 hover:bg-zinc-900 border-zinc-900 text-slate-200" 
          : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
      )}
      title="Download Center"
    >
      {/* Animated Progress Ring while processing */}
      {activeCount > 0 && (
        <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none p-0.5 scale-[1.08] sm:scale-110">
          <circle
            cx="50%"
            cy="50%"
            r="44%"
            stroke="transparent"
            strokeWidth="2"
            fill="none"
          />
          <motion.circle
            cx="50%"
            cy="50%"
            r="44%"
            stroke={isOpen ? '#ffffff' : '#4f46e5'}
            strokeWidth="2.5"
            fill="none"
            strokeDasharray="100"
            animate={{ strokeDashoffset: 100 - averageProgress }}
            transition={{ duration: 0.15 }}
          />
        </svg>
      )}

      {activeCount > 0 ? (
        <Loader2 size={18} className="animate-spin text-indigo-500 group-hover:text-indigo-400" />
      ) : (
        <DownloadCloud size={18} className="transition-transform group-hover:scale-110" />
      )}

      {/* Active tasks badge pill */}
      {activeCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 bg-rose-500 border border-white dark:border-zinc-950 text-white font-extrabold text-[9px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center p-0.5 animate-pulse">
          {activeCount}
        </span>
      )}
    </button>
  );
}

interface DownloadCenterProps {
  theme: 'light' | 'dark';
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export default function DownloadCenter({ theme, isOpen, setIsOpen }: DownloadCenterProps) {
  const [tasks, setTasks] = useState<ExportTask[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Sync state with back-end export manager
  useEffect(() => {
    const handleUpdate = () => {
      const newTasks = backgroundExportManager.getTaskList();
      
      setTasks(prevTasks => {
        // Simple premium Toast triggering for complete/fail transitions
        if (prevTasks.length > 0) {
          newTasks.forEach(task => {
            const old = prevTasks.find(t => t.id === task.id);
            if (!old) {
              if (task.attachmentsCount > 0) {
                triggerToast(`Optimizing attachments...`, 'info');
              } else {
                triggerToast(`Preparing PDF...`, 'info');
              }
            } else if (old.status !== task.status) {
              if (task.status === 'completed') {
                triggerToast(`Download ready`, 'success');
              } else if (task.status === 'failed') {
                triggerToast(`Failed to export "${task.cashbookName}"`, 'error');
              } else if (task.status === 'processing') {
                if (task.attachmentsCount > 0) {
                  triggerToast(`Optimizing attachments...`, 'info');
                } else {
                  triggerToast(`Preparing PDF...`, 'info');
                }
              }
            }
          });
        }
        return newTasks;
      });
      
      const count = backgroundExportManager.getActiveTasksCount();
      setActiveCount(count);
    };

    setTasks(backgroundExportManager.getTaskList());
    setActiveCount(backgroundExportManager.getActiveTasksCount());

    return backgroundExportManager.subscribe(handleUpdate);
  }, []);

  const triggerToast = (msg: string, type: 'success' | 'error' | 'info') => {
    setShowToast({ message: msg, type });
    setTimeout(() => {
      setShowToast(null);
    }, 4500);
  };

  const handleDownload = (taskId: string) => {
    backgroundExportManager.downloadCompletedReport(taskId);
  };

  const handleRetry = (taskId: string) => {
    backgroundExportManager.retryTask(taskId);
  };

  const handleDelete = (taskId: string) => {
    backgroundExportManager.deleteReportTask(taskId);
  };

  return (
    <>
      {/* 1. TOAST NOTIFICATIONS */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-6 left-1/2 z-[200] max-w-md w-full px-4 select-none pointer-events-none"
          >
            <div className={cn(
              "p-4 rounded-2xl shadow-xl flex items-center gap-3 border pointer-events-auto backdrop-blur-md",
              showToast.type === 'success' 
                ? "bg-emerald-500/10 border-emerald-500 text-emerald-800 dark:text-emerald-400"
                : showToast.type === 'error'
                ? "bg-rose-500/10 border-rose-500 text-rose-800 dark:text-rose-400"
                : "bg-indigo-500/10 border-indigo-500 text-indigo-800 dark:text-indigo-400"
            )}>
              {showToast.type === 'success' && <CheckCircle size={22} className="shrink-0 text-emerald-500" />}
              {showToast.type === 'error' && <AlertTriangle size={22} className="shrink-0 text-rose-500" />}
              {showToast.type === 'info' && <Loader2 size={22} className="shrink-0 text-indigo-500 animate-spin" />}
              
              <div className="flex-1 text-sm font-black tracking-tight leading-snug">
                {showToast.message}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. DOWNLOAD CENTER DRAWER / PANEL */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Click-away backdrop overlay */}
            <div 
              className="fixed inset-0 z-[140] bg-black/5 dark:bg-black/20"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              id="download-center-panel"
              initial={{ opacity: 0, y: 15, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.96 }}
              className={cn(
                "fixed top-[70px] right-4 left-4 sm:left-auto sm:right-4 z-[150] w-auto sm:w-[420px] max-w-lg rounded-3xl p-5 border shadow-2xl overflow-hidden flex flex-col max-h-[80vh] transition-all",
                theme === 'dark' 
                  ? "bg-zinc-950/95 border-zinc-900 text-white backdrop-blur-xl" 
                  : "bg-white/95 border-slate-100 text-slate-800 backdrop-blur-xl"
              )}
            >
              {/* Header block */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-900">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                    <DownloadCloud size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black tracking-tight font-sans">Download Center</h4>
                    <p className="text-[10px] uppercase font-bold text-slate-400 font-mono">Persistent Export Queue</p>
                  </div>
                </div>
                
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Task list container */}
              <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1 max-h-[50vh] scrollbar-thin scrollbar-thumb-slate-200">
                {tasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                    <div className="p-4 rounded-full bg-slate-50 dark:bg-zinc-900/60 text-slate-300 dark:text-zinc-650">
                      <DownloadCloud size={30} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-wider font-sans">No background tasks yet</p>
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 max-w-xs leading-relaxed font-sans">
                        Export any cashbook to PDF to begin background processing.
                      </p>
                    </div>
                  </div>
                ) : (
                  tasks.map((task) => {
                    const isProcessing = task.status === 'processing';
                    const isCompleted = task.status === 'completed';
                    const isFailed = task.status === 'failed';
                    const isPending = task.status === 'pending';

                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "p-3 rounded-2xl border transition-colors relative overflow-hidden group space-y-2",
                          isProcessing 
                            ? "bg-indigo-500/5 border-indigo-500/20" 
                            : isFailed 
                            ? "bg-rose-500/5 border-rose-500/20"
                            : isPending 
                            ? "bg-amber-500/5 border-amber-500/20"
                            : theme === 'dark' 
                            ? "bg-zinc-900/10 hover:bg-zinc-900/20 border-zinc-900" 
                            : "bg-slate-50/20 hover:bg-slate-50/50 border-slate-100"
                        )}
                      >
                        {/* Status top row */}
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
                            <div className={cn(
                              "p-1.5 rounded-lg shrink-0",
                              isCompleted 
                                ? "bg-emerald-500/10 text-emerald-500" 
                                : isFailed 
                                ? "bg-rose-500/10 text-rose-500"
                                : isProcessing
                                ? "bg-indigo-500/10 text-indigo-600 animate-pulse"
                                : "bg-amber-500/10 text-amber-500"
                            )}>
                              {isCompleted && <CheckCircle size={15} />}
                              {isFailed && <AlertTriangle size={15} />}
                              {isProcessing && <Loader2 size={15} className="animate-spin" />}
                              {isPending && <Layers size={15} />}
                            </div>
                            
                            <div className="min-w-0 flex-1">
                              <h5 className="text-xs font-black tracking-tight truncate font-sans" title={task.cashbookName}>
                                {task.cashbookName}
                              </h5>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5 truncate font-mono">
                                {task.isCompressed ? 'Optimized' : 'Lossless'} PDF • {task.transactionsCount} Entries
                              </p>
                            </div>
                          </div>

                          {/* Quick delete/clear item (unless processing) */}
                          <div className="flex items-center gap-1 shrink-0">
                            {isCompleted && (
                              <button
                                onClick={() => handleDownload(task.id)}
                                className="p-1 rounded-md text-emerald-500 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                                title="Download local file"
                              >
                                <DownloadCloud size={14} />
                              </button>
                            )}
                            
                            {isFailed && (
                              <button
                                onClick={() => handleRetry(task.id)}
                                className="p-1 rounded-md text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                title="Retry process"
                              >
                                <RefreshCw size={13} />
                              </button>
                            )}
                            
                            {!isProcessing && (
                              <button
                                onClick={() => handleDelete(task.id)}
                                className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                                title="Delete task record"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Middle: Progress message/logs info */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400 gap-2">
                            <span className={cn(
                              "font-semibold lowercase tracking-normal text-left leading-tight flex-1 min-w-0 truncate font-sans",
                              isFailed && "text-rose-500 uppercase tracking-widest font-black"
                            )}>
                              {task.message}
                            </span>
                            <span className="shrink-0 font-mono">{isCompleted ? '100' : task.progress}%</span>
                          </div>

                          {/* Horizontal progress bar */}
                          <div className="w-full h-1.5 bg-slate-100 dark:bg-zinc-900 rounded-full overflow-hidden">
                            <motion.div
                              className={cn(
                                "h-full rounded-full",
                                isCompleted 
                                  ? "bg-emerald-500" 
                                  : isFailed 
                                  ? "bg-rose-500"
                                  : "bg-indigo-500"
                              )}
                              initial={{ width: 0 }}
                              animate={{ width: `${isCompleted ? 100 : task.progress}%` }}
                              transition={{ duration: 0.15 }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Banner tooltip/notice */}
              <div className="mt-2 p-3 rounded-2xl bg-slate-50 dark:bg-zinc-900/50 flex gap-2 border border-slate-100/50 dark:border-zinc-900/50">
                <Info size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 leading-normal font-sans">
                  All PDF downloads compile directly block-by-block. You can switch books, edit transactions, or close modals safely; our background workers take care of everything.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
