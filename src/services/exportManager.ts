import { jsPDF } from 'jspdf';
import { addPdfBrandingFooter } from '../utils/pdfBranding';
import * as XLSX from 'xlsx';
import { uploadToCloudinary, getUserCloudinaryFolder } from './cloudinary';
import { processAndOcrImage } from './ocrService';

export interface ExportTask {
  id: string;
  type?: 'pdf' | 'excel' | 'ai';
  cashbookId: string;
  cashbookName: string;
  isCompressed: boolean;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  createdAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  transactionsCount: number;
  attachmentsCount: number;
  fileName: string;
  
  // AI fields
  aiUploadedCount?: number;
  aiProcessedCount?: number;
  aiSuccessCount?: number;
  aiFailedCount?: number;
  aiCurrentIndex?: number;
  aiTimeRemaining?: string;
  networkState?: 'good' | 'slow' | 'offline';
  aiCurrentStepId?: string;
  aiCompletedSteps?: string[];
  
  groupSize?: number;
  isHandwritten?: boolean;
  handwrittenTime?: string;
  handwrittenIsFood?: boolean;
  
  // Archive state
  isArchived?: boolean;
}

// 1. Native IndexedDB database wrapper
class ExportDB {
  private dbName = 'TrackBookExportDB';
  private dbVersion = 2;
  private db: IDBDatabase | null = null;

  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch (e) {}
      this.db = null;
    }
  }

  init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (e) => {
        const db = request.result;
        if (!db.objectStoreNames.contains('tasks')) {
          db.createObjectStore('tasks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs');
        }
        if (!db.objectStoreNames.contains('payloads')) {
          db.createObjectStore('payloads');
        }
      };
    });
  }

  private async ensureDb(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  async clearAllStores(): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['tasks', 'blobs', 'payloads'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      
      try {
        tx.objectStore('tasks').clear();
        tx.objectStore('blobs').clear();
        tx.objectStore('payloads').clear();
      } catch (e) {
        reject(e);
      }
    });
  }

  async saveTask(task: ExportTask): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['tasks'], 'readwrite');
      const store = transaction.objectStore('tasks');
      const request = store.put(task);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getTasks(): Promise<ExportTask[]> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['tasks'], 'readonly');
      const store = transaction.objectStore('tasks');
      const request = store.getAll();
      request.onsuccess = () => {
        const tasks = request.result || [];
        // Sort tasks by createdAt descending
        tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(tasks);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async savePayload(id: string, transactions: any[]): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['payloads'], 'readwrite');
      const store = transaction.objectStore('payloads');
      const request = store.put(transactions, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPayload(id: string): Promise<any[] | null> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['payloads'], 'readonly');
      const store = transaction.objectStore('payloads');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveBlob(id: string, blob: Blob): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['blobs'], 'readwrite');
      const store = transaction.objectStore('blobs');
      const request = store.put(blob, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getBlob(id: string): Promise<Blob | null> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['blobs'], 'readonly');
      const store = transaction.objectStore('blobs');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteTask(id: string): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['tasks', 'blobs', 'payloads'], 'readwrite');
      transaction.objectStore('tasks').delete(id);
      transaction.objectStore('blobs').delete(id);
      transaction.objectStore('payloads').delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// 2. Inline Web Worker Code
const workerBlobCode = `
  self.onmessage = async (e) => {
    const { taskId, urls, isCompressed, isStrongCompression, cloudName } = e.data;
    const results = {};
    const total = urls.length;

    if (total === 0) {
      self.postMessage({ type: 'complete', taskId, results });
      return;
    }

    const concurrency = 5;
    for (let i = 0; i < total; i += concurrency) {
      const chunk = urls.slice(i, i + concurrency);
      
      await Promise.all(chunk.map(async (url) => {
        try {
          if (!url) return;
          
          let targetUrl = url;
          // Pre-generate lightweight Cloudinary delivery URLs for ultra-low bandwidth usage
          if (url.includes('cloudinary.com')) {
            const splitter = url.includes('/image/upload/') ? '/image/upload/' : '/upload/';
            const parts = url.split(splitter);
            if (parts[1]) {
              const transform = isCompressed 
                ? (isStrongCompression ? 'f_jpg,q_35,w_800' : 'f_jpg,q_40,w_900')
                : 'f_jpg,q_82';
                
              const folderAndFile = parts[1].split('/');
              const cleanSegments = folderAndFile.filter(s => {
                return !(
                  s.includes('w_') || 
                  s.includes('q_') || 
                  s.includes('f_') || 
                  s.includes('c_') || 
                  s.includes('h_') || 
                  s.includes('dpr_') || 
                  s.includes('auto')
                );
              });
              targetUrl = parts[0] + splitter + transform + '/' + cleanSegments.join('/');
            }
          } else if (!url.startsWith('data:')) {
            // Egress protection: proxy non-Cloudinary images through Cloudinary Fetch API
            const transform = isCompressed 
              ? (isStrongCompression ? 'f_jpg,q_35,w_800' : 'f_jpg,q_40,w_900')
              : 'f_jpg,q_82';
            targetUrl = 'https://res.cloudinary.com/' + cloudName + '/image/fetch/' + transform + '/' + encodeURIComponent(url);
          }

          if (targetUrl.startsWith('data:')) {
            results[url] = targetUrl;
            return;
          }

          const response = await fetch(targetUrl);
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const blob = await response.blob();
          const buffer = await blob.arrayBuffer();
          results[url] = { buffer, type: blob.type };
        } catch (err) {
          console.warn('[Worker debug] Fetch failed:', url, err);
          results[url] = { error: err.message || 'Error downloading image' };
        }
      }));

      const progress = Math.min(85, Math.round(10 + ((i + chunk.length) / total) * 75));
      self.postMessage({
        type: 'progress',
        taskId,
        progress,
        message: 'Optimizing receipts (' + Math.min(total, i + chunk.length) + '/' + total + ')...'
      });
    }

    self.postMessage({ type: 'complete', taskId, results });
  };
`;

