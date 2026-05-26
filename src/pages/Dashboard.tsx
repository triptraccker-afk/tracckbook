/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Minus, 
  Upload, 
  Wallet, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  History, 
  BookOpen, 
  Loader2,
  X,
  Image as ImageIcon,
  Search,
  User,
  Settings,
  LogOut,
  LayoutGrid,
  List,
  Download,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Check,
  CheckSquare,
  Sparkles,
  Square,
  Trash,
  Share,
  Copy,
  ChevronDown,
  ArrowLeft,
  Pencil,
  Trash2,
  ArrowRight,
  FileText,
  Paperclip,
  ChevronLeft,
  ChevronRight,
  DownloadCloud,
  FileSpreadsheet,
  AlertCircle,
  HelpCircle,
  MessageSquare,
  Sun,
  Moon,
  Palette,
  ArrowUp,
  ArrowUpDown,
  MoreVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { cn, formatCurrency, vibrate } from '../lib/utils';
import { parseReceipt, parseMultipleReceipts, getApiKey } from '../services/gemini';
import { supabase } from '../lib/supabase';
import { uploadToCloudinary, getOptimizedCloudinaryUrl, getExportOptimizedCloudinaryUrl } from '../services/cloudinary';
import imageCompression from 'browser-image-compression';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { backgroundExportManager } from '../services/exportManager';
import DownloadCenter, { DownloadCenterTrigger } from '../components/DownloadCenter';

interface Transaction {
  id: string;
  amount: number;
  type: 'in' | 'out';
  description: string;
  category: string;
  mode: string;
  date: Date;
  images?: string[];
  imageLayout?: 'split' | 'merge';
  isAi?: boolean;
}

interface Cashbook {
  id: string;
  name: string;
  transactions: Transaction[];
  createdAt: Date;
}

function safeFormatDate(dateVal: any, options?: Intl.DateTimeFormatOptions, locales: string = 'en-IN'): string {
  if (!dateVal) return 'N/A';
  try {
    const d = typeof dateVal === 'string' || typeof dateVal === 'number' ? new Date(dateVal) : dateVal;
    if (d instanceof Date && !isNaN(d.getTime())) {
      return d.toLocaleDateString(locales, options);
    }
  } catch (e) {
    console.error(e);
  }
  return 'N/A';
}

function safeFormatTime(dateVal: any, options?: Intl.DateTimeFormatOptions, locales: string = 'en-IN'): string {
  if (!dateVal) return 'N/A';
  try {
    const d = typeof dateVal === 'string' || typeof dateVal === 'number' ? new Date(dateVal) : dateVal;
    if (d instanceof Date && !isNaN(d.getTime())) {
      return d.toLocaleTimeString(locales, options);
    }
  } catch (e) {
    console.error(e);
  }
  return 'N/A';
}

// Compress image before client-side direct upload using browser-image-compression
async function compressImage(file: File): Promise<Blob | File> {
  const sizeKB = file.size / 1024;
  if (file.size < 150 * 1024) {
    console.log(`[Compression] Image ${file.name} is ${sizeKB.toFixed(1)} KB (below 150 KB threshold). Skipping compression.`);
    return file;
  }

  const options = {
    maxSizeMB: 0.4,
    maxWidthOrHeight: 1400,
    useWebWorker: true
  };

  try {
    console.log(`[Compression] Compressing ${file.name} (${sizeKB.toFixed(1)} KB) automatically...`);
    const compressedBlob = await imageCompression(file, options);
    console.log(`[Compression] Success: Compressed to ${(compressedBlob.size / 1024).toFixed(1)} KB`);
    return compressedBlob;
  } catch (err) {
    console.error('[Compression] browser-image-compression failed, falling back to original file:', err);
    return file;
  }
}

// Generate lightweight thumbnail URL for Cloudinary images (w_200,q_auto,f_auto)
function getCloudinaryThumbnail(url: string): string {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('blob:')) return url; // Let blob URLs render directly
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
    if (!url.includes('/w_200')) {
      return url.replace('/upload/', '/upload/w_200,q_auto,f_auto/');
    }
  }
  return url;
}

// Ensure base64 string never lands in custom Supabase columns/attachments tables
async function validateAndResolveCloudinaryUrl(url: string, userId: string = 'anonymous'): Promise<string> {
  if (!url) return '';
  if (url.startsWith('data:')) {
    console.warn('[Validation] Base64 string detected! Uploading to Cloudinary first...');
    const folder = `trackbook/${userId}`;
    const uploadedUrl = await uploadToCloudinary(url, folder);
    return uploadedUrl;
  }
  return url;
}

// Persistent caching for cashbooks list
let cachedCashbooks: any[] | null = null;
// Persistent caching for transaction entries: cashbook_id -> Transaction[]
const entriesCache = new Map<string, any[]>();
// Persistent caching for entry fetch timers: cashbook_id -> timestamp
const lastFetchTimeCache = new Map<string, number>();
// Persistent caching for attachments (images): entry_id -> { images: string[], isAi: boolean }
const attachmentCache = new Map<string, { images: string[], isAi: boolean }>();
const revalidatedEntries = new Set<string>();
const inFlightAttachmentQueries = new Map<string, Promise<{ attachments: any[], aiAttachments: any[] }>>();

// Load from localStorage on startup under a namespace like 'trackbook_attachments_metadata_v2'
try {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const savedTimestamp = localStorage.getItem('trackbook_attachments_metadata_v2_timestamp');
  let loadedMeta = true;
  if (savedTimestamp) {
    const timestamp = parseInt(savedTimestamp, 10);
    if (!isNaN(timestamp) && (Date.now() - timestamp > SEVEN_DAYS_MS)) {
      console.log('[Cache] Clearing legacy attachments cache older than 7 days...');
      localStorage.removeItem('trackbook_attachments_metadata_v2');
      localStorage.removeItem('trackbook_attachments_metadata_v2_timestamp');
      loadedMeta = false;
    }
  }

  if (loadedMeta) {
    const savedMeta = localStorage.getItem('trackbook_attachments_metadata_v2');
    if (savedMeta) {
      const parsed = JSON.parse(savedMeta);
      Object.entries(parsed).forEach(([id, val]: [string, any]) => {
        if (val && Array.isArray(val.images)) {
          attachmentCache.set(id, { images: val.images, isAi: !!val.isAi });
        }
      });
      console.log(`[Cache] Preloaded ${attachmentCache.size} item attachment metadata keys from localStorage.`);
    }
  }
  
  if (!localStorage.getItem('trackbook_attachments_metadata_v2_timestamp')) {
    localStorage.setItem('trackbook_attachments_metadata_v2_timestamp', Date.now().toString());
  }
} catch (e) {
  console.error('[Cache] Error loading attachment cache from localStorage:', e);
}

// Helper to save attachmentCache to localStorage
function persistAttachmentCacheToStorage() {
  try {
    const obj: { [key: string]: { images: string[], isAi: boolean } } = {};
    let count = 0;
    attachmentCache.forEach((val, key) => {
      // Limit to 400 keys to avoid hitting localStorage limit of ~5MB
      if (count < 400) {
        obj[key] = val;
        count++;
      }
    });
    localStorage.setItem('trackbook_attachments_metadata_v2', JSON.stringify(obj));
  } catch (e) {
    console.error('[Cache] Error saving attachment cache to localStorage:', e);
  }
}

/**
 * Optimized, memoized, viewport-prefetching and lazy-loaded Image component
 */
