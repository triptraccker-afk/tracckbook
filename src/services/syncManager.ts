import { supabase } from '../lib/supabase';
import { uploadToCloudinary, getUserCloudinaryFolder } from './cloudinary';

export type NetworkState = 'good' | 'slow' | 'offline';

export interface SyncQueueItem {
  id: string;
  type: 'CREATE_ENTRY' | 'UPDATE_ENTRY' | 'DELETE_ENTRY' | 'UPLOAD_IMAGE' | 'AI_SCAN' | 'PDF_EXPORT' | 'EXCEL_EXPORT' | 'CREATE_CASHBOOK' | 'UPDATE_CASHBOOK' | 'DELETE_CASHBOOK';
  status: 'pending' | 'uploading' | 'scanning' | 'syncing' | 'completed' | 'failed' | 'paused' | 'waiting_for_internet';
  priority: 'high' | 'normal' | 'low';
  retryCount: number;
  createdAt: string;
  payload: any;
  error?: string;
}

export interface CachedEntry {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  description: string;
  category: string;
  mode: string;
  date: string;
  image_layout?: 'split' | 'merge';
  cashbook_id: string;
  user_id: string;
  imported_from_share_code?: string;
  is_imported?: boolean;
  import_batch_id?: string;
  images?: string[];
  isAi?: boolean;
  source?: string;
  sync_status: 'pending' | 'uploading' | 'synced' | 'failed' | 'offline';
}

export interface CachedCashbook {
  id: string;
  name: string;
  created_at: string;
  user_id: string;
  sync_status?: 'pending' | 'synced' | 'failed';
}

// 1. IndexedDB Wrapper for Offline Storage
export class TrackBookOfflineDB {
  private dbName = 'TrackBookOfflineDB';
  private dbVersion = 2;
  private db: IDBDatabase | null = null;

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
        
