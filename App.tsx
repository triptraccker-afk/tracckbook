/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
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
  Palette
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { cn, formatCurrency } from './lib/utils';
import { parseReceipt } from './services/gemini';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

interface Transaction {
  id: string;
  amount: number;
  type: 'in' | 'out';
  description: string;
  category: string;
  mode: string;
  date: Date;
  images?: string[];
  isAi?: boolean;
}

interface Cashbook {
  id: string;
  name: string;
  transactions: Transaction[];
  createdAt: Date;
}

export default function App() {
  // Global State
  const [session, setSession] = useState<any>(null);
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
  
  // UI State
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
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
  const [showDropZone, setShowDropZone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionSearchQuery, setTransactionSearchQuery] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'all' | 'in' | 'out'>('all');
  const [transactionDurationFilter, setTransactionDurationFilter] = useState('All');
  const [transactionCategoryFilter, setTransactionCategoryFilter] = useState('All');
  const [showReportsMenu, setShowReportsMenu] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const bookLongPressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleTransactionPress = (id: string) => {
    if (selectedTransactions.size > 0) {
      toggleSelectTransaction(id);
    }
  };

  const handleTransactionLongPress = (id: string) => {
    if (selectedTransactions.size === 0) {
      toggleSelectTransaction(id);
      // Vibrate if supported
      if (window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }
  };

  const onTouchStart = (id: string) => {
    longPressTimer.current = setTimeout(() => {
      handleTransactionLongPress(id);
    }, 500); // 500ms for long press
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
      if (window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
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

  // Theme handling
  useEffect(() => {
    const root = window.document.documentElement;
    const body = window.document.body;
    
    // Remove both to be sure
    root.classList.remove('light', 'dark');
    body.classList.remove('light', 'dark');
    
    // Add the current theme
    root.classList.add(theme);
    body.classList.add(theme);
    
    // Set color scheme for system UI
    root.style.colorScheme = theme;
    
    localStorage.setItem('theme', theme);
  }, [theme]);

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

  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [previewImages, setPreviewImages] = useState<string[] | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [reportLoading, setReportLoading] = useState<{ type: 'excel' | 'pdf', progress: number } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const reportsRef = useRef<HTMLDivElement>(null);

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

  const safeToDateTimeLocal = (date: Date | string | number) => {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
      return d.toISOString().slice(0, 16);
    } catch (e) {
      return new Date().toISOString().slice(0, 16);
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

  const CATEGORIES = ['Food', 'Travel', 'Advance', 'Shopping', 'Custom'];
  const MODES = ['Card', 'UPI', 'Cash', 'Custom'];
  const DURATIONS = ['All', 'Today', 'Yesterday', 'Last Week'];

  // Handle Auth Session
  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.user_metadata?.full_name) {
        setUserName(session.user.user_metadata.full_name);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.user_metadata?.full_name) {
        setUserName(session.user.user_metadata.full_name);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch data from Supabase
  useEffect(() => {
    const fetchData = async () => {
      if (!session) {
        setBooks([]);
        setIsLoading(false);
        return;
      }

      if (!supabase) {
        // Load from localStorage if Supabase is not configured
        const savedBooks = localStorage.getItem(`cashbooks_${session.user.id}`);
        if (savedBooks) {
          try {
            const parsed = JSON.parse(savedBooks);
            setBooks(parsed.map((b: any) => ({
              ...b,
              transactions: (b.transactions || []).map((t: any) => ({
                ...t,
                date: new Date(t.date)
              })),
              createdAt: new Date(b.createdAt)
            })));
          } catch (e) {
            console.error('Error parsing saved books:', e);
          }
        }
        setIsLoading(false);
        return;
      }

      try {
        const { data: cashbooks, error: cbError } = await supabase
          .from('cashbooks')
          .select('*, entries(*, attachments(*), ai_attachments(*))')
          .eq('user_id', session.user.id);

        if (cbError) throw cbError;

        if (cashbooks) {
          setBooks(cashbooks.map((cb: any) => ({
            ...cb,
            transactions: (cb.entries || []).map((t: any) => {
              // Combine manual and AI attachments for the UI
              const manualImgs = (t.attachments || []).map((a: any) => a.file_url);
              const aiImgs = (t.ai_attachments || []).map((a: any) => a.file_url);
              
              return {
                ...t,
                date: t.date ? new Date(t.date) : new Date(),
                images: [...manualImgs, ...aiImgs],
                isAi: aiImgs.length > 0
              };
            }).sort((a: any, b: any) => b.date.getTime() - a.date.getTime()),
            createdAt: cb.created_at ? new Date(cb.created_at) : (cb.createdAt ? new Date(cb.createdAt) : new Date())
          })));
        }
      } catch (error: any) {
        console.error('Error fetching data from Supabase:', error);
        setError(error.message || 'Failed to fetch data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [session]);

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

    // Sort by date ascending (1st April before 2nd April)
    return [...filtered].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [activeBook, transactionSearchQuery, transactionTypeFilter, transactionCategoryFilter, transactionDurationFilter]);

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
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: helpQuery,
        config: {
          systemInstruction: "You are a helpful assistant for 'AI Cashbook', a financial management app. The app allows users to create multiple cashbooks, add transactions (Cash In/Out), upload receipt images for AI detection (using Gemini), and export reports in Excel/PDF. Users can also filter transactions by type, category, and duration. Answer the user's question about how to use the app or general financial advice within the context of this app. Keep it concise.",
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
    setDeleteConfirmId(id);
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

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBookId || !showForm || !amount || !session) return;

    const finalCategory = category === 'Custom' ? customCategory : category;
    const finalMode = mode === 'Custom' ? customMode : mode;
    const amountNum = parseFloat(amount);
    const dateObj = new Date(transactionDate);

    if (editingTransaction) {
      // Optimistic update for editing
      const updatedTransaction: Transaction = {
        ...editingTransaction,
        amount: amountNum,
        type: showForm,
        description: description,
        category: finalCategory || 'General',
        mode: finalMode,
        date: dateObj,
        images: selectedImages.length > 0 ? selectedImages : editingTransaction.images
      };

      setBooks(books.map(b => 
        b.id === activeBookId 
          ? { 
              ...b, 
              transactions: b.transactions.map(t => t.id === editingTransaction.id ? updatedTransaction : t)
            }
          : b
      ));

      // Close form immediately for speed
      setShowForm(null);
      setEditingTransaction(null);
      setIsSubmitting(false);

      if (supabase) {
        // Run database update in background
        (async () => {
          try {
            const { error } = await supabase
              .from('entries')
              .update({
                amount: amountNum,
                type: showForm,
                description: description,
                category: finalCategory || 'General',
                mode: finalMode,
                date: safeToISOString(dateObj)
              })
              .eq('id', editingTransaction.id)
              .eq('user_id', session.user.id);
            if (error) throw error;

            if (selectedImages.length > 0) {
              await supabase.from('attachments').delete().eq('entry_id', editingTransaction.id);
              const attachmentInserts = selectedImages.map(url => ({
                entry_id: editingTransaction.id,
                user_id: session.user.id,
                file_url: url,
                file_name: 'manual_upload',
                file_type: 'image'
              }));
              await supabase.from('attachments').insert(attachmentInserts);
            }
          } catch (error) {
            console.error('Error updating entry in Supabase:', error);
            setError('Failed to sync update with server. Please check your connection.');
          }
        })();
      }
    } else {
      // Add new transaction
      const newTransaction: Transaction = {
        id: safeUUID(),
        amount: amountNum,
        type: showForm,
        description: description,
        category: finalCategory || 'General',
        mode: finalMode,
        date: dateObj,
        images: selectedImages.length > 0 ? selectedImages : undefined
      };

      // Optimistic update
      setBooks(books.map(b => 
        b.id === activeBookId 
          ? { ...b, transactions: [newTransaction, ...b.transactions] }
          : b
      ));

      // Close form immediately for speed
      setShowForm(null);
      setIsSubmitting(false);

      if (supabase) {
        // Run database insert in background
        (async () => {
          try {
            const { error } = await supabase
              .from('entries')
              .insert([{
                id: newTransaction.id,
                cashbook_id: activeBookId,
                user_id: session.user.id,
                amount: newTransaction.amount,
                type: newTransaction.type,
                description: newTransaction.description,
                category: newTransaction.category,
                mode: newTransaction.mode,
                date: safeToISOString(newTransaction.date)
              }]);
            if (error) throw error;

            if (newTransaction.images && newTransaction.images.length > 0) {
              const attachmentInserts = newTransaction.images.map(url => ({
                entry_id: newTransaction.id,
                user_id: session.user.id,
                file_url: url,
                file_name: 'manual_upload',
                file_type: 'image'
              }));
              await supabase.from('attachments').insert(attachmentInserts);
            }
          } catch (error) {
            console.error('Error creating entry in Supabase:', error);
            setError('Failed to sync transaction with server. Please check your connection.');
            // Rollback
            setBooks(prevBooks => prevBooks.map(b => 
              b.id === activeBookId 
                ? { ...b, transactions: b.transactions.filter(t => t.id !== newTransaction.id) }
                : b
            ));
          }
        })();
      }
    }

    resetForm();
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactionToDelete(id);
  };

  const confirmDeleteTransaction = async () => {
    if (!activeBookId || !transactionToDelete || !session) return;

    if (supabase) {
      try {
        const { error } = await supabase
          .from('entries')
          .delete()
          .eq('id', transactionToDelete)
          .eq('user_id', session.user.id);
        if (error) throw error;
      } catch (error) {
        console.error('Error deleting entry from Supabase:', error);
      }
    }

    setBooks(books.map(b => 
      b.id === activeBookId 
        ? { ...b, transactions: b.transactions.filter(t => t.id !== transactionToDelete) }
        : b
    ));
    setSelectedTransactions(prev => {
      const next = new Set(prev);
      next.delete(transactionToDelete);
      return next;
    });
    setTransactionToDelete(null);
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

  const resetForm = () => {
    setShowForm(null);
    setEditingTransaction(null);
    setAmount('');
    setDescription('');
    setCategory('Food');
    setCustomCategory('');
    setMode('Cash');
    setCustomMode('');
    setTransactionDate(safeToDateTimeLocal(new Date()));
    setSelectedImages([]);
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
      const reader = new FileReader();
      reader.onloadend = () => {
        newImages.push(reader.result as string);
        if (newImages.length === filesArray.length + selectedImages.length) {
          setSelectedImages(newImages);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const exportToExcel = async () => {
    if (!activeBook) return;
    setReportLoading({ type: 'excel', progress: 0 });
    
    // Simulate progress
    for (let i = 0; i <= 100; i += 10) {
      setReportLoading(prev => prev ? { ...prev, progress: i } : null);
      await new Promise(r => setTimeout(r, 100));
    }

    const data = filteredTransactions.map(t => ({
      Date: t.date.toLocaleDateString('en-IN'),
      Details: t.description,
      Category: t.category,
      Mode: t.mode,
      'Cash In': t.type === 'in' ? t.amount : 0,
      'Cash Out': t.type === 'out' ? t.amount : 0,
    }));

    // Add totals and balance as per user reference
    const totalIn = totals.in;
    const totalOut = totals.out;
    const balance = totals.net;

    const ws = XLSX.utils.json_to_sheet(data);
    
    // Add summary rows
    XLSX.utils.sheet_add_aoa(ws, [
      [],
      ['', '', '', 'TOTAL', totalIn, totalOut],
      ['', '', '', 'BALANCE', balance]
    ], { origin: -1 });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, `${activeBook.name}_Report.xlsx`);
    
    setReportLoading(null);
    setShowReportsMenu(false);
  };

  const exportToPDF = async () => {
    if (!activeBook) return;
    try {
      console.log("Starting PDF export...");
      setReportLoading({ type: 'pdf', progress: 10 });

      const doc = new jsPDF();
      
      setReportLoading({ type: 'pdf', progress: 40 });

      // Attachments only
      const transactionsWithImages = filteredTransactions.filter(t => t.images && t.images.length > 0);
      
      if (transactionsWithImages.length > 0) {
        const totalImages = transactionsWithImages.reduce((acc, t) => acc + (t.images?.length || 0), 0);
        let processedImages = 0;
        let isFirstPage = true;

        for (const t of transactionsWithImages) {
          if (t.images) {
            for (const img of t.images) {
              try {
                if (!isFirstPage) {
                  doc.addPage();
                }
                isFirstPage = false;
                
                // Detect format from base64
                let format = 'JPEG';
                if (img.startsWith('data:image/png')) format = 'PNG';
                else if (img.startsWith('data:image/webp')) format = 'WEBP';
                
                // Clean base64 string if needed
                const base64Data = img.includes('base64,') ? img.split('base64,')[1] : img;
                
                // Add image to PDF - fit to page (90%)
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                const imgWidth = pageWidth * 0.9;
                const imgHeight = pageHeight * 0.9;
                const x = (pageWidth - imgWidth) / 2;
                const y = (pageHeight - imgHeight) / 2;
                doc.addImage(base64Data, format as any, x, y, imgWidth, imgHeight, undefined, 'FAST');
              } catch (e) {
                console.error("Could not add image to PDF:", e);
              }
              
              processedImages++;
              const imageProgress = 40 + (processedImages / totalImages) * 50;
              setReportLoading({ type: 'pdf', progress: Math.round(imageProgress) });
            }
          }
        }
      } else {
        doc.setFontSize(12);
        doc.text("No attachments found in this book.", 14, 20);
      }

      setReportLoading({ type: 'pdf', progress: 95 });
      await new Promise(r => setTimeout(r, 300));
      
      const fileName = `${activeBook.name.replace(/[^a-z0-9]/gi, '_')}_Report.pdf`;
      doc.save(fileName);
      console.log("PDF saved successfully");
      
      setReportLoading({ type: 'pdf', progress: 100 });
      await new Promise(r => setTimeout(r, 300));
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

    // Limit to 5 images as per user request
    const filesToProcess = Array.from(files).slice(0, 5) as File[];

    setIsUploading(true);
    setUploadingMessage('Detecting bill...');
    try {
      for (const file of filesToProcess) {
        await new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('File reading failed'));
          reader.onloadend = async () => {
            try {
              const base64String = (reader.result as string).split(',')[1];
              const result = await parseReceipt(base64String, file.type);
              
              if (result) {
                setUploadingMessage(`Detected ${result.category}! Syncing...`);
                
                const newTransaction: Transaction = {
                  id: safeUUID(),
                  amount: result.amount,
                  type: result.type,
                  description: result.description,
                  category: result.category,
                  mode: 'Online',
                  date: result.date ? new Date(result.date) : new Date(),
                  images: [reader.result as string],
                  isAi: true
                };

                // Optimistic update - show in UI immediately after AI detection
                setBooks(prev => prev.map(b => 
                  b.id === activeBookId 
                    ? { ...b, transactions: [newTransaction, ...b.transactions] }
                    : b
                ));

                if (supabase && session) {
                  // Run database sync in background
                  (async () => {
                    try {
                      const { error } = await supabase
                        .from('entries')
                        .insert([{
                          id: newTransaction.id,
                          cashbook_id: activeBookId,
                          user_id: session.user.id,
                          amount: newTransaction.amount,
                          type: newTransaction.type,
                          description: newTransaction.description,
                          category: newTransaction.category,
                          mode: newTransaction.mode,
                          date: safeToISOString(newTransaction.date)
                        }]);
                      if (error) throw error;

                      // Handle AI attachments
                      if (newTransaction.images && newTransaction.images.length > 0) {
                        const aiAttachmentInserts = newTransaction.images.map(url => ({
                          entry_id: newTransaction.id,
                          user_id: session.user.id,
                          file_url: url,
                          file_name: 'ai_detected_bill',
                          file_type: 'image',
                          raw_ai_data: result
                        }));
                        await supabase.from('ai_attachments').insert(aiAttachmentInserts);
                      }
                    } catch (error) {
                      console.error('Error syncing AI entry to Supabase:', error);
                      setError('AI entry detected but failed to sync with server.');
                      // Rollback
                      setBooks(prev => prev.map(b => 
                        b.id === activeBookId 
                          ? { ...b, transactions: b.transactions.filter(t => t.id !== newTransaction.id) }
                          : b
                      ));
                    }
                  })();
                }
              }
              resolve();
            } catch (err) {
              console.error('Error in file processing callback:', err);
              reject(err);
            }
          };
          reader.readAsDataURL(file);
        });
      }
      setIsUploading(false);
      setShowDropZone(false);
    } catch (error: any) {
      console.error("Upload failed", error);
      setIsUploading(false);
      setShowDropZone(false);
      setError(error.message || 'Upload failed');
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
    return (
      <div className="min-h-screen bg-[#f3f7ff] dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="inline-block"
          >
            <Loader2 size={40} className="text-indigo-600" />
          </motion.div>
          <p className={cn(
            "font-medium animate-pulse transition-colors duration-300",
            theme === 'dark' ? "text-slate-400" : "text-black"
          )}>Loading AI Cashbook...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Auth theme={theme} />;
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

      {/* Header Component */}
      {!activeBookId && (
        <header className={cn(
          "border-b sticky top-0 z-50 px-4 h-14 sm:h-16 transition-colors duration-300",
          theme === 'dark' ? "bg-black border-zinc-900" : "bg-white border-slate-100"
        )}>
          <div className="max-w-6xl mx-auto h-full flex items-center justify-between gap-2 sm:gap-4">
            
            {/* Left: Logo */}
            <div className="flex items-center gap-2 shrink-0 font-outfit">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="p-1.5 sm:p-2 bg-indigo-600 rounded-lg text-white hidden xs:block"
              >
                <Wallet size={18} className="sm:w-5 sm:h-5" />
              </motion.div>
              <div className="flex items-center gap-1 leading-none">
                <span className="font-black text-indigo-600 dark:text-indigo-400 text-sm sm:text-base tracking-tight">AI</span>
                <span className={cn(
                  "font-black text-sm sm:text-base tracking-tight transition-colors duration-300",
                  theme === 'dark' ? "text-slate-100" : "text-slate-800"
                )}>Cashbook</span>
              </div>
            </div>

            {/* Center: Desktop Search (Centered) */}
            <div className="hidden sm:flex flex-1 justify-center px-4">
              <div className="w-full max-w-md relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                <input 
                  type="text"
                  placeholder="Search your books..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cn(
                    "w-full pl-10 pr-4 py-2 border-none rounded-full focus:ring-2 focus:ring-indigo-500 outline-none transition-all",
                    theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-100 text-black"
                  )}
                />
              </div>
            </div>

            {/* Right: Mobile Search Icon + Profile Dropdown */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Mobile Search Button (Right side) */}
              <button 
                onClick={() => setIsSearchExpanded(true)}
                className="sm:hidden p-2 text-slate-400 hover:text-indigo-600 transition-colors"
              >
                <Search size={20} />
              </button>

              <div className="relative shrink-0" ref={dropdownRef}>
                <button 
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
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
                        onClick={toggleTheme}
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
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cn(
                    "flex-1 rounded-full py-2 px-4 outline-none text-sm transition-all",
                    theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-100 text-black"
                  )}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="p-2 text-slate-400">
                    <X size={18} />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </header>
      )}

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto p-4 sm:p-6">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center min-h-[60vh] space-y-4"
            >
              <Loader2 size={48} className="text-indigo-600 animate-spin" />
              <p className={cn(
                "font-medium tracking-tight transition-colors duration-300",
                theme === 'dark' ? "text-slate-400" : "text-black"
              )}>
                Loading your financial data...
              </p>
            </motion.div>
          ) : !activeBookId ? (
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
                      onClick={() => setShowBulkDeleteConfirm(true)}
                      className="flex-1 sm:flex-none py-2 sm:py-2.5 px-4 sm:px-6 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-lg shadow-rose-100 dark:shadow-none transition-all flex items-center justify-center gap-2 text-sm sm:text-base animate-in fade-in zoom-in duration-200"
                    >
                      <Trash2 size={18} />
                      Delete ({selectedBooks.size})
                    </button>
                  ) : (
                    books.length > 0 && (
                      <button
                        onClick={() => setIsCreatingBook(true)}
                        className="flex-1 sm:flex-none py-2 sm:py-2.5 px-4 sm:px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 dark:shadow-none transition-all flex items-center justify-center gap-2 text-sm sm:text-base"
                      >
                        <Plus size={18} />
                        Create a Book
                      </button>
                    )
                  )}

                  <div className={cn(
                    "hidden sm:flex items-center gap-2 p-1 rounded-xl border shadow-sm transition-colors duration-300",
                    theme === 'dark' ? "bg-zinc-950 border-zinc-900" : "bg-white border-slate-100"
                  )}>
                    <button 
                      onClick={() => setViewMode('grid')}
                      className={cn("p-2 rounded-lg transition-all", viewMode === 'grid' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}
                    >
                      <LayoutGrid size={20} />
                    </button>
                    <button 
                      onClick={() => setViewMode('list')}
                      className={cn("p-2 rounded-lg transition-all", viewMode === 'list' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}
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
                  <button
                    onClick={() => setIsCreatingBook(true)}
                    className="py-2 sm:py-2.5 px-5 sm:px-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xl shadow-indigo-200 dark:shadow-none transition-all flex items-center gap-2 active:scale-95 text-xs sm:text-sm"
                  >
                    <Plus size={16} />
                    Create a Book
                  </button>
                </div>
              ) : (
                <div className={cn(
                  "grid gap-2 sm:gap-6",
                  viewMode === 'grid' ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"
                )}>
                  {filteredBooks.map((book) => (
                    <motion.div
                      key={book.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onMouseDown={() => onTouchStartBook(book.id)}
                      onMouseUp={onTouchEndBook}
                      onTouchStart={() => onTouchStartBook(book.id)}
                      onTouchEnd={onTouchEndBook}
                      onClick={() => handleBookPress(book.id)}
                      className={cn(
                        "group p-4 sm:p-6 border rounded-2xl sm:rounded-3xl transition-all duration-200 relative overflow-hidden select-none",
                        theme === 'dark' ? "bg-zinc-950 border-zinc-800" : "bg-white border-slate-100",
                        selectedBooks.has(book.id) 
                          ? (theme === 'dark' ? "border-indigo-500 ring-1 ring-indigo-500 bg-indigo-950/30" : "border-indigo-600 ring-1 ring-indigo-600 bg-indigo-50/30 shadow-lg")
                          : (theme === 'dark' ? "hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/10" : "hover:border-indigo-300 hover:shadow-2xl hover:shadow-indigo-500/10"),
                        (viewMode === 'list' || window.innerWidth < 640) && "flex items-center justify-between py-4 sm:py-4"
                      )}
                    >
                      {selectedBooks.has(book.id) && (
                        <div className="absolute top-2 right-2 z-10">
                          <div className="bg-indigo-600 text-white rounded-full p-1 shadow-md">
                            <Check size={12} />
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="p-2 sm:p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl sm:rounded-2xl group-hover:scale-110 transition-transform">
                          <BookOpen size={20} className="sm:w-6 sm:h-6" />
                        </div>
                        <div className="min-w-0">
                          <h4 className={cn(
                            "font-bold text-sm sm:text-lg truncate max-w-[120px] xs:max-w-[160px] sm:max-w-none transition-colors duration-300",
                            theme === 'dark' ? "text-slate-100" : "text-slate-800"
                          )}>{book.name}</h4>
                          <p className={cn(
                            "text-[10px] sm:text-xs transition-colors duration-300",
                            theme === 'dark' ? "text-slate-500" : "text-slate-400"
                          )}>Created on {book.createdAt.toLocaleDateString()}</p>
                        </div>
                      </div>
                      
                      {(viewMode === 'grid' && window.innerWidth >= 640) ? (
                        <>
                          <div className="mt-6 pt-4 border-t border-slate-50 dark:border-slate-800 flex justify-end items-center">
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={(e) => { e.stopPropagation(); setIsEditingBook(book.id); setEditBookName(book.name); }}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all"
                              >
                                <Pencil size={18} />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteBook(book.id); }}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={() => setActiveBookId(book.id)}
                            className={cn(
                              "w-full mt-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all group/btn",
                              theme === 'dark' ? "bg-zinc-900 text-slate-300 hover:bg-indigo-600 hover:text-white" : "bg-slate-50 text-slate-600 hover:bg-indigo-600 hover:text-white"
                            )}
                          >
                            View Book
                            <ArrowRight size={18} className="group-hover/btn:translate-x-1 transition-transform" />
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 sm:gap-6">
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
                                <ArrowRight size={18} className="sm:w-5 sm:h-5" />
                              </motion.div>
                            </button>
                          </div>
                        </div>
                      )}
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
              className="max-w-6xl mx-auto space-y-4 sm:space-y-6 pb-24 sm:pb-0"
            >
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
                
                {/* Desktop Reports Menu */}
                <div className="hidden sm:block relative" ref={reportsRef}>
                  <button 
                    onClick={() => setShowReportsMenu(!showReportsMenu)}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all"
                  >
                    <DownloadCloud size={18} />
                    Reports
                  </button>
                  <AnimatePresence>
                    {showReportsMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl border border-slate-100 dark:border-zinc-900 p-2 z-50"
                      >
                        <button 
                          onClick={exportToExcel}
                          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all"
                        >
                          <FileSpreadsheet size={18} className="text-emerald-600" />
                          <span className="font-bold text-sm">Export Excel</span>
                        </button>
                        <button 
                          onClick={exportToPDF}
                          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all"
                        >
                          <FileText size={18} className="text-rose-600" />
                          <span className="font-bold text-sm">Export PDF</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Mobile Summary Card (Reference Image Style) */}
              <div className={cn(
                "sm:hidden rounded-3xl border shadow-sm overflow-hidden transition-colors duration-300",
                theme === 'dark' ? "bg-zinc-950 border-zinc-900" : "bg-white border-slate-100"
              )}>
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className={cn(
                      "text-lg font-bold transition-colors duration-300",
                      theme === 'dark' ? "text-slate-100" : "text-black"
                    )}>Net Balance</h3>
                    <p className={cn(
                      "font-black transition-colors duration-300",
                      theme === 'dark' ? "text-slate-100" : "text-black",
                      formatCurrency(totals.net).length > 12 ? "text-lg" : "text-xl"
                    )}>
                      {formatCurrency(totals.net)}
                    </p>
                  </div>
                  
                  <div className={cn(
                    "space-y-2 pt-2 border-t transition-colors duration-300",
                    theme === 'dark' ? "border-zinc-800" : "border-slate-50"
                  )}>
                    <div className="flex items-center justify-between">
                      <p className={cn(
                        "text-sm font-bold transition-colors duration-300",
                        theme === 'dark' ? "text-slate-400" : "text-slate-500"
                      )}>Total In (+)</p>
                      <p className={cn(
                        "font-black text-emerald-600",
                        formatCurrency(totals.in).length > 12 ? "text-xs" : "text-sm"
                      )}>{formatCurrency(totals.in)}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className={cn(
                        "text-sm font-bold transition-colors duration-300",
                        theme === 'dark' ? "text-slate-400" : "text-slate-500"
                      )}>Total Out (-)</p>
                      <p className={cn(
                        "font-black text-rose-600",
                        formatCurrency(totals.out).length > 12 ? "text-xs" : "text-sm"
                      )}>{formatCurrency(totals.out)}</p>
                    </div>
                  </div>
                </div>

                {/* View Reports Dropdown for Mobile */}
                <div className="border-t border-slate-50 dark:border-slate-800">
                  <button 
                    onClick={() => setShowReportsMenu(!showReportsMenu)}
                    className="w-full py-3 flex items-center justify-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  >
                    View Reports
                    <ChevronDown size={16} className={cn("transition-transform", showReportsMenu && "rotate-180")} />
                  </button>
                  
                  <AnimatePresence>
                    {showReportsMenu && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-slate-50 dark:bg-slate-800/50"
                      >
                        <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                          <button 
                            onClick={exportToExcel}
                            className="flex items-center justify-center gap-2 py-4 hover:bg-white dark:hover:bg-slate-800 transition-all"
                          >
                            <Download size={16} className="text-emerald-600" />
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-widest transition-colors duration-300",
                              theme === 'dark' ? "text-slate-300" : "text-black"
                            )}>Excel</span>
                          </button>
                          <button 
                            onClick={exportToPDF}
                            className="flex items-center justify-center gap-2 py-4 hover:bg-white dark:hover:bg-slate-800 transition-all"
                          >
                            <FileText size={16} className="text-rose-600" />
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-widest transition-colors duration-300",
                              theme === 'dark' ? "text-slate-300" : "text-black"
                            )}>PDF</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Action Buttons Row (Desktop Only) */}
              <div className="hidden lg:flex items-center gap-3">
                <button
                  onClick={() => { setShowForm('in'); setTransactionDate(safeToDateTimeLocal(new Date())); }}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl font-bold transition-all hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                >
                  <Plus size={20} />
                  Cash In
                </button>
                <button
                  onClick={() => { setShowForm('out'); setTransactionDate(safeToDateTimeLocal(new Date())); }}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl font-bold transition-all hover:bg-rose-100 dark:hover:bg-rose-900/40"
                >
                  <Minus size={20} />
                  Cash Out
                </button>
                <button
                  onClick={() => setShowAiWarning(true)}
                  disabled={isUploading}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold transition-all hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                >
                  {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                  AI Upload
                </button>
              </div>

              {/* Filters & Search Row */}
              <div className="flex flex-col lg:flex-row items-center gap-3 sm:gap-4">
                <div className="flex-1 relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text"
                    placeholder="Search by remark, amount, category..."
                    value={transactionSearchQuery}
                    onChange={(e) => setTransactionSearchQuery(e.target.value)}
                    className={cn(
                      "w-full pl-10 pr-4 py-2.5 sm:py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm",
                      theme === 'dark' ? "bg-zinc-900 border-zinc-800 text-slate-100" : "bg-white border-slate-200 text-black"
                    )}
                  />
                </div>
                <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                  <button
                    onClick={toggleSelectAll}
                    className={cn(
                      "hidden lg:flex items-center gap-2 px-4 py-2.5 sm:py-3 rounded-xl font-bold transition-all text-[10px] sm:text-sm whitespace-nowrap",
                      selectedTransactions.size === filteredTransactions.length && filteredTransactions.length > 0
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-none"
                        : theme === 'dark' ? "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {selectedTransactions.size === filteredTransactions.length && filteredTransactions.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                    {selectedTransactions.size === filteredTransactions.length && filteredTransactions.length > 0 ? 'Deselect All' : 'Select All'}
                  </button>
                  {selectedTransactions.size > 0 && (
                    <button
                      onClick={() => setShowBulkTransactionDeleteConfirm(true)}
                      className="flex items-center gap-2 px-4 py-2.5 sm:py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 dark:shadow-none whitespace-nowrap text-xs sm:text-sm"
                    >
                      <Trash size={16} className="sm:w-[18px] sm:h-[18px]" />
                      Delete ({selectedTransactions.size})
                    </button>
                  )}
                  <div className="relative min-w-[100px] sm:min-w-[120px]">
                    <select 
                      value={transactionTypeFilter}
                      onChange={(e) => setTransactionTypeFilter(e.target.value as any)}
                      className={cn(
                        "w-full pl-3 sm:pl-4 pr-8 sm:pr-10 py-2.5 sm:py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-[10px] sm:text-sm font-bold appearance-none",
                        theme === 'dark' ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-black"
                      )}
                    >
                      <option value="all">All Types</option>
                      <option value="in">Cash In</option>
                      <option value="out">Cash Out</option>
                    </select>
                    <ChevronDown className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                  </div>
                  <div className="relative min-w-[110px] sm:min-w-[140px]">
                    <select 
                      value={transactionDurationFilter}
                      onChange={(e) => setTransactionDurationFilter(e.target.value)}
                      className={cn(
                        "w-full pl-3 sm:pl-4 pr-8 sm:pr-10 py-2.5 sm:py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-[10px] sm:text-sm font-bold appearance-none",
                        theme === 'dark' ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-black"
                      )}
                    >
                      {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                  </div>
                </div>
              </div>

              {/* Balance Cards Row (Desktop Only) */}
              <div className="hidden lg:grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                <div className={cn(
                  "p-6 rounded-3xl border flex items-center gap-4 shadow-sm transition-colors duration-300",
                  theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                )}>
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                    <Plus size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Cash In</p>
                    <p className={cn(
                      "font-black text-emerald-600 dark:text-emerald-400",
                      formatCurrency(totals.in).length > 10 ? "text-xl" : "text-3xl"
                    )}>
                      {formatCurrency(totals.in)}
                    </p>
                  </div>
                </div>

                <div className={cn(
                  "p-6 rounded-3xl border flex items-center gap-4 shadow-sm transition-colors duration-300",
                  theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                )}>
                  <div className="p-3 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-2xl">
                    <Minus size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Cash Out</p>
                    <p className={cn(
                      "font-black text-rose-600 dark:text-rose-400",
                      formatCurrency(totals.out).length > 10 ? "text-xl" : "text-3xl"
                    )}>
                      {formatCurrency(totals.out)}
                    </p>
                  </div>
                </div>

                <div className={cn(
                  "p-6 rounded-3xl border flex items-center gap-4 shadow-sm transition-colors duration-300",
                  theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                )}>
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                    <Wallet size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Net Balance</p>
                    <p className={cn(
                      "font-black text-indigo-600 dark:text-indigo-400",
                      formatCurrency(totals.net).length > 10 ? "text-xl" : "text-3xl"
                    )}>
                      {formatCurrency(totals.net)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Transaction List Section */}
              <div className="space-y-4">
                {/* Mobile Transaction List (Card Based) */}
                <div className="lg:hidden space-y-3">
                  {filteredTransactions.length === 0 ? (
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
                      // Group transactions by date for headers
                      const groups: { [key: string]: Transaction[] } = {};
                      filteredTransactions.forEach(t => {
                        const dateStr = t.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
                        if (!groups[dateStr]) groups[dateStr] = [];
                        groups[dateStr].push(t);
                      });

                      return Object.entries(groups).map(([date, transactions]) => (
                        <div key={date} className="space-y-2">
                          <div className="flex items-center gap-2 px-1">
                            <div className="w-1 h-4 bg-indigo-600 rounded-full" />
                            <h4 className={cn(
                              "text-xs font-bold transition-colors duration-300",
                              theme === 'dark' ? "text-slate-500" : "text-slate-600"
                            )}>{date}</h4>
                          </div>
                          
                          {transactions.map((t, idx) => {
                            // Calculate running balance for this specific transaction
                            const globalIdx = filteredTransactions.findIndex(ft => ft.id === t.id);
                            const runningBalance = filteredTransactions
                              .slice(0, globalIdx + 1)
                              .reduce((acc, curr) => acc + (curr.type === 'in' ? curr.amount : -curr.amount), 0);

                            return (
                              <motion.div
                                key={t.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                onMouseDown={() => onTouchStart(t.id)}
                                onMouseUp={onTouchEnd}
                                onTouchStart={() => onTouchStart(t.id)}
                                onTouchEnd={onTouchEnd}
                                onClick={() => handleTransactionPress(t.id)}
                                className={cn(
                                  "rounded-xl border shadow-sm p-2.5 relative transition-all active:scale-[0.98] select-none overflow-hidden transition-colors duration-300",
                                  selectedTransactions.has(t.id) 
                                    ? (theme === 'dark' ? "border-indigo-500 ring-1 ring-indigo-500 bg-indigo-950/30" : "border-indigo-600 ring-1 ring-indigo-600 bg-indigo-50/30 shadow-lg") 
                                    : (theme === 'dark' ? "bg-zinc-950 border-zinc-900" : "bg-white border-slate-100")
                                )}
                              >
                                {t.isAi && (
                                  <div className="absolute top-0 right-0">
                                    <div className="bg-amber-500 text-white text-[7px] font-black px-1.5 py-0.5 rounded-bl-lg flex items-center gap-0.5 shadow-sm">
                                      <Sparkles size={6} />
                                      AI
                                    </div>
                                  </div>
                                )}
                                <div className="flex justify-between items-start mb-1.5">
                                  <div className="flex flex-wrap gap-1">
                                    <span className={cn(
                                      "px-1.5 py-0.5 text-[8px] font-bold rounded-md transition-colors duration-300",
                                      theme === 'dark' ? "bg-indigo-900/40 text-indigo-400" : "bg-indigo-50 text-indigo-600"
                                    )}>
                                      {t.category}
                                    </span>
                                    <span className={cn(
                                      "px-1.5 py-0.5 text-[8px] font-bold rounded-md transition-colors duration-300",
                                      theme === 'dark' ? "bg-slate-800 text-slate-400" : "bg-slate-50 text-slate-500"
                                    )}>
                                      {t.mode}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <p className={cn(
                                      "text-sm font-black",
                                      t.type === 'in' ? "text-emerald-600" : "text-rose-600"
                                    )}>
                                      {formatCurrency(t.amount)}
                                    </p>
                                    <p className={cn(
                                      "text-[8px] font-bold leading-none transition-colors duration-300",
                                      theme === 'dark' ? "text-slate-500" : "text-slate-400"
                                    )}>
                                      Bal: {formatCurrency(runningBalance)}
                                    </p>
                                  </div>
                                </div>

                                <div className="mb-1.5">
                                  <p className={cn(
                                    "text-[11px] font-bold line-clamp-1 transition-colors duration-300",
                                    theme === 'dark' ? "text-slate-100" : "text-black"
                                  )}>
                                    {t.description || 'No details provided'}
                                  </p>
                                </div>

                                <div className={cn(
                                  "flex items-center justify-between pt-1.5 border-t transition-colors duration-300",
                                  theme === 'dark' ? "border-slate-800" : "border-slate-50"
                                )}>
                                  <div className="flex items-center gap-2">
                                    {t.images && t.images.length > 0 ? (
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPreviewImages(t.images!);
                                          setPreviewIndex(0);
                                          setPreviewRotation(0);
                                          setPreviewZoom(1);
                                        }}
                                        className={cn(
                                          "flex items-center gap-1 transition-colors duration-300",
                                          theme === 'dark' ? "text-indigo-400" : "text-indigo-600"
                                        )}
                                      >
                                        <Paperclip size={10} />
                                        <span className="text-[8px] font-bold">{t.images.length}</span>
                                      </button>
                                    ) : (
                                      <div className={cn(
                                        "flex items-center gap-1 transition-colors duration-300",
                                        theme === 'dark' ? "text-slate-700" : "text-slate-200"
                                      )}>
                                        <Paperclip size={10} />
                                        <span className="text-[8px] font-bold">0</span>
                                      </div>
                                    )}
                                    <span className={cn(
                                      "transition-colors duration-300",
                                      theme === 'dark' ? "text-slate-800" : "text-slate-200"
                                    )}>•</span>
                                    <span className={cn(
                                      "text-[8px] font-bold transition-colors duration-300",
                                      theme === 'dark' ? "text-slate-500" : "text-slate-400"
                                    )}>
                                      {t.date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                    </span>
                                  </div>
                                  
                                  <div className="flex items-center gap-1">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleEditTransaction(t); }}
                                      className={cn(
                                        "p-1 rounded-md transition-all",
                                        theme === 'dark' ? "bg-slate-800 text-slate-400 hover:text-indigo-400" : "bg-slate-50 text-slate-400 hover:text-indigo-600"
                                      )}
                                    >
                                      <Pencil size={10} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleDeleteTransaction(t.id); }}
                                      className={cn(
                                        "p-1 rounded-md transition-all",
                                        theme === 'dark' ? "bg-rose-900/20 text-rose-400 hover:text-rose-500" : "bg-rose-50 text-rose-400 hover:text-rose-600"
                                      )}
                                    >
                                      <Trash2 size={10} />
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      ));
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
                    "rounded-3xl border overflow-hidden shadow-sm transition-colors duration-300",
                    theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                  )}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className={cn(
                            "text-slate-400 text-xs font-bold uppercase tracking-wider transition-colors duration-300",
                            theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50"
                          )}>
                            <th className="px-6 py-4 w-12">
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
                            <th className="px-6 py-4">Date & Time</th>
                            <th className="px-6 py-4">Details</th>
                            <th className="px-6 py-4">Category</th>
                            <th className="px-6 py-4">Mode</th>
                            <th className="px-6 py-4">Bill</th>
                            <th className="px-6 py-4 text-right">Amount</th>
                            <th className="px-6 py-4 text-right">Balance</th>
                            <th className="px-6 py-4 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className={cn(
                          "divide-y transition-colors duration-300",
                          theme === 'dark' ? "divide-slate-800" : "divide-slate-50"
                        )}>
                          {filteredTransactions.length === 0 ? (
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
                            filteredTransactions.map((t, index) => {
                              const runningBalance = filteredTransactions
                                .slice(0, index + 1)
                                .reduce((acc, curr) => acc + (curr.type === 'in' ? curr.amount : -curr.amount), 0);

                              return (
                                <tr key={t.id} className={cn(
                                  "group transition-colors",
                                  theme === 'dark' ? "hover:bg-slate-800/30" : "hover:bg-slate-50/50",
                                  selectedTransactions.has(t.id) && (theme === 'dark' ? "bg-indigo-900/10" : "bg-indigo-50/50")
                                )}>
                                  <td className="px-6 py-4">
                                    <button 
                                      onClick={() => toggleSelectTransaction(t.id)}
                                      className={cn(
                                        "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                                        selectedTransactions.has(t.id)
                                          ? "bg-indigo-600 border-indigo-600 text-white"
                                          : "border-slate-300 dark:border-slate-700 group-hover:border-indigo-500"
                                      )}
                                    >
                                      {selectedTransactions.has(t.id) && <CheckSquare size={14} />}
                                    </button>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <p className="font-bold text-slate-800 dark:text-white text-sm">
                                      {t.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                      {t.date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                    </p>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                      <p className={cn(
                                        "text-sm font-bold transition-colors duration-300",
                                        theme === 'dark' ? "text-slate-300" : "text-black"
                                      )}>{t.description || '--'}</p>
                                      {t.isAi && (
                                        <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[9px] font-black rounded-full flex items-center gap-0.5 border border-amber-200 dark:border-amber-800">
                                          <Sparkles size={10} />
                                          AI
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <p className={cn(
                                      "text-sm font-bold transition-colors duration-300",
                                      theme === 'dark' ? "text-slate-300" : "text-black"
                                    )}>{t.category}</p>
                                  </td>
                                  <td className="px-6 py-4">
                                    <p className={cn(
                                      "text-sm font-bold transition-colors duration-300",
                                      theme === 'dark' ? "text-slate-300" : "text-black"
                                    )}>{t.mode}</p>
                                  </td>
                                  <td className="px-6 py-4">
                                    {t.images && t.images.length > 0 ? (
                                      <button 
                                        onClick={() => {
                                          setPreviewImages(t.images!);
                                          setPreviewIndex(0);
                                          setPreviewRotation(0);
                                          setPreviewZoom(1);
                                        }}
                                        className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors group/bill"
                                      >
                                        <Paperclip size={16} />
                                        <div className="text-left">
                                          <p className="text-[10px] font-black leading-none">{t.images.length}</p>
                                          <p className="text-[10px] font-bold text-slate-400 group-hover/bill:text-indigo-400">Attachments</p>
                                        </div>
                                      </button>
                                    ) : null}
                                  </td>
                                  <td className={cn(
                                    "px-6 py-4 text-right font-black",
                                    t.type === 'in' ? "text-emerald-600" : "text-rose-600",
                                    formatCurrency(t.amount).length > 10 ? "text-xs" : "text-sm"
                                  )}>
                                    {formatCurrency(t.amount)}
                                  </td>
                                  <td className={cn(
                                    "px-6 py-4 text-right font-black transition-colors duration-300",
                                    theme === 'dark' ? "text-slate-100" : "text-black",
                                    formatCurrency(runningBalance).length > 10 ? "text-xs" : "text-sm"
                                  )}>
                                    <span>{formatCurrency(runningBalance)}</span>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button 
                                        onClick={() => handleEditTransaction(t)}
                                        className={cn(
                                          "p-1.5 text-slate-400 rounded-lg transition-all",
                                          theme === 'dark' ? "hover:text-indigo-400 hover:bg-indigo-900/20" : "hover:text-indigo-600 hover:bg-indigo-50"
                                        )}
                                      >
                                        <Pencil size={16} />
                                      </button>
                                      <button 
                                        onClick={() => handleDeleteTransaction(t.id)}
                                        className={cn(
                                          "p-1.5 text-slate-400 rounded-lg transition-all",
                                          theme === 'dark' ? "hover:text-rose-400 hover:bg-rose-900/20" : "hover:text-rose-600 hover:bg-rose-50"
                                        )}
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile Sticky Bottom Buttons */}
              <div className={cn(
                "lg:hidden fixed bottom-0 left-0 right-0 p-4 backdrop-blur-lg border-t z-40 space-y-3 transition-colors duration-300",
                theme === 'dark' ? "bg-slate-900/80 border-slate-800" : "bg-white/80 border-slate-100"
              )}>
                <button
                  onClick={() => setShowAiWarning(true)}
                  disabled={isUploading}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black shadow-lg transition-all active:scale-95",
                    theme === 'dark' ? "bg-indigo-900/20 text-indigo-400 shadow-none" : "bg-indigo-50 text-indigo-600 shadow-indigo-100"
                  )}
                >
                  {isUploading ? <Loader2 size={20} className="animate-spin" /> : <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ repeat: Infinity, duration: 2 }}><Upload size={20} /></motion.div>}
                  AI UPLOAD
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowForm('in'); setTransactionDate(safeToDateTimeLocal(new Date())); }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black shadow-lg transition-all active:scale-95",
                      theme === 'dark' ? "bg-emerald-900/20 text-emerald-400 shadow-none" : "bg-emerald-50 text-emerald-600 shadow-emerald-100"
                    )}
                  >
                    <Plus size={20} />
                    CASH IN
                  </button>
                  <button
                    onClick={() => { setShowForm('out'); setTransactionDate(safeToDateTimeLocal(new Date())); }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black shadow-lg transition-all active:scale-95",
                      theme === 'dark' ? "bg-rose-900/20 text-rose-400 shadow-none" : "bg-rose-50 text-rose-600 shadow-rose-100"
                    )}
                  >
                    <Minus size={20} />
                    CASH OUT
                  </button>
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
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-3 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteBook}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-lg shadow-rose-100 dark:shadow-none transition-all"
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
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setTransactionToDelete(null)}
                  className="flex-1 py-3 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteTransaction}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-lg shadow-rose-100 dark:shadow-none transition-all"
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
              <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto">
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
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 dark:shadow-none transition-all"
                >
                  Proceed
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Drop Zone Modal */}
      <AnimatePresence>
        {showDropZone && (
          <div className={cn(
            "fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-md transition-colors duration-300",
            theme === 'dark' ? "bg-black/70" : "bg-indigo-900/20"
          )}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={cn(
                "w-full max-w-md rounded-3xl p-8 shadow-2xl space-y-6 transition-colors duration-300",
                theme === 'dark' ? "bg-zinc-950" : "bg-white"
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
                className="border-2 border-dashed border-indigo-200 dark:border-indigo-900/50 rounded-2xl p-10 flex flex-col items-center justify-center gap-4 bg-indigo-50/30 dark:bg-indigo-900/5 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all cursor-pointer group"
              >
                <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-sm flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                  <Upload size={32} />
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-800 dark:text-white">Drag & Drop images here</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">or click to browse files</p>
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
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Creation Date</label>
                  <input
                    type="text"
                    disabled
                    value={new Date().toLocaleDateString()}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/50 text-slate-400 outline-none cursor-not-allowed"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 dark:shadow-none transition-all"
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
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 dark:shadow-none transition-all"
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
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 dark:shadow-none transition-all"
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
                "w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden transition-colors duration-300",
                theme === 'dark' ? "bg-zinc-950" : "bg-white"
              )}
            >
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
                <div className={cn(
                  "p-1 rounded-xl flex gap-1 transition-colors duration-300",
                  theme === 'dark' ? "bg-slate-800" : "bg-slate-100"
                )}>
                  <button
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

                <form onSubmit={handleAddTransaction} className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date & Time</label>
                      <input
                        type="datetime-local"
                        value={transactionDate}
                        onChange={(e) => setTransactionDate(e.target.value)}
                        className={cn(
                          "w-full h-[52px] px-4 py-3 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium transition-colors duration-300",
                          theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-50 text-black"
                        )}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount (₹)</label>
                      <input
                        autoFocus
                        type="number"
                        required
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
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
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Enter transaction details"
                      rows={2}
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
                            className="w-full h-[52px] px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-indigo-100 dark:border-indigo-900/30 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white text-sm"
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
                            className="w-full h-[52px] px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-indigo-100 dark:border-indigo-900/30 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white text-sm"
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bills / Attachments (Max 5)</label>
                    <div className="space-y-3">
                      {selectedImages.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {selectedImages.map((img, i) => (
                            <div key={i} className="relative group w-16 h-16 sm:w-20 sm:h-20">
                              <img 
                                src={img} 
                                alt="preview" 
                                className="w-full h-full object-cover rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer" 
                                onClick={() => {
                                  setPreviewImages(selectedImages);
                                  setPreviewIndex(i);
                                  setPreviewRotation(0);
                                  setPreviewZoom(1);
                                }}
                              />
                              <button 
                                type="button"
                                onClick={() => removeImage(i)}
                                className="absolute -top-2 -right-2 p-1 bg-rose-600 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={12} />
                              </button>
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
                      className="flex-1 py-3 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold text-white shadow-lg transition-all active:scale-95 text-sm",
                        showForm === 'in' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100 dark:shadow-none" : "bg-rose-600 hover:bg-rose-700 shadow-rose-100 dark:shadow-none"
                      )}
                    >
                      Save
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
                  <img 
                    src={previewImages[previewIndex]} 
                    alt="preview" 
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
                      previewIndex === i ? "border-indigo-500 scale-110 shadow-lg shadow-indigo-500/20" : "border-transparent opacity-50 hover:opacity-100"
                    )}
                  >
                    <img src={img} alt="thumb" className="w-full h-full object-cover" />
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
            "fixed inset-0 z-[300] flex items-center justify-center backdrop-blur-md transition-colors duration-300",
            theme === 'dark' ? "bg-black/80" : "bg-white/80"
          )}>
            <div className="text-center space-y-6 max-w-xs w-full px-6">
              <div className="relative inline-block">
                <svg className="w-32 h-32 transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="58"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className={theme === 'dark' ? "text-slate-800" : "text-slate-100"}
                  />
                  <motion.circle
                    cx="64"
                    cy="64"
                    r="58"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={364.4}
                    initial={{ strokeDashoffset: 364.4 }}
                    animate={{ strokeDashoffset: 364.4 - (364.4 * reportLoading.progress) / 100 }}
                    className="text-indigo-600"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={cn(
                    "text-2xl font-black transition-colors duration-300",
                    theme === 'dark' ? "text-white" : "text-black"
                  )}>{reportLoading.progress}%</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className={cn(
                  "text-xl font-black transition-colors duration-300",
                  theme === 'dark' ? "text-white" : "text-black"
                )}>
                  Exporting your {reportLoading.type.toUpperCase()} report
                </h3>
                <p className={cn(
                  "font-medium transition-colors duration-300",
                  theme === 'dark' ? "text-slate-400" : "text-slate-600"
                )}>
                  Please wait while we prepare your file...
                </p>
              </div>
            </div>
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
                      onClick={handleAskAi}
                      disabled={isHelpLoading || !helpQuery.trim()}
                      className="absolute bottom-3 right-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white px-6 py-2 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-200 dark:shadow-none"
                    >
                      {isHelpLoading ? <Loader2 size={18} className="animate-spin" /> : <MessageSquare size={18} />}
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
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowBulkTransactionDeleteConfirm(false)}
                  className={cn(
                    "flex-1 py-3 border rounded-xl font-bold transition-all",
                    theme === 'dark' ? "border-slate-800 text-slate-400 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleBulkDelete}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-lg shadow-rose-100 dark:shadow-none transition-all"
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
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  className={cn(
                    "flex-1 py-3 border rounded-xl font-bold transition-all",
                    theme === 'dark' ? "border-slate-800 text-slate-400 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleBulkDeleteBooks}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-lg shadow-rose-100 dark:shadow-none transition-all"
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
              <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto">
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
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 dark:shadow-none transition-all"
                >
                  Exit
                </button>
              </div>
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
    </div>
  );
}
