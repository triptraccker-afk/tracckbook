import { supabase } from '../lib/supabase';

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

export class TrackBookOfflineDB {
  async init() {
    return true;
  }
  async getCashbooks(): Promise<any[]> {
    return [];
  }
  async getEntries(cashbookId: string): Promise<any[]> {
    return [];
  }
  async getEntry(id: string): Promise<any | null> {
    return null;
  }
  async saveEntry(entry: any) {
    return true;
  }
  async saveLocalImage(id: string, base64: string, type: string) {
    return true;
  }
  async saveQueueItem(item: any) {
    return true;
  }
  async getQueueItems(): Promise<any[]> {
    return [];
  }
  async deleteEntry(id: string) {
    return true;
  }
  async deleteCashbook(id: string) {
    return true;
  }
  async deleteLocalImage(id: string) {
    return true;
  }
  async getLocalImage(id: string): Promise<any | null> {
    return null;
  }
  async clearAllData() {
    return true;
  }
}

export class NetworkMonitor {
  public state: NetworkState = 'good';
  private listeners: ((state: NetworkState) => void)[] = [];

  subscribe(listener: (state: NetworkState) => void) {
    this.listeners.push(listener);
    // Immediately trigger with 'good'
    listener('good');
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
}

export class BackgroundSyncManager {
  public db = new TrackBookOfflineDB();
  public network = new NetworkMonitor();
  private listeners: (() => void)[] = [];
  private toastListeners: ((msg: string, type: 'success' | 'info' | 'error') => void)[] = [];

  constructor() {
    this.init();
  }

  async init() {
    return true;
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

  getQueueList(): SyncQueueItem[] {
    return [];
  }

  getPendingCount(): number {
    return 0;
  }

  async enqueue(
    type: SyncQueueItem['type'],
    payload: any,
    priority: SyncQueueItem['priority'] = 'normal'
  ): Promise<SyncQueueItem> {
    return {
      id: `queue-${Date.now()}`,
      type,
      status: 'completed',
      priority,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      payload
    };
  }

  triggerSync() {}

  async revalidate(userId: string) {
    return true;
  }
}

export const syncManager = new BackgroundSyncManager();
export const offlineDb = syncManager.db;