        if (!db.objectStoreNames.contains('cashbooks')) {
          db.createObjectStore('cashbooks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('entries')) {
          db.createObjectStore('entries', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('local_images')) {
          db.createObjectStore('local_images', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          db.createObjectStore('sync_queue', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
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

  // --- Cashbooks store operations ---
  async saveCashbook(cb: CachedCashbook): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['cashbooks'], 'readwrite');
      const store = tx.objectStore('cashbooks');
      const request = store.put(cb);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(tx.error);
    });
  }

  async saveCashbooks(cbs: CachedCashbook[]): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['cashbooks'], 'readwrite');
      const store = tx.objectStore('cashbooks');
      for (const cb of cbs) {
        store.put(cb);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getCashbooks(): Promise<CachedCashbook[]> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['cashbooks'], 'readonly');
      const store = tx.objectStore('cashbooks');
      const request = store.getAll();
      request.onsuccess = () => {
        const list = request.result || [];
        console.log(`[OfflineDB] IndexedDB Read: Read ${list.length} cashbooks`);
        resolve(list);
      };
      request.onerror = () => reject(tx.error);
    });
  }

  async deleteCashbook(id: string): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['cashbooks', 'entries'], 'readwrite');
      tx.objectStore('cashbooks').delete(id);
      
      // Also delete local entries belonging to this cashbook
      const entryStore = tx.objectStore('entries');
      const req = entryStore.getAll();
      req.onsuccess = () => {
        const entries = req.result || [];
        entries.forEach((e: CachedEntry) => {
          if (e.cashbook_id === id) {
            entryStore.delete(e.id);
          }
        });
      };
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Entries store operations ---
  async saveEntry(entry: CachedEntry): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['entries'], 'readwrite');
      const store = tx.objectStore('entries');
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(tx.error);
    });
  }

  async saveEntries(entries: CachedEntry[]): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['entries'], 'readwrite');
      const store = tx.objectStore('entries');
      for (const e of entries) {
        store.put(e);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getEntries(cashbookId?: string): Promise<CachedEntry[]> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['entries'], 'readonly');
      const store = tx.objectStore('entries');
      const request = store.getAll();
      request.onsuccess = () => {
        const list = request.result || [];
        if (cashbookId) {
          const filtered = list.filter((e: CachedEntry) => e.cashbook_id === cashbookId);
          console.log(`[OfflineDB] IndexedDB Read: Read ${filtered.length} entries for cashbook ${cashbookId}`);
          resolve(filtered);
        } else {
          console.log(`[OfflineDB] IndexedDB Read: Read ${list.length} total entries`);
          resolve(list);
        }
      };
      request.onerror = () => reject(tx.error);
    });
  }

  async getEntry(id: string): Promise<CachedEntry | null> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['entries'], 'readonly');
      const store = tx.objectStore('entries');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(tx.error);
    });
  }

  async deleteEntry(id: string): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['entries', 'local_images'], 'readwrite');
      tx.objectStore('entries').delete(id);
      tx.objectStore('local_images').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Local Images operations ---
  async saveLocalImage(id: string, fileData: Blob | string, mimeType: string): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['local_images'], 'readwrite');
      const store = tx.objectStore('local_images');
      const request = store.put({ id, data: fileData, mimeType });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(tx.error);
    });
  }

  async getLocalImage(id: string): Promise<{ data: Blob | string; mimeType: string } | null> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['local_images'], 'readonly');
      const store = tx.objectStore('local_images');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(tx.error);
    });
  }

  async deleteLocalImage(id: string): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['local_images'], 'readwrite');
      tx.objectStore('local_images').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Sync Queue operations ---
  async saveQueueItem(item: SyncQueueItem): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['sync_queue'], 'readwrite');
      const store = tx.objectStore('sync_queue');
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(tx.error);
    });
  }

  async getQueueItems(): Promise<SyncQueueItem[]> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['sync_queue'], 'readonly');
      const store = tx.objectStore('sync_queue');
      const request = store.getAll();
      request.onsuccess = () => {
        const list = request.result || [];
        list.sort((a: SyncQueueItem, b: SyncQueueItem) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        resolve(list);
      };
      request.onerror = () => reject(tx.error);
    });
  }

  async deleteQueueItem(id: string): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['sync_queue'], 'readwrite');
      tx.objectStore('sync_queue').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Settings / Preferences operations ---
  async saveSetting(key: string, value: any): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['settings'], 'readwrite');
      const store = tx.objectStore('settings');
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(tx.error);
    });
  }

  async getSetting(key: string): Promise<any | null> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['settings'], 'readonly');
      const store = tx.objectStore('settings');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => reject(tx.error);
    });
  }

  async clearAllData(): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['cashbooks', 'entries', 'local_images', 'sync_queue', 'settings'], 'readwrite');
      tx.objectStore('cashbooks').clear();
      tx.objectStore('entries').clear();
      tx.objectStore('local_images').clear();
      tx.objectStore('sync_queue').clear();
      tx.objectStore('settings').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