// 3. Centralized Premium Export Queue Manager Singleton
export interface JobNotification {
  id: string;
  type: 'pdf' | 'excel' | 'ai';
  message: string;
  taskId: string;
  timestamp: string;
}

export class BackgroundExportManager {
  private db = new ExportDB();
  private tasks: ExportTask[] = [];
  private listeners: (() => void)[] = [];
  private worker: Worker | null = null;
  private isProcessing = false;
  private cloudName = 'dd2kcpetc';
  
  public onReviewAiScan?: (results: any[]) => void;
  private notifications: JobNotification[] = [];
  public networkState: 'good' | 'slow' | 'offline' = 'good';

  constructor() {
    this.setupNetworkMonitoring();
    this.init();
  }

  private setupNetworkMonitoring() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.updateNetworkState());
      window.addEventListener('offline', () => this.updateNetworkState());
      if ((navigator as any).connection) {
        ((navigator as any).connection).addEventListener('change', () => this.updateNetworkState());
      }
      this.updateNetworkState();
    }
  }

  public updateNetworkState() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.networkState = 'offline';
    } else {
      const conn = typeof navigator !== 'undefined' ? (navigator as any).connection : null;
      if (conn) {
        if (conn.effectiveType === '2g' || conn.effectiveType === '3g' || conn.saveData) {
          this.networkState = 'slow';
        } else {
          this.networkState = 'good';
        }
      } else {
        this.networkState = 'good';
      }
    }
    // Update active tasks with current network state
    this.tasks.forEach(task => {
      if (task.type === 'ai' && task.status === 'processing') {
        task.networkState = this.networkState;
      }
    });
    this.notifyListeners();
  }

  public recordLatency(ms: number) {
    if (ms > 4000) {
      this.networkState = 'slow';
      this.notifyListeners();
    }
  }

  private async init() {
    try {
      await this.db.init();
      this.tasks = await this.db.getTasks();
      
      // Auto-archive old tasks (Feature 11)
      await this.autoArchiveOldTasks();

      this.notifyListeners();
      
      // Auto-resume any pending or processing tasks that got cut off by a reload
      const needsResume = this.tasks.some(t => t.status === 'pending' || t.status === 'processing');
      if (needsResume) {
        // Mark former processing tasks back to pending first
        for (const t of this.tasks) {
          if (t.status === 'processing') {
            t.status = 'pending';
            t.progress = 0;
            t.message = 'Queued for background export...';
            await this.db.saveTask(t);
          }
        }
        this.notifyListeners();
        this.processQueue();
      }
    } catch (err) {
      console.error('[ExportManager] initialization failed:', err);
    }
  }

  private async autoArchiveOldTasks() {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let modified = false;
    for (const t of this.tasks) {
      if (t.completedAt && !t.isArchived) {
        const completedTime = new Date(t.completedAt).getTime();
        if (completedTime < sevenDaysAgo) {
          t.isArchived = true;
          await this.db.saveTask(t);
          modified = true;
        }
      }
    }
    if (modified) {
      // Reload tasks from DB
      this.tasks = await this.db.getTasks();
    }
  }

  async archiveTask(taskId: string) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.isArchived = true;
    await this.db.saveTask(task);
    this.tasks = await this.db.getTasks();
    this.notifyListeners();
    vibrateFeedback(30);
  }

  async restoreTask(taskId: string) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.isArchived = false;
    await this.db.saveTask(task);
    this.tasks = await this.db.getTasks();
    this.notifyListeners();
    vibrateFeedback(30);
  }

  async clearAllData() {
    try {
      await this.db.clearAllStores();
    } catch (e) {
      console.error("[ExportManager] Failed to clear stores, deleting DB as fallback:", e);
      // Close DB first if open
      if (this.db) {
        try {
          this.db.close();
        } catch (err) {}
      }

      // Delete IndexedDB as fallback
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('TrackBookExportDB');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      localStorage.removeItem(`uploaded_count_${today}`);
      localStorage.removeItem(`processed_count_${today}`);
    } catch (e) {}

    this.tasks = [];
    this.notifications = [];
    this.notifyListeners();
    vibrateFeedback([100, 50, 100]);
    window.location.reload();
  }

  getNotifications(): JobNotification[] {
    return this.notifications;
  }

  dismissNotification(id: string) {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.notifyListeners();
  }

  private showJobNotification(task: ExportTask) {
    let msg = '';
    if (task.type === 'pdf') {
      msg = `Your PDF export for "${task.cashbookName}" is ready.`;
    } else if (task.type === 'excel') {
      msg = `Your Excel export for "${task.cashbookName}" is ready.`;
    } else if (task.type === 'ai') {
      msg = 'Receipt scanning completed successfully.';
    } else {
      msg = 'Job completed successfully.';
    }

    const notif: JobNotification = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: task.type || 'pdf',
      message: msg,
      taskId: task.id,
      timestamp: new Date().toISOString()
    };

    this.notifications = [notif, ...this.notifications];
    this.notifyListeners();
  }

  // Subscribe UI components to live status updates
  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(l => l());
  }

  getTaskList(): ExportTask[] {
    return this.tasks.map(t => ({ ...t }));
  }

  getActiveTasksCount(): number {
    return this.tasks.filter(t => !t.isArchived && (t.status === 'pending' || t.status === 'processing')).length;
  }

  // Enqueue a premium PDF Export Task
  async enqueueTask(
    cashbookId: string,
    cashbookName: string,
    transactions: any[],
    isCompressed: boolean
  ): Promise<string> {
    const taskId = 'tx_pdf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const attachments = transactions.filter(t => t.images && t.images.length > 0);
    const totalAttachments = attachments.reduce((acc, t) => acc + (t.images?.length || 0), 0);

    const task: ExportTask = {
      id: taskId,
      type: 'pdf',
      cashbookId,
      cashbookName,
      isCompressed,
      status: 'pending',
      progress: 0,
      message: 'Added to download queue...',
      createdAt: new Date().toISOString(),
      transactionsCount: transactions.length,
      attachmentsCount: totalAttachments,
      fileName: `${cashbookName.replace(/[^a-z0-9]/gi, '_')}.pdf`
    };

    // Save metadata and payload in parallel
    await Promise.all([
      this.db.saveTask(task),
      this.db.savePayload(taskId, transactions)
    ]);

    this.tasks = [task, ...this.tasks];
    this.notifyListeners();
    vibrateFeedback(40);

    // Run the processor loop
    this.processQueue();
    return taskId;
  }

  // Enqueue a premium Excel Export Task
  async enqueueExcelTask(
    cashbookId: string,
    cashbookName: string,
    transactions: any[]
  ): Promise<string> {
    const taskId = 'tx_excel_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    const task: ExportTask = {
      id: taskId,
      type: 'excel',
      cashbookId,
      cashbookName,
      isCompressed: false,
      status: 'pending',
      progress: 0,
      message: 'Added to download queue...',
      createdAt: new Date().toISOString(),
      transactionsCount: transactions.length,
      attachmentsCount: 0,
      fileName: `${cashbookName.replace(/[^a-z0-9]/gi, '_')}.xlsx`
    };

    // Save metadata and payload in parallel
    await Promise.all([
      this.db.saveTask(task),
      this.db.savePayload(taskId, transactions)
    ]);

    this.tasks = [task, ...this.tasks];
    this.notifyListeners();
    vibrateFeedback(40);

    // Run the processor loop
    this.processQueue();
    return taskId;
  }

  // Enqueue a premium AI Scan Task
  async enqueueAiScanTask(
    cashbookId: string,
    cashbookName: string,
    files: File[],
    taskName?: string,
    groupSize?: number,
    isHandwritten?: boolean,
    handwrittenTime?: string,
    handwrittenIsFood?: boolean
  ): Promise<string> {
    const taskId = 'tx_ai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    const task: ExportTask = {
      id: taskId,
      type: 'ai',
      cashbookId,
      cashbookName: taskName || cashbookName,
      isCompressed: false,
      status: 'pending',
      progress: 0,
      message: `0 / ${files.length} Completed`,
      createdAt: new Date().toISOString(),
      transactionsCount: 0,
      attachmentsCount: files.length,
      fileName: `${files.length} receipts batch`,
      
      aiUploadedCount: 0,
      aiProcessedCount: 0,
      aiSuccessCount: 0,
      aiFailedCount: 0,

      groupSize: groupSize || 1,
      isHandwritten: !!isHandwritten,
      handwrittenTime: handwrittenTime || '12:00 PM',
      handwrittenIsFood: !!handwrittenIsFood,
    };

    // Save metadata and payload in parallel
    await Promise.all([
      this.db.saveTask(task),
      this.db.savePayload(taskId, files)
    ]);

    this.tasks = [task, ...this.tasks];
    this.notifyListeners();
    vibrateFeedback(40);

    // Run the processor loop
    this.processQueue();
    return taskId;
  }

  // Queue Processing Loop
  private async processQueue() {
    if (this.isProcessing) return;

    const nextTask = this.tasks.find(t => t.status === 'pending');
    if (!nextTask) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    await this.runTask(nextTask);
    this.isProcessing = false;

    // Process next item
    setTimeout(() => this.processQueue(), 50);
  }

  private async runTask(task: ExportTask) {
    const startTime = Date.now();
    try {
      task.status = 'processing';
      task.progress = 5;
      task.message = 'Initializing background task...';
      await this.db.saveTask(task);
      this.notifyListeners();

      const taskType = task.type || 'pdf';

      if (taskType === 'pdf') {
        const transactions = await this.db.getPayload(task.id);
        if (!transactions || transactions.length === 0) {
          throw new Error('No transactions found to export.');
        }

        // Filter attachments
        const transactionsWithImages = transactions.filter(t => t.images && t.images.length > 0);
        const allUrls: string[] = [];
        transactionsWithImages.forEach(t => {
          t.images.forEach((url: string) => {
            if (url && !allUrls.includes(url)) {
              allUrls.push(url);
            }
          });
        });

        task.progress = 10;
        task.message = allUrls.length > 0 ? `Preparing worker thread for ${allUrls.length} receipt assets...` : 'Rendering tables...';
        await this.db.saveTask(task);
        this.notifyListeners();

        // Download and optimize fully within Worker thread if images exist
        let imageMap: { [url: string]: string } = {};
        if (allUrls.length > 0) {
          imageMap = await this.downloadImagesInWorker(task, allUrls);
        }

        task.progress = 88;
        task.message = 'Structuring document nodes inside memory...';
        await this.db.saveTask(task);
        this.notifyListeners();

        // Yield CPU safely
        await new Promise(r => setTimeout(r, 40));

        // Build jsPDF instance inside core thread with absolute safety
        const pdfBlob = await this.generatePdfBlob(task, transactions, imageMap);

        // Save output blob to IndexedDB
        await this.db.saveBlob(task.id, pdfBlob);

        // Complete task
        task.status = 'completed';
        task.progress = 100;
        task.completedAt = new Date().toISOString();
        task.durationMs = Date.now() - startTime;
        task.message = 'PDF saved to local storage!';
        await this.db.saveTask(task);
        this.notifyListeners();

        // Visual / Audio feedback
        vibrateFeedback(80);
        
        // Auto-trigger browser download
        this.triggerDownload(task.fileName, pdfBlob);

        // Notify
        this.showJobNotification(task);

      } else if (taskType === 'excel') {
        task.progress = 15;
        task.message = 'Retrieving transactions payload...';
        await this.db.saveTask(task);
        this.notifyListeners();

        const transactions = await this.db.getPayload(task.id);
        if (!transactions || transactions.length === 0) {
          throw new Error('No transactions found to export.');
        }

        task.progress = 40;
        task.message = 'Building columns and mapping entries...';
        await this.db.saveTask(task);
        this.notifyListeners();

        let currentPage = 1;
        const transactionPageMap = new Map<string, string>();
        const transactionsWithImages = transactions.filter(t => t.images && t.images.length > 0);
        for (const t of transactionsWithImages) {
          const layout = t.imageLayout || 'split';
          const imageCount = t.images?.length || 0;
          const pagesUsed = layout === 'merge' ? Math.ceil(imageCount / 2) : imageCount;
          
          if (pagesUsed === 1) {
            transactionPageMap.set(t.id, `Refer Page Number ${currentPage}`);
          } else {
            transactionPageMap.set(t.id, `Refer Page Number ${currentPage} to ${currentPage + pagesUsed - 1}`);
          }
          
          currentPage += pagesUsed;
        }

        const data = transactions.map(t => ({
          Date: safeFormatDate(t.date),
          Details: t.description,
          Category: t.category,
          Mode: t.mode,
          'Cash In': t.type === 'in' ? t.amount : 0,
          'Cash Out': t.type === 'out' ? t.amount : 0,
          'Reference': transactionPageMap.get(t.id) || '-'
        }));

        task.progress = 70;
        task.message = 'Computing formulas, balances and sheet summary...';
        await this.db.saveTask(task);
        this.notifyListeners();

        const totalIn = transactions.filter(t => t.type === 'in').reduce((sum, t) => sum + (t.amount || 0), 0);
        const totalOut = transactions.filter(t => t.type === 'out').reduce((sum, t) => sum + (t.amount || 0), 0);
        const balance = totalIn - totalOut;

        const ws = XLSX.utils.json_to_sheet(data);
        
        // Add summary rows
        XLSX.utils.sheet_add_aoa(ws, [
          [],
          ['', '', '', '', totalIn, totalOut],
          ['', '', '', '', balance]
        ], { origin: -1 });

        // Update summary labels to align with the new column structure
        const lastRow = XLSX.utils.decode_range(ws['!ref'] || 'A1').e.r;
        ws[XLSX.utils.encode_cell({ r: lastRow - 1, c: 3 })] = { v: 'TOTAL', t: 's' };
        ws[XLSX.utils.encode_cell({ r: lastRow, c: 3 })] = { v: 'BALANCE', t: 's' };

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Transactions");

        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const excelBlob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        // Save output blob to IndexedDB
        await this.db.saveBlob(task.id, excelBlob);

        task.status = 'completed';
        task.progress = 100;
        task.completedAt = new Date().toISOString();
        task.durationMs = Date.now() - startTime;
        task.message = 'Excel saved to local storage!';
        await this.db.saveTask(task);
        this.notifyListeners();

        vibrateFeedback(80);
        this.triggerDownload(task.fileName, excelBlob);

        // Notify
        this.showJobNotification(task);

      } else if (taskType === 'ai') {
        const files = await this.db.getPayload(task.id);
        if (!files || files.length === 0) {
          throw new Error('No files provided.');
        }

        task.attachmentsCount = files.length;
        task.aiUploadedCount = 0;
        task.aiProcessedCount = 0;
        task.aiSuccessCount = 0;
        task.aiFailedCount = 0;
        task.networkState = this.networkState;
        task.message = `0 / ${files.length} Completed`;
        await this.db.saveTask(task);
        this.notifyListeners();

        // Offline recovery: retrieve any partial progress
        const resultsPayload = await this.db.getPayload(task.id + '_partial_results').catch(() => null) || [];
        const results: any[] = Array.isArray(resultsPayload) ? resultsPayload : [];
        const startIndex = task.aiCurrentIndex || 0;
        task.aiProcessedCount = startIndex;
        task.aiUploadedCount = startIndex;
        task.aiSuccessCount = results.length;

        const cloudinaryFolder = await getUserCloudinaryFolder();
        const customKey = localStorage.getItem('GEMINI_API_KEY') || '';

        for (let i = startIndex; i < files.length; i++) {
          task.aiCurrentIndex = i;
          task.progress = Math.round((i / files.length) * 100);
          task.networkState = this.networkState;
          
          const remainingFiles = files.length - i;
          const estSec = this.networkState === 'slow' ? Math.max(1, remainingFiles * 15) : Math.max(1, remainingFiles * 6);
          task.aiTimeRemaining = `${estSec} sec`;
          
          await this.db.saveTask(task);
          this.notifyListeners();

          const file = files[i];

          const updateStep = async (stepId: string, customMessage?: string) => {
            const stepMapping: { [key: string]: { message: string, completed: string[] } } = {
              'receipt_uploaded': { message: 'Uploading receipt...', completed: [] },
              'uploaded_cloud': { message: 'Uploading to TrackBook Cloud...', completed: ['receipt_uploaded'] },
              'ocr_completed': { message: 'Reading receipt...', completed: ['receipt_uploaded', 'uploaded_cloud'] },
              'merchant_detected': { message: 'Extracting merchant...', completed: ['receipt_uploaded', 'uploaded_cloud', 'ocr_completed'] },
              'amount_extracted': { message: 'Extracting amount...', completed: ['receipt_uploaded', 'uploaded_cloud', 'ocr_completed', 'merchant_detected'] },
              'date_parsed': { message: 'Detecting bill category...', completed: ['receipt_uploaded', 'uploaded_cloud', 'ocr_completed', 'merchant_detected', 'amount_extracted'] },
              'ai_verification': { message: 'Verifying with TrackBook AI...', completed: ['receipt_uploaded', 'uploaded_cloud', 'ocr_completed', 'merchant_detected', 'amount_extracted', 'date_parsed'] },
              'creating_transaction': { message: 'Creating transaction...', completed: ['receipt_uploaded', 'uploaded_cloud', 'ocr_completed', 'merchant_detected', 'amount_extracted', 'date_parsed', 'ai_verification'] },
              'transaction_saved': { message: 'Saving to ledger...', completed: ['receipt_uploaded', 'uploaded_cloud', 'ocr_completed', 'merchant_detected', 'amount_extracted', 'date_parsed', 'ai_verification', 'creating_transaction'] }
            };

            const mapping = stepMapping[stepId];
            if (mapping) {
              task.aiCurrentStepId = stepId;
              task.aiCompletedSteps = mapping.completed;
              task.message = customMessage || mapping.message;
              task.networkState = this.networkState;
              
              const rem = files.length - i;
              const est = this.networkState === 'slow' ? Math.max(1, rem * 15) : Math.max(1, rem * 6);
              task.aiTimeRemaining = `${est} sec`;
              
              await this.db.saveTask(task);
              this.notifyListeners();
            }
          };

          try {
            // Keep looping while offline
            while (!navigator.onLine || this.networkState === 'offline') {
              task.message = "Connection Lost. Waiting to reconnect...";
              task.aiTimeRemaining = "Waiting to reconnect...";
              task.networkState = 'offline';
              await this.db.saveTask(task);
              this.notifyListeners();
              await new Promise(r => setTimeout(r, 2000));
            }

            // Step 1: Uploading Receipt...
            await updateStep('receipt_uploaded');
            await new Promise(r => setTimeout(r, 400));

            // Step 2: Uploading to TrackBook Cloud...
            await updateStep('uploaded_cloud');
            let cloudinaryUrl = '';
            let uploadSuccess = false;
            while (!uploadSuccess) {
              while (!navigator.onLine || this.networkState === 'offline') {
                task.message = "Connection Lost. Waiting to reconnect...";
                task.aiTimeRemaining = "Waiting to reconnect...";
                task.networkState = 'offline';
                await this.db.saveTask(task);
                this.notifyListeners();
                await new Promise(r => setTimeout(r, 2000));
              }

              try {
                task.aiUploadedCount = i + 1;
                const startTimeUpload = Date.now();
                cloudinaryUrl = await uploadToCloudinary(file, cloudinaryFolder);
                const uploadDuration = Date.now() - startTimeUpload;
                this.recordLatency(uploadDuration);
                uploadSuccess = true;
              } catch (err) {
                console.error('[Background AI] Cloudinary upload failed:', err);
                if (!navigator.onLine || (this.networkState as string) === 'offline') {
                  this.networkState = 'offline';
                  await new Promise(r => setTimeout(r, 2000));
                } else {
                  break;
                }
              }
            }

            // Step 3: Reading Receipt (OCR)...
            await updateStep('ocr_completed');
            let ocrResult = null;
            let ocrSuccess = false;
            while (!ocrSuccess) {
              while (!navigator.onLine || this.networkState === 'offline') {
                task.message = "Connection Lost. Waiting to reconnect...";
                task.aiTimeRemaining = "Waiting to reconnect...";
                task.networkState = 'offline';
                await this.db.saveTask(task);
                this.notifyListeners();
                await new Promise(r => setTimeout(r, 2000));
              }

              try {
                const startTimeOcr = Date.now();
                ocrResult = await processAndOcrImage(file, () => {});
                const ocrDuration = Date.now() - startTimeOcr;
                this.recordLatency(ocrDuration);
                if (!ocrResult) {
                  throw new Error('OCR failed');
                }
                ocrSuccess = true;
              } catch (err) {
                console.error('[Background AI] OCR failed:', err);
                if (!navigator.onLine || (this.networkState as string) === 'offline') {
                  this.networkState = 'offline';
                  await new Promise(r => setTimeout(r, 2000));
                } else {
                  break;
                }
              }
            }

            // Step 4: Extracting merchant (Starting AI)...
            await updateStep('merchant_detected');
            let result = null;
            let aiSuccess = false;
            while (!aiSuccess) {
              while (!navigator.onLine || this.networkState === 'offline') {
                task.message = "Connection Lost. Waiting to reconnect...";
                task.aiTimeRemaining = "Waiting to reconnect...";
                task.networkState = 'offline';
                await this.db.saveTask(task);
                this.notifyListeners();
                await new Promise(r => setTimeout(r, 2000));
              }

              try {
                const startTimeAi = Date.now();
                const response = await fetch('/api/gemini/parse-receipt', {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    ...(customKey ? { 'x-gemini-api-key': customKey } : {})
                  },
                  body: JSON.stringify({
                    base64Image: ocrResult ? ocrResult.base64 : '',
                    mimeType: file.type || 'image/jpeg',
                    groupSize: task.groupSize || 1,
                    isHandwritten: !!task.isHandwritten,
                    handwrittenTime: task.handwrittenTime || '12:00 PM',
                    handwrittenIsFood: !!task.handwrittenIsFood,
                    customApiKey: customKey,
                    ocrText: ocrResult ? ocrResult.text : '',
                    ocrConfidence: ocrResult ? ocrResult.confidence : 100
                  })
                });

                const aiDuration = Date.now() - startTimeAi;
                this.recordLatency(aiDuration);

                if (!response.ok) {
                  throw new Error('Gemini parse failed');
                }

                result = await response.json();
                aiSuccess = true;
              } catch (err) {
                console.error('[Background AI] Gemini parse failed:', err);
                if (!navigator.onLine || (this.networkState as string) === 'offline') {
                  this.networkState = 'offline';
                  await new Promise(r => setTimeout(r, 2000));
                } else {
                  break;
                }
              }
            }

            if (result) {
              // Stagger remaining steps for a premium SaaS UX experience
              await updateStep('amount_extracted');
              await new Promise(r => setTimeout(r, 450));

              await updateStep('date_parsed');
              await new Promise(r => setTimeout(r, 450));

              await updateStep('ai_verification');
              await new Promise(r => setTimeout(r, 450));

              await updateStep('creating_transaction');
              await new Promise(r => setTimeout(r, 450));

              await updateStep('transaction_saved');
              await new Promise(r => setTimeout(r, 450));

              results.push({
                file,
                result: {
                  ...result,
                  amount: parseFloat(result.amount) || 0,
                  merchant: result.merchant || 'Unknown Vendor',
                  billType: result.billType || 'Food',
                  category: result.category || 'Food',
                  date: result.date || '27-05-2026',
                  time: result.time || '12:00 PM',
                  mealType: result.mealType || '',
                  description: result.description || 'Food Expense',
                  ocr_confidence: ocrResult ? ocrResult.confidence : 100,
                  ocr_duration_ms: ocrResult ? ocrResult.ocr_duration_ms : 0,
                  cloudinaryUrl
                }
              });

              task.aiSuccessCount = (task.aiSuccessCount || 0) + 1;
              // Offline persistence of intermediate progress
              await this.db.savePayload(task.id + '_partial_results', results);
            } else {
              task.aiFailedCount = (task.aiFailedCount || 0) + 1;
            }

          } catch (err) {
            console.error('[Background AI] failed file:', file.name, err);
            task.aiFailedCount = (task.aiFailedCount || 0) + 1;
          }

          task.aiProcessedCount = (task.aiProcessedCount || 0) + 1;
          task.progress = Math.round(((i + 1) / files.length) * 100);
          await this.db.saveTask(task);
          this.notifyListeners();
        }

        // Save AI results to payload table
        await this.db.savePayload(task.id + '_results', results);
        try {
          // Clear intermediate recovery payload
          await this.db.deleteTask(task.id + '_partial_results');
        } catch (e) {}

        task.status = 'completed';
        task.progress = 100;
        task.completedAt = new Date().toISOString();
        task.durationMs = Date.now() - startTime;
        task.message = 'Receipt imported successfully.';
        await this.db.saveTask(task);
        this.notifyListeners();

        vibrateFeedback(80);
        this.showJobNotification(task);
      }

    } catch (err: any) {
      console.error('[ExportManager] task failure:', err);
      task.status = 'failed';
      task.error = err.message || 'Document architecture failed';
      task.message = 'Export failed: ' + (err.message || 'Process error');
      task.progress = 100;
      await this.db.saveTask(task);
      this.notifyListeners();
      vibrateFeedback([50, 50, 50]);
    }
  }

  // Web Worker execution engine
  private downloadImagesInWorker(task: ExportTask, urls: string[]): Promise<{ [url: string]: string }> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.worker) {
          const blob = new Blob([workerBlobCode], { type: 'application/javascript' });
          this.worker = new Worker(URL.createObjectURL(blob));
        }

        const isStrongCompression = task.transactionsCount >= 80;

        const onProgressMessage = async (e: MessageEvent) => {
          const { type, taskId, progress, message, results } = e.data;
          if (taskId !== task.id) return;

          if (type === 'progress') {
            task.progress = progress;
            task.message = message;
            await this.db.saveTask(task);
            this.notifyListeners();
          } else if (type === 'complete') {
            // Clean up listener
            this.worker!.removeEventListener('message', onProgressMessage);
            
            // Convert ArrayBuffers back to Object URLs in main thread
            const resolvedMap: { [url: string]: string } = {};
            for (const [url, data] of Object.entries(results as any)) {
              if (typeof data === 'string') {
                resolvedMap[url] = data; // Data URL or base64
              } else if (data && (data as any).buffer) {
                const blob = new Blob([(data as any).buffer], { type: (data as any).type });
                resolvedMap[url] = URL.createObjectURL(blob);
              } else {
                resolvedMap[url] = url; // Fallback to rawUrl
              }
            }
            resolve(resolvedMap);
          }
        };

        this.worker.addEventListener('message', onProgressMessage);
        
        // Post assets payload to worker
        this.worker.postMessage({
          taskId: task.id,
          urls,
          isCompressed: task.isCompressed,
          isStrongCompression,
          cloudName: this.cloudName
        });

      } catch (err) {
        reject(err);
      }
    });
  }

  // Pure jsPDF assembler
  private async generatePdfBlob(task: ExportTask, transactions: any[], imageMap: { [url: string]: string }): Promise<Blob> {
    const isStrongCompression = task.transactionsCount >= 80;
    const doc = new jsPDF({ compress: true });
    
    const transactionsWithImages = transactions.filter(t => t.images && t.images.length > 0);
    const totalImages = transactionsWithImages.reduce((acc, t) => acc + (t.images?.length || 0), 0);
    
    // Canvas helper to add optimized image to doc
    const addOptimizedImageToDoc = (
      pdfDoc: jsPDF,
      src: string,
      alias: string,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      let format = 'JPEG';
      let payload: string | HTMLImageElement = src;
      if (src.startsWith('data:image/png')) format = 'PNG';
      else if (src.startsWith('data:image/webp')) format = 'WEBP';
      
      if (typeof src === 'string' && src.includes('base64,')) {
        payload = src.split('base64,')[1];
      }
      pdfDoc.addImage(payload, format as any, x, y, w, h, alias, 'FAST');
    };

    if (transactionsWithImages.length > 0) {
      let processedImages = 0;
      let isFirstPage = true;

      for (const t of transactionsWithImages) {
        // cooperative yielding
        await new Promise(r => setTimeout(r, 10));

        if (t.images) {
          const layout = t.imageLayout || 'split';
          
          if (layout === 'merge') {
            for (let i = 0; i < t.images.length; i += 2) {
              await new Promise(r => setTimeout(r, 10));

              if (!isFirstPage) doc.addPage();
              isFirstPage = false;

              const pageWidth = doc.internal.pageSize.getWidth();
              const pageHeight = doc.internal.pageSize.getHeight();
              const margin = 10;
              const gap = 5;
              const availableWidth = pageWidth - (margin * 2) - gap;
              const imgWidth = availableWidth / 2;
              
              const safeTop = 16;
              const safeBottom = pageHeight - 25;
              const availableHeight = safeBottom - safeTop;
              const imgHeight = Math.min(pageHeight * 0.55, availableHeight);
              const y = safeTop + (availableHeight - imgHeight) / 2;

              // Add header text
              doc.setFontSize(10);
              doc.setTextColor(80);
              doc.text(`Transaction: ${t.description} (${t.amount}) - ${safeFormatDate(t.date)}`, 10, 10);

              // 1st image
              try {
                const rawImg1 = t.images[i];
                const resolvedSrc = imageMap[rawImg1] || rawImg1;
                addOptimizedImageToDoc(doc, resolvedSrc, rawImg1, margin, y, imgWidth, imgHeight);
              } catch (e) {
                console.error('[ExportManager] jsPDF addImage error:', e);
              }
              processedImages++;
              
              task.progress = Math.min(96, Math.round(88 + (processedImages / totalImages) * 8));
              task.message = `Rendering attachment image ${processedImages}/${totalImages}...`;
              await this.db.saveTask(task);
              this.notifyListeners();

              // 2nd image
              if (i + 1 < t.images.length) {
                try {
                  const rawImg2 = t.images[i + 1];
                  const resolvedSrc2 = imageMap[rawImg2] || rawImg2;
                  addOptimizedImageToDoc(doc, resolvedSrc2, rawImg2, margin + imgWidth + gap, y, imgWidth, imgHeight);
                } catch (e) {
                  console.error('[ExportManager] jsPDF addImage error:', e);
                }
                processedImages++;

                task.progress = Math.min(96, Math.round(88 + (processedImages / totalImages) * 8));
                task.message = `Rendering attachment image ${processedImages}/${totalImages}...`;
                await this.db.saveTask(task);
                this.notifyListeners();
              }
            }
          } else {
            // Split layout
            for (const img of t.images) {
              await new Promise(r => setTimeout(r, 10));

              try {
                if (!isFirstPage) doc.addPage();
                isFirstPage = false;

                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                
                // Centered, tall and slim layout
                const safeTop = 16;
                const safeBottom = pageHeight - 25;
                const availableHeight = safeBottom - safeTop;
                
                const imgWidth = pageWidth * 0.62;
                const imgHeight = Math.min(pageHeight * 0.70, availableHeight);
                const x = (pageWidth - imgWidth) / 2;
                const y = safeTop + (availableHeight - imgHeight) / 2;

                doc.setFontSize(10);
                doc.setTextColor(80);
                doc.text(`Transaction: ${t.description} (${t.amount}) - ${safeFormatDate(t.date)}`, 10, 10);

                const resolvedSrc = imageMap[img] || img;
                addOptimizedImageToDoc(doc, resolvedSrc, img, x, y, imgWidth, imgHeight);
              } catch (e) {
                console.error('[ExportManager] jsPDF addImage error:', e);
              }
              processedImages++;

              task.progress = Math.min(96, Math.round(88 + (processedImages / totalImages) * 8));
              task.message = `Rendering attachment image ${processedImages}/${totalImages}...`;
              await this.db.saveTask(task);
              this.notifyListeners();
            }
          }
        }
      }
    } else {
      doc.setFontSize(12);
      doc.text("No attachments found in this book report.", 14, 20);
      await new Promise(r => setTimeout(r, 100));
    }

    // Add page numbers and branding footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      addPdfBrandingFooter(doc, i, totalPages, task.cashbookName);
    }

    task.progress = 98;
    task.message = 'Completing background compression...';
    await this.db.saveTask(task);
    this.notifyListeners();

    return doc.output('blob');
  }

  // Load completed AI scan results
  async getAiScanResults(taskId: string): Promise<any[]> {
    const results = await this.db.getPayload(taskId + '_results');
    return results || [];
  }

  // Trigger web storage download on click
  triggerDownload(fileName: string, blob: Blob) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Download a previously completed report
  async downloadCompletedReport(taskId: string) {
    try {
      const task = this.tasks.find(t => t.id === taskId);
      if (!task) return;
      
      const blob = await this.db.getBlob(taskId);
      if (blob) {
        this.triggerDownload(task.fileName, blob);
        vibrateFeedback(40);
      } else {
        alert('File not found in local db. Please run a retry.');
      }
    } catch (err) {
      console.error(err);
      alert('Error loading file from DB');
    }
  }

  // Retry failed downloads
  async retryTask(taskId: string) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.status = 'pending';
    task.progress = 0;
    task.message = 'Retrying background process...';
    task.error = undefined;
    await this.db.saveTask(task);
    this.notifyListeners();

    this.processQueue();
  }

  // Wipe completed/failed logs or clear active item
  async deleteReportTask(taskId: string) {
    await this.db.deleteTask(taskId);
    this.tasks = this.tasks.filter(t => t.id !== taskId);
    this.notifyListeners();
    vibrateFeedback(30);
  }
}

// Global Singleton Export instance
export const backgroundExportManager = new BackgroundExportManager();

// Helper utils
function vibrateFeedback(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {}
  }
}

function safeFormatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch (e) {
    return dateStr;
  }
}