const OptimizedImage = React.memo(({
  src,
  alt,
  className,
  type = 'preview',
  onClick,
  ...props
}: {
  src: string;
  alt: string;
  className?: string;
  type?: 'preview' | 'fullscreen';
  onClick?: () => void;
  [key: string]: any;
}) => {
  const [isInView, setIsInView] = React.useState(false);
  const [retryCount, setRetryCount] = React.useState(0);
  const [hasError, setHasError] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  React.useEffect(() => {
    if (!src) return;
    
    // Fallback if IntersectionObserver is not supported
    if (!('IntersectionObserver' in window)) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // Prefetch when within 200px of viewport
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [src]);

  const optimizedUrl = React.useMemo(() => {
    if (!isInView || hasError) return ''; 
    const baseUrl = getOptimizedCloudinaryUrl(src, type);
    if (!baseUrl) return '';
    if (retryCount > 0) {
      // Append a retry parameter to bypass cached load attempts that might have failed
      const sep = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${sep}retry=${retryCount}`;
    }
    return baseUrl;
  }, [src, type, isInView, retryCount, hasError]);

  const handleError = () => {
    console.warn(`[ImageLoad] Failed to load ${src}. Attempt ${retryCount}/3`);
    if (!navigator.onLine) {
      setHasError(true);
      return;
    }

    if (retryCount < 3) {
      setTimeout(() => {
        setRetryCount(prev => prev + 1);
      }, (retryCount + 1) * 1500); // 1.5s, 3s, 4.5s backoff
    } else {
      setHasError(true);
    }
  };

  // Safe offline / failed visual fallback
  if (hasError || (!src && isInView)) {
    return (
      <div 
        className={cn(
          "flex flex-col items-center justify-center bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-400 dark:text-slate-600 p-2 text-center rounded-lg min-h-[100px] select-none",
          className
        )}
        onClick={() => {
          // Allow clicks to re-attempt loader when connection resumes
          setHasError(false);
          setRetryCount(0);
          if (onClick) onClick();
        }}
      >
        <ImageIcon size={20} className="mb-1 text-slate-400 dark:text-zinc-500 opacity-60" />
        <span className="font-bold text-[9px] uppercase tracking-wider">Failed / Offline</span>
        <span className="text-[7px] text-slate-400/80 dark:text-slate-600 mt-0.5">Click to retry</span>
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      src={optimizedUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={handleError}
      onClick={onClick}
      {...props}
    />
  );
});
OptimizedImage.displayName = 'OptimizedImage';

// Per-cashbook cached computed balances map: cashbook_id -> Map<transaction_id, number>
const computedBalancesCache = new Map<string, Map<string, number>>();
// Track the transaction keys/IDs list to see if the structure matches: cashbook_id -> string signature
const computedBalancesSignatureCache = new Map<string, string>();

interface CustomVirtualResult {
  startIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
}

function useVirtualWindow({
  itemsCount,
  itemHeight,
  containerRef,
}: {
  itemsCount: number;
  itemHeight: number;
  containerRef: React.RefObject<HTMLElement | null>;
}): CustomVirtualResult {
  const [scrollY, setScrollY] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);

  useEffect(() => {
    let scrollTicked = false;
    let resizeTicked = false;

    const handleScroll = () => {
      if (!scrollTicked) {
        window.requestAnimationFrame(() => {
          setScrollY(window.scrollY);
          scrollTicked = false;
        });
        scrollTicked = true;
      }
    };

    const handleResize = () => {
      if (!resizeTicked) {
        window.requestAnimationFrame(() => {
          setViewportHeight(window.innerHeight);
          resizeTicked = false;
        });
        resizeTicked = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });

    // Initial values
    setScrollY(window.scrollY);
    setViewportHeight(window.innerHeight);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const { startIndex, endIndex, paddingTop, paddingBottom } = useMemo(() => {
    const el = containerRef.current;
    if (!el || itemsCount === 0) {
      return { startIndex: 0, endIndex: Math.min(itemsCount - 1, 10), paddingTop: 0, paddingBottom: 0 };
    }

    const rect = el.getBoundingClientRect();
    const containerTop = rect.top + window.scrollY;
    const offset = Math.max(0, scrollY - containerTop);

    // Buffer of 6 elements before and after
    const startIndex = Math.max(0, Math.floor(offset / itemHeight) - 6);
    const endIndex = Math.min(itemsCount - 1, Math.floor((offset + viewportHeight) / itemHeight) + 6);

    const paddingTop = startIndex * itemHeight;
    const paddingBottom = Math.max(0, (itemsCount - 1 - endIndex) * itemHeight);

    return { startIndex, endIndex, paddingTop, paddingBottom };
  }, [scrollY, viewportHeight, itemsCount, itemHeight, containerRef]);

  return {
    startIndex,
    endIndex,
    paddingTop,
    paddingBottom,
  };
}

// Core micro-elements and memoized sub-components
const AttachmentCell = React.memo(({
  images,
  transactionId,
  uploadStatuses,
  handleRetryUpload,
  setPreviewImages,
  setPreviewIndex,
  setPreviewRotation,
  setPreviewZoom,
  theme
}: {
  images: string[] | undefined;
  transactionId: string;
  uploadStatuses: any;
  handleRetryUpload: (blobUrl: string, transactionId: string) => void;
  setPreviewImages: (imgs: string[]) => void;
  setPreviewIndex: (idx: number) => void;
  setPreviewRotation: (deg: number) => void;
  setPreviewZoom: (zoom: number) => void;
  theme: string;
}) => {
  if (!images || images.length === 0) return null;
  
  const isUploading = images.some(img => {
    const status = uploadStatuses[img]?.status;
    return status === 'uploading' || (img.startsWith('blob:') && status !== 'failed' && status !== 'success');
  });
  
  const isFailed = images.some(img => uploadStatuses[img]?.status === 'failed');
  
  return (
    <div className="relative inline-block group/desktop-attach py-1">
      {isFailed ? (
        <button 
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            images.forEach(img => {
              if (uploadStatuses[img]?.status === 'failed') {
                handleRetryUpload(img, transactionId);
              }
            });
          }}
          className="flex items-center gap-1.5 text-[10px] font-black tracking-wider text-rose-500 hover:text-rose-600 transition-colors cursor-pointer"
        >
          <RotateCw size={11} className="animate-pulse" />
          <div className="text-left">
            <p className="text-[10px] font-black leading-none">RETRY UPLOAD</p>
            <p className="text-[8px] font-bold text-rose-400 mt-0.5">Some uploads failed</p>
          </div>
        </button>
      ) : (
        <button 
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!isUploading) {
              setPreviewImages(images);
              setPreviewIndex(0);
              setPreviewRotation(0);
              setPreviewZoom(1);
            }
          }}
          disabled={isUploading}
          className={cn(
            "flex items-center gap-2 text-left transition-all cursor-pointer group/bill",
            isUploading 
              ? "text-emerald-500 dark:text-emerald-400 animate-pulse pointer-events-none" 
              : "text-slate-500 hover:text-indigo-600"
          )}
        >
          <Paperclip size={14} className={isUploading ? "animate-bounce" : ""} />
          <div className="text-left">
            <p className="text-[10px] font-black leading-none">
              {isUploading ? "Syncing..." : images.length}
            </p>
            <p className={cn(
              "text-[10px] font-bold transition-colors mt-0.5",
              isUploading ? "text-emerald-400" : "text-slate-400 group-hover/bill:text-indigo-400"
            )}>
              {isUploading ? "Uploading attachments..." : `${images.length === 1 ? 'Attachment' : 'Attachments'}`}
            </p>
          </div>
        </button>
      )}
      
      {isUploading && (
        <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-1">
          <div className="absolute top-0 bottom-0 w-[40%] bg-emerald-500 rounded-full animate-progress-smooth" />
        </div>
      )}
    </div>
  );
});
AttachmentCell.displayName = 'AttachmentCell';

const MobileTransactionRow = React.memo(({
  t,
  runningBalance,
  selected,
  isCurrentlyDeleting,
  onTouchStart,
  onTouchEnd,
  onClick,
  uploadStatuses,
  handleRetryUpload,
  setPreviewImages,
  setPreviewIndex,
  setPreviewRotation,
  setPreviewZoom,
  handleEditTransaction,
  handleDeleteTransaction,
  theme,
  index
}: {
  t: Transaction;
  runningBalance: number;
  selected: boolean;
  isCurrentlyDeleting: boolean;
  onTouchStart: (id: string) => void;
  onTouchEnd: () => void;
  onClick: (id: string) => void;
  uploadStatuses: any;
  handleRetryUpload: (blobUrl: string, transactionId: string) => void;
  setPreviewImages: (imgs: string[]) => void;
  setPreviewIndex: (idx: number) => void;
  setPreviewRotation: (deg: number) => void;
  setPreviewZoom: (zoom: number) => void;
  handleEditTransaction: (t: Transaction) => void;
  handleDeleteTransaction: (id: string) => void;
  theme: string;
  index: number;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={isCurrentlyDeleting ? { opacity: 0, x: -100, scale: 0.9, height: 0, margin: 0, padding: 0 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.03, 0.35) }}
      onMouseDown={() => onTouchStart(t.id)}
      onMouseUp={onTouchEnd}
      onTouchStart={() => onTouchStart(t.id)}
      onTouchEnd={onTouchEnd}
      onClick={() => onClick(t.id)}
      className={cn(
        "rounded-[20px] border shadow-sm relative transition-all select-none overflow-hidden hover:scale-[1.005] duration-200 cursor-pointer",
        isCurrentlyDeleting ? "border-transparent bg-transparent" : "p-4.5 sm:p-5",
        selected
          ? (theme === 'dark' ? "border-indigo-500 ring-2 ring-indigo-500/40 bg-indigo-950/20" : "border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/20 shadow-md") 
          : (theme === 'dark' ? "bg-zinc-950 border-zinc-900 hover:border-zinc-800" : "bg-white border-slate-100 hover:border-slate-200")
      )}
    >
      <div className="flex justify-between items-center gap-3 mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn(
            "px-2.5 py-1 text-[10px] font-black tracking-wider uppercase rounded-lg transition-colors duration-300",
            theme === 'dark' ? "bg-indigo-950 text-indigo-400 border border-indigo-900/30" : "bg-indigo-50 text-indigo-600 border border-indigo-100/30"
          )}>
            {t.category}
          </span>
          <span className={cn(
            "px-2.5 py-1 text-[10px] font-black tracking-wider uppercase rounded-lg transition-colors duration-300",
            theme === 'dark' ? "bg-zinc-900 text-slate-300 border border-zinc-800" : "bg-slate-50 text-slate-500 border border-slate-100"
          )}>
            {t.mode}
          </span>
        </div>
        <div className="text-right flex flex-col items-end">
          <p className={cn(
            "text-base font-black tracking-tight",
            t.type === 'in' ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-450"
          )}>
            {t.type === 'in' ? '+' : '-'}{formatCurrency(t.amount)}
          </p>
          <p className={cn(
            "text-[10px] font-bold tracking-tight mt-0.5 transition-colors duration-300",
            theme === 'dark' ? "text-zinc-500" : "text-slate-400"
          )}>
            Bal: {formatCurrency(runningBalance)}
          </p>
        </div>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <p className={cn(
          "text-[13px] font-semibold leading-relaxed line-clamp-2 transition-colors duration-300 flex-1 min-w-[120px]",
          theme === 'dark' ? "text-slate-200" : "text-slate-850"
        )}>
          {t.description || 'No details provided'}
        </p>
        
        <div className="flex items-center gap-1.5">
          {t.isAi && (
            <div className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-extrabold tracking-wide uppercase px-2 py-0.5 rounded-md flex items-center gap-0.5 shadow-sm border border-amber-500/15">
              <Sparkles size={10} />
              AI
            </div>
          )}
          {t.imageLayout && (
            <div className={cn(
              "text-[9px] font-black px-2 py-0.5 rounded-md shadow-sm uppercase border",
              t.imageLayout === 'merge' 
                ? (theme === 'dark' ? "bg-indigo-950/45 text-indigo-400 border-indigo-900/30" : "bg-indigo-50 text-indigo-600 border-indigo-100")
                : (theme === 'dark' ? "bg-zinc-900 text-slate-400 border-zinc-800" : "bg-slate-50 text-slate-500 border-slate-100")
            )}>
              {t.imageLayout}
            </div>
          )}
        </div>
      </div>

      <div className={cn(
        "flex items-center justify-between pt-3 border-t transition-colors duration-300",
        theme === 'dark' ? "border-zinc-900/60" : "border-slate-100/80"
      )}>
        <div className="flex items-center gap-2">
          {t.images && t.images.length > 0 ? (() => {
            const isUploading = t.images.some(img => {
              const status = uploadStatuses[img]?.status;
              return status === 'uploading' || (img.startsWith('blob:') && status !== 'failed' && status !== 'success');
            });
            const isFailed = t.images.some(img => uploadStatuses[img]?.status === 'failed');
            
            return (
              <div className="relative inline-block py-1">
                {isFailed ? (
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      t.images!.forEach(img => {
                        if (uploadStatuses[img]?.status === 'failed') {
                          handleRetryUpload(img, t.id);
                        }
                      });
                    }}
                    className="flex items-center gap-1 text-[10px] font-extrabold tracking-wide text-rose-500 hover:text-rose-650 transition-colors cursor-pointer"
                  >
                    <RotateCw size={10} className="animate-pulse" />
                    <span>RETRY UPLOAD</span>
                  </button>
                ) : (
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isUploading) {
                        setPreviewImages(t.images!);
                        setPreviewIndex(0);
                        setPreviewRotation(0);
                        setPreviewZoom(1);
                      }
                    }}
                    disabled={isUploading}
                    className={cn(
                      "flex items-center gap-1 transition-colors duration-300 text-[10px] font-bold cursor-pointer py-0.5 px-2 rounded-lg border",
                      isUploading 
                        ? "text-emerald-500 border-emerald-100/30 bg-emerald-500/5 dark:text-emerald-400 animate-pulse pointer-events-none" 
                        : (theme === 'dark' ? "text-indigo-400 border-indigo-950 bg-indigo-950/10 hover:text-indigo-300" : "text-indigo-650 border-indigo-100 bg-indigo-50/10 hover:text-indigo-700")
                    )}
                  >
                    <Paperclip size={11} className={isUploading ? "animate-bounce" : ""} />
                    <span>
                      {isUploading 
                        ? "Syncing..." 
                        : `${t.images.length} ${t.images.length === 1 ? 'Attachment' : 'Attachments'}`}
                    </span>
                  </button>
                )}
                
                {isUploading && (
                  <div className="absolute left-0 right-0 bottom-0 h-[1.5px] bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-0.5">
                    <div className="absolute top-0 bottom-0 w-[40%] bg-emerald-500 rounded-full animate-progress-smooth" />
                  </div>
                )}
              </div>
            );
          })() : (
            <div className={cn(
              "flex items-center gap-1 transition-colors duration-300",
              theme === 'dark' ? "text-zinc-700" : "text-slate-250"
            )}>
              <Paperclip size={11} />
              <span className="text-[10px] font-black">0</span>
            </div>
          )}
          <span className={cn(
            "transition-colors duration-300",
            theme === 'dark' ? "text-zinc-800" : "text-slate-150"
          )}>•</span>
          <span className={cn(
            "text-[10px] font-bold tracking-tight transition-colors duration-300",
            theme === 'dark' ? "text-zinc-500" : "text-slate-400"
          )}>
            {t.date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button 
            onClick={(e) => { e.stopPropagation(); handleEditTransaction(t); }}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer hover:scale-105 active:scale-90 border shadow-sm",
              theme === 'dark' ? "bg-zinc-900 border-zinc-850/60 text-slate-400 hover:text-indigo-400" : "bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100 hover:text-indigo-650"
            )}
            aria-label="Edit Transaction"
          >
            <Pencil size={12.5} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); handleDeleteTransaction(t.id); }}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer hover:scale-105 active:scale-90 border shadow-sm",
              theme === 'dark' ? "bg-zinc-900 border-zinc-850/60 text-rose-400 hover:text-rose-500" : "bg-rose-50 border-rose-150 text-rose-500 hover:bg-rose-100 hover:text-rose-650"
            )}
            aria-label="Delete Transaction"
          >
            <Trash2 size={12.5} />
          </button>
        </div>
      </div>
    </motion.div>
  );
});
MobileTransactionRow.displayName = 'MobileTransactionRow';

const DesktopTransactionRow = React.memo(({
  t,
  runningBalance,
  selected,
  isCurrentlyDeleting,
  toggleSelectTransaction,
  handleEditTransaction,
  handleDeleteTransaction,
  handleRetryUpload,
  uploadStatuses,
  setPreviewImages,
  setPreviewIndex,
  setPreviewRotation,
  setPreviewZoom,
  theme,
  index
}: {
  t: Transaction;
  runningBalance: number;
  selected: boolean;
  isCurrentlyDeleting: boolean;
  toggleSelectTransaction: (id: string) => void;
  handleEditTransaction: (t: any) => void;
  handleDeleteTransaction: (id: string) => void;
  handleRetryUpload: (blobUrl: string, transactionId: string) => void;
  uploadStatuses: any;
  setPreviewImages: (imgs: string[]) => void;
  setPreviewIndex: (idx: number) => void;
  setPreviewRotation: (deg: number) => void;
  setPreviewZoom: (zoom: number) => void;
  theme: string;
  index: number;
}) => {
  return (
    <motion.tr 
      initial={{ opacity: 0, y: 12 }}
      animate={isCurrentlyDeleting ? { opacity: 0, x: -50, scale: 0.95 } : { opacity: 1, x: 0, scale: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.03, 0.35) }}
      className={cn(
        "group transition-colors",
        theme === 'dark' ? "hover:bg-slate-800/30" : "hover:bg-slate-50/50",
        selected && (theme === 'dark' ? "bg-indigo-900/10" : "bg-indigo-50/50"),
        isCurrentlyDeleting && "pointer-events-none opacity-50"
      )}
    >
      <td className="px-3 sm:px-6 py-4">
        <button 
          type="button"
          onClick={() => toggleSelectTransaction(t.id)}
          className={cn(
            "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
            selected
              ? "bg-indigo-600 border-indigo-600 text-white"
              : "border-slate-300 dark:border-slate-700 group-hover:border-indigo-500"
          )}
        >
          {selected && <CheckSquare size={14} />}
        </button>
      </td>
      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
        <p className={cn(
          "font-bold text-sm",
          theme === 'dark' ? "text-slate-200" : "text-slate-800"
        )}>
          {safeFormatDate(t.date, { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
        <p className={cn(
          "text-[10px] font-bold uppercase tracking-tight",
          theme === 'dark' ? "text-slate-400" : "text-slate-500"
        )}>
          {safeFormatTime(t.date, { hour: '2-digit', minute: '2-digit', hour12: true })}
        </p>
      </td>
      <td className="px-3 sm:px-6 py-4 min-w-[120px]">
        <div className="flex items-center gap-2">
          <p className={cn(
            "text-sm font-bold transition-colors duration-300",
            theme === 'dark' ? "text-slate-300" : "text-black"
          )}>{t.description || '--'}</p>
          {t.isAi && (
            <span className={cn(
              "px-1.5 py-0.5 text-[9px] font-black rounded-full flex items-center gap-0.5 border",
              theme === 'dark' ? "bg-amber-900/40 text-amber-400 border-amber-800" : "bg-amber-50 text-amber-600 border-amber-200"
            )}>
              <Sparkles size={10} />
              AI
            </span>
          )}
          {t.imageLayout && (
            <span className={cn(
              "px-1.5 py-0.5 text-[9px] font-black rounded-full border uppercase",
              t.imageLayout === 'merge'
                ? (theme === 'dark' ? "bg-indigo-900/40 text-indigo-400" : "bg-indigo-50 text-indigo-600 border-indigo-200")
                : (theme === 'dark' ? "bg-slate-800 text-slate-400 border-slate-700" : "bg-slate-50 text-slate-500 border-slate-200")
            )}>
              {t.imageLayout}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
        <p className={cn(
          "text-sm font-bold transition-colors duration-300",
          theme === 'dark' ? "text-slate-300" : "text-black"
        )}>{t.category}</p>
      </td>
      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
        <p className={cn(
          "text-sm font-bold transition-colors duration-300",
          theme === 'dark' ? "text-slate-300" : "text-black"
        )}>{t.mode}</p>
      </td>
      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
        <AttachmentCell
          images={t.images}
          transactionId={t.id}
          uploadStatuses={uploadStatuses}
          handleRetryUpload={handleRetryUpload}
          setPreviewImages={setPreviewImages}
          setPreviewIndex={setPreviewIndex}
          setPreviewRotation={setPreviewRotation}
          setPreviewZoom={setPreviewZoom}
          theme={theme}
        />
      </td>
      <td className={cn(
        "px-3 sm:px-6 py-4 text-right font-black whitespace-nowrap tabular-nums",
        t.type === 'in' ? "text-emerald-600" : "text-rose-600",
        "text-xs sm:text-sm"
      )}>
        {formatCurrency(t.amount)}
      </td>
      <td className={cn(
        "px-3 sm:px-6 py-4 text-right font-black transition-colors duration-300 whitespace-nowrap tabular-nums",
        theme === 'dark' ? "text-slate-100" : "text-black",
        "text-xs sm:text-sm"
      )}>
        <span>{formatCurrency(runningBalance)}</span>
      </td>
      <td className="px-3 sm:px-6 py-4">
        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            type="button"
            onClick={() => handleEditTransaction(t)}
            className={cn(
              "p-1.5 text-slate-400 rounded-lg transition-all cursor-pointer",
              theme === 'dark' ? "hover:text-indigo-400 hover:bg-indigo-900/20" : "hover:text-indigo-600 hover:bg-indigo-50"
            )}
          >
            <Pencil size={16} />
          </button>
          <button 
            type="button"
            onClick={() => handleDeleteTransaction(t.id)}
            className={cn(
              "p-1.5 text-slate-400 rounded-lg transition-all cursor-pointer",
              theme === 'dark' ? "hover:text-rose-400 hover:bg-rose-900/20" : "hover:text-rose-600 hover:bg-rose-50"
            )}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </motion.tr>
  );
});
DesktopTransactionRow.displayName = 'DesktopTransactionRow';

const SummaryCards = React.memo(({ totals, theme }: { totals: { in: number; out: number; net: number }; theme: string }) => {
  return (
    <>
      {/* Mobile Summary Card (Reference Image Style) */}
      <div className={cn(
        "sm:hidden rounded-2xl border shadow-sm overflow-hidden transition-colors duration-300",
        theme === 'dark' ? "bg-zinc-950 border-zinc-900" : "bg-white border-slate-100"
      )}>
        <div className="p-3 px-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className={cn(
              "text-sm font-bold transition-colors duration-300",
              theme === 'dark' ? "text-slate-100" : "text-black"
            )}>Net Balance</h3>
            <p className={cn(
              "font-black transition-colors duration-300",
              theme === 'dark' ? "text-slate-100" : "text-black",
              "text-sm"
            )}>
              {formatCurrency(totals.net)}
            </p>
          </div>
          
          <div className={cn(
            "space-y-1.5 pt-1.5 border-t transition-colors duration-300",
            theme === 'dark' ? "border-zinc-800" : "border-slate-50"
          )}>
            <div className="flex items-center justify-between">
              <p className={cn(
                "text-xs font-bold transition-colors duration-300",
                theme === 'dark' ? "text-slate-400" : "text-slate-500"
              )}>Total In (+)</p>
              <p className={cn(
                "font-black text-emerald-600",
                "text-xs"
              )}>{formatCurrency(totals.in)}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className={cn(
                "text-xs font-bold transition-colors duration-300",
                theme === 'dark' ? "text-slate-400" : "text-slate-500"
              )}>Total Out (-)</p>
              <p className={cn(
                "font-black text-rose-600",
                "text-xs"
              )}>{formatCurrency(totals.out)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Balance Cards Row (Desktop Only) */}
      <div className="hidden lg:grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className={cn(
          "p-6 rounded-3xl border flex items-center gap-4 shadow-sm transition-colors duration-300",
          theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
        )}>
          <div className={cn(
            "p-3 rounded-2xl",
            theme === 'dark' ? "bg-emerald-900/20 text-emerald-400" : "bg-emerald-50 text-emerald-600"
          )}>
            <Plus size={24} />
          </div>
          <div>
            <p className={cn(
              "text-sm font-bold uppercase tracking-wider",
              theme === 'dark' ? "text-slate-400" : "text-slate-500"
            )}>Cash In</p>
            <p className={cn(
              "font-black text-emerald-600 dark:text-emerald-400",
              "text-xl"
            )}>
              {formatCurrency(totals.in)}
            </p>
          </div>
        </div>

        <div className={cn(
          "p-6 rounded-3xl border flex items-center gap-4 shadow-sm transition-colors duration-300",
          theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
        )}>
          <div className={cn(
            "p-3 rounded-2xl",
            theme === 'dark' ? "bg-rose-900/20 text-rose-400" : "bg-rose-50 text-rose-600"
          )}>
            <Minus size={24} />
          </div>
          <div>
            <p className={cn(
              "text-sm font-bold uppercase tracking-wider",
              theme === 'dark' ? "text-slate-400" : "text-slate-500"
            )}>Cash Out</p>
            <p className={cn(
              "font-black text-rose-600 dark:text-rose-400",
              "text-xl"
            )}>
              {formatCurrency(totals.out)}
            </p>
          </div>
        </div>

        <div className={cn(
          "p-6 rounded-3xl border flex items-center gap-4 shadow-sm transition-colors duration-300",
          theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
        )}>
          <div className={cn(
            "p-3 rounded-2xl",
            theme === 'dark' ? "bg-indigo-900/20 text-indigo-400" : "bg-indigo-50 text-indigo-600"
          )}>
            <Wallet size={24} />
          </div>
          <div>
            <p className={cn(
              "text-sm font-bold uppercase tracking-wider",
              theme === 'dark' ? "text-slate-400" : "text-slate-500"
            )}>Net Balance</p>
            <p className={cn(
              "font-black text-indigo-600 dark:text-indigo-400",
              "text-xl"
            )}>
              {formatCurrency(totals.net)}
            </p>
          </div>
        </div>
      </div>
    </>
  );
});
SummaryCards.displayName = 'SummaryCards';

async function fetchAttachmentsDeduplicated(entryIds: string[]): Promise<{ attachments: any[], aiAttachments: any[] }> {
  const sortedIds = [...entryIds].sort();
  const batchKey = sortedIds.join(',');
  
  if (inFlightAttachmentQueries.has(batchKey)) {
    console.log(`[Deduplication] Reusing in-flight attachments query promise for ${entryIds.length} entries.`);
    return inFlightAttachmentQueries.get(batchKey)!;
  }
  
  const queryPromise = (async () => {
    try {
      const startTime = performance.now();
      const [attachmentsRes, aiAttachmentsRes] = await Promise.all([
        supabase.from('attachments').select('entry_id, file_url').in('entry_id', entryIds),
        supabase.from('ai_attachments').select('entry_id, file_url').in('entry_id', entryIds)
      ]);
      const duration = performance.now() - startTime;
      console.log(`[Performance] Attachments load timing: fetched from db in ${duration.toFixed(2)}ms for ${entryIds.length} entries`);
      
      return {
        attachments: attachmentsRes.data || [],
        aiAttachments: aiAttachmentsRes.data || []
      };
    } finally {
      inFlightAttachmentQueries.delete(batchKey);
    }
  })();
  
  inFlightAttachmentQueries.set(batchKey, queryPromise);
  return queryPromise;
}

// Helper to normalize strings for comparison (lower-case, trim, remove double-spaces)
const normalizeString = (str: any): string => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
};

// Helper to normalize date to YYYY-MM-DD
const normalizeDate = (dateVal: any): string => {
  if (!dateVal) return '';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (err) {
    return '';
  }
};

// Generator for deterministic entry signature
const getEntrySignature = (t: any): string => {
  const amt = (parseFloat(t.amount) || 0).toFixed(2);
  const type = normalizeString(t.type || 'out');
  const desc = normalizeString(t.description || '');
  const cat = normalizeString(t.category || 'Food');
  const mode = normalizeString(t.mode || 'Cash');
  const dateStr = normalizeDate(t.date);
  const membersCount = t.members_count !== undefined 
    ? t.members_count 
    : (t.member_count !== undefined 
        ? t.member_count 
        : (t.membersCount !== undefined ? t.membersCount : 0));
  return `${amt}_${type}_${desc}_${cat}_${mode}_${dateStr}_${membersCount}`;
};

// Helper to generate deterministic entry signatures
const generateEntriesSignature = (entryIds: string[]): string => {
  const sortedIds = [...entryIds].sort();
  return sortedIds.join('-');
};

// Caching of optimized variants using unified Promises to prevent redundant fetches
const optimizedImageCache = new Map<string, Promise<HTMLImageElement | string>>();

const getOptimizedImage = async (
  imgUrl: string, 
  isCompressedMode: boolean, 
  isStrongCompression: boolean = false
): Promise<HTMLImageElement | string> => {
  // 1. Skip canvas compression if already a lightweight Cloudinary optimized URL
  // "3. ZERO CANVAS RECOMPRESSION FOR ALREADY-OPTIMIZED IMAGES: Skip expensive loop"
  if (imgUrl.includes('cloudinary.com')) {
    return new Promise<HTMLImageElement | string>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(imgUrl);
      img.src = imgUrl;
    });
  }

  // Small local / base64 images under 150KB - skip compression
  if (imgUrl.startsWith('data:image/') && imgUrl.length < 150 * 1024 * 1.33) {
    return new Promise<HTMLImageElement | string>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(imgUrl);
      img.src = imgUrl;
    });
  }

  if (!isCompressedMode) {
    return new Promise<HTMLImageElement | string>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(imgUrl);
      img.src = imgUrl;
    });
  }

  return new Promise<HTMLImageElement | string>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        
        if (width <= 0 || height <= 0) {
          resolve(imgUrl);
          return;
        }

        // Resolution Downscaling
        const maxDim = isStrongCompression ? 800 : 900;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imgUrl);
          return;
        }

        // Convert PNG to JPEG & strip EXIF/orientation metadata
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Quality optimization
        const quality = isStrongCompression ? 0.35 : 0.40;

        // 8. REMOVE ALL BASE64 EXPORT PATHS - strictly construct Object URLs
        canvas.toBlob((blob) => {
          if (blob) {
            const blobUrl = URL.createObjectURL(blob);
            const optImg = new Image();
            optImg.onload = () => resolve(optImg);
            optImg.onerror = () => resolve(blobUrl);
            optImg.src = blobUrl;
          } else {
            resolve(imgUrl);
          }
        }, 'image/jpeg', quality);

      } catch (err) {
        console.warn('[PDFCompress] Canvas processing failed, falling back:', err);
        resolve(imgUrl);
      }
    };
    img.onerror = () => {
      resolve(imgUrl);
    };
    img.src = imgUrl;
  });
};

const getCachedOptimizedImage = (
  imgUrl: string, 
  isCompressedMode: boolean, 
  isStrongCompression: boolean,
  onProgress: () => void
): Promise<HTMLImageElement | string> => {
  if (optimizedImageCache.has(imgUrl)) {
    onProgress();
    return optimizedImageCache.get(imgUrl)!;
  }
  
  const promise = (async () => {
    try {
      // 1. Pre-generate lightweight Cloudinary URL representing our aggressive transform choice
      const isHuge = isStrongCompression;
      const preOptimizedUrl = getExportOptimizedCloudinaryUrl(imgUrl, isCompressedMode, isHuge);
      
      const optimized = await getOptimizedImage(preOptimizedUrl, isCompressedMode, isStrongCompression);
      return optimized;
    } catch (err) {
      console.warn('[PDF] Cache loading error fallback:', err);
      return imgUrl;
    }
  })();
  
  optimizedImageCache.set(imgUrl, promise);
  onProgress();
  return promise;
};

const CATEGORIES = ['Food', 'Travel', 'Advance', 'Shopping', 'Custom'];
const MODES = ['Card', 'UPI', 'Cash', 'Custom'];
const DURATIONS = ['All', 'Today', 'Yesterday', 'Last Week'];

export default function Dashboard({ session, theme, setTheme }: { session: any, theme: 'light' | 'dark', setTheme: React.Dispatch<React.SetStateAction<'light' | 'dark'>> }) {
  // Global State
  const [userName, setUserName] = useState('Siva');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [helpQuery, setHelpQuery] = useState('');
  const [helpResponse, setHelpResponse] = useState('');
  const [isHelpLoading, setIsHelpLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [books, setBooks] = useState<Cashbook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQueryInput, setSearchQueryInput] = useState('');

  // Performance timers
  const lastBookOpenStart = useRef<number | null>(null);
  const initialRenderStart = useRef<number>(performance.now());

  // Debounce logic for general book search
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(searchQueryInput);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQueryInput]);

  useEffect(() => {
    if (searchQuery === '') {
      setSearchQueryInput('');
    }
  }, [searchQuery]);

  // Initial Render Performance Log
  useEffect(() => {
    const duration = performance.now() - initialRenderStart.current;
    console.log(`[Performance] Initial render completed in ${duration.toFixed(2)}ms`);
  }, []);

  // Set book opening start on selection change
  useEffect(() => {
    if (activeBookId) {
      lastBookOpenStart.current = performance.now();
      console.log(`[Performance] Opening cashbook ID: ${activeBookId}...`);
    } else {
      lastBookOpenStart.current = null;
    }
  }, [activeBookId]);
  
  // Quick Add State and Refs
  const [submitAndAddNew, setSubmitAndAddNew] = useState(false);
  const [quickAddSuccess, setQuickAddSuccess] = useState(false);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);
  
  // UI State
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showDownloadCenter, setShowDownloadCenter] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [isEditingBook, setIsEditingBook] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingMessage, setSubmittingMessage] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showBulkTransactionDeleteConfirm, setShowBulkTransactionDeleteConfirm] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null);
  const [newBookName, setNewBookName] = useState('');
  const [editBookName, setEditBookName] = useState('');
  const [showForm, setShowForm] = useState<'in' | 'out' | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingMessage, setUploadingMessage] = useState('Detecting bill...');
  const [showAiWarning, setShowAiWarning] = useState(false);
  const [aiConstructionModal, setAiConstructionModal] = useState<'upload' | 'ask' | null>(null);
  const [showDropZone, setShowDropZone] = useState(false);
  const [aiMode, setAiMode] = useState<'split' | 'merge'>('split');
  const [error, setError] = useState<string | null>(null);

  // Share Entries states
  const [showShareModal, setShowShareModal] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareError, setShareError] = useState('');
  const [copied, setCopied] = useState(false);
  const [shareExpiryTime, setShareExpiryTime] = useState<number | null>(null);
  const [countdownText, setCountdownText] = useState('');

  // Import Shared Entries states
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCode, setImportCode] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState(false);
  const [importSummary, setImportSummary] = useState('');
  const [transactionSearchQuery, setTransactionSearchQuery] = useState('');
  const [transactionSearchQueryInput, setTransactionSearchQueryInput] = useState('');

  // Debounce logic for active book transaction search
  useEffect(() => {
    const handler = setTimeout(() => {
      setTransactionSearchQuery(transactionSearchQueryInput);
    }, 250);
    return () => clearTimeout(handler);
  }, [transactionSearchQueryInput]);

  useEffect(() => {
    if (transactionSearchQuery === '') {
      setTransactionSearchQueryInput('');
    }
  }, [transactionSearchQuery]);

  // Periodic db cleanup of expired share entries and countdown state timer
  useEffect(() => {
    if (!supabase || !session) return;
    
    const runCleanup = async () => {
      try {
        const { error } = await supabase
          .from('shared_entries')
          .delete()
          .lt('expires_at', new Date().toISOString());
        if (error) {
          console.warn('[Cleanup] Failed to clean up expired share codes:', error);
        } else {
          console.log('[Cleanup] Expired share codes cleaned up successfully.');
        }
      } catch (err) {
        console.error('[Cleanup] Error in cleanupExpiredShareCodes:', err);
      }
    };

    runCleanup();
    const intervalId = setInterval(runCleanup, 60000); // Check and delete expired codes every minute
    return () => clearInterval(intervalId);
  }, [session]);

  const [restoredMessage, setRestoredMessage] = useState('');

  // Active share session restoration and sync
  useEffect(() => {
    if (!activeBookId) {
      setGeneratedCode('');
      setShareExpiryTime(null);
      setCountdownText('');
      return;
    }
    
    const savedSessionStr = localStorage.getItem(`trackbook_share_session_${activeBookId}`);
    if (savedSessionStr) {
      try {
        const savedSession = JSON.parse(savedSessionStr);
        if (savedSession && savedSession.code && savedSession.expiry) {
          const expiryNum = parseInt(savedSession.expiry, 10);
          if (expiryNum > Date.now()) {
            setGeneratedCode(savedSession.code);
            setShareExpiryTime(expiryNum);
            setRestoredMessage("Active share session restored");
            const timer = setTimeout(() => setRestoredMessage(''), 4000);
            return () => clearTimeout(timer);
          } else {
            localStorage.removeItem(`trackbook_share_session_${activeBookId}`);
          }
        }
      } catch (e) {
        console.error('Error parsing saved share session', e);
      }
    }
    
    setGeneratedCode('');
    setShareExpiryTime(null);
    setCountdownText('');
  }, [activeBookId]);

  // Clean up import states when showImportModal toggles
  useEffect(() => {
    if (!showImportModal) {
      setImportCode('');
      setImportError('');
      setImportSummary('');
      setImportSuccess(false);
    }
  }, [showImportModal]);

  useEffect(() => {
    if (!shareExpiryTime) {
      setCountdownText('');
      return;
    }
    
    const updateCountdown = () => {
      const remaining = shareExpiryTime - Date.now();
      if (remaining <= 0) {
        setCountdownText('Share code expired');
        if (activeBookId) {
          localStorage.removeItem(`trackbook_share_session_${activeBookId}`);
        }
      } else {
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        setCountdownText(`Code expires in ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
      }
    };
    
    updateCountdown();
    const intervalId = setInterval(updateCountdown, 1000);
    return () => clearInterval(intervalId);
  }, [shareExpiryTime, activeBookId]);
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'all' | 'in' | 'out'>('all');
  const [transactionDurationFilter, setTransactionDurationFilter] = useState('All');
  const [transactionCategoryFilter, setTransactionCategoryFilter] = useState('All');
  const [sortColumn, setSortColumn] = useState<'date' | 'category' | 'amount'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showReportsMenu, setShowReportsMenu] = useState(false);
  const [showBookMenu, setShowBookMenu] = useState(false);
  const bookMenuRef = useRef<HTMLDivElement>(null);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [animatingDeleteId, setAnimatingDeleteId] = useState<string | null>(null);
  const [isEntriesLoading, setIsEntriesLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [uploadStatuses, setUploadStatuses] = useState<Record<string, {
    status: 'uploading' | 'success' | 'failed';
    error?: string;
    progress?: number;
  }>>({});
  const imageFilesRef = useRef<Record<string, File>>({});
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const bookLongPressTimer = useRef<NodeJS.Timeout | null>(null);
  
  const toggleSort = (column: 'date' | 'category' | 'amount') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    vibrate(30);
  };

  // Set isEntriesLoading to true immediately on activeBookId changes if cache is empty, to prevent false empty flashes
  useEffect(() => {
    if (activeBookId) {
      const cached = entriesCache.get(activeBookId);
      if (!cached || cached.length === 0) {
        setIsEntriesLoading(true);
      }
    }
  }, [activeBookId]);

  const handleTransactionPress = (id: string) => {
    if (selectedTransactions.size > 0) {
      toggleSelectTransaction(id);
    }
  };

  const handleTransactionLongPress = (id: string) => {
    if (selectedTransactions.size === 0) {
      toggleSelectTransaction(id);
      vibrate(50);
    }
  };

  const onTouchStart = (id: string) => {
    longPressTimer.current = setTimeout(() => {
      handleTransactionLongPress(id);
    }, 1200); // 1.2 seconds (or 1200ms) for long press on mobile/touch devices
  };

  const onTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const toggleSelectBook = (id: string) => {
    const newSelected = new Set(selectedBooks);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedBooks(newSelected);
  };

  const handleBookPress = (id: string) => {
    if (selectedBooks.size > 0) {
      toggleSelectBook(id);
    } else {
      setActiveBookId(id);
    }
  };

  const handleBookLongPress = (id: string) => {
    if (selectedBooks.size === 0) {
      toggleSelectBook(id);
      vibrate(50);
    }
  };

  const onTouchStartBook = (id: string) => {
    bookLongPressTimer.current = setTimeout(() => {
      handleBookLongPress(id);
    }, 500);
  };

  const onTouchEndBook = () => {
    if (bookLongPressTimer.current) {
      clearTimeout(bookLongPressTimer.current);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    let lastKey = '';
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input or textarea
      const activeElement = document.activeElement;
      const isInput = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA' || (activeElement as HTMLElement)?.isContentEditable;
      if (isInput && e.key !== 'Escape') return;

      const key = e.key.toUpperCase();
      const now = Date.now();

      // Handle Escape key to close forms/modals
      if (e.key === 'Escape') {
        setShowForm(null);
        setIsCreatingBook(false);
        setIsEditingName(false);
        setIsHelpOpen(false);
        setShowAiWarning(false);
        setAiConstructionModal(null);
        setShowReportsMenu(false);
        setShowBulkDeleteConfirm(false);
        setShowExitConfirm(false);
        setEditingTransaction(null);
        setPreviewImages(null);
        setShowImportModal(false);
        lastKey = '';
        return;
      }

      // Clear last key if too much time passed (e.g. 1 second)
      if (now - lastKeyTime > 1000) {
        lastKey = '';
      }

      if (lastKey === 'C') {
        if (key === 'B') {
          e.preventDefault();
          setIsCreatingBook(true);
          lastKey = '';
        } else if (key === 'I' && activeBookId) {
          e.preventDefault();
          setShowForm('in');
          setTransactionDate(safeToDateTimeLocal(new Date()));
          lastKey = '';
        } else if (key === 'O' && activeBookId) {
          e.preventDefault();
          setShowForm('out');
          setTransactionDate(safeToDateTimeLocal(new Date()));
          lastKey = '';
        }
      } else if (lastKey === 'A') {
        if (key === 'U' && activeBookId) {
          e.preventDefault();
          setAiConstructionModal('upload');
          lastKey = '';
        }
      }

      lastKey = key;
      lastKeyTime = now;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeBookId]);

  const toggleTheme = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Back button handling for mobile
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (activeBookId) {
        setActiveBookId(null);
        // Prevent default back behavior
        window.history.pushState(null, '', window.location.pathname);
      } else {
        setShowExitConfirm(true);
        // Prevent default back behavior
        window.history.pushState(null, '', window.location.pathname);
      }
    };

    // Push initial state
    window.history.pushState(null, '', window.location.pathname);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [activeBookId]);

  const moveImage = (index: number, direction: 'up' | 'down') => {
    const newImages = [...selectedImages];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newImages.length) return;
    
    const temp = newImages[index];
    newImages[index] = newImages[newIndex];
    newImages[newIndex] = temp;
    setSelectedImages(newImages);
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [previewImages, setPreviewImages] = useState<string[] | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [reportLoading, setReportLoading] = useState<{ type: 'excel' | 'pdf', progress: number, message?: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const reportsRef = useRef<HTMLDivElement>(null);

  const desktopTableRef = useRef<HTMLTableSectionElement | null>(null);
  const mobileContainerRef = useRef<HTMLDivElement | null>(null);



  // Form states for transaction
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Food');
  const [customCategory, setCustomCategory] = useState('');
  const [mode, setMode] = useState('Cash');
  const [customMode, setCustomMode] = useState('');
  const safeToISOString = (date: Date | string | number) => {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return new Date().toISOString();
      return d.toISOString();
    } catch (e) {
      return new Date().toISOString();
    }
  };

  const parseAIDate = (dateStr: string | undefined): Date => {
    if (!dateStr) return new Date();
    
    // Handle DD-MM-YYYY
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1; // JS months are 0-indexed
      const year = parseInt(parts[2]);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
    
    // Fallback to standard parsing
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  const safeToDateTimeLocal = (date: Date | string | number) => {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) {
        const now = new Date();
        const offset = now.getTimezoneOffset();
        const localized = new Date(now.getTime() - offset * 60 * 1000);
        return localized.toISOString().slice(0, 16);
      }
      const offset = d.getTimezoneOffset();
      const localized = new Date(d.getTime() - offset * 60 * 1000);
      return localized.toISOString().slice(0, 16);
    } catch (e) {
      const now = new Date();
      const offset = now.getTimezoneOffset();
      const localized = new Date(now.getTime() - offset * 60 * 1000);
      return localized.toISOString().slice(0, 16);
    }
  };

  const safeUUID = () => {
    try {
      return crypto.randomUUID();
    } catch (e) {
      return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
  };

  const [transactionDate, setTransactionDate] = useState(safeToDateTimeLocal(new Date()));
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [imageLayout, setImageLayout] = useState<'split' | 'merge'>('split');

  // Restrict merge layout - automatically fallback to split if there are less than 2 images
  useEffect(() => {
    if (selectedImages.length < 2 && imageLayout === 'merge') {
      setImageLayout('split');
    }
  }, [selectedImages, imageLayout]);

  // Clear selected transactions when exiting a book to avoid leaking selection bar onto book homepage
  useEffect(() => {
    if (!activeBookId) {
      setSelectedTransactions(new Set());
    }
  }, [activeBookId]);

  // Set user name from session
  useEffect(() => {
    if (session?.user?.user_metadata?.full_name) {
      setUserName(session.user.user_metadata.full_name);
    }
  }, [session]);

  // Pre-load from localStorage cache on mount/session ready to render UI instantly!
  useEffect(() => {
    if (session) {
      const savedBooks = localStorage.getItem(`cashbooks_${session.user.id}`);
      if (savedBooks) {
        try {
          const parsed = JSON.parse(savedBooks);
          // Pre-populate entriesCache so we don't flash empty states on hard-refresh
          parsed.forEach((b: any) => {
            if (b.id && Array.isArray(b.transactions)) {
              entriesCache.set(b.id, b.transactions);
            }
          });
          setBooks(parsed.map((b: any) => ({
            ...b,
            transactions: (b.transactions || []).map((t: any) => ({
              ...t,
              date: new Date(t.date),
              images: t.images || []
            })),
            createdAt: new Date(b.created_at || b.createdAt)
          })));
        } catch (e) {
          console.error('Error pre-loading from cache:', e);
        }
      }
      setIsLoading(false); // Enable immediate frame rendering!
    }
  }, [session]);

  // Stable component-level data fetch and sync function
  const fetchData = useCallback(async (force: boolean = false) => {
    if (!session) {
      setBooks([]);
      setIsLoading(false);
      return;
    }

    if (!supabase) {
      return;
    }

    const now = Date.now();

    // 1. STALE-WHILE-REVALIDATE: Instantly render from cache if available
    if (cachedCashbooks && !force) {
      setBooks(prevBooks => {
        return cachedCashbooks!.map((cb: any) => {
          const isCurrentActive = cb.id === activeBookId;
          const entriesToUse = isCurrentActive ? (entriesCache.get(activeBookId) || []) : [];
          return {
            ...cb,
            transactions: entriesToUse.map((t: any) => {
              const cachedImg = attachmentCache.get(t.id);
              return {
                ...t,
                date: t.date ? new Date(t.date) : new Date(),
                images: cachedImg ? cachedImg.images : (t.images || []),
                imageLayout: t.image_layout || t.imageLayout || 'split',
                isAi: cachedImg ? cachedImg.isAi : (t.isAi || false)
              };
            }),
            createdAt: cb.created_at ? new Date(cb.created_at) : (cb.createdAt ? new Date(cb.createdAt) : new Date())
          };
        });
      });
      if (activeBookId && entriesCache.has(activeBookId)) {
        setIsEntriesLoading(false);
        setIsLoading(false);
      }
    }

    // 2. CACHE FRESHNESS CHECK: Skip remote call completely if book was loaded < 15 seconds ago
    if (activeBookId && !force) {
      const lastFetch = lastFetchTimeCache.get(activeBookId) || 0;
      const isCacheFresh = (now - lastFetch) < 15000; // 15 seconds threshold
      if (isCacheFresh && entriesCache.has(activeBookId)) {
        console.log('[fetchData] Skipping remote fetch because cache is fresh for active book:', activeBookId);
        setIsEntriesLoading(false);
        setIsLoading(false);
        return;
      }
    }

    try {
      if (activeBookId && (!entriesCache.has(activeBookId) || entriesCache.get(activeBookId)?.length === 0)) {
        setIsEntriesLoading(true);
      }
      console.log('[fetchData] Refreshing books from Supabase...');
      const { data: cashbooks, error: cbError } = await supabase
        .from('cashbooks')
        .select('id, name, created_at, user_id')
        .eq('user_id', session.user.id);

      if (cbError) throw cbError;

      if (cashbooks) {
        cachedCashbooks = cashbooks;
        let activeBookEntries: any[] = [];
        if (activeBookId) {
          console.log('[fetchData] Fetching required columns for active book:', activeBookId);
          // PART 2: Select ONLY required columns! Optimize queries aggressively!
          const { data: entries, error: entError } = await supabase
            .from('entries')
            .select('id, amount, type, description, category, mode, date, image_layout, cashbook_id, user_id')
            .eq('cashbook_id', activeBookId)
            .eq('user_id', session.user.id)
            .order('date', { ascending: false });

          if (entError) throw entError;
          if (entries) {
            activeBookEntries = entries;
            entriesCache.set(activeBookId, entries);
            lastFetchTimeCache.set(activeBookId, Date.now());
          }
        }

        setBooks(prevBooks => {
          // Keep loaded images/attachments mapping to prevent flashing and re-loading
          const existingBook = prevBooks.find(b => b.id === activeBookId);
          const existingImagesMap = new Map<string, { images: string[], isAi: boolean }>();
          if (existingBook?.transactions) {
            existingBook.transactions.forEach((t: any) => {
              if (t.images && t.images.length > 0) {
                existingImagesMap.set(t.id, { images: t.images, isAi: !!t.isAi });
              }
            });
          }

          return cashbooks.map((cb: any) => {
            const isCurrentActive = cb.id === activeBookId;
            let entriesToUse: any[] = [];
            if (isCurrentActive) {
              entriesToUse = activeBookEntries;
            } else if (entriesCache.has(cb.id)) {
              entriesToUse = entriesCache.get(cb.id) || [];
            } else {
              const prev = prevBooks.find(pb => pb.id === cb.id);
              entriesToUse = prev ? (prev.transactions || []) : [];
            }
            
            return {
              ...cb,
              transactions: entriesToUse.map((t: any) => {
                const cached = attachmentCache.get(t.id);
                const existing = existingImagesMap.get(t.id) || cached;
                if (existing) {
                  // Keep it in cache
                  attachmentCache.set(t.id, existing);
                }
                return {
                  ...t,
                  date: t.date ? new Date(t.date) : new Date(),
                  images: existing ? existing.images : [],
                  imageLayout: t.image_layout || 'split',
                  isAi: existing ? existing.isAi : false
                };
              }),
              createdAt: cb.created_at ? new Date(cb.created_at) : (cb.createdAt ? new Date(cb.createdAt) : new Date())
            };
          });
        });

        // Progressive, asynchronous lazy-loading of attachments to keep page responsive
        if (activeBookId && activeBookEntries && activeBookEntries.length > 0) {
          const entryIds = activeBookEntries.map(e => e.id);
          const dbQueryEntryIds = force
            ? entryIds
            : entryIds.filter(id => !attachmentCache.has(id) && !revalidatedEntries.has(id));

          if (dbQueryEntryIds.length === 0) {
            console.log('[fetchData] Skipping progressive DB attachment queries: all rows already cached or revalidated.');
          } else {
            // Mark as revalidated to prevent repeating request during active app session
            dbQueryEntryIds.forEach(id => revalidatedEntries.add(id));

            (async () => {
              try {
                console.log(`[fetchData] Retrieving attachments metadata from DB for ${dbQueryEntryIds.length} entries via SWR...`);
                const loadStart = performance.now();
                const { attachments, aiAttachments } = await fetchAttachmentsDeduplicated(dbQueryEntryIds);
                const loadDuration = performance.now() - loadStart;
                console.log(`[Performance] Attachments loaded in ${loadDuration.toFixed(2)}ms for ${dbQueryEntryIds.length} entries`);

                const manualMap = new Map<string, string[]>();
                attachments.forEach((a: any) => {
                  const list = manualMap.get(a.entry_id) || [];
                  list.push(a.file_url);
                  manualMap.set(a.entry_id, list);
                });

                const aiMap = new Map<string, string[]>();
                aiAttachments.forEach((a: any) => {
                  const list = aiMap.get(a.entry_id) || [];
                  list.push(a.file_url);
                  aiMap.set(a.entry_id, list);
                });

                let cacheChanged = false;
                dbQueryEntryIds.forEach(id => {
                  const manualImgs = (manualMap.get(id) || []).slice(0, 20);
                  const aiImgs = (aiMap.get(id) || []).slice(0, 20);
                  const combinedImgs = [...manualImgs, ...aiImgs];
                  const isAi = aiImgs.length > 0;
                  
                  const cached = attachmentCache.get(id);
                  if (!cached || JSON.stringify(cached.images) !== JSON.stringify(combinedImgs) || cached.isAi !== isAi) {
                    attachmentCache.set(id, { images: combinedImgs, isAi });
                    cacheChanged = true;
                  }
                });

                if (cacheChanged) {
                  persistAttachmentCacheToStorage();
                  setBooks(prevBooks => prevBooks.map(b => b.id === activeBookId ? {
                    ...b,
                    transactions: b.transactions.map((t: any) => {
                      const cached = attachmentCache.get(t.id);
                      if (cached) {
                        return {
                          ...t,
                          images: cached.images,
                          isAi: cached.isAi
                        };
                      }
                      return t;
                    })
                  } : b));
                }
              } catch (err) {
                console.error('[fetchData] Background SWR images lazy-fetch error:', err);
              }
            })();
          }
        }

        if (lastBookOpenStart.current !== null) {
          const openDuration = performance.now() - lastBookOpenStart.current;
          console.log(`[Performance] Cashbook ID: ${activeBookId} opened and rendered in ${openDuration.toFixed(2)}ms`);
          lastBookOpenStart.current = null;
        }

        console.log('[fetchData] Refresh completed loaded. Books count:', cashbooks.length);
      }
    } catch (error: any) {
      console.error('Error fetching data from Supabase:', error);
      const isFailedToFetch = error?.message?.includes('Failed to fetch') || error?.message === 'Failed to fetch';
      if (isFailedToFetch && (cachedCashbooks || (Array.isArray(books) && books.length > 0))) {
        console.warn('[fetchData] Failed to fetch live data from Supabase, relying safely on local cache.');
      } else {
        setError(error.message || 'Failed to fetch data');
      }
    } finally {
      setIsLoading(false);
      setIsEntriesLoading(false);
    }
  }, [session, activeBookId]);

  // Fetch data from Supabase init
  useEffect(() => {
    fetchData();
  }, [session, fetchData]);

  // Automatic migration utility for legacy base64 images in database tables
  useEffect(() => {
    if (!supabase || !session) return;

    let isSubscribed = true;

    async function runDatabaseMigration() {
      try {
        console.log('[Migration] Checking for legacy base64 image rows in Supabase...');

        // 1. Query attachments table where file_url starts with data:
        const { data: legacyAttachments, error: error1 } = await supabase
          .from('attachments')
          .select('*')
          .like('file_url', 'data:%');

        if (error1) {
          console.error('[Migration] Error checking legacy attachments:', error1);
        } else if (legacyAttachments && legacyAttachments.length > 0) {
          console.log(`[Migration] Found ${legacyAttachments.length} base64 attachment rows to migrate.`);
          for (const row of legacyAttachments) {
            if (!isSubscribed) return;
            try {
              console.log(`[Migration] Migrating attachment item ${row.id}...`);
              const userIdentifier = session?.user?.email || session?.user?.id || 'anonymous';
              const cloudinaryFolder = `trackbook/${userIdentifier}`;
              const cloudinaryUrl = await uploadToCloudinary(row.file_url, cloudinaryFolder);
              
              if (cloudinaryUrl) {
                const { error: updateError } = await supabase
                  .from('attachments')
                  .update({ file_url: cloudinaryUrl })
                  .eq('id', row.id);
                  
                if (updateError) {
                  throw updateError;
                }
                console.log(`[Migration] successfully migrated attachment row ${row.id} to Cloudinary.`);
              }
            } catch (err) {
              console.error(`[Migration] Failed to migrate attachment row ${row.id}:`, err);
            }
          }
        }

        // 2. Query ai_attachments table where file_url starts with data:
        const { data: legacyAiAttachments, error: error2 } = await supabase
          .from('ai_attachments')
          .select('*')
          .like('file_url', 'data:%');

        if (error2) {
          console.error('[Migration] Error checking legacy ai_attachments:', error2);
        } else if (legacyAiAttachments && legacyAiAttachments.length > 0) {
          console.log(`[Migration] Found ${legacyAiAttachments.length} base64 AI attachment rows to migrate.`);
          for (const row of legacyAiAttachments) {
            if (!isSubscribed) return;
            try {
              console.log(`[Migration] Migrating AI attachment item ${row.id}...`);
              const userIdentifier = session?.user?.email || session?.user?.id || 'anonymous';
              const cloudinaryFolder = `trackbook/${userIdentifier}`;
              const cloudinaryUrl = await uploadToCloudinary(row.file_url, cloudinaryFolder);
              
              if (cloudinaryUrl) {
                const { error: updateError } = await supabase
                  .from('ai_attachments')
                  .update({ file_url: cloudinaryUrl })
                  .eq('id', row.id);
                  
                if (updateError) {
                  throw updateError;
                }
                console.log(`[Migration] successfully migrated AI attachment row ${row.id} to Cloudinary.`);
              }
            } catch (err) {
              console.error(`[Migration] Failed to migrate AI attachment row ${row.id}:`, err);
            }
          }
        }

        // 3. Try "images" table with "image_url" column if applicable
        try {
          const { data: legacyImages, error: error3 } = await supabase
            .from('images')
            .select('*')
            .like('image_url', 'data:%');

          if (!error3 && legacyImages && legacyImages.length > 0) {
            console.log(`[Migration] Found ${legacyImages.length} base64 images rows to migrate.`);
            for (const row of legacyImages) {
              if (!isSubscribed) return;
              try {
                console.log(`[Migration] Migrating image item ${row.id}...`);
                const userIdentifier = session?.user?.email || session?.user?.id || 'anonymous';
                const cloudinaryFolder = `trackbook/${userIdentifier}`;
                const cloudinaryUrl = await uploadToCloudinary(row.image_url, cloudinaryFolder);
                
                if (cloudinaryUrl) {
                  const { error: updateError } = await supabase
                    .from('images')
                    .update({ image_url: cloudinaryUrl })
                    .eq('id', row.id);
                    
                  if (updateError) {
                    throw updateError;
                  }
                  console.log(`[Migration] successfully migrated images row ${row.id} to Cloudinary.`);
                }
              } catch (err) {
                console.log(`[Migration] Failed on images row ${row.id}:`, err);
              }
            }
          }
        } catch (e) {
          // Ignore, expected if images table doesn't exist
        }

        // If any migrations were done, trigger refresh of current books
        if (isSubscribed) {
          fetchData(true);
        }

      } catch (err) {
        console.error('[Migration] Failed migration checks:', err);
      }
    }

    const timer = setTimeout(() => {
      runDatabaseMigration();
    }, 4000);

    return () => {
      isSubscribed = false;
      clearTimeout(timer);
    };
  }, [session, supabase]);

  // Autofocus description when form is shown
  useEffect(() => {
    if (showForm) {
      setTimeout(() => {
        descriptionInputRef.current?.focus();
      }, 120);
    }
  }, [showForm]);

  // Save to localStorage as fallback (without heavy images to avoid quota errors)
  useEffect(() => {
    if (books.length > 0 && session) {
      try {
        const booksToSave = books.map(book => ({
          ...book,
          transactions: book.transactions.map(t => {
            const { images, ...rest } = t;
            return rest;
          })
        }));
        localStorage.setItem(`cashbooks_${session.user.id}`, JSON.stringify(booksToSave));
      } catch (e) {
        console.warn('Failed to save to localStorage (Quota likely exceeded):', e);
      }
    }
  }, [books, session]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (reportsRef.current && !reportsRef.current.contains(event.target as Node)) {
        setShowReportsMenu(false);
      }
      if (bookMenuRef.current && !bookMenuRef.current.contains(event.target as Node)) {
        setShowBookMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeBook = useMemo(() => 
    books.find(b => b.id === activeBookId), 
  [books, activeBookId]);

  const filteredBooks = useMemo(() => 
    books.filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase())),
  [books, searchQuery]);

  const totals = useMemo(() => {
    if (!activeBook) return { in: 0, out: 0, net: 0 };
    const cashIn = activeBook.transactions
      .filter(t => t.type === 'in')
      .reduce((sum, t) => sum + t.amount, 0);
    const cashOut = activeBook.transactions
      .filter(t => t.type === 'out')
      .reduce((sum, t) => sum + t.amount, 0);
    return {
      in: cashIn,
      out: cashOut,
      net: cashIn - cashOut
    };
  }, [activeBook]);

  const filteredTransactions = useMemo(() => {
    if (!activeBook) return [];
    const filtered = activeBook.transactions.filter(t => {
      const matchesSearch = t.description.toLowerCase().includes(transactionSearchQuery.toLowerCase()) || 
                            t.amount.toString().includes(transactionSearchQuery) ||
                            t.category.toLowerCase().includes(transactionSearchQuery.toLowerCase()) ||
                            t.mode.toLowerCase().includes(transactionSearchQuery.toLowerCase());
      const matchesType = transactionTypeFilter === 'all' || t.type === transactionTypeFilter;
      
      // Category Filter
      const matchesCategory = transactionCategoryFilter === 'All' || t.category === transactionCategoryFilter;

      // Duration Filter
      let matchesDuration = true;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);

      if (transactionDurationFilter === 'Today') {
        matchesDuration = t.date >= today;
      } else if (transactionDurationFilter === 'Yesterday') {
        matchesDuration = t.date >= yesterday && t.date < today;
      } else if (transactionDurationFilter === 'Last Week') {
        matchesDuration = t.date >= lastWeek;
      }

      return matchesSearch && matchesType && matchesCategory && matchesDuration;
    });

    // Apply Dynamic Sorting
    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortColumn === 'category') {
        // Primary: Category, Secondary: Date (newest first)
        comparison = a.category.localeCompare(b.category);
        if (comparison === 0) {
          comparison = b.date.getTime() - a.date.getTime();
        }
      } else {
        // Primary: Date (newest first), Secondary: Category
        comparison = b.date.getTime() - a.date.getTime();
        if (comparison === 0) {
          comparison = a.category.localeCompare(b.category);
        }
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [activeBook, transactionSearchQuery, transactionTypeFilter, transactionCategoryFilter, transactionDurationFilter, sortColumn, sortDirection]);

  // Reset visibleCount whenever the selected book or filters change to keep viewport neat and clean
  useEffect(() => {
    setVisibleCount(20);
  }, [activeBookId, transactionSearchQuery, transactionTypeFilter, transactionCategoryFilter, transactionDurationFilter]);

  // Pre-calculate running balances for transaction list items with smart cached incremental logic
  const runningBalancesMap = useMemo(() => {
    if (!activeBookId) return new Map<string, number>();
    
    // Create a signature of the current list of filteredTransactions
    // To see if we can instantly reuse the cached map!
    const sig = filteredTransactions.map(t => `${t.id}_${t.amount}_${t.type}`).join('|');
    const cachedSig = computedBalancesSignatureCache.get(activeBookId);
    if (cachedSig === sig && computedBalancesCache.has(activeBookId)) {
      return computedBalancesCache.get(activeBookId)!;
    }
    
    const map = new Map<string, number>();
    // Calculate running balances incrementally starting from oldest (end of array) to newest (start of array, index 0)
    let current = 0;
    for (let i = filteredTransactions.length - 1; i >= 0; i--) {
      const t = filteredTransactions[i];
      current += (t.type === 'in' ? t.amount : -t.amount);
      map.set(t.id, current);
    }
    
    computedBalancesCache.set(activeBookId, map);
    computedBalancesSignatureCache.set(activeBookId, sig);
    return map;
  }, [filteredTransactions, activeBookId]);

  // Sliced set of transactions currently visible in the UI viewport
  const pagedTransactions = useMemo(() => {
    return filteredTransactions.slice(0, visibleCount);
  }, [filteredTransactions, visibleCount]);

  const selectedList = useMemo(() => {
    return filteredTransactions.filter(t => selectedTransactions.has(t.id));
  }, [filteredTransactions, selectedTransactions]);

  const selectedTotals = useMemo(() => {
    let cashIn = 0;
    let cashOut = 0;
    selectedList.forEach(t => {
      if (t.type === 'in') {
        cashIn += Number(t.amount);
      } else {
        cashOut += Number(t.amount);
      }
    });
    return { in: cashIn, out: cashOut };
  }, [selectedList]);

  const {
    startIndex: desktopStart,
    endIndex: desktopEnd,
    paddingTop: desktopPaddingTop,
    paddingBottom: desktopPaddingBottom,
  } = useVirtualWindow({
    itemsCount: pagedTransactions.length,
    itemHeight: 64,
    containerRef: desktopTableRef,
  });

  const {
    startIndex: mobileStart,
    endIndex: mobileEnd,
    paddingTop: mobilePaddingTop,
    paddingBottom: mobilePaddingBottom,
  } = useVirtualWindow({
    itemsCount: pagedTransactions.length,
    itemHeight: 132,
    containerRef: mobileContainerRef,
  });

  // Auto load more while scrolling (Infinite scrolling)
  useEffect(() => {
    const handleScrollForInfinite = () => {
      if (filteredTransactions.length <= visibleCount) return;
      
      const threshold = 450; // px from bottom of the page
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;
      const scrollPos = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
      
      if (scrollHeight - clientHeight - scrollPos < threshold) {
        setVisibleCount(prev => prev + 20);
      }
    };
    
    window.addEventListener('scroll', handleScrollForInfinite, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScrollForInfinite);
    };
  }, [filteredTransactions.length, visibleCount]);

  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBookName.trim() || !session) return;
    
    // Optimization: Don't show submitting overlay for simple book creation if it's too slow
    // Or just make it very quick.
    setIsSubmitting(true);
    setSubmittingMessage('Creating new book...');
    
    const newBook: Cashbook = {
      id: safeUUID(),
      name: newBookName,
      transactions: [],
      createdAt: new Date()
    };

    // Update local state immediately for perceived speed
    setBooks(prev => [...prev, newBook]);
    setNewBookName('');
    setIsCreatingBook(false);
    setIsSubmitting(false);

    // Then handle Supabase in background
    if (supabase) {
      try {
        const { error } = await supabase
          .from('cashbooks')
          .insert([{ 
            id: newBook.id, 
            name: newBook.name, 
            created_at: safeToISOString(newBook.createdAt),
            user_id: session.user.id 
          }]);
        if (error) throw error;
      } catch (error) {
        console.error('Error creating book in Supabase:', error);
        // If it fails, we might want to revert local state, but usually it's fine
      }
    }
  };

  const handleUpdateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBookName.trim() || !isEditingBook || !session) return;

    if (supabase) {
      try {
        const { error } = await supabase
          .from('cashbooks')
          .update({ name: editBookName })
          .eq('id', isEditingBook)
          .eq('user_id', session.user.id);
        if (error) throw error;
      } catch (error) {
        console.error('Error updating book in Supabase:', error);
      }
    }

    setBooks(books.map(b => b.id === isEditingBook ? { ...b, name: editBookName } : b));
    setIsEditingBook(null);
    setEditBookName('');
  };

  const handleAskAi = async () => {
    if (!helpQuery.trim()) return;
    setIsHelpLoading(true);
    setHelpResponse('');
    
    try {
      const ai = new GoogleGenAI({ apiKey: getApiKey() });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: helpQuery,
        config: {
          systemInstruction: "You are a helpful assistant for 'Track Book', a financial management app. The app allows users to create multiple books, add transactions (Cash In/Out), upload receipt images for AI detection (using Gemini), and export reports in Excel/PDF. Users can also filter transactions by type, category, and duration. Answer the user's question about how to use the app or general financial advice within the context of this app. Keep it concise.",
        },
      });
      setHelpResponse(response.text || "I'm sorry, I couldn't generate a response.");
    } catch (err) {
      console.error('Error asking AI:', err);
      setHelpResponse("Sorry, I encountered an error while processing your request.");
    } finally {
      setIsHelpLoading(false);
    }
  };

  const handleDeleteBook = (id: string) => {
    vibrate(50);
    setDeleteConfirmId(id);
    setDeleteConfirmed(false);
  };

  const confirmDeleteBook = async () => {
    if (deleteConfirmId && session) {
      if (supabase) {
        try {
          const { error } = await supabase
            .from('cashbooks')
            .delete()
            .eq('id', deleteConfirmId)
            .eq('user_id', session.user.id);
          if (error) throw error;
        } catch (error) {
          console.error('Error deleting book from Supabase:', error);
        }
      }

      setBooks(books.filter(b => b.id !== deleteConfirmId));
      setDeleteConfirmId(null);
      if (activeBookId === deleteConfirmId) {
        setActiveBookId(null);
      }
    }
  };

  const handleBulkDeleteBooks = async () => {
    if (selectedBooks.size === 0 || !session) return;
    
    if (supabase) {
      try {
        const { error } = await supabase
          .from('cashbooks')
          .delete()
          .in('id', Array.from(selectedBooks))
          .eq('user_id', session.user.id);
        if (error) throw error;
      } catch (error) {
        console.error('Error bulk deleting books from Supabase:', error);
      }
    }

    setBooks(books.filter(b => !selectedBooks.has(b.id)));
    setSelectedBooks(new Set());
    setShowBulkDeleteConfirm(false);
  };

  const uploadSingleImageInBackground = async (blobUrl: string, transactionId: string, folderName: string) => {
    const file = imageFilesRef.current[blobUrl];
    if (!file) {
      console.warn('[BackgroundUpload] No file found in registry for blobUrl:', blobUrl);
      return;
    }

    setUploadStatuses(prev => ({
      ...prev,
      [blobUrl]: { status: 'uploading' }
    }));

    try {
      // 1. Compress image in background
      console.log('[BackgroundUpload] Compressing image...', file.name);
      const compressedBlob = await compressImage(file);
      const compressedFile = new File([compressedBlob], file.name || 'compressed.jpg', { type: 'image/jpeg' });

      // 2. Upload to Cloudinary
      console.log('[BackgroundUpload] Uploading compressed file to Cloudinary...', file.name);
      const cloudUrl = await uploadToCloudinary(compressedFile, folderName);
      console.log('[BackgroundUpload] Upload completed successfully:', cloudUrl);

      // 3. Save into Supabase 'attachments' table permanently
      if (supabase && session) {
        const validatedUrl = await validateAndResolveCloudinaryUrl(cloudUrl, session.user.id);
        console.log('[BackgroundUpload] Saving attachment metadata to database...', { transactionId, file_url: validatedUrl });
        const { error: insertError } = await supabase
          .from('attachments')
          .insert([{
            entry_id: transactionId,
            user_id: session.user.id,
            file_url: validatedUrl,
            file_name: file.name || 'manual_upload',
            file_type: 'image'
          }]);
        if (insertError) throw insertError;
      }

      // 4. Update local transaction images list: replace local blob URL with permanent Cloudinary URL
      setBooks(prevBooks => prevBooks.map(b => {
        if (b.id !== activeBookId) return b;
        return {
          ...b,
          transactions: b.transactions.map(t => {
            if (t.id !== transactionId) return t;
            const updatedImages = (t.images || []).map(img => img === blobUrl ? cloudUrl : img);
            return {
              ...t,
              images: updatedImages
            };
          })
        };
      }));

      // Update status to success
      setUploadStatuses(prev => ({
        ...prev,
        [blobUrl]: { status: 'success' }
      }));

      // Clean up the URL object reference
      try {
        URL.revokeObjectURL(blobUrl);
      } catch (err) {}
      delete imageFilesRef.current[blobUrl];

    } catch (err: any) {
      console.error('[BackgroundUpload] Failed to process background upload:', err);
      setUploadStatuses(prev => ({
        ...prev,
        [blobUrl]: { status: 'failed', error: err.message || 'Upload failed' }
      }));
    }
  };

  const handleRetryUpload = (blobUrl: string, transactionId: string) => {
    const userIdentifier = session?.user?.email || session?.user?.id || 'anonymous';
    const cloudinaryFolder = `trackbook/${userIdentifier}`;
    uploadSingleImageInBackground(blobUrl, transactionId, cloudinaryFolder);
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBookId || !showForm || !amount || !session) return;

    const finalCategory = category === 'Custom' ? customCategory : category;
    const finalMode = mode === 'Custom' ? customMode : mode;
    const amountNum = parseFloat(amount);
    const dateObj = new Date(transactionDate);

    setIsSubmitting(true);
    setError(null);

    const userIdentifier = session?.user?.email || session?.user?.id || 'anonymous';
    const cloudinaryFolder = `trackbook/${userIdentifier}`;

    try {
      if (editingTransaction) {
        console.log('[handleAddTransaction] Optimistic Edit Mode for existing ID:', editingTransaction.id);

        // Keep local state up-to-date instantly with current selectedImages which includes blob URLs for instant rendering.
        const updatedTransaction: Transaction = {
          ...editingTransaction,
          amount: amountNum,
          type: showForm,
          description: description,
          category: finalCategory || 'General',
          mode: finalMode,
          date: dateObj,
          images: selectedImages,
          imageLayout: imageLayout
        };

        // Update entriesCache
        const currCached = entriesCache.get(activeBookId);
        if (currCached) {
          entriesCache.set(activeBookId, currCached.map(t => t.id === editingTransaction.id ? { 
            ...t, 
            amount: amountNum, 
            type: showForm, 
            description: description, 
            category: finalCategory || 'General', 
            mode: finalMode, 
            date: dateObj, 
            image_layout: imageLayout 
          } : t));
        }

        // Update the books local cache state instantly
        setBooks(prevBooks => prevBooks.map(b => 
          b.id === activeBookId 
            ? { 
                ...b, 
                transactions: b.transactions.map(t => t.id === editingTransaction.id ? updatedTransaction : t)
              }
            : b
        ));

        // Let form shut down instantly!
        setShowForm(null);
        setEditingTransaction(null);
        resetForm();
        setIsSubmitting(false);

        // Run direct database updates on textual metadata in background
        if (supabase) {
          const payload: any = {
            amount: amountNum,
            type: showForm,
            description: description,
            category: finalCategory || 'General',
            mode: finalMode,
            date: safeToISOString(dateObj)
          };

          (async () => {
            try {
              console.log('[BackgroundSave] Updating entry fields in Supabase...');
              const { error: entryError } = await supabase
                .from('entries')
                .update({ ...payload, image_layout: imageLayout })
                .eq('id', editingTransaction.id)
                .eq('user_id', session.user.id);
              
              if (entryError) {
                if (entryError.code === '42703' || entryError.message?.includes('column "image_layout" does not exist')) {
                  console.warn('[BackgroundSave] image_layout missing in schema, retrying text-only...');
                  const { error: retryError } = await supabase
                    .from('entries')
                    .update(payload)
                    .eq('id', editingTransaction.id)
                    .eq('user_id', session.user.id);
                  if (retryError) throw retryError;
                } else {
                  throw entryError;
                }
              }

              // Remove from attachments table those that were removed in UI editor (images not present in selectedImages)
              const keptImages = selectedImages.filter((img) => !img.startsWith('blob:') && !img.startsWith('data:'));
              console.log('[BackgroundSave] Removing deleted attachments from database. Remaining Cloudinary count:', keptImages.length);
              let deleteQuery = supabase.from('attachments').delete().eq('entry_id', editingTransaction.id);
              if (keptImages.length > 0) {
                deleteQuery = deleteQuery.not('file_url', 'in', `(${keptImages.map(x => `"${x}"`).join(',')})`);
              }
              const { error: deleteError } = await deleteQuery;
              if (deleteError) {
                console.error('[BackgroundSave] Warning: attachments sync error:', deleteError);
              }

              // Start background parallel upload triggers for newly added local blob URLs
              const newBlobs = selectedImages.filter(img => img.startsWith('blob:'));
              newBlobs.forEach(blobUrl => {
                uploadSingleImageInBackground(blobUrl, editingTransaction.id, cloudinaryFolder);
              });
            } catch (err: any) {
              console.error('[BackgroundSave] Supabase sync failure on edit:', err);
            }
          })();
        }

      } else {
        console.log('[handleAddTransaction] Optimistic Creation Mode...');
        
        const tempId = safeUUID();

        // 1. Instantly render new row in client UI viewport (Optimistic Rendering)
        const newTransaction: Transaction = {
          id: tempId,
          amount: amountNum,
          type: showForm,
          description: description,
          category: finalCategory || 'General',
          mode: finalMode,
          date: dateObj,
          images: selectedImages,
          imageLayout: imageLayout
        };

        // Instantly save images in attachmentCache so they persist even if user switches or scrolls immediately
        attachmentCache.set(tempId, { images: selectedImages, isAi: false });

        // Update entriesCache
        const currCached = entriesCache.get(activeBookId) || [];
        entriesCache.set(activeBookId, [{ 
          id: tempId, 
          amount: amountNum, 
          type: showForm, 
          description: description, 
          category: finalCategory || 'General', 
          mode: finalMode, 
          date: dateObj, 
          image_layout: imageLayout,
          user_id: session.user.id,
          cashbook_id: activeBookId
        }, ...currCached]);

        setBooks(prevBooks => prevBooks.map(b => 
          b.id === activeBookId 
            ? { ...b, transactions: [newTransaction, ...b.transactions] }
            : b
        ));

        // Let field inputs reset while keeping the form open or closed based on submitAndAddNew state
        if (submitAndAddNew) {
          resetFormFields(true); // reset inputs but preserve mode
          setQuickAddSuccess(true);
          setTimeout(() => setQuickAddSuccess(false), 1500);
          setIsSubmitting(false);

          // Focus description right after reset
          setTimeout(() => {
            descriptionInputRef.current?.focus();
          }, 80);
        } else {
          // Shutdown popup form immediately, giving an incredibly fast, instant UI visual feel!
          setShowForm(null);
          resetForm();
          setIsSubmitting(false);
        }

        // 2. Perform background DB core insertion & attachments pipeline
        if (supabase) {
          const payload: any = {
            id: tempId,
            cashbook_id: activeBookId,
            user_id: session.user.id,
            amount: amountNum,
            type: showForm,
            description: description,
            category: finalCategory || 'General',
            mode: finalMode,
            date: safeToISOString(dateObj)
          };

          (async () => {
            try {
              console.log('[BackgroundSave] Inserting new entry core into Supabase:', tempId);
              const { error: entryError } = await supabase
                .from('entries')
                .insert([{ ...payload, image_layout: imageLayout }]);
              
              if (entryError) {
                if (entryError.code === '42703' || entryError.message?.includes('column "image_layout" does not exist')) {
                  console.warn('[BackgroundSave] image_layout missing in schema, falling back to schema fields only...');
                  const { error: retryError } = await supabase
                    .from('entries')
                    .insert([payload]);
                  if (retryError) throw retryError;
                } else {
                  throw entryError;
                }
              }

              // Start parallel background upload tasks for selected local blob images
              const newBlobs = selectedImages.filter(img => img.startsWith('blob:'));
              newBlobs.forEach(blobUrl => {
                uploadSingleImageInBackground(blobUrl, tempId, cloudinaryFolder);
              });
            } catch (err: any) {
              console.error('[BackgroundSave] Supabase insert transaction background sync failure:', err);
            }
          })();
        } else {
          // If no Supabase (offline/localStorage mode), clean cache
          selectedImages.forEach(blobUrl => {
            if (blobUrl.startsWith('blob:')) {
              try {
                URL.revokeObjectURL(blobUrl);
              } catch (e) {}
              delete imageFilesRef.current[blobUrl];
            }
          });
        }
      }
    } catch (error: any) {
      console.error('[handleAddTransaction] Error in optimistic transaction flow:', error);
      setError(error.message || 'Transaction submission failed');
      setIsSubmitting(false);
    }
  };

  const handleDeleteTransaction = (id: string) => {
    vibrate(50);
    setTransactionToDelete(id);
    setDeleteConfirmed(false);
  };

  const confirmDeleteTransaction = async () => {
    if (!activeBookId || !transactionToDelete || !session) return;

    const idToDelete = transactionToDelete;

    // Close the confirmation modal to keep UI responsive
    setTransactionToDelete(null);

    // Trigger delete animation
    setAnimatingDeleteId(idToDelete);

    // Wait for the animation (300ms)
    await new Promise(resolve => setTimeout(resolve, 300));

    if (supabase) {
      try {
        const { error } = await supabase
          .from('entries')
          .delete()
          .eq('id', idToDelete)
          .eq('user_id', session.user.id);
        if (error) throw error;
      } catch (error) {
        console.error('Error deleting entry from Supabase:', error);
      }
    }

    // Synchronize entries cache for the active book
    const currCached = entriesCache.get(activeBookId);
    if (currCached) {
      entriesCache.set(activeBookId, currCached.filter(t => t.id !== idToDelete));
    }

    setBooks(books.map(b => 
      b.id === activeBookId 
        ? { ...b, transactions: b.transactions.filter(t => t.id !== idToDelete) }
        : b
    ));
    setSelectedTransactions(prev => {
      const next = new Set(prev);
      next.delete(idToDelete);
      return next;
    });
    setAnimatingDeleteId(null);
  };

  const handleBulkDelete = async () => {
    if (!activeBookId || selectedTransactions.size === 0 || !session) return;

    if (supabase) {
      try {
        const { error } = await supabase
          .from('entries')
          .delete()
          .in('id', Array.from(selectedTransactions))
          .eq('user_id', session.user.id);
        if (error) throw error;
      } catch (error) {
        console.error('Error bulk deleting entries from Supabase:', error);
      }
    }

    setBooks(books.map(b => 
      b.id === activeBookId 
        ? { ...b, transactions: b.transactions.filter(t => !selectedTransactions.has(t.id)) }
        : b
    ));
    setSelectedTransactions(new Set());
    setShowBulkTransactionDeleteConfirm(false);
  };

  const handleEditTransaction = (t: Transaction) => {
    setEditingTransaction(t);
    setShowForm(t.type);
    setAmount(t.amount.toString());
    setDescription(t.description);
    setCategory(CATEGORIES.includes(t.category) ? t.category : 'Custom');
    if (!CATEGORIES.includes(t.category)) setCustomCategory(t.category);
    setMode(MODES.includes(t.mode) ? t.mode : 'Custom');
    if (!MODES.includes(t.mode)) setCustomMode(t.mode);
    setTransactionDate(safeToDateTimeLocal(t.date));
    setSelectedImages(t.images || []);
    setImageLayout(t.imageLayout || 'split');
  };

  const toggleSelectTransaction = (id: string) => {
    setSelectedTransactions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedTransactions.size === filteredTransactions.length) {
      setSelectedTransactions(new Set());
    } else {
      setSelectedTransactions(new Set(filteredTransactions.map(t => t.id)));
    }
  };

  const generateShareCode = () => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `TBK-${result}`;
  };

  const handleCopy = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGenerateShareCode = async () => {
    if (selectedList.length === 0 || !session) return;
    if (isGenerating) return; // Atomic loading lock protection
    setIsGenerating(true);
    setShareError('');
    setRestoredMessage('');
    try {
      const nowIso = new Date().toISOString();
      const ids = selectedList.map(t => t.id).filter(Boolean);
      const signature = generateEntriesSignature(ids);

      // Run cleanup on expired entries first
      try {
        await supabase
          .from('shared_entries')
          .delete()
          .lt('expires_at', nowIso);
      } catch (cleanErr) {
        console.warn('Error during pre-share expired cleanup:', cleanErr);
      }

      console.log('[ShareCode] Checking for existing active share session...');
      let existingActiveSession: any = null;

      try {
        // Try to query directly with entries_signature and cashbook_id
        const { data: primaryData, error: primaryErr } = await supabase
          .from('shared_entries')
          .select('share_code, expires_at, entries_json')
          .eq('created_by', session.user.id)
          .eq('cashbook_id', activeBookId)
          .eq('entries_signature', signature)
          .gt('expires_at', nowIso);

        if (!primaryErr && primaryData && primaryData.length > 0) {
          existingActiveSession = primaryData[0];
          console.log('[ShareCode] Primary matching session found:', existingActiveSession.share_code);
        } else if (primaryErr && (primaryErr.code === '42703' || primaryErr.message?.includes('column') || primaryErr.message?.includes('does not exist'))) {
          console.warn('[ShareCode] entries_signature column missing on select, using client-side fallback matching...');
          // Fallback querying user's active codes of this cashbook
          const { data: fallbackData, error: fallbackErr } = await supabase
            .from('shared_entries')
            .select('share_code, expires_at, entries_json')
            .eq('created_by', session.user.id)
            .gt('expires_at', nowIso);

          if (!fallbackErr && fallbackData) {
            existingActiveSession = fallbackData.find((row: any) => {
              if (!Array.isArray(row.entries_json)) return false;
              const rowIds = row.entries_json.map((e: any) => e.id).filter(Boolean);
              return generateEntriesSignature(rowIds) === signature;
            });
          }
        }
      } catch (err) {
        console.warn('[ShareCode] Error during direct session checking:', err);
      }

      if (existingActiveSession) {
        const reusedCode = existingActiveSession.share_code;
        const expiryTime = new Date(existingActiveSession.expires_at).getTime();
        setGeneratedCode(reusedCode);
        setShareExpiryTime(expiryTime);
        
        setRestoredMessage("Previous active share session restored");
        setTimeout(() => setRestoredMessage(''), 4000);

        if (activeBookId) {
          localStorage.setItem(`trackbook_share_session_${activeBookId}`, JSON.stringify({
            code: reusedCode,
            expiry: expiryTime
          }));
        }
        setIsGenerating(false);
        return;
      }

      // No matching session found: delete previous active state for this cashbook before adding a new one
      if (activeBookId) {
        const savedSessionStr = localStorage.getItem(`trackbook_share_session_${activeBookId}`);
        if (savedSessionStr) {
          try {
            const savedSession = JSON.parse(savedSessionStr);
            if (savedSession && savedSession.code) {
              await supabase
                .from('shared_entries')
                .delete()
                .eq('share_code', savedSession.code.toUpperCase());
            }
          } catch (e) {
            console.warn('Error cleanup old session from DB:', e);
          }
        }
      }

      // Generate a new code
      const code = generateShareCode();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const expiryTime = Date.now() + 5 * 60 * 1000;
      const createdAt = new Date().toISOString();
      
      const payload: any = {
        share_code: code,
        created_by: session.user.id,
        entries_count: selectedList.length,
        expires_at: expiresAt,
        created_at: createdAt,
        cashbook_id: activeBookId,
        entries_signature: signature,
        entries_json: selectedList.map(t => ({
          id: t.id,
          amount: t.amount,
          type: t.type,
          description: t.description,
          category: t.category,
          mode: t.mode,
          date: t.date,
          image_layout: t.imageLayout || 'split',
          images: t.images || []
        }))
      };

      const { error: insertErr } = await supabase
        .from('shared_entries')
        .insert([payload]);

      if (insertErr) {
        console.warn('[ShareCode] Insert with signature failed, falling back...', insertErr.message);
        if (insertErr.code === '42703' || insertErr.message?.includes('column') || insertErr.message?.includes('does not exist')) {
          const { entries_signature, cashbook_id, ...fallbackPayload } = payload;
          const { error: retryErr } = await supabase
            .from('shared_entries')
            .insert([fallbackPayload]);
          if (retryErr) {
            throw new Error(retryErr.message);
          }
        } else {
          throw new Error(insertErr.message);
        }
      }
      
      setGeneratedCode(code);
      setShareExpiryTime(expiryTime);
      setRestoredMessage("New share session generated");
      setTimeout(() => setRestoredMessage(''), 4000);

      // Save current active share session to localStorage
      if (activeBookId) {
        localStorage.setItem(`trackbook_share_session_${activeBookId}`, JSON.stringify({
          code,
          expiry: expiryTime
        }));
      }
    } catch (err: any) {
      console.error('Error generating share code:', err);
      setShareError('Failed to export entries. Clear connection and try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImportSharedEntries = async () => {
    if (!importCode.trim() || !session) return;
    if (isImporting) return; // Atomic loading lock protection (Rule 5)
    setIsImporting(true);
    setImportError('');
    setImportSuccess(false);
    setImportSummary('');
    
    let targetBookId = activeBookId;

    try {
      const cleanedCode = importCode.trim().toUpperCase();
      const nowIso = new Date().toISOString();

      // 1. Supabase query layer validation for existence
      const { data: sharedRow, error: fetchError } = await supabase
        .from('shared_entries')
        .select('entries_json, expires_at')
        .eq('share_code', cleanedCode)
        .maybeSingle();

      if (fetchError) {
        throw new Error('Failed to import entries due to dynamic fetch error.');
      }
      if (!sharedRow || !sharedRow.entries_json) {
        setImportError('Invalid share code. Please double-check and try again.');
        setIsImporting(false);
        return;
      }

      // 2. Clear query layer validation for expiration (expires_at > nowIso)
      const { data: queryLayerVal } = await supabase
        .from('shared_entries')
        .select('share_code')
        .eq('share_code', cleanedCode)
        .gt('expires_at', nowIso)
        .maybeSingle();

      const isExpiredInQueryLayer = !queryLayerVal;
      const isExpiredInFrontend = new Date(sharedRow.expires_at).getTime() < Date.now();

      if (isExpiredInQueryLayer || isExpiredInFrontend) {
        setImportError("This share code has expired.");
        setIsImporting(false);
        return;
      }

      const entriesToImport = sharedRow.entries_json as any[];
      if (!Array.isArray(entriesToImport) || entriesToImport.length === 0) {
        setImportError('No entries found in this shared code.');
        setIsImporting(false);
        return;
      }

      // If there is no active book, create a new book!
      if (!targetBookId) {
        const newBookTitle = `Imported Book (${cleanedCode})`;
        const { data: newBook, error: createError } = await supabase
          .from('cashbooks')
          .insert([{
            name: newBookTitle,
            user_id: session.user.id
          }])
          .select()
          .single();

        if (createError) {
          throw new Error('Failed to create imported cashbook.');
        }
        targetBookId = newBook.id;
        
        // Add to local state
        const newBookWithTransactions = {
          ...newBook,
          transactions: []
        };
        setBooks(prev => [newBookWithTransactions, ...prev]);
      } else {
        // 7. Clear stale import locks automatically after failed imports or refresh interruptions.
        try {
          const { data: locks } = await supabase
            .from('shared_entry_imports')
            .select('id, share_code, cashbook_id')
            .eq('cashbook_id', targetBookId)
            .eq('share_code', cleanedCode);
          
          if (locks && locks.length > 0) {
            for (const lock of locks) {
              const { data: anyEntries } = await supabase
                .from('entries')
                .select('id')
                .eq('cashbook_id', lock.cashbook_id)
                .eq('imported_from_share_code', lock.share_code)
                .limit(1);
              
              if (!anyEntries || anyEntries.length === 0) {
                console.log(`[Import] Clearing stale import lock for code: ${lock.share_code} in cashbook: ${lock.cashbook_id}`);
                await supabase
                  .from('shared_entry_imports')
                  .delete()
                  .eq('id', lock.id);
              }
            }
          }
        } catch (cleanupErr) {
          console.warn('[Import] Non-blocking safety lock cleanup warning:', cleanupErr);
        }
      }

      // Rule 1: Fetch all existing entries in target cashbook beforehand
      let existingEntries: any[] = [];
      try {
        const { data: dbEntries, error: existingErr } = await supabase
          .from('entries')
          .select('id, amount, type, category, description, date, mode, imported_from_share_code')
          .eq('cashbook_id', targetBookId);

        if (!existingErr && dbEntries) {
          existingEntries = dbEntries;
        } else if (existingErr) {
          console.warn('[Import] Primary entries select failed, running fallback...', existingErr.message);
          const { data: fallbackEntries } = await supabase
            .from('entries')
            .select('id, amount, type, category, description, date, mode')
            .eq('cashbook_id', targetBookId);
          if (fallbackEntries) {
            existingEntries = fallbackEntries;
          }
        }
      } catch (e) {
        console.error('[Import] Failed to query existing entries:', e);
      }

      // Rule 2 & 3: Generate deterministic signatures and compare to find final inserts
      const existingSignatures = new Set(existingEntries.map(item => getEntrySignature(item)));
      
      const finalInserts: any[] = [];
      let skippedDuplicatesCount = 0;

      for (const t of entriesToImport) {
        const entrySig = getEntrySignature(t);

        if (existingSignatures.has(entrySig)) {
          // Rule 4: Skip duplicates entirely
          skippedDuplicatesCount++;
        } else {
          finalInserts.push({
            id: safeUUID(),
            amount: parseFloat(t.amount) || 0,
            type: t.type || 'out',
            description: t.description || '',
            category: t.category || 'Food',
            mode: t.mode || 'Cash',
            date: t.date || new Date().toISOString(),
            image_layout: t.image_layout || t.imageLayout || 'split',
            cashbook_id: targetBookId,
            user_id: session.user.id,
            imported_from_share_code: cleanedCode, // Rule 6
            images: t.images || [] // kept in memory for attachments insert
          });
        }
      }

      // If there are no unique entries to import (they all already exist by signature/date)
      if (finalInserts.length === 0) {
        // If 0 duplicates exist, never show duplicate warning (Instruction 8)
        if (skippedDuplicatesCount === 0) {
          setImportSummary("Imported: 0");
        } else {
          setImportSummary(`Imported: 0 | Skipped Duplicates: ${skippedDuplicatesCount}`);
          setImportError("These entries were already imported into this cashbook.");
        }
        setIsImporting(false);
        return;
      }

      // Convert entries list to clean rows for `entries` database schema (strip extra `images` key)
      const cleanInserts = finalInserts.map(({ images, ...rest }) => rest);

      console.log('[Import] Ingesting unique entries to database...', cleanInserts.length);
      const { error: err1 } = await supabase
        .from('entries')
        .insert(cleanInserts);

      if (err1) {
        console.warn('[Import] Attempt 1 failed:', err1.message, err1.code);
        const isColumnError = err1.code === '42703' || 
                              err1.message?.includes('column') || 
                              err1.message?.includes('does not exist');

        if (isColumnError) {
          // Attempt 2: Without imported_from_share_code
          console.log('[Import] Retrying without imported_from_share_code...');
          const inserts2 = cleanInserts.map(({ imported_from_share_code, ...rest }) => rest);
          const { error: err2 } = await supabase
            .from('entries')
            .insert(inserts2);

          if (err2) {
            console.warn('[Import] Attempt 2 failed:', err2.message, err2.code);
            const isColError2 = err2.code === '42703' || 
                                err2.message?.includes('column') || 
                                err2.message?.includes('does not exist');

            if (isColError2) {
              // Attempt 3: Without image_layout
              console.log('[Import] Retrying without image_layout...');
              const inserts3 = cleanInserts.map(({ image_layout, ...rest }) => rest);
              const { error: err3 } = await supabase
                .from('entries')
                .insert(inserts3);

              if (err3) {
                console.warn('[Import] Attempt 3 failed:', err3.message, err3.code);
                const isColError3 = err3.code === '42703' || 
                                    err3.message?.includes('column') || 
                                    err3.message?.includes('does not exist');

                if (isColError3) {
                  // Attempt 4: Without both image_layout and imported_from_share_code
                  console.log('[Import] Retrying without both image_layout and imported_from_share_code...');
                  const inserts4 = cleanInserts.map(({ image_layout, imported_from_share_code, ...rest }) => rest);
                  const { error: err4 } = await supabase
                    .from('entries')
                    .insert(inserts4);

                  if (err4) {
                    console.error('[Import] Attempt 4 failed:', err4);
                    throw new Error('Failed to import entries database save failed.');
                  }
                } else {
                  throw err3;
                }
              }
            } else {
              throw err2;
            }
          }
        } else {
          throw err1;
        }
      }

      // 6. Ensure imported_from_share_code is only written / logged to history after successful insert completion.
      if (targetBookId) {
        try {
          await supabase
            .from('shared_entry_imports')
            .insert([{
              share_code: cleanedCode,
              cashbook_id: targetBookId,
              imported_by: session.user.id,
              imported_at: new Date().toISOString()
            }]);
          console.log('[Import] History logging completed successfully.');
        } catch (historyLogErr) {
          console.warn('[Import] History logging failed:', historyLogErr);
        }
      }

      // Clone entry images into attachments table
      const attachmentInserts: any[] = [];
      finalInserts.forEach(entry => {
        if (Array.isArray(entry.images) && entry.images.length > 0) {
          entry.images.forEach((imgUrl: string) => {
            if (imgUrl) {
              attachmentInserts.push({
                entry_id: entry.id,
                file_url: imgUrl
              });
            }
          });
        }
      });

      if (attachmentInserts.length > 0) {
        try {
          const { error: attachError } = await supabase
            .from('attachments')
            .insert(attachmentInserts);
          if (attachError) {
            console.warn('[ImportGD] attachments saving warning:', attachError);
          }
        } catch (attachmentsCatchErr) {
          console.warn('[ImportGD] attachments catch warning:', attachmentsCatchErr);
        }
      }

      // Optimistic update of the books list locally to prevent freezing or reload latency
      setBooks(prevBooks => {
        return prevBooks.map(b => {
          if (b.id === targetBookId) {
            const mappedNew = finalInserts.map((ins, index) => ({
              id: ins.id || `imported-temp-${index}-${Date.now()}`,
              amount: ins.amount,
              type: ins.type as 'in' | 'out',
              description: ins.description,
              category: ins.category,
              mode: ins.mode,
              date: new Date(ins.date),
              images: ins.images || [],
              imageLayout: (ins.image_layout || 'split') as 'split' | 'merge'
            }));
            return {
              ...b,
              transactions: [...mappedNew, ...b.transactions]
            };
          }
          return b;
        });
      });

      // Clear caches
      if (targetBookId) {
        entriesCache.delete(targetBookId);
        lastFetchTimeCache.delete(targetBookId);
      }

      if (skippedDuplicatesCount === 0) {
        setImportSummary(`Imported: ${finalInserts.length}`);
      } else {
        setImportSummary(`Imported: ${finalInserts.length} | Skipped Duplicates: ${skippedDuplicatesCount}`);
      }
      setImportSuccess(true);
      setImportCode('');
      
      // Fetch fresh data asynchronously while staying optimistic so UI is instant and doesn't block!
      const updatePromise = fetchData();
      if (targetBookId) {
        setActiveBookId(targetBookId);
      }
      
      setTimeout(() => {
        setShowImportModal(false);
        setImportSuccess(false);
        setImportSummary('');
      }, 3000);

    } catch (err: any) {
      console.error('Error importing shared entries:', err);
      setImportError(err.message || 'Failed to import entries. Please try again.');
    } finally {
      setIsImporting(false);
    }
  };

  const resetFormFields = (keepMode?: boolean) => {
    setAmount('');
    setDescription('');
    setCategory('Food');
    setCustomCategory('');
    if (!keepMode) {
      setMode('Cash');
      setCustomMode('');
    }
    setTransactionDate(safeToDateTimeLocal(new Date()));
    setSelectedImages([]);
  };

  const resetForm = () => {
    setShowForm(null);
    setEditingTransaction(null);
    resetFormFields(false);
    setTransactionTypeFilter('all');
    setTransactionDurationFilter('All');
    setTransactionCategoryFilter('All');
    setTransactionSearchQuery('');
    setIsSubmitting(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: string[] = [...selectedImages];
    const filesArray = Array.from(files).slice(0, 5 - selectedImages.length) as File[];

    filesArray.forEach(file => {
      const blobUrl = URL.createObjectURL(file);
      imageFilesRef.current[blobUrl] = file;
      newImages.push(blobUrl);
    });

    setSelectedImages(newImages);
  };

  const exportToExcel = async () => {
    if (!activeBook || reportLoading) return;
    setReportLoading({ type: 'excel', progress: 0 });
    
    // Simulate progress
    for (let i = 0; i <= 100; i += 10) {
      setReportLoading(prev => prev ? { ...prev, progress: i } : null);
      await new Promise(r => setTimeout(r, 100));
    }

    // Calculate PDF page numbers for reference
    let currentPage = 1;
    const transactionPageMap = new Map<string, string>();
    
    const transactionsWithImages = filteredTransactions.filter(t => t.images && t.images.length > 0);
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

    const data = filteredTransactions.map(t => ({
      Date: safeFormatDate(t.date),
      Details: t.description,
      Category: t.category,
      Mode: t.mode,
      'Cash In': t.type === 'in' ? t.amount : 0,
      'Cash Out': t.type === 'out' ? t.amount : 0,
      'Reference': transactionPageMap.get(t.id) || '-'
    }));

    // Add totals and balance as per user reference
    const totalIn = totals.in;
    const totalOut = totals.out;
    const balance = totals.net;

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
    XLSX.writeFile(wb, `${activeBook.name}.xlsx`);
    
    setReportLoading(null);
    setShowReportsMenu(false);
  };
  const exportToPDF = async (isCompressed = true) => {
    if (!activeBook || reportLoading) return;
    try {
      console.log("Starting PDF export. Compressed mode:", isCompressed);
      setReportLoading({ type: 'pdf', progress: 5, message: 'Preparing document setup...' });
      
      // Yield to the browser main thread to render the loading backdrop/popup instantly
      await new Promise(r => setTimeout(r, 60));

      // Feature 11: PDF Object/Stream Compression enabled internally
      const doc = new jsPDF({ compress: true });
      
      setReportLoading({ type: 'pdf', progress: 10, message: 'Scanning cashbook attachments...' });
      await new Promise(r => setTimeout(r, 30));

      // Feature 10: Adaptive Compression by Entry Count
      const isStrongCompression = filteredTransactions.length >= 80;
      if (isCompressed && isStrongCompression) {
        console.log('[PDFExport] 80+ entries detected. Enabling extra aggressive receipt compression.');
      }

      // Attachments only
      const transactionsWithImages = filteredTransactions.filter(t => t.images && t.images.length > 0);
      
      const pool = async <T, R>(
        items: T[],
        limit: number,
        fn: (item: T) => Promise<R>
      ): Promise<R[]> => {
        const results: R[] = [];
        const promises: Promise<void>[] = [];
        let index = 0;

        const run = async (): Promise<void> => {
          const currentIdx = index++;
          if (currentIdx >= items.length) return;
          const item = items[currentIdx];
          results[currentIdx] = await fn(item);
          await run();
        };

        for (let i = 0; i < Math.min(limit, items.length); i++) {
          promises.push(run());
        }

        await Promise.all(promises);
        return results;
      };

      // Inline visual asset helper for jsPDF alias mapping (Feature 5: Prevent Duplicate Embedded Assets)
      const addOptimizedImageToDoc = (
        pdfDoc: jsPDF,
        img: HTMLImageElement | string,
        alias: string,
        x: number,
        y: number,
        w: number,
        h: number
      ) => {
        let format = 'JPEG';
        let src: any = img;
        if (typeof img === 'string') {
          if (img.startsWith('data:image/png')) format = 'PNG';
          else if (img.startsWith('data:image/webp')) format = 'WEBP';
          src = img.includes('base64,') ? img.split('base64,')[1] : img;
        }
        pdfDoc.addImage(src, format as any, x, y, w, h, alias, 'FAST');
      };

      if (transactionsWithImages.length > 0) {
        // Collect all distinct and unique image URLs to compress before PDF rendering begins (Feature 9)
        const allImageUrls: string[] = [];
        transactionsWithImages.forEach(t => {
          if (t.images) {
            t.images.forEach(imgUrl => {
              if (imgUrl && !allImageUrls.includes(imgUrl)) {
                allImageUrls.push(imgUrl);
              }
            });
          }
        });

        // 5. CHUNKED PARALLEL IMAGE LOADING: Fetch in background. Use a queue size of max 5.
        // We do NOT block/await the entire pool. We let the background pool start fetching immediately
        // while we progressively render pages. Since we fetch 5 at a time concurrently, and the PDF drawer 
        // will progressively wait for each image in sequence, this ensures incredible speed and smoothness!
        const prefetchPromises = pool(allImageUrls, 5, async (url) => {
          try {
            return await getCachedOptimizedImage(url, isCompressed, isStrongCompression, () => {});
          } catch (e) {
            console.warn('[PDF] Parallel prefetch failed for url:', url, e);
            return url;
          }
        });

        const totalImages = transactionsWithImages.reduce((acc, t) => acc + (t.images?.length || 0), 0);
        let processedImages = 0;
        let isFirstPage = true;

        for (const t of transactionsWithImages) {
          await new Promise(r => setTimeout(r, 10));

          if (t.images) {
            const layout = t.imageLayout || 'split';
            
            if (layout === 'merge') {
              // Merge layout: 2 images per page side-by-side
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
                const imgHeight = pageHeight * 0.6; // Take 60% of height for side-by-side
                const y = (pageHeight - imgHeight) / 2;

                // Add transaction header
                doc.setFontSize(10);
                doc.setTextColor(80);
                doc.text(`Transaction: ${t.description} (${t.amount}) - ${safeFormatDate(t.date)}`, 10, 10);

                // First image in pair
                try {
                  const rawImg1 = t.images[i];
                  const currentImgIdx = processedImages + 1;
                  setReportLoading({ 
                    type: 'pdf', 
                    progress: Math.min(94, Math.round(10 + (processedImages / totalImages) * 85)),
                    message: `Drawing attachment ${currentImgIdx}/${totalImages} to layout...`
                  });
                  
                  const img1 = await getCachedOptimizedImage(rawImg1, isCompressed, isStrongCompression, () => {});
                  addOptimizedImageToDoc(doc, img1, rawImg1, margin, y, imgWidth, imgHeight);
                } catch (e) { console.error(e); }
                processedImages++;

                await new Promise(r => setTimeout(r, 10));

                // Second image in pair (if exists)
                if (i + 1 < t.images.length) {
                  try {
                    const rawImg2 = t.images[i + 1];
                    const currentImgIdx = processedImages + 1;
                    setReportLoading({ 
                      type: 'pdf', 
                      progress: Math.min(94, Math.round(10 + (processedImages / totalImages) * 85)),
                      message: `Drawing attachment ${currentImgIdx}/${totalImages} to layout...`
                    });
                    
                    const img2 = await getCachedOptimizedImage(rawImg2, isCompressed, isStrongCompression, () => {});
                    addOptimizedImageToDoc(doc, img2, rawImg2, margin + imgWidth + gap, y, imgWidth, imgHeight);
                  } catch (e) { console.error(e); }
                  processedImages++;
                }
              }
            } else {
              // Split layout: 1 image per page (current behavior)
              for (const img of t.images) {
                await new Promise(r => setTimeout(r, 10));

                try {
                  if (!isFirstPage) doc.addPage();
                  isFirstPage = false;
                  
                  const currentImgIdx = processedImages + 1;
                  setReportLoading({ 
                    type: 'pdf', 
                    progress: Math.min(94, Math.round(10 + (processedImages / totalImages) * 85)),
                    message: `Drawing attachment ${currentImgIdx}/${totalImages} to layout...`
                  });

                  const optimizedImg = await getCachedOptimizedImage(img, isCompressed, isStrongCompression, () => {});
                  
                  const pageWidth = doc.internal.pageSize.getWidth();
                  const pageHeight = doc.internal.pageSize.getHeight();
                  const imgWidth = pageWidth * 0.9;
                  const imgHeight = pageHeight * 0.9;
                  const x = (pageWidth - imgWidth) / 2;
                  const y = (pageHeight - imgHeight) / 2;

                  // Add transaction header
                  doc.setFontSize(10);
                  doc.setTextColor(80);
                  doc.text(`Transaction: ${t.description} (${t.amount}) - ${safeFormatDate(t.date)}`, 10, 10);

                  addOptimizedImageToDoc(doc, optimizedImg, img, x, y, imgWidth, imgHeight);
                } catch (e) { console.error(e); }
                
                processedImages++;
              }
            }
          }
        }
      } else {
        doc.setFontSize(12);
        doc.text("No attachments found in this book.", 14, 20);
        await new Promise(r => setTimeout(r, 200));
      }

      setReportLoading({ type: 'pdf', progress: 95, message: 'Finalizing document pagination...' });
      await new Promise(r => setTimeout(r, 100));
      
      const fileName = `${activeBook.name}.pdf`;
      
      // Add page numbers and footer
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        if (i % 4 === 0) {
          await new Promise(r => setTimeout(r, 15));
        }
        
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Page ${i} of ${totalPages}`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 5, { align: 'center' });
        doc.text(`Report: ${activeBook.name}`, 10, doc.internal.pageSize.getHeight() - 5);
        doc.text(new Date().toLocaleDateString('en-IN'), doc.internal.pageSize.getWidth() - 30, doc.internal.pageSize.getHeight() - 5);
      }

      await new Promise(r => setTimeout(r, 50));
      setReportLoading({ type: 'pdf', progress: 98, message: 'Saving PDF file to disk...' });
      doc.save(fileName);
      console.log("PDF saved successfully");
      
      setReportLoading({ type: 'pdf', progress: 100, message: 'Export complete!' });
      await new Promise(r => setTimeout(r, 200));
    } catch (error) {
      console.error("PDF Export failed:", error);
      alert("Failed to download PDF. Please try again.");
    } finally {
      setReportLoading(null);
      setShowReportsMenu(false);
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0 || !activeBookId) return;

    const userIdentifier = session?.user?.email || session?.user?.id || 'anonymous';
    const cloudinaryFolder = `trackbook/${userIdentifier}`;

    // Limit to 5 images as per user request
    const filesToProcess = Array.from(files).slice(0, 5) as File[];

    setIsUploading(true);
    setUploadingMessage('Detecting bills with Gemini...');
    setError(null);

    try {
      if (aiMode === 'merge' && filesToProcess.length > 1) {
        setUploadingMessage('Merging and detecting bills...');
        const imagesData: { base64: string, mimeType: string, raw: string | File }[] = [];
        
        for (const file of filesToProcess) {
          const compressedBlob = await compressImage(file);
          const compressedFile = new File([compressedBlob], file.name || 'compressed.jpg', { type: 'image/jpeg' });
          
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(compressedFile);
          });
          
          imagesData.push({
            base64: base64.split(',')[1],
            mimeType: 'image/jpeg',
            raw: compressedFile
          });
        }

        console.log('[processFiles] Querying Gemini receipt parser for merged receipts...');
        const result = await parseMultipleReceipts(imagesData.map(img => ({ base64: img.base64, mimeType: img.mimeType })));
        
        if (result) {
          setUploadingMessage('Uploading merged bills to Cloudinary...');
          console.log('[processFiles] Uploading receipt documents to Cloudinary store...');
          
          const cloudinaryUrls: string[] = [];
          for (const img of imagesData) {
            try {
              const u = await uploadToCloudinary(img.raw, cloudinaryFolder);
              cloudinaryUrls.push(u);
            } catch (err: any) {
              console.error('[processFiles] Merged Cloudinary upload error:', err);
              throw new Error(`Cloudinary upload failed: ${err.message || err}`);
            }
          }

          const newTransactionId = safeUUID();

          if (supabase && session) {
            setUploadingMessage('Registering transaction in database...');
            console.log('[processFiles] Inserting entry to database:', { id: newTransactionId });
            try {
              const payload: any = {
                id: newTransactionId,
                cashbook_id: activeBookId,
                user_id: session.user.id,
                amount: result.amount,
                type: result.type,
                description: result.description,
                category: result.category,
                mode: 'Online',
                date: safeToISOString(parseAIDate(result.date))
              };

              // Try with image_layout first
              const { error: entryError } = await supabase.from('entries').insert([{ ...payload, image_layout: 'merge' }]);
              
              if (entryError) {
                if (entryError.code === '42703' || entryError.message?.includes('column "image_layout" does not exist')) {
                  console.warn('[processFiles] image_layout missing in schema, retrying fallback...');
                  const { error: retryError } = await supabase.from('entries').insert([payload]);
                  if (retryError) throw retryError;
                } else {
                  throw entryError;
                }
              }

              if (cloudinaryUrls.length > 0) {
                console.log('[processFiles] Saving AI attachments rows...');
                const aiAttachmentInserts = await Promise.all(
                  cloudinaryUrls.map(async (url) => {
                    const validated = await validateAndResolveCloudinaryUrl(url, session.user.id);
                    return {
                      entry_id: newTransactionId,
                      user_id: session.user.id,
                      file_url: validated,
                      file_name: 'ai_merged_bill',
                      file_type: 'image'
                    };
                  })
                );
                const { error: attachError } = await supabase.from('ai_attachments').insert(aiAttachmentInserts);
                if (attachError) throw attachError;
              }

              console.log('[processFiles] Completed insertions, triggering database refetch...');
              await fetchData();
            } catch (error: any) {
              console.error('[processFiles] Error syncing merged AI entry (detailed):', error);
              const msg = error.message || 'Unknown error';
              setError(`Database Sync Error: ${msg}. Please ensure your Supabase "amount" column supports decimals.`);
            }
          } else {
            // Local fallback
            const newTransaction: Transaction = {
              id: newTransactionId,
              amount: result.amount,
              type: result.type,
              description: result.description,
              category: result.category,
              mode: 'Online',
              date: parseAIDate(result.date),
              images: cloudinaryUrls,
              isAi: true,
              imageLayout: 'merge'
            };
            setBooks(prev => prev.map(b => 
              b.id === activeBookId 
                ? { ...b, transactions: [newTransaction, ...b.transactions] }
                : b
            ));
          }
        }
      } else {
        let completed = 0;
        const total = filesToProcess.length;
        
        for (const file of filesToProcess) {
          setUploadingMessage(`Detecting bill ${completed + 1}/${total}...`);
          
          const compressedBlob = await compressImage(file);
          const compressedFile = new File([compressedBlob], file.name || 'compressed.jpg', { type: 'image/jpeg' });
          
          await new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('File reading failed'));
            reader.onloadend = async () => {
              try {
                const base64String = (reader.result as string).split(',')[1];
                console.log(`[processFiles] Uploading file ${completed + 1}/${total} to Gemini...`);
                const result = await parseReceipt(base64String, 'image/jpeg');
                
                if (result) {
                  setUploadingMessage(`Uploading receipt ${completed + 1}/${total} to Cloudinary...`);
                  console.log(`[processFiles] Uploading file ${completed + 1}/${total} to Cloudinary...`);
                  
                  let cloudinaryUrl = '';
                  try {
                    cloudinaryUrl = await uploadToCloudinary(compressedFile, cloudinaryFolder);
                  } catch (err: any) {
                    console.error('[processFiles] Single Cloudinary upload failed:', err);
                    throw new Error(`Cloudinary file upload failed: ${err.message || err}`);
                  }

                  const newTransactionId = safeUUID();
                  completed++;
                  
                  if (supabase && session) {
                    setUploadingMessage(`Saving bill ${completed}/${total} (SQL)...`);
                    try {
                      const payload: any = {
                        id: newTransactionId,
                        cashbook_id: activeBookId,
                        user_id: session.user.id,
                        amount: result.amount,
                        type: result.type,
                        description: result.description,
                        category: result.category,
                        mode: 'Online',
                        date: safeToISOString(parseAIDate(result.date))
                      };

                      // Try with image_layout first
                      const { error: entryError } = await supabase.from('entries').insert([{ ...payload, image_layout: 'split' }]);
                      
                      if (entryError) {
                        if (entryError.code === '42703' || entryError.message?.includes('column "image_layout" does not exist')) {
                          const { error: retryError } = await supabase.from('entries').insert([payload]);
                          if (retryError) throw retryError;
                        } else {
                          throw entryError;
                        }
                      }

                      console.log('[processFiles] Saving single AI image attachment row...');
                      const validatedSingleUrl = await validateAndResolveCloudinaryUrl(cloudinaryUrl, session.user.id);
                      const aiAttachmentInserts = [{
                        entry_id: newTransactionId,
                        user_id: session.user.id,
                        file_url: validatedSingleUrl,
                        file_name: 'ai_detected_bill',
                        file_type: 'image'
                      }];
                      const { error: attachError } = await supabase.from('ai_attachments').insert(aiAttachmentInserts);
                      if (attachError) throw attachError;
                      
                    } catch (error: any) {
                      console.error('[processFiles] Error syncing AI entry:', error);
                      const msg = error.message || 'Unknown error';
                      setError(`AI Sync Error: ${msg}. Your Supabase "amount" column likely needs to be changed to DECIMAL.`);
                    }
                  } else {
                    // Local fallback
                    const newTransaction: Transaction = {
                      id: newTransactionId,
                      amount: result.amount,
                      type: result.type,
                      description: result.description,
                      category: result.category,
                      mode: 'Online',
                      date: parseAIDate(result.date),
                      images: [cloudinaryUrl],
                      isAi: true,
                      imageLayout: 'split'
                    };
                    setBooks(prev => prev.map(b => 
                      b.id === activeBookId 
                        ? { ...b, transactions: [newTransaction, ...b.transactions] }
                        : b
                    ));
                  }
                }
                resolve();
              } catch (err) {
                console.error('Error in file processing callback:', err);
                reject(err);
              }
            };
            reader.readAsDataURL(compressedFile);
          });
        }

        // Fetch everything freshly to finalize the batch update
        if (supabase && session && completed > 0) {
          setUploadingMessage('Syncing backend changes...');
          await fetchData();
        }
      }

      setIsUploading(false);
      setShowDropZone(false);
    } catch (error: any) {
      console.error("[processFiles] Upload/AI chain failed:", error);
      setIsUploading(false);
      setShowDropZone(false);
      setError(error.message || 'Processing failed');
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processFiles(e.target.files);
    }
  };

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
  };

  if (isLoading) {
    return null;
  }

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-300",
      theme === 'dark' ? "bg-black text-slate-100" : "bg-slate-50 text-black"
    )}>
      {/* Error Alert */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-rose-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 sticky top-0 z-[60]"
          >
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-2 hover:bg-white/20 rounded p-0.5 transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Session Restored Alert */}
      <AnimatePresence>
        {restoredMessage && (
          <motion.div
            initial={{ height: 0, opacity: 0, y: -20 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -20 }}
            className="bg-emerald-600 dark:bg-emerald-700 text-white px-4 py-3 text-center text-xs sm:text-xs font-bold flex items-center justify-center gap-2 sticky top-0 z-[60] shadow-md tracking-wide"
          >
            <CheckSquare size={16} />
            <span>{restoredMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Component */}
      {!activeBookId && (
        <header className={cn(
          "border-b sticky top-0 z-50 px-4 h-14 sm:h-16 transition-colors duration-300",
          theme === 'dark' ? "bg-black border-zinc-900" : "bg-white border-slate-100"
        )}>
          <div className="max-w-[98%] mx-auto h-full flex items-center justify-between gap-2 sm:gap-4">
            
            {/* Left: Logo */}
            <div className="flex items-center gap-2 shrink-0 font-outfit">
              <div className="flex items-center gap-1 leading-none">
                <span className="font-black text-indigo-600 dark:text-indigo-400 text-sm sm:text-base tracking-tight">Track</span>
                <span className={cn(
                  "font-black text-sm sm:text-base tracking-tight transition-colors duration-300",
                  theme === 'dark' ? "text-slate-100" : "text-slate-800"
                )}>Book</span>
              </div>
            </div>

            {/* Center: Desktop Search (Centered) */}
            <div className="hidden sm:flex flex-1 justify-center px-4">
              <div className="w-full max-w-md relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                <input 
                  type="text"
                  placeholder="Search your books..."
                  value={searchQueryInput}
                  onChange={(e) => setSearchQueryInput(e.target.value)}
                  className={cn(
                    "w-full pl-10 pr-4 py-2 border-none rounded-full focus:ring-2 focus:ring-indigo-500 outline-none transition-all",
                    theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-100 text-black"
                  )}
                />
              </div>
            </div>

            {/* Right: Mobile Search Icon + Profile Dropdown */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Mobile Search Button (Right side) */}
              <button 
                onClick={() => { vibrate(); setIsSearchExpanded(true); }}
                className="sm:hidden p-2 text-slate-400 hover:text-indigo-600 transition-colors"
              >
                <Search size={20} />
              </button>

              {/* Inline Download Center Trigger (Prevent absolute-position overlaps) */}
              <DownloadCenterTrigger theme={theme} isOpen={showDownloadCenter} setIsOpen={setShowDownloadCenter} />

              <div className="relative shrink-0" ref={dropdownRef}>
                <button 
                  onClick={() => { vibrate(); setIsProfileOpen(!isProfileOpen); }}
                  className="flex items-center gap-1.5 sm:gap-2 p-1 pr-2 sm:pr-3 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                >
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xs sm:text-sm">
                    {userName && userName.length > 0 ? userName[0].toUpperCase() : 'U'}
                  </div>
                  <ChevronDown size={14} className={cn("text-slate-400 transition-transform", isProfileOpen && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {isProfileOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className={cn(
                        "absolute right-0 mt-2 w-64 rounded-2xl shadow-2xl border p-2 z-50 transition-colors duration-300",
                        theme === 'dark' ? "bg-zinc-950 border-zinc-900" : "bg-white border-slate-100"
                      )}
                    >
                      <div className={cn(
                        "p-3 border-b mb-2 transition-colors duration-300",
                        theme === 'dark' ? "border-zinc-800" : "border-slate-100"
                      )}>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Signed in as</p>
                        <p className={cn(
                          "font-bold truncate transition-colors duration-300",
                          theme === 'dark' ? "text-slate-100" : "text-black"
                        )}>{userName}</p>
                      </div>

                      <button 
                        onClick={(e) => { vibrate(); toggleTheme(e); }}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-xl transition-all",
                          theme === 'dark' ? "hover:bg-zinc-900 text-slate-300" : "hover:bg-slate-50 text-black"
                        )}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                          <span className="font-medium text-left">Appearance</span>
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {theme}
                        </div>
                      </button>

                      <button 
                        onClick={() => { setIsHelpOpen(true); setIsProfileOpen(false); }}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-xl transition-all",
                          theme === 'dark' ? "hover:bg-zinc-900 text-slate-300" : "hover:bg-slate-50 text-black"
                        )}
                      >
                        <HelpCircle size={18} />
                        <span className="font-medium flex-1 text-left">Help & Support</span>
                      </button>

                      <button 
                        onClick={() => { setIsEditingName(true); setIsProfileOpen(false); }}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-xl transition-all",
                          theme === 'dark' ? "hover:bg-zinc-900 text-slate-300" : "hover:bg-slate-50 text-black"
                        )}
                      >
                        <Settings size={18} />
                        <span className="font-medium flex-1 text-left">Profile Settings</span>
                      </button>

                      <button 
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 transition-all"
                      >
                        <LogOut size={18} />
                        <span className="font-medium flex-1 text-left">Sign Out</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Mobile Search Overlay */}
          <AnimatePresence>
            {isSearchExpanded && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={cn(
                  "absolute inset-0 z-[60] px-4 flex items-center gap-2 transition-colors duration-300",
                  theme === 'dark' ? "bg-black" : "bg-white"
                )}
              >
                <button onClick={() => setIsSearchExpanded(false)} className="p-2 text-slate-400 hover:text-indigo-600">
                  <ArrowLeft size={20} />
                </button>
                <input 
                  autoFocus
                  type="text"
                  placeholder="Search books..."
                  value={searchQueryInput}
                  onChange={(e) => setSearchQueryInput(e.target.value)}
                  className={cn(
                    "flex-1 rounded-full py-2 px-4 outline-none text-sm transition-all",
                    theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-100 text-black"
                  )}
                />
                {searchQueryInput && (
                  <button onClick={() => { setSearchQueryInput(''); setSearchQuery(''); }} className="p-2 text-slate-400">
                    <X size={18} />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </header>
      )}

      {/* Main Content Area */}
      <main className="w-full mx-auto p-2 sm:p-4 lg:p-6 lg:px-6 xl:px-10">
        <AnimatePresence mode="wait">
          {!activeBookId ? (
            /* PAGE 1: HOME / BOOKS LIST */
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* User Welcome Section */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5 sm:space-y-1">
                    <h2 className={cn(
                      "text-2xl sm:text-3xl font-bold transition-colors duration-300",
                      theme === 'dark' ? "text-slate-100" : "text-slate-800"
                    )}>
                      Hello, <span className="text-indigo-600 dark:text-indigo-400">{userName}</span>!
                    </h2>
                    <p className={cn(
                      "text-sm sm:text-base transition-colors duration-300",
                      theme === 'dark' ? "text-slate-400" : "text-slate-500"
                    )}>Welcome back to your financial dashboard.</p>
                </div>

                <div className="flex items-center gap-3 sm:gap-4">
                  {selectedBooks.size > 0 ? (
                    <button
                      onClick={() => { vibrate(); setShowBulkDeleteConfirm(true); setDeleteConfirmed(false); }}
                      className={cn(
                        "flex-1 sm:flex-none py-2 sm:py-2.5 px-4 sm:px-6 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm sm:text-base animate-in fade-in zoom-in duration-200",
                        theme === 'dark' ? "shadow-none" : "shadow-lg shadow-rose-100"
                      )}
                    >
                      <Trash2 size={18} />
                      Delete ({selectedBooks.size})
                    </button>
                  ) : (
                    books.length > 0 && (
                      <button
                        onClick={() => { vibrate(); setIsCreatingBook(true); }}
                        className={cn(
                          "group/shortcut relative flex-1 sm:flex-none py-2 sm:py-2.5 px-4 sm:px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm sm:text-base hover:scale-[1.02] active:scale-[0.98] duration-200 cursor-pointer",
                          theme === 'dark' ? "shadow-none" : "shadow-lg shadow-indigo-100"
                        )}
                      >
                        <Plus size={18} />
                        Create a Book
                        <span className="hidden lg:group-hover/shortcut:flex absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded shadow-lg whitespace-nowrap items-center gap-1 z-50">
                          Press <kbd className="bg-slate-700 px-1 rounded">C</kbd> + <kbd className="bg-slate-700 px-1 rounded">B</kbd>
                        </span>
                      </button>
                    )
                  )}

                  <div className={cn(
                    "hidden sm:flex items-center gap-2 p-1 rounded-xl border shadow-sm transition-colors duration-300",
                    theme === 'dark' ? "bg-zinc-950 border-zinc-900" : "bg-white border-slate-100"
                  )}>
                    <button 
                      onClick={() => setViewMode('grid')}
                      className={cn(
                        "p-2 rounded-lg transition-all cursor-pointer", 
                        viewMode === 'grid' 
                          ? (theme === 'dark' ? "bg-indigo-600 text-white shadow-none" : "bg-indigo-600 text-white shadow-lg shadow-indigo-100") 
                          : (theme === 'dark' ? "text-slate-400 hover:bg-slate-800" : "text-slate-400 hover:bg-slate-50")
                      )}
                    >
                      <LayoutGrid size={20} />
                    </button>
                    <button 
                      onClick={() => setViewMode('list')}
                      className={cn(
                        "p-2 rounded-lg transition-all cursor-pointer", 
                        viewMode === 'list' 
                          ? (theme === 'dark' ? "bg-indigo-600 text-white shadow-none" : "bg-indigo-600 text-white shadow-lg shadow-indigo-100") 
                          : (theme === 'dark' ? "text-slate-400 hover:bg-slate-800" : "text-slate-400 hover:bg-slate-50")
                      )}
                    >
                      <List size={20} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Books Section */}
              {filteredBooks.length === 0 ? (
                <div className={cn(
                  "flex flex-col items-center justify-center py-8 sm:py-12 text-center space-y-4 sm:space-y-6 border rounded-[24px] sm:rounded-[32px] shadow-sm mx-auto max-w-md transition-colors duration-300",
                  theme === 'dark' ? "bg-zinc-950 border-zinc-900" : "bg-white border-slate-100"
                )}>
                  <div className={cn(
                    "w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-colors duration-300",
                    theme === 'dark' ? "bg-indigo-950/30 text-indigo-400" : "bg-indigo-50 text-indigo-600"
                  )}>
                    <BookOpen size={24} className="sm:w-8 sm:h-8" />
                  </div>
                  <div className="space-y-1 sm:space-y-2 px-4">
                    <h3 className={cn(
                      "text-lg sm:text-xl font-black transition-colors duration-300",
                      theme === 'dark' ? "text-slate-100" : "text-slate-800"
                    )}>No Cashbooks Yet</h3>
                    <p className={cn(
                      "max-w-[200px] sm:max-w-xs mx-auto text-[10px] sm:text-xs transition-colors duration-300",
                      theme === 'dark' ? "text-slate-500" : "text-slate-400"
                    )}>Start your financial journey by creating your first cashbook today.</p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-2 w-full justify-center">
                    <button
                      onClick={() => { vibrate(); setIsCreatingBook(true); }}
                      className={cn(
                        "w-full sm:w-auto py-2 sm:py-2.5 px-5 sm:px-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 active:scale-95 text-xs sm:text-sm cursor-pointer",
                        theme === 'dark' ? "shadow-none" : "shadow-xl shadow-indigo-100"
                      )}
                    >
                      <Plus size={16} />
                      Create a Book
                    </button>
                  </div>
                </div>
              ) : (
                <div className={cn(
                  "grid gap-2 sm:gap-6",
                  viewMode === 'grid' 
                    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" 
                    : "grid-cols-1"
                )}>
                  {filteredBooks.map((book, index) => (
                    <motion.div
                      key={book.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.035, 0.3) }}
                      onMouseDown={() => onTouchStartBook(book.id)}
                      onMouseUp={onTouchEndBook}
                      onTouchStart={() => onTouchStartBook(book.id)}
                      onTouchEnd={onTouchEndBook}
                      onClick={() => handleBookPress(book.id)}
                      className={cn(
                        "group p-4 sm:p-5 border rounded-2xl sm:rounded-3xl transition-all duration-200 relative overflow-hidden select-none flex items-center justify-between cursor-pointer",
                        theme === 'dark' ? "bg-zinc-950 border-zinc-800" : "bg-white border-slate-100",
                      )}
                    >
                      {selectedBooks.has(book.id) && (
                        <div className="absolute top-2 right-2 z-10">
                          <div className="bg-indigo-600 text-white rounded-full p-1 shadow-md">
                            <Check size={12} />
                          </div>
                        </div>
                      )}
                      <div className="flex-grow flex-1 min-w-0 flex items-center gap-2 sm:gap-4 pr-1 sm:pr-2">
                        <div className="p-2 sm:p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl sm:rounded-2xl group-hover:scale-110 transition-transform flex-shrink-0">
                          <BookOpen size={20} className="sm:w-6 sm:h-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className={cn(
                            "font-bold text-sm sm:text-lg break-words whitespace-normal leading-tight transition-colors duration-300",
                            theme === 'dark' ? "text-slate-100" : "text-slate-800"
                          )}>{book.name}</h4>
                          <p className={cn(
                            "text-[10px] sm:text-xs transition-colors duration-300",
                            theme === 'dark' ? "text-slate-500" : "text-slate-400"
                          )}>Created on {safeFormatDate(book.createdAt)}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 sm:gap-6 flex-shrink-0 ml-3">
                        <div className="flex items-center gap-0.5 sm:gap-1 border-l border-slate-100 dark:border-slate-800 pl-1.5 sm:pl-4">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setIsEditingBook(book.id); setEditBookName(book.name); }}
                            className="p-1 sm:p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all"
                          >
                            <Pencil size={12} className="sm:w-[18px] sm:h-[18px]" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteBook(book.id); }}
                            className="p-1 sm:p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                          >
                            <Trash2 size={12} className="sm:w-[18px] sm:h-[18px]" />
                          </button>
                          <button 
                            onClick={() => setActiveBookId(book.id)}
                            className="p-1.5 sm:p-2 text-indigo-800 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all ml-0.5"
                          >
                            <motion.div
                              animate={{ x: [0, 3, 0] }}
                              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                            >
                              <ArrowRight size={18} className="sm:w-6 sm:h-6" />
                            </motion.div>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            /* PAGE 2: INDIVIDUAL CASHBOOK VIEW */
            <motion.div
              key="cashbook"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full space-y-4 sm:space-y-6 pb-[180px] lg:pb-0"
            >
              {/* STICKY TOP CONTROLS SECTION */}
              <div className={cn(
                "lg:sticky lg:top-0 z-30 transition-colors duration-300 border-b",
                "-mt-2 pt-2 -mx-2 px-2 pb-3 mb-2",
                "sm:-mt-4 sm:pt-4 sm:-mx-4 sm:px-4 sm:pb-4 sm:mb-4",
                "lg:-mt-6 lg:pt-6 lg:-mx-6 lg:px-6 lg:pb-5 lg:mb-5",
                "xl:-mx-10 xl:px-10",
                "space-y-2.5 sm:space-y-4 shadow-sm",
                theme === 'dark' ? "bg-black/95 backdrop-blur-md border-zinc-900" : "bg-slate-50/95 backdrop-blur-md border-slate-200"
              )}>
                {/* Header Actions */}
                <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-4">
                  <button 
                    onClick={() => setActiveBookId(null)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors"
                  >
                    <ArrowLeft size={24} />
                  </button>
                  <h2 className={cn(
                    "text-xl sm:text-2xl font-bold truncate max-w-[150px] sm:max-w-none transition-colors duration-300",
                    theme === 'dark' ? "text-slate-100" : "text-black"
                  )}>{activeBook?.name}</h2>
                </div>
                
                {/* Right actions: Download Center Trigger + 3-Dots Menu */}
                <div className="flex items-center gap-2 sm:gap-3">
                  <DownloadCenterTrigger theme={theme} isOpen={showDownloadCenter} setIsOpen={setShowDownloadCenter} />

                  {/* 3-Dots Overflow/Book Actions Menu */}
                  <div className="relative" ref={bookMenuRef}>
                  <button 
                    onClick={() => setShowBookMenu(!showBookMenu)}
                    className={cn(
                      "flex items-center justify-center w-10 h-10 border rounded-xl transition-all cursor-pointer active:scale-95 duration-150 hover:bg-slate-100 dark:hover:bg-slate-800",
                      theme === 'dark' 
                        ? "border-zinc-800 text-slate-200" 
                        : "border-slate-200 text-slate-600 shadow-sm bg-white"
                    )}
                    aria-label="Book Options"
                  >
                    <MoreVertical size={20} />
                  </button>
                  <AnimatePresence>
                    {showBookMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className={cn(
                          "absolute right-0 mt-2 w-52 rounded-2xl shadow-2xl p-1.5 z-50 border backdrop-blur-xl transition-all",
                          theme === 'dark' 
                            ? "bg-zinc-950/95 border-zinc-900 text-white" 
                            : "bg-white/95 border-slate-200 text-slate-900"
                        )}
                      >
                        <button 
                          onClick={() => { setShowBookMenu(false); setShowImportModal(true); }}
                          className={cn(
                            "w-full flex items-center gap-3 p-2.5 rounded-xl transition-all cursor-pointer text-left border mb-1.5 shadow-sm",
                            theme === 'dark' 
                              ? "bg-amber-950/20 border-amber-900/40 text-amber-400 hover:bg-amber-950/45" 
                              : "bg-amber-50/50 border-amber-100/70 text-amber-800 hover:bg-amber-50"
                          )}
                        >
                          <DownloadCloud size={16} className="text-amber-500 shrink-0" />
                          <span className="font-extrabold text-[11px] uppercase tracking-wider">Import Entries</span>
                        </button>
                        <button 
                          onClick={() => { setShowBookMenu(false); exportToExcel(); }}
                          className={cn(
                            "w-full flex items-center gap-3 p-2.5 rounded-xl transition-all cursor-pointer text-left border mb-1.5 shadow-sm",
                            theme === 'dark' 
                              ? "bg-emerald-950/20 border-emerald-900/40 text-emerald-400 hover:bg-emerald-950/45" 
                              : "bg-emerald-50/50 border-emerald-100/70 text-emerald-800 hover:bg-emerald-50"
                          )}
                        >
                          <FileSpreadsheet size={16} className="text-emerald-500 shrink-0" />
                          <span className="font-extrabold text-[11px] uppercase tracking-wider">Export Excel</span>
                        </button>
                        <button 
                          onClick={() => { 
                            setShowBookMenu(false); 
                            if (activeBook) {
                              backgroundExportManager.enqueueTask(activeBook.id, activeBook.name, filteredTransactions, true);
                            }
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 p-2.5 rounded-xl transition-all cursor-pointer text-left border shadow-sm",
                            theme === 'dark' 
                              ? "bg-rose-950/20 border-rose-900/40 text-rose-400 hover:bg-rose-950/45" 
                              : "bg-rose-50/50 border-rose-100/70 text-rose-800 hover:bg-rose-50"
                          )}
                        >
                          <FileText size={16} className="text-rose-500 shrink-0" />
                          <span className="font-extrabold text-[11px] uppercase tracking-wider">Export PDF</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

              {/* Mobile Summary Card (Reference Image Style) */}
              <div className={cn(
                "sm:hidden rounded-2xl border shadow-sm overflow-hidden transition-colors duration-300",
                theme === 'dark' ? "bg-zinc-950 border-zinc-900" : "bg-white border-slate-100"
              )}>
                <div className="p-3 px-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className={cn(
                      "text-sm font-bold transition-colors duration-300",
                      theme === 'dark' ? "text-slate-100" : "text-black"
                    )}>Net Balance</h3>
                    <p className={cn(
                      "font-black transition-colors duration-300",
                      theme === 'dark' ? "text-slate-100" : "text-black",
                      "text-sm"
                    )}>
                      {formatCurrency(totals.net)}
                    </p>
                  </div>
                  
                  <div className={cn(
                    "space-y-1.5 pt-1.5 border-t transition-colors duration-300",
                    theme === 'dark' ? "border-zinc-800" : "border-slate-50"
                  )}>
                    <div className="flex items-center justify-between">
                      <p className={cn(
                        "text-xs font-bold transition-colors duration-300",
                        theme === 'dark' ? "text-slate-400" : "text-slate-500"
                      )}>Total In (+)</p>
                      <p className={cn(
                        "font-black text-emerald-600",
                        "text-xs"
                      )}>{formatCurrency(totals.in)}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className={cn(
                        "text-xs font-bold transition-colors duration-300",
                        theme === 'dark' ? "text-slate-400" : "text-slate-500"
                      )}>Total Out (-)</p>
                      <p className={cn(
                        "font-black text-rose-600",
                        "text-xs"
                      )}>{formatCurrency(totals.out)}</p>
                    </div>
                  </div>
                </div>

              </div>

              {/* Action Buttons Row (Desktop Only) */}
              <div className="hidden lg:flex items-center gap-3">
                <button
                  onClick={() => { vibrate(); setShowForm('in'); setTransactionDate(safeToDateTimeLocal(new Date())); }}
                  className={cn(
                    "group/shortcut relative flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all active:scale-95 cursor-pointer",
                    theme === 'dark' 
                      ? "bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40" 
                      : "bg-emerald-50/80 border border-emerald-100 text-emerald-700 hover:bg-emerald-100 shadow-sm shadow-emerald-100/50"
                  )}
                >
                  <Plus size={20} />
                  Cash In
                  <span className="hidden lg:group-hover/shortcut:flex absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded shadow-lg whitespace-nowrap items-center gap-1 z-50">
                    Press <kbd className="bg-slate-700 px-1 rounded">C</kbd> + <kbd className="bg-slate-700 px-1 rounded">I</kbd>
                  </span>
                </button>
                <button
                  onClick={() => { vibrate(); setShowForm('out'); setTransactionDate(safeToDateTimeLocal(new Date())); }}
                  className={cn(
                    "group/shortcut relative flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all active:scale-95 cursor-pointer",
                    theme === 'dark' 
                      ? "bg-rose-900/20 text-rose-400 hover:bg-rose-900/40" 
                      : "bg-rose-50/80 border border-rose-100 text-rose-700 hover:bg-rose-100 shadow-sm shadow-rose-100/50"
                  )}
                >
                  <Minus size={20} />
                  Cash Out
                  <span className="hidden lg:group-hover/shortcut:flex absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded shadow-lg whitespace-nowrap items-center gap-1 z-50">
                    Press <kbd className="bg-slate-700 px-1 rounded">C</kbd> + <kbd className="bg-slate-700 px-1 rounded">O</kbd>
                  </span>
                </button>
                <button
                  onClick={() => { vibrate(); setAiConstructionModal('upload'); }}
                  disabled={isUploading}
                  className={cn(
                    "group/shortcut relative flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all active:scale-95 cursor-pointer",
                    theme === 'dark' 
                      ? "bg-indigo-900/20 text-indigo-400 hover:bg-indigo-900/40" 
                      : "bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 shadow-sm shadow-indigo-100/20"
                  )}
                >
                  {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                  AI Upload
                  <span className="hidden lg:group-hover/shortcut:flex absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded shadow-lg whitespace-nowrap items-center gap-1 z-50">
                    Press <kbd className="bg-slate-700 px-1 rounded">A</kbd> + <kbd className="bg-slate-700 px-1 rounded">U</kbd>
                  </span>
                </button>
              </div>

              {/* Filters & Search Row */}
              <div className="flex flex-col lg:flex-row items-center gap-3 sm:gap-4">
                <div className="flex-1 relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text"
                    placeholder="Search by remark, amount, category..."
                    value={transactionSearchQueryInput}
                    onChange={(e) => setTransactionSearchQueryInput(e.target.value)}
                    className={cn(
                      "w-full pl-10 pr-4 py-2 sm:py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm",
                      theme === 'dark' ? "bg-zinc-900 border-zinc-800 text-slate-100" : "bg-white border-slate-200 text-black"
                    )}
                  />
                </div>                {/* Desktop Action & Filter Row */}
                <div className="hidden lg:flex items-center gap-2 pb-1 sm:pb-0">
                  {selectedTransactions.size === 0 ? (
                    <button
                      onClick={toggleSelectAll}
                      className={cn(
                        "flex items-center gap-2 px-4 h-11 rounded-xl font-bold transition-all text-sm whitespace-nowrap cursor-pointer hover:scale-[1.02] active:scale-[0.98] duration-200",
                        theme === 'dark' ? "bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm"
                      )}
                    >
                      <Square size={16} />
                      Select All
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setSelectedTransactions(new Set())}
                        className={cn(
                          "flex items-center gap-2 px-4 h-11 rounded-xl font-bold transition-all text-sm whitespace-nowrap cursor-pointer hover:scale-[1.02] active:scale-[0.98] duration-200 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm",
                          theme === 'dark' && "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
                        )}
                      >
                        <X size={16} />
                        <span>Deselect All</span>
                      </button>
                      <button
                        onClick={() => setShowShareModal(true)}
                        className={cn(
                          "flex items-center gap-2 px-4 h-11 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap text-sm cursor-pointer duration-200",
                          theme === 'dark' ? "shadow-none" : "shadow-lg shadow-indigo-100"
                        )}
                      >
                        <Share size={16} />
                        Share Entries
                      </button>
                      <button
                        onClick={() => { setShowBulkTransactionDeleteConfirm(true); setDeleteConfirmed(false); }}
                        className={cn(
                          "flex items-center gap-2 px-4 h-11 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap text-sm cursor-pointer duration-200",
                          theme === 'dark' ? "shadow-none" : "shadow-lg shadow-rose-100"
                        )}
                      >
                        <Trash size={16} />
                        Delete ({selectedTransactions.size})
                      </button>
                    </>
                  )}
                  <div className="relative min-w-[120px]">
                    <select 
                      value={transactionTypeFilter}
                      onChange={(e) => setTransactionTypeFilter(e.target.value as any)}
                      className={cn(
                        "w-full pl-4 pr-10 h-11 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-bold appearance-none",
                        theme === 'dark' ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-black"
                      )}
                    >
                      <option value="all">All Types</option>
                      <option value="in">Cash In</option>
                      <option value="out">Cash Out</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                  </div>
                  <div className="relative min-w-[140px]">
                    <select 
                      value={transactionDurationFilter}
                      onChange={(e) => setTransactionDurationFilter(e.target.value)}
                      className={cn(
                        "w-full pl-4 pr-10 h-11 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-bold appearance-none",
                        theme === 'dark' ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-black"
                      )}
                    >
                      {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                  </div>
                </div>

                {/* Mobile Action & Filter Stacked Layout */}
                <div className="lg:hidden w-full flex flex-col gap-2.5">

                  {/* ROW 3: [All Types] [All] */}
                  <div className="grid grid-cols-2 gap-2.5 w-full">
                    <div className="relative w-full">
                      <select 
                        value={transactionTypeFilter}
                        onChange={(e) => setTransactionTypeFilter(e.target.value as any)}
                        className={cn(
                          "w-full pl-4 pr-10 h-11 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-xs font-bold appearance-none",
                          theme === 'dark' ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-black"
                        )}
                      >
                        <option value="all">All Types</option>
                        <option value="in">Cash In</option>
                        <option value="out">Cash Out</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                    </div>
                    <div className="relative w-full">
                      <select 
                        value={transactionDurationFilter}
                        onChange={(e) => setTransactionDurationFilter(e.target.value)}
                        className={cn(
                          "w-full pl-4 pr-10 h-11 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-xs font-bold appearance-none",
                          theme === 'dark' ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-black"
                        )}
                      >
                        {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Balance Cards Row (Desktop Only) */}
              <div className="hidden lg:grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                <div className={cn(
                  "p-6 rounded-3xl border flex items-center gap-4 shadow-sm transition-colors duration-300",
                  theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                )}>
                  <div className={cn(
                    "p-3 rounded-2xl",
                    theme === 'dark' ? "bg-emerald-900/20 text-emerald-400" : "bg-emerald-50 text-emerald-600"
                  )}>
                    <Plus size={24} />
                  </div>
                  <div>
                    <p className={cn(
                      "text-sm font-bold uppercase tracking-wider",
                      theme === 'dark' ? "text-slate-400" : "text-slate-500"
                    )}>Cash In</p>
                    <p className={cn(
                      "font-black text-emerald-600 dark:text-emerald-400",
                      "text-xl"
                    )}>
                      {formatCurrency(totals.in)}
                    </p>
                  </div>
                </div>

                <div className={cn(
                  "p-6 rounded-3xl border flex items-center gap-4 shadow-sm transition-colors duration-300",
                  theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                )}>
                  <div className={cn(
                    "p-3 rounded-2xl",
                    theme === 'dark' ? "bg-rose-900/20 text-rose-400" : "bg-rose-50 text-rose-600"
                  )}>
                    <Minus size={24} />
                  </div>
                  <div>
                    <p className={cn(
                      "text-sm font-bold uppercase tracking-wider",
                      theme === 'dark' ? "text-slate-400" : "text-slate-500"
                    )}>Cash Out</p>
                    <p className={cn(
                      "font-black text-rose-600 dark:text-rose-400",
                      "text-xl"
                    )}>
                      {formatCurrency(totals.out)}
                    </p>
                  </div>
                </div>

                <div className={cn(
                  "p-6 rounded-3xl border flex items-center gap-4 shadow-sm transition-colors duration-300",
                  theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                )}>
                  <div className={cn(
                    "p-3 rounded-2xl",
                    theme === 'dark' ? "bg-indigo-900/20 text-indigo-400" : "bg-indigo-50 text-indigo-600"
                  )}>
                    <Wallet size={24} />
                  </div>
                  <div>
                    <p className={cn(
                      "text-sm font-bold uppercase tracking-wider",
                      theme === 'dark' ? "text-slate-400" : "text-slate-500"
                    )}>Net Balance</p>
                    <p className={cn(
                      "font-black text-indigo-600 dark:text-indigo-400",
                      "text-xl"
                    )}>
                      {formatCurrency(totals.net)}
                    </p>
                  </div>
                </div>
              </div>
              </div> {/* Close STICKY TOP CONTROLS SECTION */}

              {/* Transaction List Section */}
              <div className="space-y-4">
                {/* Mobile Transaction List (Card Based) */}
                 <div ref={mobileContainerRef} className="lg:hidden space-y-3">
                  {(isEntriesLoading || (activeBookId !== null && !entriesCache.has(activeBookId))) && filteredTransactions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                      <div className="relative flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 animate-ping absolute" />
                        <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin relative z-10" />
                      </div>
                      <p className={cn(
                        "text-xs font-black uppercase tracking-widest leading-none font-mono",
                        theme === 'dark' ? "text-slate-500" : "text-slate-400"
                      )}>
                        Loading entries...
                      </p>
                    </div>
                  ) : filteredTransactions.length === 0 ? (
                    <div className={cn(
                      "py-12 text-center rounded-3xl border transition-colors duration-300",
                      theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                    )}>
                      <History size={40} className={cn(
                        "mx-auto mb-2 transition-colors duration-300",
                        theme === 'dark' ? "text-slate-700" : "text-slate-200"
                      )} />
                      <p className={cn(
                        "text-sm font-medium transition-colors duration-300",
                        theme === 'dark' ? "text-slate-500" : "text-black"
                      )}>No entries found</p>
                    </div>
                  ) : (
                    (() => {
                      // Group transactions by date for headers in viewport
                      const visibleSlice = pagedTransactions.slice(mobileStart, mobileEnd + 1);
                      const groups: { [key: string]: Transaction[] } = {};
                      visibleSlice.forEach(t => {
                        const dateStr = safeFormatDate(t.date, { day: 'numeric', month: 'long', year: 'numeric' });
                        if (!groups[dateStr]) groups[dateStr] = [];
                        groups[dateStr].push(t);
                      });

                      return (
                        <>
                          {mobilePaddingTop > 0 && <div style={{ height: `${mobilePaddingTop}px` }} />}
                          {Object.entries(groups).map(([date, transactions]) => (
                            <div key={date} className="space-y-2">
                              <div className="flex items-center gap-2 px-1">
                                <div className="w-1 h-4 bg-indigo-600 rounded-full" />
                                <h4 className={cn(
                                  "text-xs font-bold transition-colors duration-300",
                                  theme === 'dark' ? "text-slate-500" : "text-slate-600"
                                )}>{date}</h4>
                              </div>
                              
                              {transactions.map((t) => (
                                <MobileTransactionRow
                                  key={t.id}
                                  t={t}
                                  runningBalance={runningBalancesMap.get(t.id) || 0}
                                  selected={selectedTransactions.has(t.id)}
                                  isCurrentlyDeleting={animatingDeleteId === t.id}
                                  onTouchStart={onTouchStart}
                                  onTouchEnd={onTouchEnd}
                                  onClick={handleTransactionPress}
                                  handleEditTransaction={handleEditTransaction}
                                  handleDeleteTransaction={handleDeleteTransaction}
                                  handleRetryUpload={handleRetryUpload}
                                  uploadStatuses={uploadStatuses}
                                  setPreviewImages={setPreviewImages}
                                  setPreviewIndex={setPreviewIndex}
                                  setPreviewRotation={setPreviewRotation}
                                  setPreviewZoom={setPreviewZoom}
                                  theme={theme}
                                  index={visibleSlice.indexOf(t)}
                                />
                              ))}
                            </div>
                          ))}
                          {mobilePaddingBottom > 0 && <div style={{ height: `${mobilePaddingBottom}px` }} />}
                        </>
                      );
                    })()


                  )}
                </div>

                {/* Desktop Transaction Table */}
                <div className="hidden lg:block">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2 mb-4">
                    <p className="text-sm text-slate-500 font-medium">
                      Showing 1 - {filteredTransactions.length} of {filteredTransactions.length} entries
                    </p>
                  </div>

                  <div className={cn(
                    "rounded-3xl border shadow-sm transition-colors duration-300",
                    theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                  )}>
                    <div className="w-full">
                      <table className="w-full text-left">
                        <thead>
                          <tr className={cn(
                            "text-xs font-bold uppercase tracking-wider transition-colors duration-300",
                            theme === 'dark' ? "bg-slate-800/50 text-slate-300" : "bg-slate-50 text-slate-400"
                          )}>
                            <th className="px-3 sm:px-6 py-4 w-12">
                              <button 
                                onClick={toggleSelectAll}
                                className={cn(
                                  "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                                  selectedTransactions.size === filteredTransactions.length && filteredTransactions.length > 0
                                    ? "bg-indigo-600 border-indigo-600 text-white"
                                    : "border-slate-300 dark:border-slate-700"
                                )}
                              >
                                {selectedTransactions.size === filteredTransactions.length && filteredTransactions.length > 0 && <CheckSquare size={14} />}
                              </button>
                            </th>
                             <th className="px-3 sm:px-6 py-4">
                               <div className="flex items-center gap-2">
                                 Date & Time
                               </div>
                             </th>
                            <th className="px-3 sm:px-6 py-4">Details</th>
                            <th 
                              className="px-3 sm:px-6 py-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                              onClick={() => toggleSort('category')}
                            >
                              <div className="flex items-center gap-2">
                                Category
                                {sortColumn === 'category' ? (
                                  <ArrowUp size={12} className={cn("transition-transform duration-200", sortDirection === 'desc' ? "rotate-180" : "")} />
                                ) : (
                                  <ArrowUpDown size={12} className="text-slate-300 dark:text-slate-700" />
                                )}
                              </div>
                            </th>
                            <th className="px-3 sm:px-6 py-4">Mode</th>
                            <th className="px-3 sm:px-6 py-4">Bill</th>
                            <th className="px-3 sm:px-6 py-4 text-right">Amount</th>
                            <th className="px-3 sm:px-6 py-4 text-right">Balance</th>
                            <th className="px-3 sm:px-6 py-4 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody 
                          ref={desktopTableRef}
                          className={cn(
                            "divide-y transition-colors duration-300",
                            theme === 'dark' ? "divide-slate-800" : "divide-slate-50"
                          )}
                        >{(isEntriesLoading || (activeBookId !== null && !entriesCache.has(activeBookId))) && filteredTransactions.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="px-6 py-20">
                                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                                  <div className="relative flex items-center justify-center">
                                    <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 animate-ping absolute" />
                                    <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin relative z-10" />
                                  </div>
                                  <p className={cn(
                                    "text-xs font-black uppercase tracking-widest leading-none font-mono",
                                    theme === 'dark' ? "text-slate-500" : "text-slate-400"
                                  )}>
                                    Loading entries...
                                  </p>
                                </div>
                              </td>
                            </tr>
                          ) : filteredTransactions.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="px-6 py-20 text-center">
                                <div className="flex flex-col items-center justify-center space-y-3">
                                  <div className={cn(
                                    "w-12 h-12 rounded-full flex items-center justify-center transition-colors duration-300",
                                    theme === 'dark' ? "bg-slate-800 text-slate-700" : "bg-slate-50 text-slate-300"
                                  )}>
                                    <History size={24} />
                                  </div>
                                  <p className={cn(
                                    "text-sm font-medium transition-colors duration-300",
                                    theme === 'dark' ? "text-slate-500" : "text-black"
                                  )}>No entries found for this book.</p>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <>
                              {desktopPaddingTop > 0 && (
                                <tr style={{ height: `${desktopPaddingTop}px` }}>
                                  <td colSpan={9} style={{ padding: 0, height: `${desktopPaddingTop}px` }} />
                                </tr>
                              )}
                              {pagedTransactions.slice(desktopStart, desktopEnd + 1).map((t, index) => (
                                <DesktopTransactionRow
                                  key={t.id}
                                  t={t}
                                  runningBalance={runningBalancesMap.get(t.id) || 0}
                                  selected={selectedTransactions.has(t.id)}
                                  isCurrentlyDeleting={animatingDeleteId === t.id}
                                  toggleSelectTransaction={toggleSelectTransaction}
                                  handleEditTransaction={handleEditTransaction}
                                  handleDeleteTransaction={handleDeleteTransaction}
                                  handleRetryUpload={handleRetryUpload}
                                  uploadStatuses={uploadStatuses}
                                  setPreviewImages={setPreviewImages}
                                  setPreviewIndex={setPreviewIndex}
                                  setPreviewRotation={setPreviewRotation}
                                  setPreviewZoom={setPreviewZoom}
                                  theme={theme}
                                  index={index}
                                />
                              ))}
                              {desktopPaddingBottom > 0 && (
                                <tr style={{ height: `${desktopPaddingBottom}px` }}>
                                  <td colSpan={9} style={{ padding: 0, height: `${desktopPaddingBottom}px` }} />
                                </tr>
                              )}
                            </>
                          )}

                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {filteredTransactions.length > visibleCount && (
                  <div className="flex justify-center pt-6 pb-2">
                    <button
                      onClick={() => setVisibleCount(prev => prev + 30)}
                      className={cn(
                        "px-6 py-2.5 rounded-full text-xs font-black tracking-wider transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm border",
                        theme === 'dark'
                          ? "bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
                          : "bg-white border-slate-200 text-slate-700 hover:text-black hover:bg-slate-50"
                      )}
                    >
                      LOAD MORE ENTRIES ({filteredTransactions.length - visibleCount} REMAINING)
                    </button>
                  </div>
                )}
              </div>

              {/* Mobile Sticky Bottom Buttons */}
              <div className={cn(
                "lg:hidden fixed bottom-0 left-0 right-0 p-4 pb-6 backdrop-blur-lg border-t z-40 transition-colors duration-300",
                theme === 'dark' ? "bg-slate-900/80 border-slate-800" : "bg-white/80 border-slate-100"
              )}>
                <div className="flex flex-col gap-2 w-full">
                  <button
                    onClick={() => { vibrate(); setAiConstructionModal('upload'); }}
                    disabled={isUploading}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black shadow-sm transition-all active:scale-95 cursor-pointer text-xs sm:text-sm border",
                      theme === 'dark' 
                        ? "bg-indigo-950/40 text-indigo-400 border-indigo-900/50 shadow-none hover:bg-indigo-950/60" 
                        : "bg-white border-indigo-200 text-indigo-700 shadow-sm shadow-indigo-100/30 hover:bg-indigo-50"
                    )}
                  >
                    {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                    AI UPLOAD
                  </button>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => { vibrate(); setShowForm('in'); setTransactionDate(safeToDateTimeLocal(new Date())); }}
                      className={cn(
                        "flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black shadow-sm transition-all active:scale-95 cursor-pointer text-xs sm:text-sm border",
                        theme === 'dark' 
                          ? "bg-emerald-950/20 text-emerald-400 border-emerald-900/40 shadow-none hover:bg-emerald-950/35" 
                          : "bg-white border-emerald-200 text-emerald-700 shadow-sm shadow-emerald-100/30 hover:bg-emerald-50"
                      )}
                    >
                      <Plus size={18} />
                      CASH IN
                    </button>
                    <button
                      onClick={() => { vibrate(); setShowForm('out'); setTransactionDate(safeToDateTimeLocal(new Date())); }}
                      className={cn(
                        "flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black shadow-sm transition-all active:scale-95 cursor-pointer text-xs sm:text-sm border",
                        theme === 'dark' 
                          ? "bg-rose-950/20 text-rose-400 border-rose-900/40 shadow-none hover:bg-rose-950/35" 
                          : "bg-white border-rose-200 text-rose-700 shadow-sm shadow-rose-100/30 hover:bg-rose-50"
                      )}
                    >
                      <Minus size={18} />
                      CASH OUT
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* MODALS */}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className={cn(
            "fixed inset-0 z-[150] flex items-center justify-center p-4 backdrop-blur-sm transition-colors duration-300",
            theme === 'dark' ? "bg-black/60" : "bg-indigo-900/10"
          )}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center space-y-4 transition-colors duration-300",
                theme === 'dark' ? "bg-zinc-950" : "bg-white"
              )}
            >
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto transition-colors duration-300",
                theme === 'dark' ? "bg-rose-900/20 text-rose-400" : "bg-rose-50 text-rose-600"
              )}>
                <Trash2 size={32} />
              </div>
              <div className="space-y-2">
                <h3 className={cn(
                  "text-xl font-bold transition-colors duration-300",
                  theme === 'dark' ? "text-slate-100" : "text-slate-800"
                )}>Delete Cashbook?</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  Are you sure you want to delete this book? This action cannot be undone and all transactions will be permanently lost.
                </p>
                <div className="pt-2 text-left flex justify-center">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs select-none">
                    <input 
                      type="checkbox" 
                      checked={deleteConfirmed} 
                      onChange={(e) => setDeleteConfirmed(e.target.checked)}
                      className="rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-slate-800 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-slate-500 dark:text-slate-400 font-bold">I confirm this deletion</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => { setDeleteConfirmId(null); }}
                  className="flex-1 py-3 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteBook}
                  disabled={!deleteConfirmed}
                  className={cn(
                    "flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
                    theme === 'dark' ? "shadow-none" : "shadow-lg shadow-rose-100"
                  )}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transaction Delete Confirmation Modal */}
      <AnimatePresence>
        {transactionToDelete && (
          <div className={cn(
            "fixed inset-0 z-[150] flex items-center justify-center p-4 backdrop-blur-sm transition-colors duration-300",
            theme === 'dark' ? "bg-black/60" : "bg-indigo-900/10"
          )}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center space-y-4 transition-colors duration-300",
                theme === 'dark' ? "bg-zinc-950" : "bg-white"
              )}
            >
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto transition-colors duration-300",
                theme === 'dark' ? "bg-rose-900/20 text-rose-400" : "bg-rose-50 text-rose-600"
              )}>
                <Trash2 size={32} />
              </div>
              <div className="space-y-2">
                <h3 className={cn(
                  "text-xl font-bold transition-colors duration-300",
                  theme === 'dark' ? "text-slate-100" : "text-slate-800"
                )}>Delete Entry?</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  Are you sure you want to delete this entry? Once deleted, it cannot be recovered.
                </p>
                <div className="pt-2 text-left flex justify-center">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs select-none">
                    <input 
                      type="checkbox" 
                      checked={deleteConfirmed} 
                      onChange={(e) => setDeleteConfirmed(e.target.checked)}
                      className="rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-slate-800 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-slate-500 dark:text-slate-400 font-bold">I confirm this deletion</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => { setTransactionToDelete(null); }}
                  className="flex-1 py-3 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteTransaction}
                  disabled={!deleteConfirmed}
                  className={cn(
                    "flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
                    theme === 'dark' ? "shadow-none" : "shadow-lg shadow-rose-100"
                  )}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Upload Warning Modal */}
      <AnimatePresence>
        {showAiWarning && (
          <div className={cn(
            "fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-sm transition-colors duration-300",
            theme === 'dark' ? "bg-black/60" : "bg-indigo-900/10"
          )}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center space-y-4 transition-colors duration-300",
                theme === 'dark' ? "bg-zinc-950" : "bg-white"
              )}
            >
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto",
                theme === 'dark' ? "bg-indigo-900/20 text-indigo-400" : "bg-indigo-50 text-indigo-600"
              )}>
                <Upload size={32} />
              </div>
              <div className="space-y-2">
                <h3 className={cn(
                  "text-xl font-bold transition-colors duration-300",
                  theme === 'dark' ? "text-white" : "text-black"
                )}>AI Upload Information</h3>
                <p className={cn(
                  "text-sm transition-colors duration-300",
                  theme === 'dark' ? "text-slate-400" : "text-black"
                )}>
                  You can upload up to <span className="font-bold text-indigo-600">5 images</span> at a time. 
                  Please note that AI can make mistakes, so verify the entries after processing.
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowAiWarning(false)}
                  className="flex-1 py-3 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => { setShowAiWarning(false); setShowDropZone(true); }}
                  className={cn(
                    "flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all",
                    theme === 'dark' ? "shadow-none" : "shadow-lg shadow-indigo-100"
                  )}
                >
                  Proceed
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Under Construction Modal */}
      <AnimatePresence>
        {aiConstructionModal && (
          <div 
            onClick={() => setAiConstructionModal(null)}
            className={cn(
              "fixed inset-0 z-[400] flex items-center justify-center p-4 backdrop-blur-xl transition-colors duration-300",
              theme === 'dark' ? "bg-slate-950/80" : "bg-slate-900/60"
            )}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "relative w-full max-w-sm rounded-[32px] p-6 sm:p-8 shadow-3xl text-center space-y-6 transition-colors duration-300 border overflow-hidden",
                theme === 'dark' ? "bg-zinc-950 border-zinc-900 shadow-black/80" : "bg-white border-slate-100 shadow-slate-200/50"
              )}
            >
              {/* Background Slowly Rotating Construction Gear */}
              <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none select-none">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
                  className={cn(
                    "opacity-[0.03] dark:opacity-[0.04]",
                    theme === 'dark' ? "text-indigo-400" : "text-indigo-900"
                  )}
                >
                  <Settings size={280} strokeWidth={1} />
                </motion.div>
              </div>

              {/* Close Button */}
              <button 
                onClick={() => { vibrate(); setAiConstructionModal(null); }}
                className={cn(
                  "absolute top-4 right-4 p-2 rounded-full border transition-all hover:scale-105 active:scale-95 cursor-pointer",
                  theme === 'dark' 
                    ? "border-zinc-800 hover:bg-zinc-900 text-slate-400 hover:text-white" 
                    : "border-slate-100 hover:bg-slate-50 text-slate-500 hover:text-slate-800"
                )}
              >
                <X size={16} />
              </button>

              {/* Glowing Dynamic Visual Header */}
              <div className="relative w-24 h-24 mx-auto flex items-center justify-center mt-3">
                {/* AI Glow/Pulse Rings */}
                <motion.div 
                  animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0.15, 0.6] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                  className="absolute inset-0 rounded-full bg-indigo-500/10 dark:bg-indigo-500/5"
                />
                <motion.div 
                  animate={{ scale: [1, 1.25, 1], opacity: [0.8, 0.3, 0.8] }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut", delay: 0.5 }}
                  className="absolute inset-2 rounded-full bg-indigo-500/15 dark:bg-indigo-500/10"
                />
                
                {/* Central Icon Container */}
                <div className={cn(
                  "w-16 h-16 rounded-[22px] flex items-center justify-center relative shadow-xl",
                  theme === 'dark' ? "bg-gradient-to-tr from-indigo-900/40 to-violet-800/20" : "bg-indigo-50"
                )}>
                  {/* Rotating small cog */}
                  <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
                    className="absolute -top-1 -right-1 text-indigo-500/40"
                  >
                    <Settings size={18} strokeWidth={2.5} />
                  </motion.div>

                  {/* Interactive Icon based on type */}
                  <motion.div
                    animate={aiConstructionModal === 'upload' ? { y: [-2, 2, -2] } : { scale: [0.95, 1.05, 0.95] }}
                    transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                    className={theme === 'dark' ? "text-indigo-400" : "text-indigo-600"}
                  >
                    {aiConstructionModal === 'upload' ? (
                      <Upload size={28} strokeWidth={2.2} />
                    ) : (
                      <MessageSquare size={28} strokeWidth={2.2} />
                    )}
                  </motion.div>
                  
                  {/* Sparkles overlay */}
                  <motion.div 
                    animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.1, 0.8] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                    className="absolute bottom-1 right-1 text-amber-400"
                  >
                    <Sparkles size={14} fill="currentColor" />
                  </motion.div>
                </div>
              </div>

              {/* Title & Subtitle */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-center gap-1.5">
                  <motion.div 
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1.5, delay: 0 }}
                    className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                  />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Under Construction</span>
                </div>
                
                <h3 className={cn(
                  "text-xl font-bold tracking-tight transition-colors duration-300",
                  theme === 'dark' ? "text-white" : "text-slate-900"
                )}>
                  {aiConstructionModal === 'upload' ? "AI Upload Coming Soon" : "Ask AI Coming Soon"}
                </h3>
                
                <p className={cn(
                  "text-sm leading-relaxed px-2 transition-colors duration-300 font-medium",
                  theme === 'dark' ? "text-slate-400" : "text-slate-600"
                )}>
                  {aiConstructionModal === 'upload' 
                    ? "This feature is currently under construction and will be available in a couple of days." 
                    : "This AI feature is under development and will be released soon."}
                </p>
              </div>

              {/* Progress and Construction indicators */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 px-1">
                  <span>Development Progress</span>
                  <span className="text-indigo-500 font-black">
                    {aiConstructionModal === 'upload' ? "85%" : "78%"}
                  </span>
                </div>
                
                {/* Simulated Progress bar with shine */}
                <div className={cn(
                  "h-2 w-full rounded-full overflow-hidden relative",
                  theme === 'dark' ? "bg-zinc-900" : "bg-slate-100"
                )}>
                  <motion.div 
                    initial={{ width: "0%" }}
                    animate={{ width: aiConstructionModal === 'upload' ? "85%" : "78%" }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-600 rounded-full relative"
                  >
                    {/* Glowing scanning effect inside the progress bar */}
                    <motion.div 
                      initial={{ left: "-100%" }}
                      animate={{ left: "100%" }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12"
                    />
                  </motion.div>
                </div>
                
                {/* Bouncing loading indicator dots representing activity */}
                <div className="flex justify-center items-center gap-1.5 pt-2">
                  <span className="text-[10px] font-bold text-slate-400">Deploying updates</span>
                  <div className="flex gap-1 items-center">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        animate={{ y: [0, -3, 0] }}
                        transition={{
                          repeat: Infinity,
                          duration: 1,
                          delay: i * 0.18,
                          ease: "easeInOut"
                        }}
                        className="w-1 h-1 rounded-full bg-indigo-500"
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Primary action close button */}
              <button 
                onClick={() => { vibrate(); setAiConstructionModal(null); }}
                className={cn(
                  "w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-lg",
                  theme === 'dark' ? "shadow-indigo-950/20" : "shadow-indigo-100"
                )}
              >
                Awesome, I'll wait!
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Drop Zone Modal */}
      <AnimatePresence>
        {showDropZone && (
          <div className={cn(
            "fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-md transition-colors duration-300",
            theme === 'dark' ? "bg-black/70" : "bg-slate-900/40"
          )}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={cn(
                "w-full max-w-md rounded-3xl p-8 shadow-2xl space-y-6 transition-colors duration-300",
                theme === 'dark' ? "bg-zinc-950" : "bg-white border border-slate-100"
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className={cn(
                  "text-xl font-bold transition-colors duration-300",
                  theme === 'dark' ? "text-white" : "text-black"
                )}>Drop Images</h3>
                <button 
                  onClick={() => setShowDropZone(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                >
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files) {
                    processFiles(e.dataTransfer.files);
                    setShowDropZone(false);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer group",
                  theme === 'dark' ? "border-indigo-900/50 bg-indigo-900/5 hover:bg-indigo-900/10" : "border-indigo-200 bg-indigo-50/30 hover:bg-indigo-50/50"
                )}
              >
                <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-sm flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                  <Upload size={32} />
                </div>
                <div className="text-center">
                  <p className={cn(
                    "font-bold transition-colors duration-300",
                    theme === 'dark' ? "text-white" : "text-black"
                  )}>Drag & Drop images here</p>
                  <p className={cn(
                    "text-sm transition-colors duration-300",
                    theme === 'dark' ? "text-slate-400" : "text-slate-500"
                  )}>or click to browse files</p>
                </div>
              </div>

              <div className="flex items-center gap-2 p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl text-amber-700 dark:text-amber-400 text-xs">
                <div className="shrink-0"><Loader2 size={14} className="animate-spin" /></div>
                <p>AI will process images one by one. Max 5 images allowed.</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Book Modal */}
      <AnimatePresence>
        {isCreatingBook && (
          <div className={cn(
            "fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm transition-colors duration-300",
            theme === 'dark' ? "bg-black/60" : "bg-slate-900/40"
          )}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "w-full max-w-md rounded-3xl p-6 shadow-2xl transition-colors duration-300",
                theme === 'dark' ? "bg-zinc-950" : "bg-white"
              )}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className={cn(
                  "text-xl font-bold transition-colors duration-300",
                  theme === 'dark' ? "text-white" : "text-black"
                )}>Create New Book</h3>
                <button onClick={() => setIsCreatingBook(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                  <X size={20} className="text-slate-400" />
                </button>
              </div>
              <form onSubmit={handleCreateBook} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Book Name</label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="e.g., Personal, Business"
                    value={newBookName}
                    onChange={(e) => setNewBookName(e.target.value)}
                    className={cn(
                      "w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-indigo-500 outline-none transition-all",
                      theme === 'dark' ? "bg-slate-800 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-black"
                    )}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Creation Date</label>
                  <input
                    type="text"
                    disabled
                    value={new Date().toLocaleDateString()}
                    className={cn(
                      "w-full px-4 py-3 rounded-xl border outline-none cursor-not-allowed",
                      theme === 'dark' ? "bg-slate-800/50 border-slate-800 text-slate-500" : "bg-slate-100 border-slate-200 text-slate-400"
                    )}
                  />
                </div>
                <button
                  type="submit"
                  className={cn(
                    "w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all",
                    theme === 'dark' ? "shadow-none" : "shadow-lg shadow-indigo-100"
                  )}
                >
                  Create Book
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Book Modal */}
      <AnimatePresence>
        {isEditingBook && (
          <div className={cn(
            "fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm transition-colors duration-300",
            theme === 'dark' ? "bg-black/60" : "bg-slate-900/40"
          )}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "w-full max-w-md rounded-3xl p-6 shadow-2xl transition-colors duration-300",
                theme === 'dark' ? "bg-zinc-950" : "bg-white"
              )}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className={cn(
                  "text-xl font-bold transition-colors duration-300",
                  theme === 'dark' ? "text-white" : "text-black"
                )}>Edit Book Name</h3>
                <button onClick={() => setIsEditingBook(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                  <X size={20} className="text-slate-400" />
                </button>
              </div>
              <form onSubmit={handleUpdateBook} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Book Name</label>
                  <input
                    autoFocus
                    type="text"
                    value={editBookName}
                    onChange={(e) => setEditBookName(e.target.value)}
                    className={cn(
                      "w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-indigo-500 outline-none transition-all",
                      theme === 'dark' ? "bg-slate-800 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-black"
                    )}
                  />
                </div>
                <button
                  type="submit"
                  className={cn(
                    "w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all",
                    theme === 'dark' ? "shadow-none" : "shadow-lg shadow-indigo-100"
                  )}
                >
                  Save Changes
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Settings Modal */}
      <AnimatePresence>
        {isEditingName && (
          <div className={cn(
            "fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm transition-colors duration-300",
            theme === 'dark' ? "bg-black/60" : "bg-slate-900/40"
          )}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "w-full max-w-md rounded-3xl p-6 shadow-2xl transition-colors duration-300",
                theme === 'dark' ? "bg-slate-900" : "bg-white"
              )}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className={cn(
                  "text-xl font-bold transition-colors duration-300",
                  theme === 'dark' ? "text-white" : "text-black"
                )}>Profile Settings</h3>
                <button onClick={() => setIsEditingName(false)} className={cn(
                  "p-2 rounded-full transition-colors",
                  theme === 'dark' ? "hover:bg-slate-800" : "hover:bg-slate-100"
                )}>
                  <X size={20} className="text-slate-400" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Name</label>
                  <input
                    autoFocus
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className={cn(
                      "w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-indigo-500 outline-none transition-all",
                      theme === 'dark' ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-slate-50 text-black"
                    )}
                  />
                </div>
                <button
                  onClick={() => setIsEditingName(false)}
                  className={cn(
                    "w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all",
                    theme === 'dark' ? "shadow-none" : "shadow-lg shadow-indigo-100"
                  )}
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transaction Form Modal */}
      <AnimatePresence>
        {showForm && (
          <div className={cn(
            "fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 backdrop-blur-sm transition-colors duration-300",
            theme === 'dark' ? "bg-black/60" : "bg-indigo-900/10"
          )}>
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className={cn(
                "relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden transition-colors duration-300",
                theme === 'dark' ? "bg-zinc-950" : "bg-white"
              )}
            >
              {/* Quick Add Success Overlay */}
              <AnimatePresence>
                {quickAddSuccess && (
                  <motion.div 
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[10px] sm:text-xs font-black tracking-widest px-5 py-2.5 rounded-full shadow-xl z-50 flex items-center gap-2 border border-emerald-500/30"
                  >
                    <CheckSquare size={13} className="animate-bounce" />
                    <span>ENTRY SAVED &amp; COMPLETED! ADDING NEXT...</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Modal Header */}
              <div className={cn(
                "flex items-center justify-between p-4 sm:p-6 border-b transition-colors duration-300",
                theme === 'dark' ? "border-slate-800" : "border-slate-100"
              )}>
                <h3 className={cn(
                  "text-xl sm:text-2xl font-bold transition-colors duration-300",
                  theme === 'dark' ? "text-white" : "text-slate-800"
                )}>
                  {showForm === 'in' ? 'Add Cash In' : 'Add Cash Out'}
                </h3>
                <button onClick={resetForm} className={cn(
                  "p-2 rounded-full transition-colors",
                  theme === 'dark' ? "hover:bg-slate-800" : "hover:bg-slate-100"
                )}>
                  <X size={24} className="text-slate-400" />
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-h-[80vh] overflow-y-auto no-scrollbar">
                {/* Type Tabs */}
                <div className="flex flex-col gap-4">
                  <div className={cn(
                    "p-1 rounded-xl flex gap-1 transition-colors duration-300",
                    theme === 'dark' ? "bg-slate-800" : "bg-slate-100"
                  )}>
                    <button
                      type="button"
                      onClick={() => setShowForm('in')}
                      className={cn(
                        "flex-1 py-2 sm:py-3 rounded-lg font-bold transition-all text-xs sm:text-sm",
                        showForm === 'in' 
                          ? (theme === 'dark' ? "bg-slate-700 text-emerald-400 shadow-sm" : "bg-white text-emerald-600 shadow-sm")
                          : (theme === 'dark' ? "text-slate-400 hover:bg-slate-700/50" : "text-slate-500 hover:bg-slate-200/50")
                      )}
                    >
                      CASH IN
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowForm('out')}
                      className={cn(
                        "flex-1 py-2 sm:py-3 rounded-lg font-bold transition-all text-xs sm:text-sm",
                        showForm === 'out' 
                          ? (theme === 'dark' ? "bg-slate-700 text-rose-400 shadow-sm" : "bg-white text-rose-600 shadow-sm")
                          : (theme === 'dark' ? "text-slate-400 hover:bg-slate-700/50" : "text-slate-500 hover:bg-slate-200/50")
                      )}
                    >
                      CASH OUT
                    </button>
                  </div>
                </div>

                <form onSubmit={handleAddTransaction} className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date & Time</label>
                      <input
                        type="datetime-local"
                        value={transactionDate}
                        onChange={(e) => setTransactionDate(e.target.value)}
                        tabIndex={5}
                        className={cn(
                          "w-full h-[52px] px-4 py-3 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium transition-colors duration-300",
                          theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-50 text-black"
                        )}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount (₹)</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        required
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        tabIndex={2}
                        className={cn(
                          "w-full h-[52px] px-4 py-3 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium transition-colors duration-300",
                          theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-50 text-black"
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Details</label>
                    <textarea
                      ref={descriptionInputRef}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Enter transaction details"
                      rows={2}
                      tabIndex={1}
                      className={cn(
                        "w-full px-4 py-3 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium resize-none transition-colors duration-300",
                        theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-50 text-black"
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</label>
                      <div className="space-y-2">
                        <div className="relative">
                          <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            tabIndex={3}
                            className={cn(
                              "w-full h-[52px] px-4 py-3 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium appearance-none transition-colors duration-300",
                              theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-50 text-black"
                            )}
                          >
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                        </div>
                        {category === 'Custom' && (
                          <input
                            type="text"
                            placeholder="Enter custom category"
                            value={customCategory}
                            onChange={(e) => setCustomCategory(e.target.value)}
                            className={cn(
                              "w-full h-[52px] px-4 py-3 rounded-xl border focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all",
                              theme === 'dark' ? "bg-slate-800 border-indigo-900/30 text-white" : "bg-slate-50 border-indigo-100 text-black"
                            )}
                          />
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mode</label>
                      <div className="space-y-2">
                        <div className="relative">
                          <select
                            value={mode}
                            onChange={(e) => setMode(e.target.value)}
                            tabIndex={4}
                            className={cn(
                              "w-full h-[52px] px-4 py-3 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium appearance-none transition-colors duration-300",
                              theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-50 text-black"
                            )}
                          >
                            {MODES.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                        </div>
                        {mode === 'Custom' && (
                          <input
                            type="text"
                            placeholder="Enter custom mode"
                            value={customMode}
                            onChange={(e) => setCustomMode(e.target.value)}
                            className={cn(
                              "w-full h-[52px] px-4 py-3 rounded-xl border focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all",
                              theme === 'dark' ? "bg-slate-800 border-indigo-900/30 text-white" : "bg-slate-50 border-indigo-100 text-black"
                            )}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Image Layout Selection */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Image Layout in PDF</label>
                    <div className={cn(
                      "p-1 rounded-xl flex gap-1 transition-colors duration-300",
                      theme === 'dark' ? "bg-slate-800" : "bg-slate-100"
                    )}>
                      <button
                        type="button"
                        disabled={selectedImages.length < 2}
                        onClick={() => setImageLayout('merge')}
                        className={cn(
                          "flex-1 py-2 rounded-lg font-bold transition-all text-[10px] flex items-center justify-center gap-2",
                          selectedImages.length < 2
                            ? "opacity-40 cursor-not-allowed text-slate-400 dark:text-slate-500 bg-slate-100/30 dark:bg-slate-800/20"
                            : imageLayout === 'merge' 
                              ? (theme === 'dark' ? "bg-slate-700 text-indigo-400 shadow-sm" : "bg-white text-indigo-600 shadow-sm")
                              : (theme === 'dark' ? "text-slate-400 hover:bg-slate-700/50" : "text-slate-500 hover:bg-slate-200/50")
                        )}
                        title={selectedImages.length < 2 ? "Upload at least 2 images to enable MERGE layout" : ""}
                      >
                        <LayoutGrid size={14} />
                        MERGE (Side by Side)
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageLayout('split')}
                        className={cn(
                          "flex-1 py-2 rounded-lg font-bold transition-all text-[10px] flex items-center justify-center gap-2",
                          imageLayout === 'split' 
                            ? (theme === 'dark' ? "bg-slate-700 text-indigo-400 shadow-sm" : "bg-white text-indigo-600 shadow-sm")
                            : (theme === 'dark' ? "text-slate-400 hover:bg-slate-700/50" : "text-slate-500 hover:bg-slate-200/50")
                        )}
                      >
                        <List size={14} />
                        SPLIT (Page by Page)
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bills / Attachments (Max 5)</label>
                    <div className="space-y-3">
                      {selectedImages.length > 0 && (
                        <div className="space-y-4">
                          {/* Merge Preview if selected */}
                          {imageLayout === 'merge' && selectedImages.length > 1 && (
                            <div className={cn(
                              "p-3 rounded-2xl border border-dashed transition-colors duration-300",
                              theme === 'dark' ? "bg-indigo-950/20 border-indigo-900/50" : "bg-indigo-50/50 border-indigo-200"
                            )}>
                              <p className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 mb-2 flex items-center gap-1">
                                <Sparkles size={10} />
                                PDF MERGE PREVIEW
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                {selectedImages.map((img, i) => (
                                  <div key={i} className="relative aspect-[3/4] rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                    <OptimizedImage src={img} alt="preview" className="w-full h-full object-cover" type="preview" />
                                    <div className="absolute bottom-1 right-1 bg-black/50 text-[6px] text-white px-1 rounded">P.{Math.floor(i/2) + 1}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            {selectedImages.map((img, i) => (
                              <div key={i} className="relative group w-20 h-20 sm:w-24 sm:h-24">
                                <OptimizedImage 
                                  src={img} 
                                  alt="preview" 
                                  type="preview"
                                  className="w-full h-full object-cover rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer" 
                                  onClick={() => {
                                    setPreviewImages(selectedImages);
                                    setPreviewIndex(i);
                                    setPreviewRotation(0);
                                    setPreviewZoom(1);
                                  }}
                                />
                                
                                {/* Reorder Controls - Always Visible on Hover, but semi-visible always */}
                                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-1 pointer-events-none">
                                  <button 
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); moveImage(i, 'up'); }}
                                    disabled={i === 0}
                                    className={cn(
                                      "p-1 bg-black/40 hover:bg-black/70 text-white rounded-full transition-all pointer-events-auto",
                                      i === 0 ? "opacity-0" : "opacity-60 group-hover:opacity-100"
                                    )}
                                  >
                                    <ChevronLeft size={14} />
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); moveImage(i, 'down'); }}
                                    disabled={i === selectedImages.length - 1}
                                    className={cn(
                                      "p-1 bg-black/40 hover:bg-black/70 text-white rounded-full transition-all pointer-events-auto",
                                      i === selectedImages.length - 1 ? "opacity-0" : "opacity-60 group-hover:opacity-100"
                                    )}
                                  >
                                    <ChevronRight size={14} />
                                  </button>
                                </div>

                                <button 
                                  type="button"
                                  onClick={() => removeImage(i)}
                                  className={cn(
                                    "absolute -top-2 -right-2 p-1 bg-rose-600 text-white rounded-full transition-opacity z-10",
                                    theme === 'dark' ? "shadow-none" : "shadow-lg",
                                    "opacity-0 group-hover:opacity-100"
                                  )}
                                >
                                  <X size={12} />
                                </button>
                                
                                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-black/50 text-[8px] text-white px-1.5 rounded-full">
                                  {i + 1}
                                </div>
                              </div>
                            ))}
                            {selectedImages.length < 5 && (
                              <button 
                                type="button"
                                onClick={() => multiFileInputRef.current?.click()}
                                className={cn(
                                  "w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center border-2 border-dashed rounded-xl text-slate-400 hover:border-indigo-500 hover:text-indigo-500 transition-all",
                                  theme === 'dark' ? "border-slate-800" : "border-slate-200"
                                )}
                              >
                                <Plus size={24} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {selectedImages.length === 0 && (
                        <div 
                          onClick={() => multiFileInputRef.current?.click()}
                          className={cn(
                            "border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-2 hover:border-indigo-300 transition-all cursor-pointer group",
                            theme === 'dark' ? "border-slate-800 hover:border-indigo-500" : "border-slate-200"
                          )}
                        >
                          <div className={cn(
                            "p-2 rounded-full text-slate-400 group-hover:text-indigo-500 transition-colors",
                            theme === 'dark' ? "bg-slate-800" : "bg-slate-50"
                          )}>
                            <Upload size={24} />
                          </div>
                          <p className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-500 transition-colors">
                            Click to upload bills (Max 5)
                          </p>
                        </div>
                      )}
                      <input 
                        type="file"
                        multiple
                        accept="image/*"
                        ref={multiFileInputRef}
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="flex-1 py-3 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-xs sm:text-sm"
                    >
                      Cancel
                    </button>
                    {!editingTransaction && (
                      <button
                        type="submit"
                        onClick={() => { vibrate(30); setSubmitAndAddNew(true); }}
                        className={cn(
                          "flex-1 py-3 rounded-xl font-bold text-white transition-all active:scale-95 text-xs sm:text-sm",
                          theme === 'dark' ? "bg-indigo-600 hover:bg-indigo-700 shadow-none" : "bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100"
                        )}
                      >
                        Save &amp; Add New
                      </button>
                    )}
                    <button
                      type="submit"
                      onClick={() => { vibrate(30); setSubmitAndAddNew(false); }}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold text-white transition-all active:scale-95 text-xs sm:text-sm",
                        showForm === 'in' 
                          ? (theme === 'dark' ? "bg-emerald-600 hover:bg-emerald-700 shadow-none" : "bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100")
                          : (theme === 'dark' ? "bg-rose-600 hover:bg-rose-700 shadow-none" : "bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-100")
                      )}
                    >
                      {editingTransaction ? 'Save Changes' : 'Save'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Processing Overlay */}
      <AnimatePresence mode="wait">
        {isUploading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-indigo-600 text-white"
          >
            <div className="text-center space-y-6 px-6">
              <div className="relative flex items-center justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full"
                />
              </div>
              <div className="space-y-2">
                <AnimatePresence mode="wait">
                  <motion.h3 
                    key={uploadingMessage}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-2xl font-bold tracking-tight"
                  >
                    {uploadingMessage}
                  </motion.h3>
                </AnimatePresence>
                <p className="text-indigo-100/80 text-sm max-w-[280px] mx-auto">
                  AI is reading your receipt and extracting details
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Gallery Preview Modal */}
      <AnimatePresence>
        {previewImages && (
          <div className="fixed inset-0 z-[200] bg-slate-950/95 backdrop-blur-xl flex flex-col">
            {/* Gallery Header */}
            <div className="flex items-center justify-between p-4 text-white">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setPreviewImages(null)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
                <div>
                  <p className="font-bold">Attachment Preview</p>
                  <p className="text-xs text-slate-400">{previewIndex + 1} of {previewImages.length}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setPreviewZoom(prev => Math.max(0.5, prev - 0.25))}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut size={20} />
                </button>
                <button 
                  onClick={() => setPreviewZoom(prev => Math.min(3, prev + 0.25))}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn size={20} />
                </button>
                <button 
                  onClick={() => setPreviewRotation(prev => (prev + 90) % 360)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  title="Rotate"
                >
                  <RotateCw size={20} />
                </button>
                <a 
                  href={previewImages[previewIndex]} 
                  download={`attachment-${previewIndex + 1}.png`}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  title="Download"
                >
                  <Download size={20} />
                </a>
              </div>
            </div>

            {/* Main Preview Area */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={previewIndex}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ 
                    opacity: 1, 
                    scale: previewZoom,
                    rotate: previewRotation
                  }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  className="relative max-w-full max-h-full p-4"
                >
                  <OptimizedImage 
                    src={previewImages[previewIndex]} 
                    alt="preview" 
                    type="fullscreen"
                    className="max-w-full max-h-[80vh] object-contain shadow-2xl rounded-lg"
                    referrerPolicy="no-referrer"
                  />
                </motion.div>
              </AnimatePresence>

              {/* Navigation Arrows */}
              {previewImages.length > 1 && (
                <>
                  <button 
                    onClick={() => {
                      setPreviewIndex(prev => (prev - 1 + previewImages.length) % previewImages.length);
                      setPreviewRotation(0);
                      setPreviewZoom(1);
                    }}
                    className="absolute left-4 p-4 bg-white/5 hover:bg-white/10 rounded-full text-white backdrop-blur-md transition-all"
                  >
                    <ChevronLeft size={32} />
                  </button>
                  <button 
                    onClick={() => {
                      setPreviewIndex(prev => (prev + 1) % previewImages.length);
                      setPreviewRotation(0);
                      setPreviewZoom(1);
                    }}
                    className="absolute right-4 p-4 bg-white/5 hover:bg-white/10 rounded-full text-white backdrop-blur-md transition-all"
                  >
                    <ChevronRight size={32} />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails Strip */}
            {previewImages.length > 1 && (
              <div className="p-6 flex justify-center gap-2 overflow-x-auto no-scrollbar">
                {previewImages.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setPreviewIndex(i);
                      setPreviewRotation(0);
                      setPreviewZoom(1);
                    }}
                    className={cn(
                      "w-16 h-16 rounded-lg overflow-hidden border-2 transition-all shrink-0",
                      previewIndex === i 
                        ? (theme === 'dark' ? "border-indigo-500 scale-110 shadow-none" : "border-indigo-500 scale-110 shadow-lg shadow-indigo-500/20") 
                        : "border-transparent opacity-50 hover:opacity-100"
                    )}
                  >
                    <OptimizedImage src={img} alt="thumb" className="w-full h-full object-cover" type="preview" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </AnimatePresence>
      {/* Report Generation Overlay */}
      <AnimatePresence>
        {reportLoading && (
          <div className={cn(
            "fixed inset-0 z-[300] flex items-center justify-center backdrop-blur-xl transition-colors duration-300",
            theme === 'dark' ? "bg-slate-950/80" : "bg-slate-900/60"
          )}>
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className={cn(
                "rounded-3xl shadow-2xl p-6 sm:p-8 max-w-sm w-full mx-4 border flex flex-col items-center text-center",
                theme === 'dark' ? "bg-zinc-950 border-zinc-900 shadow-black/80" : "bg-white border-slate-100 shadow-slate-200/50"
              )}
            >
              {/* Animated 3D-style Spreadsheet Graphic (for Excel) */}
              {reportLoading.type === 'excel' && (
                <div className="w-48 h-36 relative flex items-center justify-center mb-2 overflow-hidden">
                  <motion.div 
                    initial={{ rotateX: 12, rotateY: -12, scale: 0.85 }}
                    animate={{ rotateX: [12, 8, 12], rotateY: [-12, -16, -12], scale: [0.85, 0.88, 0.85] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                    style={{ transformStyle: "preserve-3d" }}
                    className="w-36 h-26 bg-emerald-950/20 border-2 border-emerald-500/30 rounded-2xl relative p-3 shadow-2xl shadow-emerald-500/5 flex flex-col justify-between overflow-hidden"
                  >
                    {/* Shiny/glow effect scanning across sheet */}
                    <motion.div 
                      initial={{ left: "-150%" }}
                      animate={{ left: "150%" }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute inset-y-0 w-12 bg-gradient-to-r from-transparent via-emerald-400/20 to-transparent -skew-x-12 z-10"
                    />

                    {/* Spreadsheet headers */}
                    <div className="grid grid-cols-4 gap-1.5 border-b border-emerald-500/20 pb-2">
                      <div className="h-1.5 rounded bg-emerald-500/40 col-span-1" />
                      <div className="h-1.5 rounded bg-emerald-500/20 col-span-2" />
                      <div className="h-1.5 rounded bg-emerald-500/30 col-span-1" />
                    </div>

                    {/* Spreadsheet Rows flying/entering */}
                    <div className="flex-1 flex flex-col justify-center gap-2 pt-2">
                      {[
                        { delay: 0, width: "w-24", color: "bg-emerald-500/40" },
                        { delay: 0.2, width: "w-16", color: "bg-emerald-500/25" },
                        { delay: 0.4, width: "w-20", color: "bg-emerald-400/30" }
                      ].map((row, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ x: -45, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{
                            delay: row.delay,
                            duration: 0.8,
                            repeat: Infinity,
                            repeatDelay: 1,
                            ease: "easeOut"
                          }}
                          className={`h-2 rounded-full ${row.color} ${row.width}`}
                        />
                      ))}
                    </div>

                    {/* 3D floating Excel tag */}
                    <motion.div
                      animate={{ y: [-1, 2, -1], rotate: [0, 4, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute -right-1 -bottom-1 w-9 h-9 bg-emerald-600 text-white rounded-xl shadow-lg flex items-center justify-center border border-emerald-400/20 z-20"
                    >
                      <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
                        <path d="M10 3v18M4 10h17" />
                      </svg>
                    </motion.div>
                  </motion.div>
                </div>
              )}

              {/* Animated 3D-style Document Stack Graphic (for PDF) */}
              {reportLoading.type === 'pdf' && (
                <div className="w-48 h-36 relative flex items-center justify-center mb-2 overflow-hidden">
                  <div style={{ perspective: "800px" }} className="relative w-36 h-26">
                    {/* Page 3 (Deepest) */}
                    <motion.div 
                      animate={{ rotate: [-6, -4, -6], y: [1, 0, 1] }}
                      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute inset-0 bg-indigo-950/5 border border-indigo-500/10 rounded-2xl transform translate-x-2 -translate-y-2 select-none pointer-events-none"
                    />
                    {/* Page 2 (Middle) */}
                    <motion.div 
                      animate={{ rotate: [-3, -1, -3], y: [-1, 0, -1] }}
                      transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute inset-0 bg-indigo-950/10 border border-indigo-500/20 rounded-2xl transform translate-x-1 -translate-y-1 select-none pointer-events-none"
                    />
                    {/* Page 1 (Top Active Page) */}
                    <motion.div 
                      initial={{ rotate: 0, scale: 0.95 }}
                      animate={{ rotate: [0, 1, 0], scale: [0.95, 0.97, 0.95] }}
                      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute inset-0 bg-indigo-950/15 border border-indigo-500/30 rounded-2xl p-2.5 flex flex-col gap-1.5 overflow-hidden shadow-2xl"
                    >
                      {/* Scan gradient sweep */}
                      <motion.div 
                        initial={{ top: "-150%" }}
                        animate={{ top: "150%" }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-indigo-400/15 to-transparent -skew-y-3 z-10"
                      />

                      {/* Header layout */}
                      <div className="flex gap-1.5 items-center">
                        <div className="w-2.5 h-2.5 rounded bg-indigo-500/40 flex-shrink-0" />
                        <div className="w-16 h-1.5 rounded bg-indigo-500/20" />
                      </div>

                      {/* Moving entries landing inside */}
                      <div className="flex flex-col gap-1.5 mt-1">
                        {[
                          { delay: 0, iconColor: "bg-emerald-500/30", textWidth: "w-20" },
                          { delay: 0.25, iconColor: "bg-rose-500/30", textWidth: "w-24" },
                          { delay: 0.5, iconColor: "bg-indigo-500/30", textWidth: "w-14" }
                        ].map((item, idx) => (
                          <motion.div 
                            key={idx}
                            initial={{ y: -20, opacity: 0, scale: 0.85 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            transition={{
                              delay: item.delay,
                              duration: 0.5,
                              repeat: Infinity,
                              repeatDelay: 1,
                              type: "spring",
                              stiffness: 90
                            }}
                            className="flex gap-1.5 items-center"
                          >
                            <div className={`w-2 h-2 rounded-full ${item.iconColor}`} />
                            <div className={`h-1 rounded ${item.textWidth} bg-indigo-300/15`} />
                          </motion.div>
                        ))}
                      </div>

                      {/* Photo attachments simulation in document bottom */}
                      <div className="absolute right-2.5 bottom-2.5 flex gap-1 items-end">
                        <div className="w-4 h-4 rounded border border-dashed border-indigo-500/30 bg-indigo-500/5 flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-indigo-400/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="M21 15l-5-5L5 21" />
                          </svg>
                        </div>
                        <div className="w-8 h-1 rounded bg-indigo-500/20" />
                      </div>
                    </motion.div>

                    {/* Floating PDF badge */}
                    <motion.div
                      animate={{ y: [-1, 2, -1], rotate: [0, -4, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute -right-2 -bottom-2 w-9 h-9 bg-indigo-600 text-white rounded-xl shadow-lg flex items-center justify-center border border-indigo-400/20 z-20"
                    >
                      <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </motion.div>
                  </div>
                </div>
              )}

              {/* Progress Dial Widget */}
              <div className="relative inline-block mt-4">
                <svg className="w-24 h-24 transform -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="6"
                    fill="transparent"
                    className={theme === 'dark' ? "text-zinc-800" : "text-slate-150"}
                  />
                  <motion.circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="6"
                    fill="transparent"
                    strokeDasharray={251.2}
                    initial={{ strokeDashoffset: 251.2 }}
                    animate={{ strokeDashoffset: 251.2 - (251.2 * reportLoading.progress) / 100 }}
                    className={reportLoading.type === 'excel' ? "text-emerald-500" : "text-indigo-500"}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={cn(
                    "text-xl font-black transition-colors duration-300",
                    theme === 'dark' ? "text-white" : "text-slate-900"
                  )}>{reportLoading.progress}%</span>
                </div>
              </div>

              {/* Dynamic Status Display details */}
              <div className="space-y-1.5 mt-4">
                <h3 className={cn(
                  "text-lg font-black transition-colors duration-300 tracking-tight",
                  theme === 'dark' ? "text-white" : "text-slate-900"
                )}>
                  {reportLoading.type === 'excel' ? (
                    reportLoading.progress <= 30 ? "Preparing entries..." : 
                    reportLoading.progress <= 75 ? "Generating Excel sheet..." : 
                    "Exporting file..."
                  ) : (
                    reportLoading.progress <= 30 ? "Preparing report pages..." : 
                    reportLoading.progress <= 60 ? "Rendering PDF..." : 
                    reportLoading.progress <= 90 ? "Adding entries into document..." : 
                    "Almost ready..."
                  )}
                </h3>
                <p className={cn(
                  "text-xs font-semibold px-4 transition-colors duration-300 max-w-xs leading-relaxed",
                  theme === 'dark' ? "text-zinc-400" : "text-slate-500"
                )}>
                  Please keep this page open. We are constructing your beautiful report dynamically.
                </p>
                {reportLoading.message && (
                  <p className="text-xs font-mono font-black text-rose-500 dark:text-rose-400 mt-2 px-4 select-none">
                    {reportLoading.message}
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Help & Support Dialog */}
      <AnimatePresence>
        {isHelpOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={cn(
                "rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border transition-colors duration-300",
                theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
              )}
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-indigo-600 text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <HelpCircle size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black tracking-tight">Help & Support</h3>
                    <p className="text-xs text-indigo-100 font-medium uppercase tracking-widest">AI Assistant</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setIsHelpOpen(false); setHelpQuery(''); setHelpResponse(''); }}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="space-y-4">
                  <label className={cn(
                    "text-sm font-black uppercase tracking-widest transition-colors duration-300",
                    theme === 'dark' ? "text-slate-500" : "text-black"
                  )}>Ask anything about the app</label>
                  <div className="relative">
                    <textarea
                      value={helpQuery}
                      onChange={(e) => setHelpQuery(e.target.value)}
                      placeholder="How do I add a transaction? How to export reports?"
                      className={cn(
                        "w-full border-2 rounded-2xl p-4 outline-none focus:border-indigo-500 transition-all resize-none h-32",
                        theme === 'dark' ? "bg-zinc-900 border-zinc-800 text-white" : "bg-slate-50 border-slate-100 text-black"
                      )}
                    />
                    <button
                      onClick={() => { vibrate(); setAiConstructionModal('ask'); }}
                      className="absolute bottom-3 right-3 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-200 dark:shadow-none"
                    >
                      <MessageSquare size={18} />
                      Ask AI
                    </button>
                  </div>
                </div>

                {helpResponse && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-5 border border-indigo-100 dark:border-indigo-800/50"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />
                      <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">AI Response</span>
                    </div>
                    <div className={cn(
                      "text-sm leading-relaxed prose prose-slate dark:prose-invert max-w-none transition-colors duration-300",
                      theme === 'dark' ? "text-slate-300" : "text-black"
                    )}>
                      <ReactMarkdown>{helpResponse}</ReactMarkdown>
                    </div>
                  </motion.div>
                )}

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
                  <p className="text-slate-400 text-xs font-medium mb-2">Need more help?</p>
                  <a 
                    href="mailto:triptraccker@gmail.com"
                    className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-black hover:underline transition-all"
                  >
                    mail to triptraccker@gmail.com
                    <ArrowRight size={14} />
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSubmitting && (
          <div className={cn(
            "fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-md transition-colors duration-300",
            theme === 'dark' ? "bg-black/80" : "bg-slate-900/40"
          )}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "rounded-3xl p-8 shadow-2xl text-center space-y-6 max-w-xs w-full border transition-colors duration-300",
                theme === 'dark' ? "bg-zinc-950 border-zinc-900" : "bg-white border-slate-100"
              )}
            >
              <div className="relative w-20 h-20 mx-auto">
                <div className={cn(
                  "absolute inset-0 border-4 rounded-full transition-colors duration-300",
                  theme === 'dark' ? "border-indigo-900/30" : "border-indigo-100"
                )} />
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-full"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="text-indigo-600 animate-pulse" size={32} />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className={cn(
                  "text-xl font-black transition-colors duration-300",
                  theme === 'dark' ? "text-white" : "text-black"
                )}>{submittingMessage}</h3>
                <p className={cn(
                  "text-sm font-medium transition-colors duration-300",
                  theme === 'dark' ? "text-slate-400" : "text-slate-600"
                )}>Please wait a moment...</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bulk Transaction Delete Confirmation Modal */}
      <AnimatePresence>
        {showBulkTransactionDeleteConfirm && (
          <div className={cn(
            "fixed inset-0 z-[150] flex items-center justify-center p-4 backdrop-blur-sm transition-colors duration-300",
            theme === 'dark' ? "bg-black/60" : "bg-slate-900/40"
          )}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center space-y-4 transition-colors duration-300",
                theme === 'dark' ? "bg-zinc-950" : "bg-white"
              )}
            >
              <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto">
                <Trash2 size={32} />
              </div>
              <div className="space-y-2">
                <h3 className={cn(
                  "text-xl font-bold transition-colors duration-300",
                  theme === 'dark' ? "text-white" : "text-black"
                )}>Delete Selected Entries?</h3>
                <p className={cn(
                  "text-sm transition-colors duration-300",
                  theme === 'dark' ? "text-slate-400" : "text-black"
                )}>
                  Are you sure you want to delete <span className="font-bold text-rose-600">{selectedTransactions.size}</span> entries? This action cannot be undone.
                </p>
                <div className="pt-2 text-left flex justify-center">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs select-none">
                    <input 
                      type="checkbox" 
                      checked={deleteConfirmed} 
                      onChange={(e) => setDeleteConfirmed(e.target.checked)}
                      className="rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-slate-800 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-slate-500 dark:text-slate-400 font-bold">I confirm this deletion</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => { setShowBulkTransactionDeleteConfirm(false); }}
                  className={cn(
                    "flex-1 py-3 border rounded-xl font-bold transition-all cursor-pointer",
                    theme === 'dark' ? "border-slate-800 text-slate-400 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleBulkDelete}
                  disabled={!deleteConfirmed}
                  className={cn(
                    "flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-lg shadow-rose-100 dark:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  )}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bulk Delete Confirmation Modal */}
      <AnimatePresence>
        {showBulkDeleteConfirm && (
          <div className={cn(
            "fixed inset-0 z-[150] flex items-center justify-center p-4 backdrop-blur-sm transition-colors duration-300",
            theme === 'dark' ? "bg-black/60" : "bg-slate-900/40"
          )}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center space-y-4 transition-colors duration-300",
                theme === 'dark' ? "bg-zinc-950" : "bg-white"
              )}
            >
              <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto">
                <Trash2 size={32} />
              </div>
              <div className="space-y-2">
                <h3 className={cn(
                  "text-xl font-bold transition-colors duration-300",
                  theme === 'dark' ? "text-white" : "text-black"
                )}>Delete Selected Books?</h3>
                <p className={cn(
                  "text-sm transition-colors duration-300",
                  theme === 'dark' ? "text-slate-400" : "text-black"
                )}>
                  Are you sure you want to delete <span className="font-bold text-rose-600">{selectedBooks.size}</span> cashbooks? This action cannot be undone.
                </p>
                <div className="pt-2 text-left flex justify-center">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs select-none">
                    <input 
                      type="checkbox" 
                      checked={deleteConfirmed} 
                      onChange={(e) => setDeleteConfirmed(e.target.checked)}
                      className="rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-slate-800 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-slate-500 dark:text-slate-400 font-bold">I confirm this deletion</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => { setShowBulkDeleteConfirm(false); }}
                  className={cn(
                    "flex-1 py-3 border rounded-xl font-bold transition-all cursor-pointer",
                    theme === 'dark' ? "border-slate-800 text-slate-400 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleBulkDeleteBooks}
                  disabled={!deleteConfirmed}
                  className={cn(
                    "flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-lg shadow-rose-100 dark:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  )}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Exit App Confirmation Modal */}
      <AnimatePresence>
        {showExitConfirm && (
          <div className={cn(
            "fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-sm transition-colors duration-300",
            theme === 'dark' ? "bg-black/60" : "bg-indigo-900/10"
          )}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center space-y-4 transition-colors duration-300",
                theme === 'dark' ? "bg-zinc-950" : "bg-white"
              )}
            >
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto",
                theme === 'dark' ? "bg-indigo-900/20 text-indigo-400" : "bg-indigo-50 text-indigo-600"
              )}>
                <LogOut size={32} />
              </div>
              <div className="space-y-2">
                <h3 className={cn(
                  "text-xl font-bold transition-colors duration-300",
                  theme === 'dark' ? "text-white" : "text-black"
                )}>Exit App?</h3>
                <p className={cn(
                  "text-sm transition-colors duration-300",
                  theme === 'dark' ? "text-slate-400" : "text-black"
                )}>
                  Do you want to exit the application?
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowExitConfirm(false)}
                  className={cn(
                    "flex-1 py-3 border rounded-xl font-bold transition-all",
                    theme === 'dark' ? "border-slate-800 text-slate-400 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    // In a real app, this might close the window or navigate away
                    // Here we'll just sign out or similar, or just close the modal
                    // The user specifically asked for "Exit" button
                    window.close(); 
                    // Fallback if window.close() is blocked
                    setShowExitConfirm(false);
                  }}
                  className={cn(
                    "flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all",
                    theme === 'dark' ? "shadow-none" : "shadow-lg shadow-indigo-100"
                  )}
                >
                  Exit
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Share Entries Modal */}
      <AnimatePresence>
        {showShareModal && (
          <div className={cn(
            "fixed inset-0 z-[150] flex items-center justify-center p-4 backdrop-blur-sm transition-colors duration-300",
            theme === 'dark' ? "bg-black/60" : "bg-slate-900/40"
          )}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={cn(
                "w-full max-w-md rounded-3xl p-6 shadow-2xl relative space-y-6 transition-colors duration-300",
                theme === 'dark' ? "bg-zinc-950 border border-zinc-900" : "bg-white"
              )}
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-900 pb-3">
                <h3 className={cn(
                  "text-xl font-black transition-colors duration-300",
                  theme === 'dark' ? "text-white" : "text-slate-800"
                )}>
                  {generatedCode ? "Share Code Available" : "Share Selected Entries"}
                </h3>
                <button
                  onClick={() => { setShowShareModal(false); setGeneratedCode(''); setShareExpiryTime(null); setCountdownText(''); }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {shareError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs flex items-center gap-2 font-bold antialiased">
                  <AlertCircle size={16} />
                  <span>{shareError}</span>
                </div>
              )}

              {!generatedCode ? (
                <>
                  <p className={cn(
                    "text-sm transition-colors duration-300 leading-relaxed",
                    theme === 'dark' ? "text-slate-400" : "text-slate-600"
                  )}>
                    You are generating a secure share code to import these entries into another TrackBook cashbook.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
                    <div className={cn(
                      "p-4 rounded-2xl text-center transition-colors duration-300 border flex flex-col justify-center items-center",
                      theme === 'dark' ? "bg-zinc-900/40 border-zinc-900" : "bg-slate-50 border-slate-100"
                    )}>
                      <div className="text-[10px] uppercase font-black tracking-wider text-slate-400">Entries</div>
                      <div className={cn("text-lg font-black mt-1", theme === 'dark' ? "text-indigo-400" : "text-indigo-600")}>
                        {selectedList.length}
                      </div>
                    </div>
                    <div className={cn(
                      "p-4 rounded-2xl text-center transition-colors duration-300 border flex flex-col justify-center items-center",
                      theme === 'dark' ? "bg-zinc-900/40 border-zinc-900" : "bg-emerald-50/40 border-emerald-100/50"
                    )}>
                      <div className="text-[10px] uppercase font-black tracking-wider text-emerald-500">Cash In</div>
                      <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
                        ₹{selectedTotals.in.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className={cn(
                      "p-4 rounded-2xl text-center transition-colors duration-300 border flex flex-col justify-center items-center",
                      theme === 'dark' ? "bg-zinc-900/40 border-zinc-900" : "bg-rose-50/40 border-rose-100/50"
                    )}>
                      <div className="text-[10px] uppercase font-black tracking-wider text-rose-500">Cash Out</div>
                      <div className="text-lg font-black text-rose-600 dark:text-rose-450 mt-1 break-all">
                        ₹{selectedTotals.out.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setShowShareModal(false)}
                      className={cn(
                        "flex-1 py-3 border rounded-xl font-bold transition-all cursor-pointer text-xs sm:text-sm text-center",
                        theme === 'dark' ? "border-slate-800 text-slate-400 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleGenerateShareCode}
                      disabled={isGenerating}
                      className={cn(
                        "flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 cursor-pointer text-xs sm:text-sm",
                        isGenerating && "opacity-55 cursor-not-allowed"
                      )}
                    >
                      {isGenerating ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Generating...
                        </>
                      ) : (
                        "Generate Share Code"
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-6 text-center">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Share Code</div>
                      <div className={cn(
                        "text-3xl sm:text-4xl font-extrabold tracking-widest font-mono p-4 rounded-2xl transition-all select-all flex items-center justify-center gap-3 border border-indigo-100 relative",
                        theme === 'dark' ? "bg-zinc-900 border-zinc-800 text-indigo-400" : "bg-indigo-50/50 border-indigo-100 text-indigo-600"
                      )}>
                        {generatedCode}
                      </div>
                    </div>
                    {countdownText && (
                      <div className={cn(
                        "text-xs font-black px-3.5 py-1.5 rounded-full inline-block animate-pulse font-mono tracking-wider transition-colors duration-300 border",
                        countdownText.includes('expired')
                          ? "bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border-rose-200/50"
                          : "bg-amber-100/80 dark:bg-amber-950/45 text-[#1f2937] dark:text-amber-300 border-amber-300 dark:border-amber-900/60"
                      )}>
                        {countdownText}
                      </div>
                    )}
                  </div>

                  <p className={cn(
                    "text-xs leading-relaxed max-w-sm mx-auto",
                    theme === 'dark' ? "text-slate-400" : "text-slate-500"
                  )}>
                    Give this code to anyone you want to share these entries with. They can import it instantly inside TrackBook under <span className="font-bold">Import Shared Entries</span>.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <button
                      onClick={handleCopy}
                      disabled={countdownText.includes('expired')}
                      className={cn(
                        "flex-1 py-3 border rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-xs sm:text-sm",
                        countdownText.includes('expired')
                          ? "opacity-50 cursor-not-allowed border-slate-200 text-slate-400 dark:border-zinc-850 dark:text-zinc-600"
                          : theme === 'dark'
                            ? "border-slate-800 text-slate-300 hover:bg-slate-850 cursor-pointer"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                      )}
                    >
                      {copied ? (
                        <>
                          <Check className="text-indigo-600 dark:text-indigo-400" size={16} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={16} />
                          Copy Code
                        </>
                      )}
                    </button>
                    {countdownText.includes('expired') ? (
                      <button
                        disabled
                        className="flex-1 py-3 bg-slate-100 dark:bg-zinc-900 border border-slate-250/10 text-slate-400 dark:text-zinc-650 rounded-xl font-bold transition-all flex items-center justify-center gap-2 cursor-not-allowed text-xs sm:text-sm text-center"
                      >
                        Expired
                      </button>
                    ) : (
                      <a
                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Import my TrackBook entries using this code:

${generatedCode}

Open TrackBook → Import Shared Entries`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-3 bg-[#25D366] hover:bg-[#20ba59] active:scale-95 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 cursor-pointer text-xs sm:text-sm text-center shadow-lg shadow-emerald-500/10"
                      >
                        <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm11.951-21.734c-5.382 0-9.761 4.377-9.765 9.761-.001 2.059.537 4.07 1.558 5.839l.24.417-1.033 3.774 3.861-1.013.407.242c1.71 1.015 3.693 1.55 5.733 1.552h.005c5.381 0 9.761-4.377 9.765-9.762.002-2.61-1.013-5.063-2.87-6.921-1.856-1.857-4.31-2.871-6.932-2.872zm4.721 13.43c-.259-.13-1.533-.757-1.77-.843-.238-.087-.41-.13-.582.13-.172.26-.665.843-.815 1.016-.15.174-.3.195-.559.066-.259-.13-1.096-.404-2.088-1.291-.772-.69-1.293-1.543-1.444-1.803-.15-.26-.016-.401.114-.53.117-.116.259-.303.39-.453.13-.15.172-.259.259-.433.086-.174.043-.324-.022-.454-.064-.13-.581-1.402-.796-1.921-.21-.506-.44-.437-.582-.444-.137-.007-.294-.008-.452-.008-.158 0-.417.06-.635.297-.218.238-.832.813-.832 1.984s.854 2.302.973 2.459c.119.157 1.68 2.565 4.07 3.593.57.245 1.014.391 1.359.502.571.181 1.09.155 1.5.094.457-.068 1.533-.626 1.748-1.23.216-.604.216-1.124.152-1.23-.065-.107-.238-.172-.497-.303z" />
                        </svg>
                        Share via WhatsApp
                      </a>
                    )}
                  </div>

                  <button
                    onClick={() => { setShowShareModal(false); setGeneratedCode(''); setShareExpiryTime(null); setCountdownText(''); }}
                    className={cn(
                      "w-full py-2.5 border rounded-xl font-bold transition-all text-xs cursor-pointer",
                      theme === 'dark' ? "border-slate-800 hover:bg-slate-900 text-slate-400" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    Close Action Window
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sticky Mobile/Tablet Action Bar */}
      <AnimatePresence>
        {selectedTransactions.size > 0 && activeBookId && (
          <motion.div
            initial={{ y: "150%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "150%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className={cn(
              "lg:hidden fixed bottom-6 left-4 right-4 max-w-sm mx-auto rounded-[24px] p-4.5 pb-5 backdrop-blur-xl border z-[100] transition-colors duration-300 shadow-[0_16px_50px_rgba(0,0,0,0.3)]",
              theme === 'dark' 
                ? "bg-zinc-950/85 border-zinc-800/80 text-white" 
                : "bg-white/90 border-slate-200/60 text-slate-900"
            )}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100/80 dark:border-zinc-900/60 mb-3">
              <span className={cn(
                "text-[10px] font-extrabold tracking-widest uppercase",
                theme === 'dark' ? "text-zinc-400" : "text-slate-500"
              )}>
                Selected ({selectedTransactions.size})
              </span>
              <div className="flex items-center gap-1.5 font-bold font-mono text-[11px]">
                <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                  +₹{selectedTotals.in.toLocaleString('en-IN')}
                </span>
                <span className="text-slate-300 dark:text-zinc-800">/</span>
                <span className="text-rose-600 dark:text-rose-450 font-extrabold">
                  -₹{selectedTotals.out.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2.5">
              <button
                onClick={toggleSelectAll}
                className={cn(
                  "flex flex-col items-center justify-center h-16 rounded-[18px] transition-all font-bold font-sans text-[10px] tracking-wider uppercase gap-1.5 duration-150 active:scale-95 cursor-pointer border",
                  selectedTransactions.size === filteredTransactions.length
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                    : theme === 'dark'
                      ? "border-zinc-800 text-slate-200 bg-zinc-900/60 hover:bg-zinc-850"
                      : "border-slate-150 text-slate-700 bg-slate-50/50 hover:bg-slate-100/50"
                )}
              >
                <CheckSquare size={16} />
                <span>All</span>
              </button>
              <button
                onClick={() => setSelectedTransactions(new Set())}
                className={cn(
                  "flex flex-col items-center justify-center h-16 rounded-[18px] transition-all font-bold font-sans text-[10px] tracking-wider uppercase gap-1.5 duration-150 active:scale-95 cursor-pointer border",
                  theme === 'dark'
                    ? "border-zinc-800 text-slate-200 bg-zinc-900/60 hover:bg-zinc-850"
                    : "border-slate-150 text-slate-700 bg-slate-50/50 hover:bg-slate-100/50"
                )}
              >
                <Square size={16} />
                <span>None</span>
              </button>
              <button
                onClick={() => setShowShareModal(true)}
                className="flex flex-col items-center justify-center h-16 rounded-[18px] transition-all font-bold font-sans text-[10px] tracking-wider uppercase gap-1.5 bg-indigo-600 border border-indigo-650 text-white cursor-pointer hover:bg-indigo-700 active:scale-95 duration-150 shadow-lg shadow-indigo-600/20"
              >
                <Share size={16} />
                <span>Share</span>
              </button>
              <button
                onClick={() => { setShowBulkTransactionDeleteConfirm(true); setDeleteConfirmed(false); }}
                className="flex flex-col items-center justify-center h-16 rounded-[18px] transition-all font-bold font-sans text-[10px] tracking-wider uppercase gap-1.5 bg-rose-600 border border-rose-650 text-white cursor-pointer hover:bg-rose-700 active:scale-95 duration-150 shadow-lg shadow-rose-600/20"
              >
                <Trash size={16} />
                <span>Delete</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import Shared Entries Modal */}
      <AnimatePresence>
        {showImportModal && (
          <div className={cn(
            "fixed inset-0 z-[150] flex items-center justify-center p-4 backdrop-blur-sm transition-colors duration-300",
            theme === 'dark' ? "bg-black/60" : "bg-slate-900/40"
          )}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={cn(
                "w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4 transition-colors duration-300 relative",
                theme === 'dark' ? "bg-zinc-950 border border-zinc-900" : "bg-white"
              )}
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-900 pb-3">
                <h3 className={cn(
                  "text-lg font-black transition-colors duration-300",
                  theme === 'dark' ? "text-white" : "text-black"
                )}>
                  Import Shared Entries
                </h3>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {importError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs flex items-center gap-2 font-bold antialiased">
                  <AlertCircle size={16} />
                  <span>{importError}</span>
                </div>
              )}

              {importSuccess ? (
                <div className="text-center py-6 space-y-4">
                  <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                    <CheckSquare size={24} className="text-emerald-600 dark:text-emerald-450" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-850 dark:text-slate-100">Entries Imported!</h4>
                    <p className="text-xs text-slate-400 mt-1">Creating book and refreshing workspace...</p>
                    {importSummary && (
                      <div className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-2xl text-left border border-indigo-100/30">
                        <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                          {importSummary.split(' | ')[0]}
                        </div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                          {importSummary.split(' | ')[1]}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!isImporting && importCode.trim()) {
                      handleImportSharedEntries();
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className={cn(
                        "text-[10px] uppercase font-black tracking-wider transition-colors duration-300",
                        theme === 'dark' ? "text-slate-400" : "text-slate-500"
                      )}>
                        Enter 5-Character Share Code
                      </label>
                      <input 
                        type="text"
                        placeholder="e.g. TBK-82KD1"
                        value={importCode}
                        onChange={(e) => setImportCode(e.target.value.toUpperCase())}
                        disabled={isImporting}
                        className={cn(
                          "w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-center font-bold font-mono text-lg tracking-widest",
                          theme === 'dark' ? "bg-zinc-900 border-zinc-800 text-white placeholder-slate-700" : "bg-white border-slate-200 text-black placeholder-slate-300"
                        )}
                        maxLength={10}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button 
                      type="button"
                      onClick={() => setShowImportModal(false)}
                      disabled={isImporting}
                      className={cn(
                        "flex-1 py-3 border rounded-xl font-bold transition-all cursor-pointer text-xs sm:text-sm",
                        theme === 'dark' ? "border-slate-800 text-slate-400 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      disabled={isImporting || !importCode.trim()}
                      className={cn(
                        "flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 dark:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer text-xs sm:text-sm",
                        (isImporting || !importCode.trim()) && "opacity-55 cursor-not-allowed"
                      )}
                    >
                      {isImporting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Importing...
                        </>
                      ) : (
                        "Import Entries"
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden AI File Input */}
      <input 
        type="file"
        multiple
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Floating Download Manager Portal */}
      <DownloadCenter theme={theme} isOpen={showDownloadCenter} setIsOpen={setShowDownloadCenter} />
    </div>
  );
}