// 2. Network Quality Monitor
export class NetworkMonitor {
  private listeners: ((state: NetworkState, details?: any) => void)[] = [];
  public state: NetworkState = 'good';
  public uploadLatencyMs: number = 0;
  public apiLatencyMs: number = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[NetworkMonitor] Online Event: Browser went online. Re-evaluating network and triggering sync...');
        this.evaluate();
      });
      window.addEventListener('offline', () => this.evaluate());
      
      // Periodically evaluate network quality
      setInterval(() => this.evaluate(), 15000);
      this.evaluate();
    }
  }

  subscribe(callback: (state: NetworkState, details?: any) => void) {
    this.listeners.push(callback);
    callback(this.state, { uploadLatency: this.uploadLatencyMs, apiLatency: this.apiLatencyMs });
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private trigger() {
    this.listeners.forEach(l => l(this.state, {
      uploadLatency: this.uploadLatencyMs,
      apiLatency: this.apiLatencyMs
    }));
  }

  async evaluate() {
    if (typeof navigator === 'undefined') return;

    if (!navigator.onLine) {
      if (this.state !== 'offline') {
        this.state = 'offline';
        this.trigger();
      }
      return;
    }

    const start = performance.now();
    try {
      // Test latency via rapid request to health check
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 4000);
      
      const res = await fetch('/api/health', {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(id);
      
      this.apiLatencyMs = performance.now() - start;

      // Leverage connection metadata if available
      const conn = (navigator as any).connection;
      let effectiveType = conn?.effectiveType || '4g';
      
      if (this.apiLatencyMs > 1200 || effectiveType === '2g' || effectiveType === 'slow-2g') {
        this.state = 'slow';
      } else {
        this.state = 'good';
      }
    } catch (e) {
      // Failed to fetch or timed out -> consider offline or slow
      this.state = 'offline';
      this.apiLatencyMs = 9999;
    }

    this.trigger();
  }

  // Update real latency after actual operations
  updateMetrics(uploadMs: number, apiMs: number) {
    this.uploadLatencyMs = uploadMs;
    this.apiLatencyMs = apiMs;
    
    if (apiMs > 1200 || uploadMs > 3500) {
      this.state = 'slow';
    } else {
      this.state = 'good';
    }
    this.trigger();
  }
}

// 3. Centralized Background Sync Manager
export class BackgroundSyncManager {
  public db = new TrackBookOfflineDB();
  public network = new NetworkMonitor();
  private isProcessing = false;
  private queue: SyncQueueItem[] = [];
  private listeners: (() => void)[] = [];
  private toastListeners: ((msg: string, type: 'success' | 'info' | 'error') => void)[] = [];

  constructor() {
    this.init();
    
    // Subscribe to network updates
    this.network.subscribe((state) => {
      if (state !== 'offline') {
        this.triggerSync();
      }
    });
  }

  async init() {
    await this.db.init();
    await this.loadQueueFromDb();
  }

  subscribe(cb: () => void) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  subscribeToToasts(cb: (msg: string, type: 'success' | 'info' | 'error') => void) {
    this.toastListeners.push(cb);
    return () => {
      this.toastListeners = this.toastListeners.filter(l => l !== cb);
    };
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  private notifyToast(msg: string, type: 'success' | 'info' | 'error') {
    this.toastListeners.forEach(l => l(msg, type));
  }

  getQueueList() {
    return this.queue;
  }

  getPendingCount() {
    return this.queue.filter(q => q.status === 'pending' || q.status === 'uploading' || q.status === 'syncing').length;
  }

  async loadQueueFromDb() {
    this.queue = await this.db.getQueueItems();
    console.log(`[SyncEngine] Queue Restored: Loaded ${this.queue.length} items from DB`);
    this.notify();
  }

  // Add item to sync queue and trigger loop
  async enqueue(
    type: SyncQueueItem['type'],
    payload: any,
    priority: SyncQueueItem['priority'] = 'normal'
  ): Promise<SyncQueueItem> {
    const item: SyncQueueItem = {
      id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      status: 'pending',
      priority,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      payload
    };

    console.log(`[SyncEngine] Queue Created: Enqueued item ${item.type} (${item.id})`);
    this.queue.push(item);
    await this.db.saveQueueItem(item);
    this.notify();

    // Trigger sync process in background asynchronously
    this.triggerSync();
    return item;
  }

  // Trigger sync if online
  triggerSync() {
    if (this.isProcessing) return;
    if (this.network.state === 'offline') {
      console.log('[SyncEngine] Offline. Sync queued until internet is restored.');
      return;
    }
    
    this.processQueue();
  }

  // Sequential task processor
  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (true) {
        if (this.network.state === 'offline') {
          console.log('[SyncEngine] Internet connection lost during sync. Pausing queue.');
          break;
        }

        // Fetch queue items directly from DB to prevent out of sync states
        const dbItems = await this.db.getQueueItems();
        this.queue = dbItems;

        const nextItem = dbItems.find(
          item => item.status === 'pending' || item.status === 'failed' && item.retryCount < 5
        );

        if (!nextItem) {
          break;
        }

        // Process this item
        await this.syncItem(nextItem);
      }
    } finally {
      this.isProcessing = false;
      this.notify();
    }
  }

  // Sync a single queue item
  private async syncItem(item: SyncQueueItem) {
    console.log(`[SyncEngine] Supabase Sync Started for item: ${item.type} (${item.id})`);
    
    // Update status to syncing
    item.status = 'syncing';
    await this.db.saveQueueItem(item);
    this.notify();

    const startOp = performance.now();

    try {
      switch (item.type) {
        case 'CREATE_ENTRY':
          await this.executeCreateEntry(item.payload);
          break;
        case 'UPDATE_ENTRY':
          await this.executeUpdateEntry(item.payload);
          break;
        case 'DELETE_ENTRY':
          await this.executeDeleteEntry(item.payload);
          break;
        case 'CREATE_CASHBOOK':
          await this.executeCreateCashbook(item.payload);
          break;
        case 'UPDATE_CASHBOOK':
          await this.executeUpdateCashbook(item.payload);
          break;
        case 'DELETE_CASHBOOK':
          await this.executeDeleteCashbook(item.payload);
          break;
        case 'UPLOAD_IMAGE':
          await this.executeUploadImage(item.payload);
          break;
        default:
          console.warn('[SyncEngine] Unknown queue item type:', item.type);
      }

      // Mark completed
      item.status = 'completed';
      await this.db.deleteQueueItem(item.id);
      
      const latency = performance.now() - startOp;
      this.network.updateMetrics(0, latency);

      console.log(`[SyncEngine] Supabase Sync Completed for item: ${item.type} (${item.id})`);

      // Trigger a light user-friendly online toast
      const pendingCount = this.getPendingCount();
      if (pendingCount > 0) {
        this.notifyToast(`Back Online. Syncing ${pendingCount} pending items...`, 'info');
      } else {
        this.notifyToast('TrackBook Cloud Synchronized successfully', 'success');
      }

    } catch (err: any) {
      console.error(`[SyncEngine] Error syncing item ${item.id}:`, err);
      
      item.retryCount += 1;
      item.error = err?.message || 'Unknown synchronization error';

      if (item.retryCount >= 5) {
        item.status = 'failed';
        this.notifyToast(`Sync failed for "${item.type}": ${item.error}. Manual retry required.`, 'error');
      } else {
        item.status = 'pending'; // Leave pending for next retry interval
        // Determine backoff delay: 5s, 15s, 30s, 1m, 5m
        const delays = [5000, 15000, 30000, 60000, 300000];
        const delay = delays[item.retryCount - 1] || 300000;
        console.log(`[SyncEngine] Will retry item ${item.id} in ${delay / 1000} seconds (Attempt ${item.retryCount}/5)`);
        
        setTimeout(() => {
          this.triggerSync();
        }, delay);
      }

      await this.db.saveQueueItem(item);
    } finally {
      await this.loadQueueFromDb();
    }
  }

  // --- Manual queue control ---
  async retryItem(id: string) {
    const item = this.queue.find(q => q.id === id);
    if (item) {
      item.status = 'pending';
      item.retryCount = 0;
      await this.db.saveQueueItem(item);
      this.notify();
      this.triggerSync();
    }
  }

  async deleteItemFromQueue(id: string) {
    await this.db.deleteQueueItem(id);
    await this.loadQueueFromDb();
  }

  async clearCompletedTasks() {
    const items = await this.db.getQueueItems();
    for (const item of items) {
      if (item.status === 'completed') {
        await this.db.deleteQueueItem(item.id);
      }
    }
    await this.loadQueueFromDb();
  }

  // --- Implement actual sync calls ---

  private async executeCreateEntry(payload: any) {
    if (!supabase) throw new Error('Supabase client is not configured');

    const { entry, localImageId } = payload;
    let cloudUrl = '';

    // 1. If there's an offline image, upload it first to TrackBook Cloud
    if (localImageId) {
      const localImage = await this.db.getLocalImage(localImageId);
      if (localImage) {
        console.log('[SyncEngine] Uploading local image to TrackBook Cloud:', localImageId);
        
        // Get user cloud folder
        const folder = await getUserCloudinaryFolder();
        const startUpload = performance.now();
        cloudUrl = await uploadToCloudinary(localImage.data as string, `${folder}/bills`);
        const uploadLatency = performance.now() - startUpload;
        
        this.network.updateMetrics(uploadLatency, 0);

        // Delete local image since it's now archived on cloud
        await this.db.deleteLocalImage(localImageId);
      }
    }

    // 2. Prep insert entry fields
    const finalImages = cloudUrl ? [cloudUrl] : (entry.images || []);
    
    const entryPayload = {
      id: entry.id,
      amount: entry.amount,
      type: entry.type,
      description: entry.description,
      category: entry.category,
      mode: entry.mode,
      date: entry.date,
      image_layout: entry.image_layout || 'split',
      cashbook_id: entry.cashbook_id,
      user_id: entry.user_id,
      imported_from_share_code: entry.imported_from_share_code || null,
      is_imported: !!entry.is_imported,
      import_batch_id: entry.import_batch_id || null
    };

    console.log('[SyncEngine] Inserting entry to Supabase:', entry.id);
    const { error: entryError } = await supabase
      .from('entries')
      .insert([entryPayload]);

    if (entryError) {
      // If error is duplicate key, it means it already exists, so we just proceed
      if (entryError.code !== '23505') {
        throw entryError;
      }
    }

    // 3. If there is an image, link it permanently to Supabase ai_attachments or attachments
    if (finalImages.length > 0) {
      const table = entry.isAi ? 'ai_attachments' : 'attachments';
      console.log(`[SyncEngine] Linking attachment URL: ${finalImages[0]} to ${table}`);
      
      const attachmentPayload = {
        entry_id: entry.id,
        file_url: finalImages[0],
        user_id: entry.user_id
      };

      const { error: attachError } = await supabase
        .from(table)
        .insert([attachmentPayload]);

      if (attachError && attachError.code !== '23505') {
        throw attachError;
      }
    }

    // 4. Update the local entry to match synced status and cloud image URLs
    const localEntry = await this.db.getEntry(entry.id);
    if (localEntry) {
      localEntry.sync_status = 'synced';
      if (finalImages.length > 0) {
        localEntry.images = finalImages;
      }
      await this.db.saveEntry(localEntry);
    }
  }

  private async executeUpdateEntry(payload: any) {
    if (!supabase) throw new Error('Supabase client is not configured');

    const { entry } = payload;

    const entryPayload = {
      amount: entry.amount,
      type: entry.type,
      description: entry.description,
      category: entry.category,
      mode: entry.mode,
      date: entry.date,
      image_layout: entry.image_layout || 'split',
      cashbook_id: entry.cashbook_id,
      user_id: entry.user_id
    };

    console.log('[SyncEngine] Updating entry in Supabase:', entry.id);
    const { error } = await supabase
      .from('entries')
      .update(entryPayload)
      .eq('id', entry.id)
      .eq('user_id', entry.user_id);

    if (error) throw error;

    // Update local entry status to synced
    const localEntry = await this.db.getEntry(entry.id);
    if (localEntry) {
      localEntry.sync_status = 'synced';
      await this.db.saveEntry(localEntry);
    }
  }

  private async executeDeleteEntry(payload: any) {
    if (!supabase) throw new Error('Supabase client is not configured');

    const { id, user_id } = payload;

    // Delete ONLY from Supabase. DO NOT delete from Cloudinary/TrackBook Cloud!
    // The image must remain permanently archived in TrackBook Cloud.
    console.log('[SyncEngine] Deleting entry from Supabase:', id);

    // Delete attachments links first due to foreign keys
    await supabase.from('attachments').delete().eq('entry_id', id);
    await supabase.from('ai_attachments').delete().eq('entry_id', id);

    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('id', id)
      .eq('user_id', user_id);

    if (error) throw error;
  }

  private async executeCreateCashbook(payload: any) {
    if (!supabase) throw new Error('Supabase client is not configured');
    const { id, name, created_at, user_id } = payload;
    const { error } = await supabase
      .from('cashbooks')
      .insert([{ id, name, created_at, user_id }]);
    if (error && error.code !== '23505') throw error;
  }

  private async executeUpdateCashbook(payload: any) {
    if (!supabase) throw new Error('Supabase client is not configured');
    const { id, name, user_id } = payload;
    const { error } = await supabase
      .from('cashbooks')
      .update({ name })
      .eq('id', id)
      .eq('user_id', user_id);
    if (error) throw error;
  }

  private async executeDeleteCashbook(payload: any) {
    if (!supabase) throw new Error('Supabase client is not configured');
    const { id, user_id } = payload;
    const { error } = await supabase
      .from('cashbooks')
      .delete()
      .eq('id', id)
      .eq('user_id', user_id);
    if (error) throw error;
  }

  private async executeUploadImage(payload: any) {
    if (!supabase) throw new Error('Supabase client is not configured');

    const { localImageId, transactionId, user_id, isAi } = payload;
    console.log(`[SyncEngine] Image Upload Started: Processing local image ID: ${localImageId} for transaction: ${transactionId}`);

    const localImage = await this.db.getLocalImage(localImageId);
    if (!localImage) {
      console.warn(`[SyncEngine] Local image not found: ${localImageId}, skipping.`);
      return;
    }

    // 1. Upload to Cloudinary
    const folder = await getUserCloudinaryFolder({ id: user_id } as any);
    const startUpload = performance.now();
    const cloudUrl = await uploadToCloudinary(localImage.data as string, `${folder}/bills`);
    const uploadLatency = performance.now() - startUpload;
    this.network.updateMetrics(uploadLatency, 0);

    console.log(`[SyncEngine] Image Upload Completed: Uploaded to URL ${cloudUrl}`);

    // 2. Delete local image from IndexedDB
    await this.db.deleteLocalImage(localImageId);

    // 3. Save into Supabase table (attachments or ai_attachments)
    const table = isAi ? 'ai_attachments' : 'attachments';
    const attachmentPayload = {
      entry_id: transactionId,
      file_url: cloudUrl,
      user_id: user_id,
      file_name: 'offline_upload',
      file_type: 'image'
    };

    const { error: attachError } = await supabase
      .from(table)
      .insert([attachmentPayload]);

    if (attachError && attachError.code !== '23505') {
      throw attachError;
    }

    // 4. Update local entry images list
    const localEntry = await this.db.getEntry(transactionId);
    if (localEntry) {
      const existingImages = localEntry.images || [];
      const updatedImages = existingImages.map(img => (img === localImageId || img.startsWith('blob:') || img.startsWith('data:')) ? cloudUrl : img);
      if (!updatedImages.includes(cloudUrl)) {
        updatedImages.push(cloudUrl);
      }
      localEntry.images = updatedImages;
      localEntry.sync_status = 'synced';
      await this.db.saveEntry(localEntry);
    }
  }

  async revalidate(userId: string) {
    if (this.network.state === 'offline') return;
    if (!supabase) return;

    try {
      console.log('[SyncEngine] Supabase Sync Started: Fetching latest cashbooks from cloud...');
      const { data: cashbooks, error: cbErr } = await supabase
        .from('cashbooks')
        .select('id, name, created_at, user_id')
        .eq('user_id', userId);

      if (cbErr) throw cbErr;

      if (cashbooks && cashbooks.length > 0) {
        const cachedCbs: CachedCashbook[] = cashbooks.map(cb => ({
          id: cb.id,
          name: cb.name,
          created_at: cb.created_at,
          user_id: cb.user_id,
          sync_status: 'synced'
        }));
        await this.db.saveCashbooks(cachedCbs);

        for (const cb of cashbooks) {
          const { data: entries, error: entErr } = await supabase
            .from('entries')
            .select('id, amount, type, description, category, mode, date, image_layout, cashbook_id, user_id, imported_from_share_code, is_imported, import_batch_id')
            .eq('cashbook_id', cb.id)
            .eq('user_id', userId)
            .order('date', { ascending: false });

          if (!entErr && entries) {
            const cachedEntries: CachedEntry[] = entries.map(e => ({
              id: e.id,
              amount: e.amount,
              type: e.type,
              description: e.description,
              category: e.category,
              mode: e.mode,
              date: e.date,
              image_layout: e.image_layout,
              cashbook_id: e.cashbook_id,
              user_id: e.user_id,
              imported_from_share_code: e.imported_from_share_code,
              is_imported: e.is_imported,
              import_batch_id: e.import_batch_id,
              sync_status: 'synced'
            }));

            const existingEntries = await this.db.getEntries(cb.id);
            const existingMap = new Map(existingEntries.map(e => [e.id, e]));

            for (const ce of cachedEntries) {
              const prev = existingMap.get(ce.id);
              if (prev && prev.images) {
                ce.images = prev.images;
              }
            }

            await this.db.saveEntries(cachedEntries);
          }
        }
      }
      console.log('[SyncEngine] Supabase Sync Completed: Cloud data synced to IndexedDB.');
      this.notify();
    } catch (err) {
      console.error('[SyncEngine] Background revalidation failed:', err);
    }
  }
}

// Global singletons
export const syncManager = new BackgroundSyncManager();
export const offlineDb = syncManager.db;
