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
  Palette,
  ArrowUp,
  ArrowUpDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { cn, formatCurrency, vibrate } from '../lib/utils';
import { parseReceipt, parseMultipleReceipts, getApiKey } from '../services/gemini';
import { supabase } from '../lib/supabase';
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
  imageLayout?: 'split' | 'merge';
  isAi?: boolean;
}

interface Cashbook {
  id: string;
  name: string;
  transactions: Transaction[];
  createdAt: Date;
}

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
  const [aiMode, setAiMode] = useState<'split' | 'merge'>('split');
  const [error, setError] = useState<string | null>(null);
  const [transactionSearchQuery, setTransactionSearchQuery] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'all' | 'in' | 'out'>('all');
  const [transactionDurationFilter, setTransactionDurationFilter] = useState('All');
  const [transactionCategoryFilter, setTransactionCategoryFilter] = useState('All');
  const [sortColumn, setSortColumn] = useState<'date' | 'category' | 'amount'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showReportsMenu, setShowReportsMenu] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [deleteTimer, setDeleteTimer] = useState(0);
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

  // Delete Timer Effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (deleteTimer > 0) {
      interval = setInterval(() => {
        setDeleteTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [deleteTimer]);

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
      if (isInput) return;

      const key = e.key.toUpperCase();
      const now = Date.now();

      // Handle Escape key to close forms/modals
      if (e.key === 'Escape') {
        setShowForm(null);
        setIsCreatingBook(false);
        setIsEditingName(false);
        setIsHelpOpen(false);
        setShowAiWarning(false);
        setShowReportsMenu(false);
        setShowBulkDeleteConfirm(false);
        setShowExitConfirm(false);
        setEditingTransaction(null);
        setPreviewImages(null);
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
          setShowAiWarning(true);
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
  const [reportLoading, setReportLoading] = useState<{ type: 'excel' | 'pdf', progress: number } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const abortUploadRef = useRef(false);
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
  const [imageLayout, setImageLayout] = useState<'split' | 'merge'>('split');

  const CATEGORIES = ['Food', 'Travel', 'Advance', 'Shopping', 'Custom'];
  const MODES = ['Card', 'UPI', 'Cash', 'Custom'];
  const DURATIONS = ['All', 'Today', 'Yesterday', 'Last Week'];

  // Set user name from session
  useEffect(() => {
    if (session?.user?.user_metadata?.full_name) {
      setUserName(session.user.user_metadata.full_name);
    }
  }, [session]);

  // Fetch data from Supabase
  useEffect(() => {
    const fetchData = async () => {
      // Safety timeout to ensure loading state clears even if query hangs
      const fetchTimeout = setTimeout(() => {
        console.warn('Data fetching taking too long, clearing loading state...');
        setIsLoading(false);
      }, 8000);

      if (!session) {
        clearTimeout(fetchTimeout);
        setBooks([]);
        setIsLoading(false);
        return;
      }

      if (!supabase) {
        clearTimeout(fetchTimeout);
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
        clearTimeout(fetchTimeout);

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
                imageLayout: t.image_layout || 'split',
                isAi: aiImgs.length > 0
              };
            }).sort((a: any, b: any) => b.date.getTime() - a.date.getTime()),
            createdAt: cb.created_at ? new Date(cb.created_at) : (cb.createdAt ? new Date(cb.createdAt) : new Date())
          })));
        }
      } catch (error: any) {
        clearTimeout(fetchTimeout);
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

  const handleUpdateProfile = async () => {
    if (!session || !supabase) {
      setIsEditingName(false);
      return;
    }

    setIsSubmitting(true);
    setSubmittingMessage('Updating profile...');
    
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: userName }
      });
      
      if (error) throw error;
      
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setError(err.message || 'Failed to update profile');
    } finally {
      setIsSubmitting(false);
      setIsEditingName(false);
    }
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
    setDeleteTimer(5);
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
        images: selectedImages.length > 0 ? selectedImages : editingTransaction.images,
        imageLayout: imageLayout
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
            const payload: any = {
                amount: amountNum,
                type: showForm,
                description: description,
                category: finalCategory || 'General',
                mode: finalMode,
                date: safeToISOString(dateObj)
            };

            try {
              // Try with image_layout first
              const { error } = await supabase
                .from('entries')
                .update({ ...payload, image_layout: imageLayout })
                .eq('id', editingTransaction.id)
                .eq('user_id', session.user.id);
              
              if (error) {
                // Check if it's a column missing error
                if (error.code === '42703' || error.message?.includes('column "image_layout" does not exist')) {
                  console.warn('Supabase: column "image_layout" missing, retrying without it...');
                  const { error: retryError } = await supabase
                    .from('entries')
                    .update(payload)
                    .eq('id', editingTransaction.id)
                    .eq('user_id', session.user.id);
                  if (retryError) throw retryError;
                } else {
                  throw error;
                }
              }
            } catch (err) {
              console.error('Detailed Supabase Update Error:', err);
              throw err;
            }

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
          } catch (error: any) {
            console.error('Detailed Supabase Update Error:', error);
            const msg = error.message || 'Unknown error';
            setError(`Failed to sync update: ${msg}. If you added decimals, please ensure your Supabase "amount" column supports them.`);
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
        images: selectedImages.length > 0 ? selectedImages : undefined,
        imageLayout: imageLayout
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
            const payload: any = {
                id: newTransaction.id,
                cashbook_id: activeBookId,
                user_id: session.user.id,
                amount: newTransaction.amount,
                type: newTransaction.type,
                description: newTransaction.description,
                category: newTransaction.category,
                mode: newTransaction.mode,
                date: safeToISOString(newTransaction.date)
            };

            try {
              // Try with image_layout first
              const { error } = await supabase
                .from('entries')
                .insert([{ ...payload, image_layout: imageLayout }]);
              
              if (error) {
                if (error.code === '42703' || error.message?.includes('column "image_layout" does not exist')) {
                  console.warn('Supabase: column "image_layout" missing, retrying without it...');
                  const { error: retryError } = await supabase
                    .from('entries')
                    .insert([payload]);
                  if (retryError) throw retryError;
                } else {
                  throw error;
                }
              }
            } catch (err) {
              console.error('Detailed Supabase Insert Error:', err);
              throw err;
            }

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
          } catch (error: any) {
            console.error('Error creating entry in Supabase:', error);
            setError(`Failed to sync transaction: ${error.message || 'Unknown error'}. Please ensure your Supabase "amount" column supports decimals.`);
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
    vibrate(50);
    setTransactionToDelete(id);
    setDeleteTimer(5);
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

  const exportToExcel = async () => {
    if (!activeBook) return;
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
      Date: t.date.toLocaleDateString('en-IN'),
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
            const layout = t.imageLayout || 'split';
            
            if (layout === 'merge') {
              // Merge layout: 2 images per page side-by-side
              for (let i = 0; i < t.images.length; i += 2) {
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
                doc.text(`Transaction: ${t.description} (${t.amount}) - ${t.date.toLocaleDateString('en-IN')}`, 10, 10);

                // First image in pair
                try {
                  const img1 = t.images[i];
                  let format1 = 'JPEG';
                  if (img1.startsWith('data:image/png')) format1 = 'PNG';
                  else if (img1.startsWith('data:image/webp')) format1 = 'WEBP';
                  const base64Data1 = img1.includes('base64,') ? img1.split('base64,')[1] : img1;
                  doc.addImage(base64Data1, format1 as any, margin, y, imgWidth, imgHeight, undefined, 'FAST');
                } catch (e) { console.error(e); }
                processedImages++;

                // Second image in pair (if exists)
                if (i + 1 < t.images.length) {
                  try {
                    const img2 = t.images[i + 1];
                    let format2 = 'JPEG';
                    if (img2.startsWith('data:image/png')) format2 = 'PNG';
                    else if (img2.startsWith('data:image/webp')) format2 = 'WEBP';
                    const base64Data2 = img2.includes('base64,') ? img2.split('base64,')[1] : img2;
                    doc.addImage(base64Data2, format2 as any, margin + imgWidth + gap, y, imgWidth, imgHeight, undefined, 'FAST');
                  } catch (e) { console.error(e); }
                  processedImages++;
                }

                const imageProgress = 40 + (processedImages / totalImages) * 50;
                setReportLoading({ type: 'pdf', progress: Math.round(imageProgress) });
              }
            } else {
              // Split layout: 1 image per page (current behavior)
              for (const img of t.images) {
                try {
                  if (!isFirstPage) doc.addPage();
                  isFirstPage = false;
                  
                  let format = 'JPEG';
                  if (img.startsWith('data:image/png')) format = 'PNG';
                  else if (img.startsWith('data:image/webp')) format = 'WEBP';
                  const base64Data = img.includes('base64,') ? img.split('base64,')[1] : img;
                  
                  const pageWidth = doc.internal.pageSize.getWidth();
                  const pageHeight = doc.internal.pageSize.getHeight();
                  const imgWidth = pageWidth * 0.9;
                  const imgHeight = pageHeight * 0.9;
                  const x = (pageWidth - imgWidth) / 2;
                  const y = (pageHeight - imgHeight) / 2;

                  // Add transaction header
                  doc.setFontSize(10);
                  doc.setTextColor(80);
                  doc.text(`Transaction: ${t.description} (${t.amount}) - ${t.date.toLocaleDateString('en-IN')}`, 10, 10);

                  doc.addImage(base64Data, format as any, x, y, imgWidth, imgHeight, undefined, 'FAST');
                } catch (e) { console.error(e); }
                
                processedImages++;
                const imageProgress = 40 + (processedImages / totalImages) * 50;
                setReportLoading({ type: 'pdf', progress: Math.round(imageProgress) });
              }
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
      
      // Add page numbers and footer
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Page ${i} of ${totalPages}`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 5, { align: 'center' });
        doc.text(`Report: ${activeBook.name}`, 10, doc.internal.pageSize.getHeight() - 5);
        doc.text(new Date().toLocaleDateString('en-IN'), doc.internal.pageSize.getWidth() - 30, doc.internal.pageSize.getHeight() - 5);
      }

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
    abortUploadRef.current = false;
    setUploadingMessage('Detecting bills...');
    try {
      if (aiMode === 'merge' && filesToProcess.length > 1) {
        setUploadingMessage('Merging and detecting bills...');
        const imagesData: { base64: string, mimeType: string, raw: string }[] = [];
        
        for (const file of filesToProcess) {
          if (abortUploadRef.current) return;
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          imagesData.push({
            base64: base64.split(',')[1],
            mimeType: file.type,
            raw: base64
          });
        }

        if (abortUploadRef.current) return;
        const result = await parseMultipleReceipts(imagesData.map(img => ({ base64: img.base64, mimeType: img.mimeType })));
        
        if (result && !abortUploadRef.current) {
          const newTransaction: Transaction = {
            id: safeUUID(),
            amount: result.amount,
            type: result.type,
            description: result.description,
            category: result.category,
            mode: 'Online',
            date: parseAIDate(result.date),
            images: imagesData.map(img => img.raw),
            isAi: true,
            imageLayout: 'merge'
          };

          // Optimistic update
          setBooks(prev => prev.map(b => 
            b.id === activeBookId 
              ? { ...b, transactions: [newTransaction, ...b.transactions] }
              : b
          ));

          if (supabase && session) {
            try {
              const payload: any = {
                id: newTransaction.id,
                cashbook_id: activeBookId,
                user_id: session.user.id,
                amount: newTransaction.amount,
                type: newTransaction.type,
                description: newTransaction.description,
                category: newTransaction.category,
                mode: newTransaction.mode,
                date: safeToISOString(newTransaction.date)
              };

              // Try with image_layout first
              const { error: entryError } = await supabase.from('entries').insert([{ ...payload, image_layout: 'merge' }]);
              
              if (entryError) {
                if (entryError.code === '42703' || entryError.message?.includes('column "image_layout" does not exist')) {
                  const { error: retryError } = await supabase.from('entries').insert([payload]);
                  if (retryError) throw retryError;
                } else {
                  throw entryError;
                }
              }

              const aiAttachmentInserts = imagesData.map(img => ({
                entry_id: newTransaction.id,
                user_id: session.user.id,
                file_url: img.raw,
                file_name: 'ai_merged_bill',
                file_type: 'image'
              }));
              const { error: attachError } = await supabase.from('ai_attachments').insert(aiAttachmentInserts);
              if (attachError) throw attachError;
            } catch (error: any) {
              console.error('Error syncing merged AI entry (detailed):', error);
              const msg = error.message || 'Unknown error';
              setError(`Sync Error: ${msg}. Please ensure your Supabase "amount" column supports decimals.`);
            }
          }
        }
      } else {
        let completed = 0;
        const total = filesToProcess.length;
        for (const file of filesToProcess) {
          if (abortUploadRef.current) return;
          setUploadingMessage(`Detecting bill ${completed}/${total}...`);
          await new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('File reading failed'));
            reader.onloadend = async () => {
              try {
                if (abortUploadRef.current) {
                  resolve();
                  return;
                }
                const base64String = (reader.result as string).split(',')[1];
                const result = await parseReceipt(base64String, file.type);
                
                if (result && !abortUploadRef.current) {
                  completed++;
                  setUploadingMessage(`Detected ${result.category} (${completed}/${total})! Syncing...`);
                  
                  const newTransaction: Transaction = {
                    id: safeUUID(),
                    amount: result.amount,
                    type: result.type,
                    description: result.description,
                    category: result.category,
                    mode: 'Online',
                    date: parseAIDate(result.date),
                    images: [reader.result as string],
                    isAi: true,
                    imageLayout: 'split'
                  };

                  // Optimistic update
                  setBooks(prev => prev.map(b => 
                    b.id === activeBookId 
                      ? { ...b, transactions: [newTransaction, ...b.transactions] }
                      : b
                  ));

                  if (supabase && session) {
                    try {
                      const payload: any = {
                        id: newTransaction.id,
                        cashbook_id: activeBookId,
                        user_id: session.user.id,
                        amount: newTransaction.amount,
                        type: newTransaction.type,
                        description: newTransaction.description,
                        category: newTransaction.category,
                        mode: newTransaction.mode,
                        date: safeToISOString(newTransaction.date)
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

                      if (newTransaction.images && newTransaction.images.length > 0) {
                        const aiAttachmentInserts = newTransaction.images.map(url => ({
                          entry_id: newTransaction.id,
                          user_id: session.user.id,
                          file_url: url,
                          file_name: 'ai_detected_bill',
                          file_type: 'image'
                        }));
                        const { error: attachError } = await supabase.from('ai_attachments').insert(aiAttachmentInserts);
                        if (attachError) throw attachError;
                      }
                    } catch (error: any) {
                      console.error('Error syncing AI entry:', error);
                      const msg = error.message || 'Unknown error';
                      setError(`AI Sync Error: ${msg}. Your Supabase "amount" column likely needs to be changed to DECIMAL.`);
                      // Rollback local state on failure
                      setBooks(prev => prev.map(b => 
                        b.id === activeBookId 
                          ? { ...b, transactions: b.transactions.filter(t => t.id !== newTransaction.id) }
                          : b
                      ));
                    }
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
                onClick={() => { vibrate(); setIsSearchExpanded(true); }}
                className="sm:hidden p-2 text-slate-400 hover:text-indigo-600 transition-colors"
              >
                <Search size={20} />
              </button>

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
                      onClick={() => { vibrate(); setShowBulkDeleteConfirm(true); setDeleteTimer(5); }}
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
                          "group/shortcut relative flex-1 sm:flex-none py-2 sm:py-2.5 px-4 sm:px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm sm:text-base",
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
                  <button
                    onClick={() => setIsCreatingBook(true)}
                    className={cn(
                      "py-2 sm:py-2.5 px-5 sm:px-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all flex items-center gap-2 active:scale-95 text-xs sm:text-sm",
                      theme === 'dark' ? "shadow-none" : "shadow-xl shadow-indigo-200"
                    )}
                  >
                    <Plus size={16} />
                    Create a Book
                  </button>
                </div>
              ) : (
                <div className={cn(
                  "grid gap-2 sm:gap-6",
                  viewMode === 'grid' 
                    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" 
                    : "grid-cols-1"
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
              className="w-full space-y-4 sm:space-y-6 pb-24 sm:pb-0"
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
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 border font-semibold rounded-xl transition-all",
                      theme === 'dark' 
                        ? "border-slate-800 text-slate-200 hover:bg-slate-800" 
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
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
                      "text-lg"
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
                        "text-xs"
                      )}>{formatCurrency(totals.in)}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className={cn(
                        "text-sm font-bold transition-colors duration-300",
                        theme === 'dark' ? "text-slate-400" : "text-slate-500"
                      )}>Total Out (-)</p>
                      <p className={cn(
                        "font-black text-rose-600",
                        "text-xs"
                      )}>{formatCurrency(totals.out)}</p>
                    </div>
                  </div>
                </div>

                {/* View Reports Dropdown for Mobile */}
                <div className="border-t border-slate-50 dark:border-slate-800">
                  <button 
                    onClick={() => setShowReportsMenu(!showReportsMenu)}
                    className={cn(
                      "w-full py-3 flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer",
                      theme === 'dark' ? "text-indigo-400 hover:bg-slate-800" : "text-indigo-600 hover:bg-slate-50"
                    )}
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
                        className="overflow-hidden bg-white dark:bg-slate-800/50"
                      >
                        <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                          <button 
                            onClick={exportToExcel}
                            className="flex items-center justify-center gap-2 py-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                          >
                            <Download size={16} className="text-emerald-600" />
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-widest transition-colors duration-300",
                              theme === 'dark' ? "text-slate-300" : "text-black"
                            )}>Excel</span>
                          </button>
                          <button 
                            onClick={exportToPDF}
                            className="flex items-center justify-center gap-2 py-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
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
                  onClick={() => { vibrate(); setShowForm('in'); setTransactionDate(safeToDateTimeLocal(new Date())); }}
                  className={cn(
                    "group/shortcut relative flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all active:scale-95",
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
                    "group/shortcut relative flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all active:scale-95",
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
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => { vibrate(); setShowAiWarning(true); }}
                    disabled={isUploading}
                    className={cn(
                      "group/shortcut relative flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all active:scale-95",
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
                      "hidden lg:flex items-center gap-2 px-4 py-2.5 sm:py-3 rounded-xl font-bold transition-all text-[10px] sm:text-sm whitespace-nowrap cursor-pointer",
                      selectedTransactions.size === filteredTransactions.length && filteredTransactions.length > 0
                        ? (theme === 'dark' ? "bg-indigo-600 text-white shadow-none" : "bg-indigo-600 text-white shadow-lg shadow-indigo-100")
                        : theme === 'dark' ? "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {selectedTransactions.size === filteredTransactions.length && filteredTransactions.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                    {selectedTransactions.size === filteredTransactions.length && filteredTransactions.length > 0 ? 'Deselect All' : 'Select All'}
                  </button>
                  {selectedTransactions.size > 0 && (
                    <button
                      onClick={() => { setShowBulkTransactionDeleteConfirm(true); setDeleteTimer(5); }}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2.5 sm:py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all whitespace-nowrap text-xs sm:text-sm",
                        theme === 'dark' ? "shadow-none" : "shadow-lg shadow-rose-100"
                      )}
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
                                  "rounded-xl border shadow-sm p-2.5 relative transition-all active:scale-[0.98] select-none overflow-hidden transition-colors duration-300 cursor-pointer",
                                  selectedTransactions.has(t.id) 
                                    ? (theme === 'dark' ? "border-indigo-500 ring-1 ring-indigo-500 bg-indigo-950/30" : "border-indigo-600 ring-1 ring-indigo-600 bg-indigo-50/30 shadow-lg") 
                                    : (theme === 'dark' ? "bg-zinc-950 border-zinc-900" : "bg-white border-slate-100")
                                )}
                              >
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

                                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                                  <p className={cn(
                                    "text-[11px] font-bold line-clamp-1 transition-colors duration-300",
                                    theme === 'dark' ? "text-slate-100" : "text-black"
                                  )}>
                                    {t.description || 'No details provided'}
                                  </p>
                                   {t.isAi && (
                                    <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[8px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shadow-sm">
                                      <Sparkles size={8} />
                                      AI
                                    </div>
                                  )}
                                  {t.imageLayout && (
                                    <div className={cn(
                                      "text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-sm uppercase",
                                      t.imageLayout === 'merge' 
                                        ? (theme === 'dark' ? "bg-indigo-900/30 text-indigo-400" : "bg-indigo-50 text-indigo-600")
                                        : (theme === 'dark' ? "bg-slate-800 text-slate-400" : "bg-slate-50 text-slate-600")
                                    )}>
                                      {t.imageLayout}
                                    </div>
                                  )}
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
                                  <td className="px-3 sm:px-6 py-4">
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
                                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                                    <p className={cn(
                                      "font-bold text-sm",
                                      theme === 'dark' ? "text-slate-200" : "text-slate-800"
                                    )}>
                                      {t.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </p>
                                    <p className={cn(
                                      "text-[10px] font-bold uppercase tracking-tight",
                                      theme === 'dark' ? "text-slate-400" : "text-slate-500"
                                    )}>
                                      {t.date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
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
                                            ? (theme === 'dark' ? "bg-indigo-900/40 text-indigo-400 border-indigo-800" : "bg-indigo-50 text-indigo-600 border-indigo-200")
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
                                    {t.images && t.images.length > 0 ? (
                                      <button 
                                        onClick={() => {
                                          setPreviewImages(t.images!);
                                          setPreviewIndex(0);
                                          setPreviewRotation(0);
                                          setPreviewZoom(1);
                                        }}
                                        className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors group/bill cursor-pointer"
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
                                        onClick={() => handleEditTransaction(t)}
                                        className={cn(
                                          "p-1.5 text-slate-400 rounded-lg transition-all cursor-pointer",
                                          theme === 'dark' ? "hover:text-indigo-400 hover:bg-indigo-900/20" : "hover:text-indigo-600 hover:bg-indigo-50"
                                        )}
                                      >
                                        <Pencil size={16} />
                                      </button>
                                      <button 
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
                  onClick={() => { vibrate(); setShowAiWarning(true); }}
                  disabled={isUploading}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black transition-all active:scale-95",
                    theme === 'dark' 
                      ? "bg-indigo-900/20 text-indigo-400 shadow-none" 
                      : "bg-white border border-indigo-200 text-indigo-700 shadow-sm shadow-indigo-100/20"
                  )}
                >
                  {isUploading ? <Loader2 size={20} className="animate-spin" /> : <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ repeat: Infinity, duration: 2 }}><Upload size={20} /></motion.div>}
                  AI UPLOAD
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => { vibrate(); setShowForm('in'); setTransactionDate(safeToDateTimeLocal(new Date())); }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black transition-all active:scale-95",
                      theme === 'dark' 
                        ? "bg-emerald-900/20 text-emerald-400 shadow-none" 
                        : "bg-white border border-emerald-200 text-emerald-700 shadow-sm shadow-emerald-100/20"
                    )}
                  >
                    <Plus size={20} />
                    CASH IN
                  </button>
                  <button
                    onClick={() => { vibrate(); setShowForm('out'); setTransactionDate(safeToDateTimeLocal(new Date())); }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black transition-all active:scale-95",
                      theme === 'dark' 
                        ? "bg-rose-900/20 text-rose-400 shadow-none" 
                        : "bg-white border border-rose-200 text-rose-700 shadow-sm shadow-rose-100/20"
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
                  onClick={() => { setDeleteConfirmId(null); setDeleteTimer(0); }}
                  className="flex-1 py-3 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteBook}
                  disabled={deleteTimer > 0}
                  className={cn(
                    "flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                    theme === 'dark' ? "shadow-none" : "shadow-lg shadow-rose-100"
                  )}
                >
                  {deleteTimer > 0 ? `Delete (${deleteTimer}s)` : 'Delete'}
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
                  onClick={() => { setTransactionToDelete(null); setDeleteTimer(0); }}
                  className="flex-1 py-3 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteTransaction}
                  disabled={deleteTimer > 0}
                  className={cn(
                    "flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                    theme === 'dark' ? "shadow-none" : "shadow-lg shadow-rose-100"
                  )}
                >
                  {deleteTimer > 0 ? `Delete (${deleteTimer}s)` : 'Delete'}
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
                  onClick={handleUpdateProfile}
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
                <div className="flex flex-col gap-4">
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
                        step="any"
                        min="0"
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
                        onClick={() => setImageLayout('merge')}
                        className={cn(
                          "flex-1 py-2 rounded-lg font-bold transition-all text-[10px] flex items-center justify-center gap-2",
                          imageLayout === 'merge' 
                            ? (theme === 'dark' ? "bg-slate-700 text-indigo-400 shadow-sm" : "bg-white text-indigo-600 shadow-sm")
                            : (theme === 'dark' ? "text-slate-400 hover:bg-slate-700/50" : "text-slate-500 hover:bg-slate-200/50")
                        )}
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
                                    <img src={img} alt="preview" className="w-full h-full object-cover" />
                                    <div className="absolute bottom-1 right-1 bg-black/50 text-[6px] text-white px-1 rounded">P.{Math.floor(i/2) + 1}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            {selectedImages.map((img, i) => (
                              <div key={i} className="relative group w-20 h-20 sm:w-24 sm:h-24">
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
                      className="flex-1 py-3 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold text-white transition-all active:scale-95 text-sm",
                        showForm === 'in' 
                          ? (theme === 'dark' ? "bg-emerald-600 hover:bg-emerald-700 shadow-none" : "bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100")
                          : (theme === 'dark' ? "bg-rose-600 hover:bg-rose-700 shadow-none" : "bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-100")
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
            <div className="text-center space-y-8 px-6 w-full max-w-sm">
              <div className="relative flex items-center justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full"
                />
              </div>
              <div className="space-y-3">
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
                <p className="text-indigo-100/80 text-sm">
                  AI is reading your receipt and extracting details
                </p>
              </div>

              <div className="pt-4">
                <button 
                  onClick={() => {
                    abortUploadRef.current = true;
                    setIsUploading(false);
                    setUploadingMessage('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="px-8 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl font-bold flex items-center justify-center gap-2 mx-auto transition-all active:scale-95"
                >
                  <ChevronLeft size={18} />
                  Back to Dashboard
                </button>
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
                      previewIndex === i 
                        ? (theme === 'dark' ? "border-indigo-500 scale-110 shadow-none" : "border-indigo-500 scale-110 shadow-lg shadow-indigo-500/20") 
                        : "border-transparent opacity-50 hover:opacity-100"
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
                  onClick={() => { setShowBulkTransactionDeleteConfirm(false); setDeleteTimer(0); }}
                  className={cn(
                    "flex-1 py-3 border rounded-xl font-bold transition-all",
                    theme === 'dark' ? "border-slate-800 text-slate-400 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleBulkDelete}
                  disabled={deleteTimer > 0}
                  className={cn(
                    "flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-lg shadow-rose-100 dark:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {deleteTimer > 0 ? `Delete (${deleteTimer}s)` : 'Delete'}
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
                  onClick={() => { setShowBulkDeleteConfirm(false); setDeleteTimer(0); }}
                  className={cn(
                    "flex-1 py-3 border rounded-xl font-bold transition-all",
                    theme === 'dark' ? "border-slate-800 text-slate-400 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleBulkDeleteBooks}
                  disabled={deleteTimer > 0}
                  className={cn(
                    "flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-lg shadow-rose-100 dark:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {deleteTimer > 0 ? `Delete (${deleteTimer}s)` : 'Delete'}
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
