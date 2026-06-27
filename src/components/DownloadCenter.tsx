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
  Layers,
  Archive,
  Calendar,
  Clock,
  Sparkles,
  FileSpreadsheet,
  FileText,
  Eye,
  Inbox,
  CloudLightning,
  CloudOff,
  Cloud,
  Check,
  RotateCcw
} from 'lucide-react';
import { backgroundExportManager, ExportTask, JobNotification } from '../services/exportManager';
import { syncManager, SyncQueueItem } from '../services/syncManager';
import { cn } from '../lib/utils';

// Responsive and reactive named export for Processing Center Trigger
export function DownloadCenterTrigger({ 
  theme, 
  isOpen, 
  setIsOpen 
}: { 
  theme: 'light' | 'dark'; 
  isOpen: boolean; 
  setIsOpen: (open: boolean) => void; 
}) {
  const [activeCounts, setActiveCounts] = useState({ pdf: 0, excel: 0, ai: 0, sync: 0, total: 0 });
  const [averageProgress, setAverageProgress] = useState(0);

  useEffect(() => {
    const handleUpdate = () => {
      const tasks = backgroundExportManager.getTaskList().filter(t => !t.isArchived);
      const activeTasks = tasks.filter(t => t.status === 'pending' || t.status === 'processing');
      
      const pdf = activeTasks.filter(t => t.type === 'pdf' || !t.type).length;
      const excel = activeTasks.filter(t => t.type === 'excel').length;
      const ai = activeTasks.filter(t => t.type === 'ai').length;
      const syncPending = syncManager.getPendingCount();
      
      setActiveCounts({ pdf, excel, ai, sync: syncPending, total: activeTasks.length + syncPending });
      
      const totalItems = tasks.length + syncManager.getQueueList().length;
      const completedCount = tasks.filter(t => t.status === 'completed').length + syncManager.getQueueList().filter(q => q.status === 'completed').length;
      
      const avg = totalItems > 0
        ? Math.round((completedCount / totalItems) * 100)
        : 0;
      setAverageProgress(avg);
    };

    handleUpdate();
    const unsubExport = backgroundExportManager.subscribe(handleUpdate);
    const unsubSync = syncManager.subscribe(handleUpdate);
    return () => {
      unsubExport();
      unsubSync();
    };
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
        "relative p-2.5 rounded-xl outline-none transition-all cursor-pointer flex items-center justify-center group shrink-0",
        isOpen 
          ? "bg-indigo-600 border border-indigo-600 text-white shadow-sm" 
          : theme === 'dark' 
          ? "bg-transparent text-slate-400 hover:text-white" 
          : "bg-transparent text-slate-500 hover:text-slate-800"
      )}
      title={`Processing Center (${activeCounts.pdf} PDF, ${activeCounts.excel} Excel, ${activeCounts.ai} AI Scan, ${activeCounts.sync} Syncs)`}
    >
      {/* Animated Progress Ring while processing */}
      {activeCounts.total > 0 && (
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

      {activeCounts.total > 0 ? (
        <Loader2 size={18} className="animate-spin text-indigo-500 group-hover:text-indigo-400" />
      ) : (
        <DownloadCloud size={18} className="transition-transform group-hover:scale-110" />
      )}

      {/* Active tasks badge pill */}
      {activeCounts.total > 0 && (
        <span 
          className="absolute -top-1.5 -right-1.5 bg-rose-500 border border-white dark:border-zinc-950 text-white font-extrabold text-[9px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center p-0.5 animate-pulse"
          title={`${activeCounts.pdf} PDF, ${activeCounts.excel} Excel, ${activeCounts.ai} AI, ${activeCounts.sync} Cloud Syncs pending`}
        >
          {activeCounts.total}
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
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
  const [activeFilter, setActiveFilter] = useState<'all' | 'export' | 'ai' | 'sync'>('all');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<JobNotification[]>([]);

  // Sync state with back-end export manager and sync manager
  useEffect(() => {
    const handleUpdate = () => {
      const newTasks = backgroundExportManager.getTaskList();
      setNotifications(backgroundExportManager.getNotifications());
      
      setTasks(prevTasks => {
        // Simple premium Toast triggering for complete/fail transitions
        if (prevTasks.length > 0) {
          newTasks.forEach(task => {
            const old = prevTasks.find(t => t.id === task.id);
            if (!old) {
              if (task.type === 'ai') {
                triggerToast(`AI scanning queued...`, 'info');
              } else if (task.type === 'excel') {
                triggerToast(`Preparing Excel...`, 'info');
              } else {
                triggerToast(`Preparing PDF...`, 'info');
              }
            } else if (old.status !== task.status) {
              if (task.status === 'completed') {
                triggerToast(`Download ready`, 'success');
              } else if (task.status === 'failed') {
                triggerToast(`Failed to process "${task.cashbookName}"`, 'error');
              } else if (task.status === 'processing') {
                if (task.type === 'ai') {
                  triggerToast(`AI is scanning bills...`, 'info');
                } else if (task.type === 'excel') {
                  triggerToast(`Generating Excel spreadsheet...`, 'info');
                } else {
                  triggerToast(`Optimizing PDF attachments...`, 'info');
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

    const handleSyncUpdate = () => {
      setSyncQueue([...syncManager.getQueueList()]);
    };

    setTasks(backgroundExportManager.getTaskList());
    setSyncQueue([...syncManager.getQueueList()]);
    setActiveCount(backgroundExportManager.getActiveTasksCount());
    setNotifications(backgroundExportManager.getNotifications());

    const unsubExport = backgroundExportManager.subscribe(handleUpdate);
    const unsubSync = syncManager.subscribe(handleSyncUpdate);

    // Wire up sync toast alerts nicely
    const unsubSyncToasts = syncManager.subscribeToToasts((msg, type) => {
      triggerToast(msg, type);
    });

    return () => {
      unsubExport();
      unsubSync();
      unsubSyncToasts();
    };
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

  const filteredTasks = tasks.filter(t => {
    // Tab filtering (Active vs Archive)
    if (activeTab === 'archive') {
      if (!t.isArchived) return false;
    } else {
      if (t.isArchived) return false;
    }

    // Type filtering
    if (activeFilter === 'export') {
      return t.type === 'pdf' || t.type === 'excel' || !t.type;
    }
    if (activeFilter === 'ai') {
      return t.type === 'ai';
    }
    if (activeFilter === 'sync') {
      return false; // Sync queue rendered separately under its own schema
    }
    return true;
  });

  const getSyncTypeLabel = (type: string) => {
    switch (type) {
      case 'CREATE_ENTRY': return 'Create Transaction';
      case 'UPDATE_ENTRY': return 'Update Transaction';
      case 'DELETE_ENTRY': return 'Delete Transaction';
      case 'UPLOAD_IMAGE': return 'Upload Attachment';
      case 'AI_SCAN': return 'AI Receipt Scan';
      case 'PDF_EXPORT': return 'Generate PDF';
      case 'EXCEL_EXPORT': return 'Generate Excel';
      default: return type;
    }
  };

  const getSyncStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return { label: 'Synced', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-black' };
      case 'failed':
        return { label: 'Failed', color: 'bg-rose-500/10 text-rose-500 border-rose-500/20 font-black' };
      case 'uploading':
        return { label: 'Uploading', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20 animate-pulse font-black' };
      case 'scanning':
        return { label: 'Scanning', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20 animate-pulse font-black' };
      case 'syncing':
        return { label: 'Syncing', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20 animate-pulse font-black' };
      case 'waiting_for_internet':
        return { label: 'Offline Queue', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20 font-black' };
      case 'paused':
        return { label: 'Paused', color: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20 font-black' };
      default:
        return { label: 'Queued', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20 font-black' };
    }
  };

  return (
    <>
      {/* 1. NOTIFICATIONS PORTAL OVERLAY */}
      <div className="fixed top-20 right-4 z-[210] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none select-none">
        <AnimatePresence>
          {notifications.map(notif => {
            const notifTitle = notif.type === 'ai' ? 'AI Scan Complete' : notif.type === 'excel' ? 'Excel Export Ready' : 'PDF Report Ready';
            const targetTask = tasks.find(t => t.id === notif.taskId);
            const isNotifCompleted = targetTask ? targetTask.status === 'completed' : true;

            return (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, x: 50, y: -10 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, x: 50, scale: 0.9 }}
                className="bg-zinc-950/95 border border-zinc-850 p-4 rounded-2xl shadow-2xl flex flex-col gap-3 pointer-events-auto backdrop-blur-md text-white"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex gap-2">
                    <div className={cn(
                      "p-1.5 rounded-xl text-white mt-0.5",
                      notif.type === 'ai' ? "bg-indigo-600" : notif.type === 'excel' ? "bg-emerald-600" : "bg-blue-600"
                    )}>
                      {notif.type === 'ai' ? <Sparkles size={14} /> : notif.type === 'excel' ? <FileSpreadsheet size={14} /> : <FileText size={14} />}
                    </div>
                    <div>
                      <h5 className="text-xs font-black tracking-tight">{notifTitle}</h5>
                      <p className="text-[10px] text-zinc-400 font-semibold font-sans mt-0.5 leading-normal">{notif.message}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => backgroundExportManager.dismissNotification(notif.id)}
                    className="p-1 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </div>

                {/* Custom Action buttons inside notifications */}
                {isNotifCompleted && (
                  <div className="flex gap-1.5 self-end">
                    <button
                      onClick={() => {
                        backgroundExportManager.dismissNotification(notif.id);
                        if (notif.type === 'ai') {
                          if (backgroundExportManager.onReviewAiScan) {
                            backgroundExportManager.getAiScanResults(notif.taskId).then(results => {
                              backgroundExportManager.onReviewAiScan?.(results);
                            });
                          }
                        } else {
                          handleDownload(notif.taskId);
                        }
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1 text-white",
                        notif.type === 'ai' ? "bg-indigo-600 hover:bg-indigo-500" : "bg-emerald-600 hover:bg-emerald-500"
                      )}
                    >
                      {notif.type === 'ai' ? (
                        <>
                          <Eye size={11} />
                          <span>Review Splits</span>
                        </>
                      ) : (
                        <>
                          <DownloadCloud size={11} />
                          <span>Download File</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* 2. MAIN MODAL POPUP DIALOG */}
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
                "fixed top-[70px] right-4 left-4 sm:left-auto sm:right-4 z-[150] w-auto sm:w-[420px] max-w-lg rounded-3xl p-5 border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-all",
                theme === 'dark' 
                  ? "bg-zinc-950/95 border-zinc-900 text-white backdrop-blur-xl" 
                  : "bg-white/95 border-slate-100 text-slate-800 backdrop-blur-xl"
              )}
            >
              {/* Header block */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-900">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                    <Layers size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black tracking-tight font-sans">Processing Center</h4>
                    <p className="text-[10px] uppercase font-bold text-slate-400 font-mono">Offline-First Sync & Exports</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm("Are you sure you want to completely wipe all local databases? This action is irreversible.")) {
                        await backgroundExportManager.clearAllData();
                        await syncManager.db.clearAllData();
                        window.location.reload();
                      }
                    }}
                    className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-[9px] uppercase tracking-wider transition-colors cursor-pointer border border-rose-500/20"
                    title="completely wipe local IndexedDB databases"
                  >
                    Clear All Data
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Active / Archive Tabs */}
              <div className="flex border-b border-slate-100 dark:border-zinc-900 mt-3 shrink-0">
                <button
                  onClick={() => { setActiveTab('active'); setExpandedTaskId(null); }}
                  className={cn(
                    "flex-1 pb-2.5 text-xs font-black tracking-tight text-center border-b-2 cursor-pointer transition-all",
                    activeTab === 'active'
                      ? "border-indigo-500 text-indigo-500 dark:text-indigo-400"
                      : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  )}
                >
                  Processing Center ({filteredTasks.length + syncQueue.filter(q => q.status !== 'completed').length})
                </button>
                <button
                  onClick={() => { setActiveTab('archive'); setExpandedTaskId(null); }}
                  className={cn(
                    "flex-1 pb-2.5 text-xs font-black tracking-tight text-center border-b-2 cursor-pointer transition-all flex items-center justify-center gap-1.5",
                    activeTab === 'archive'
                      ? "border-indigo-500 text-indigo-500 dark:text-indigo-400"
                      : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  )}
                >
                  <Archive size={13} />
                  Archive ({tasks.filter(t => t.isArchived).length + syncQueue.filter(q => q.status === 'completed').length})
                </button>
              </div>

              {/* Type Filter Buttons */}
              <div className="flex gap-1.5 py-2.5 overflow-x-auto scrollbar-none shrink-0">
                {([
                  { key: 'all', label: 'All Jobs' },
                  { key: 'export', label: 'Exports' },
                  { key: 'ai', label: 'AI Scans' },
                  { key: 'sync', label: 'Cloud Syncs' }
                ] as const).map(f => (
                  <button
                    key={f.key}
                    onClick={() => { setActiveFilter(f.key); setExpandedTaskId(null); }}
                    className={cn(
                      "px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer border shrink-0",
                      activeFilter === f.key
                        ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-extrabold"
                        : theme === 'dark'
                        ? "bg-zinc-900/40 hover:bg-zinc-900 border-zinc-900 text-slate-400"
                        : "bg-slate-50 hover:bg-slate-100 border-slate-100 text-slate-500"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Task list container */}
              <div className="flex-1 overflow-y-auto py-1 space-y-3 pr-1 max-h-[45vh] scrollbar-thin scrollbar-thumb-slate-200">
                
                {/* 1. ASYNC BACKGROUND SYNC QUEUE ITEMS */}
                {(activeFilter === 'all' || activeFilter === 'sync') && (
                  syncQueue
                    .filter(item => {
                      if (activeTab === 'archive') return item.status === 'completed';
                      return item.status !== 'completed';
                    })
                    .map((item) => {
                      const badge = getSyncStatusBadge(item.status);
                      const isExpanded = expandedTaskId === item.id;
                      const isProcessing = item.status === 'uploading' || item.status === 'scanning' || item.status === 'syncing';
                      const isFailed = item.status === 'failed';
                      const isCompleted = item.status === 'completed';
                      
                      return (
                        <div
                          key={item.id}
                          onClick={() => setExpandedTaskId(isExpanded ? null : item.id)}
                          className={cn(
                            "p-3 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col space-y-2",
                            isProcessing 
                              ? "bg-indigo-500/5 border-indigo-500/20" 
                              : isFailed 
                              ? "bg-rose-500/5 border-rose-500/20"
                              : theme === 'dark' 
                              ? "bg-zinc-900/15 hover:bg-zinc-900/30 border-zinc-900" 
                              : "bg-slate-50/20 hover:bg-slate-50/50 border-slate-100"
                          )}
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
                              <div className={cn(
                                "p-1.5 rounded-lg shrink-0 flex items-center justify-center",
                                isCompleted 
                                  ? "bg-emerald-500/10 text-emerald-500" 
                                  : isFailed 
                                  ? "bg-rose-500/10 text-rose-500"
                                  : isProcessing
                                  ? "bg-indigo-500/10 text-indigo-500 animate-pulse"
                                  : "bg-amber-500/10 text-amber-500"
                              )}>
                                {isCompleted && <Check size={14} />}
                                {isFailed && <AlertTriangle size={14} />}
                                {isProcessing && <Loader2 size={14} className="animate-spin" />}
                                {item.status === 'waiting_for_internet' && <CloudOff size={14} />}
                                {item.status === 'pending' && <Cloud size={14} />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h5 className="text-xs font-black tracking-tight truncate font-sans">
                                  {getSyncTypeLabel(item.type)}
                                </h5>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 font-mono flex items-center gap-1.5">
                                  <span>Sync Pipeline • Priority: {item.priority}</span>
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={cn("text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border font-sans", badge.color)}>
                                {badge.label}
                              </span>
                              {isFailed && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    syncManager.triggerSync();
                                    triggerToast('Retrying background sync queue...', 'info');
                                  }}
                                  className="p-1 rounded-md text-slate-400 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors"
                                  title="Force Sync Now"
                                >
                                  <RotateCcw size={12} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Expanded Details accordion */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="border-t border-slate-100/40 dark:border-zinc-900/40 pt-2 mt-1 text-[11px] font-sans text-slate-500 dark:text-zinc-400 space-y-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-0.5">
                                    <p className="text-[9px] uppercase font-bold text-slate-400 font-mono">Enqueued Time</p>
                                    <p className="font-semibold text-slate-700 dark:text-slate-300">
                                      {new Date(item.createdAt).toLocaleString('en-IN')}
                                    </p>
                                  </div>
                                  <div className="space-y-0.5">
                                    <p className="text-[9px] uppercase font-bold text-slate-400 font-mono">Retries</p>
                                    <p className="font-semibold text-slate-700 dark:text-slate-300">
                                      {item.retryCount} / 5 Attempts
                                    </p>
                                  </div>
                                </div>

                                {item.payload && (
                                  <div className="space-y-0.5 pt-1.5 border-t border-slate-50 dark:border-zinc-900/30">
                                    <p className="text-[9px] uppercase font-bold text-slate-400 font-mono">Transaction Payload</p>
                                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-zinc-900/50 font-mono text-[9px] space-y-1 overflow-x-auto">
                                      {item.payload.entry ? (
                                        <>
                                          <p><span className="text-indigo-500">Desc:</span> {item.payload.entry.description || 'N/A'}</p>
                                          <p><span className="text-indigo-500">Amount:</span> ₹{item.payload.entry.amount || 0}</p>
                                          <p><span className="text-indigo-500">Category:</span> {item.payload.entry.category || 'General'}</p>
                                        </>
                                      ) : item.payload.id ? (
                                        <p><span className="text-rose-500">ID:</span> {item.payload.id}</p>
                                      ) : (
                                        <p className="text-slate-400">Metadata Payload Enqueued</p>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {item.error && (
                                  <div className="p-1.5 rounded-lg bg-rose-500/5 border border-rose-500/10 text-rose-500 font-mono text-[9px] break-words">
                                    Error Details: {item.error}
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })
                )}

                {/* 2. EXPORT AND AI TASKS FROM BACKEND EXPORT MANAGER */}
                {filteredTasks.map((task) => {
                  const isProcessing = task.status === 'processing';
                  const isCompleted = task.status === 'completed';
                  const isFailed = task.status === 'failed';
                  const isPending = task.status === 'pending';
                  const isExpanded = expandedTaskId === task.id;

                  const taskType = task.type || 'pdf';
                  let TypeIcon = FileText;
                  if (taskType === 'excel') TypeIcon = FileSpreadsheet;
                  if (taskType === 'ai') TypeIcon = Sparkles;

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        "p-3 rounded-2xl border transition-colors relative overflow-hidden group space-y-2 flex flex-col cursor-pointer",
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
                      onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                    >
                      {/* Status top row */}
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
                          <div className={cn(
                            "p-1.5 rounded-lg shrink-0 flex items-center justify-center",
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
                            <h5 className="text-xs font-black tracking-tight truncate font-sans flex items-center gap-1.5" title={task.cashbookName}>
                              <TypeIcon size={12} className="shrink-0 text-slate-400" />
                              <span className="truncate">{task.cashbookName}</span>
                            </h5>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5 truncate font-mono flex items-center gap-1.5">
                              <span>{taskType.toUpperCase()} • {taskType === 'ai' ? `${task.attachmentsCount} Receipts` : `${task.transactionsCount} Entries`}</span>
                              {isProcessing && taskType === 'ai' && task.networkState && (
                                <span className={cn(
                                  "text-[8px] font-extrabold tracking-widest rounded px-1.5 py-0.5 leading-none font-sans uppercase",
                                  task.networkState === 'offline' && "bg-rose-500/10 text-rose-500 animate-pulse border border-rose-500/20",
                                  task.networkState === 'slow' && "bg-amber-500/10 text-amber-500 animate-pulse border border-amber-500/20",
                                  task.networkState === 'good' && "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                )}>
                                  {task.networkState}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Quick action controls */}
                        <div className="flex items-center gap-1 shrink-0">
                          {isCompleted && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (taskType === 'ai') {
                                  if (backgroundExportManager.onReviewAiScan) {
                                    backgroundExportManager.getAiScanResults(task.id).then(results => {
                                      backgroundExportManager.onReviewAiScan?.(results);
                                    });
                                  }
                                } else {
                                  handleDownload(task.id);
                                }
                              }}
                              className={cn(
                                "p-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-black uppercase tracking-wider",
                                taskType === 'ai' 
                                  ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 px-2 py-1"
                                  : "text-emerald-500 hover:bg-emerald-500/10"
                              )}
                              title={taskType === 'ai' ? "Review Scan" : "Download local file"}
                            >
                              {taskType === 'ai' ? (
                                <>
                                  <Eye size={12} />
                                  <span>Review</span>
                                </>
                              ) : (
                                <DownloadCloud size={14} />
                              )}
                            </button>
                          )}
                          
                          {isFailed && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRetry(task.id); }}
                              className="p-1 rounded-md text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Retry process"
                            >
                              <RefreshCw size={13} />
                            </button>
                          )}

                          {/* Archive toggle */}
                          {(isCompleted || isFailed) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (task.isArchived) {
                                  backgroundExportManager.restoreTask(task.id);
                                  triggerToast('Job restored from archive', 'success');
                                } else {
                                  backgroundExportManager.archiveTask(task.id);
                                  triggerToast('Job moved to archive', 'success');
                                }
                              }}
                              className="p-1 rounded-md text-slate-400 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                              title={task.isArchived ? "Restore to active queue" : "Archive job"}
                            >
                              <Archive size={13} />
                            </button>
                          )}
                          
                          {!isProcessing && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}
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
                            "font-semibold lowercase tracking-normal text-left leading-tight flex-1 min-w-0 truncate font-sans flex items-center gap-1.5",
                            isFailed && "text-rose-500 uppercase tracking-widest font-black"
                          )}>
                            <span>{task.message}</span>
                            {isProcessing && task.aiTimeRemaining && (
                              <span className="font-mono text-[9px] text-indigo-500 dark:text-indigo-400 font-bold uppercase shrink-0 animate-pulse">
                                ({task.aiTimeRemaining} remaining)
                              </span>
                            )}
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

                      {/* Expanded details accordion */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-slate-100/40 dark:border-zinc-900/40 pt-2.5 mt-1 text-[11px] font-sans text-slate-500 dark:text-zinc-400 space-y-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <p className="text-[9px] uppercase font-bold text-slate-400 font-mono flex items-center gap-1">
                                  <Calendar size={10} /> Created
                                </p>
                                <p className="font-semibold text-slate-700 dark:text-slate-300">
                                  {new Date(task.createdAt).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: 'short' })}
                                </p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[9px] uppercase font-bold text-slate-400 font-mono flex items-center gap-1">
                                  <Clock size={10} /> Duration
                                </p>
                                <p className="font-semibold text-slate-700 dark:text-slate-300">
                                  {task.durationMs ? `${(task.durationMs / 1000).toFixed(1)}s` : isProcessing ? 'In progress...' : '-'}
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-50 dark:border-zinc-900/30">
                              <div className="space-y-1">
                                <p className="text-[9px] uppercase font-bold text-slate-400 font-mono">Job Status</p>
                                <p className={cn(
                                  "font-black uppercase tracking-wider text-[10px]",
                                  isCompleted ? "text-emerald-500" : isFailed ? "text-rose-500" : "text-indigo-500"
                                )}>
                                  {task.status}
                                </p>
                              </div>
                              <div className="space-y-1">
                                {taskType === 'ai' ? (
                                  <>
                                    <p className="text-[9px] uppercase font-bold text-slate-400 font-mono">Receipts Summary</p>
                                    <p className="font-semibold text-slate-700 dark:text-slate-300">
                                      Total: {task.attachmentsCount} • Ok: {task.aiSuccessCount || 0} • Err: {task.aiFailedCount || 0}
                                    </p>
                                  </>
                                ) : (
                                  <>
                                    <p className="text-[9px] uppercase font-bold text-slate-400 font-mono">Entries</p>
                                    <p className="font-semibold text-slate-700 dark:text-slate-300">
                                      {task.transactionsCount} Transactions
                                    </p>
                                  </>
                                )}
                              </div>
                            </div>

                            {task.error && (
                              <div className="p-1.5 rounded-lg bg-rose-500/5 border border-rose-500/10 text-rose-500 font-mono text-[9px] break-words">
                                Error: {task.error}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                {/* EMPTY STATE CAPTURE */}
                {filteredTasks.length === 0 && (activeFilter !== 'sync' || syncQueue.filter(q => activeTab === 'archive' ? q.status === 'completed' : q.status !== 'completed').length === 0) && (
                  <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                    <div className="p-4 rounded-full bg-slate-50 dark:bg-zinc-900/60 text-slate-300 dark:text-zinc-650">
                      <Inbox size={30} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-wider font-sans">No tasks found</p>
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 max-w-xs leading-relaxed font-sans">
                        {activeTab === 'active' 
                          ? "All sync operations, exports, and receipt scans are operating normally." 
                          : "Your archived jobs will appear here."}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Banner tooltip/notice */}
              <div className="mt-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-zinc-900/50 flex gap-2 border border-slate-100/50 dark:border-zinc-900/50 shrink-0">
                <Info size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 leading-normal font-sans">
                  All PDF/Excel compiles, image archiving, and database synchronization operate silently in the background. You can exit safely or run offline; our BackgroundSync Engine guarantees data delivery.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
