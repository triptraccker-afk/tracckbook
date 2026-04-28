import { useState, useEffect, useRef } from 'react';
import { Bell, Check, Clock, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

export interface AppNotification {
  id: string;
  user_id: string;
  message: string;
  type: string;
  entry_id?: string;
  is_read: boolean;
  created_at: string;
}

export function NotificationSystem({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const fetchNotifications = async () => {
    if (!supabase || !userId) return;
    
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setNotifications(data || []);
      setUnreadCount(data?.filter(n => !n.is_read).length || 0);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Set up real-time subscription
    if (supabase && userId) {
      const channel = supabase
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`
          },
          (payload) => {
            console.log('[NotificationSystem] Real-time insertion received:', payload.new);
            setNotifications(prev => [payload.new as AppNotification, ...prev].slice(0, 20));
            setUnreadCount(prev => prev + 1);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [userId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id: string) => {
    if (!supabase) return;
    
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);

      if (error) throw error;
      
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!supabase || userId === '') return;
    setLoading(true);
    
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) throw error;
      
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all as read:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      const deleted = notifications.find(n => n.id === id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (deleted && !deleted.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const clearAllNotifications = async () => {
    if (!supabase || userId === '') return;
    if (!confirm('Are you sure you want to clear all notifications?')) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;
      
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      console.error('Error clearing notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleNotificationClick = (notification: AppNotification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    
    if (notification.entry_id) {
      // Determine what to focus based on the message
      let focusField = '';
      const msg = notification.message.toLowerCase();
      if (msg.includes('image') || msg.includes('receipt')) {
        focusField = 'image';
      } else if (msg.includes('details') || msg.includes('description')) {
        focusField = 'description';
      } else if (msg.includes('category')) {
        focusField = 'category';
      }

      // Navigate to home with query parameters to trigger edit mode
      navigate(`/?editEntryId=${notification.entry_id}${focusField ? `&focusField=${focusField}` : ''}`);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon */}
      <button
        id="notification-bell"
        onClick={() => setIsOpen(!isOpen)}
        className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all duration-200 relative group"
      >
        <Bell 
          size={22} 
          className={cn(
            "transition-colors",
            isOpen ? "text-indigo-600" : "text-slate-600 dark:text-slate-400 group-hover:text-indigo-500"
          )} 
        />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 flex min-w-[18px] h-[18px] items-center justify-center bg-rose-500 text-white text-[10px] font-bold rounded-full border-2 border-white dark:border-zinc-950 px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop for mobile */}
          <div 
            className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-[2px] z-40 sm:hidden" 
            onClick={() => setIsOpen(false)}
          />
          
          <div 
            className="fixed left-1/2 top-[72px] -translate-x-1/2 w-[calc(100%-32px)] max-w-[400px] sm:absolute sm:left-auto sm:right-0 sm:translate-x-0 sm:top-full sm:mt-3 bg-white dark:bg-black rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in duration-200 origin-top sm:origin-top-right ring-1 ring-black/5 dark:ring-white/10"
          >
          {/* Header */}
          <div className="px-4 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-black">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800 dark:text-zinc-100">Notifications</h3>
              {unreadCount > 0 && (
                <span className="bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button 
                  onClick={markAllAsRead}
                  disabled={loading}
                  className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-all disabled:opacity-50 flex items-center gap-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg group"
                >
                  {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={3} className="transition-transform group-active:scale-90" />}
                  Mark read
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-[450px] overflow-y-auto overscroll-contain custom-scrollbar bg-white dark:bg-black">
            {notifications.length > 0 ? (
              <div className="divide-y divide-slate-50 dark:divide-zinc-900">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      "px-4 py-4 flex gap-4 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-zinc-900 group active:scale-[0.98]",
                      !notification.is_read ? "bg-indigo-50/20 dark:bg-indigo-500/[0.05]" : "bg-transparent"
                    )}
                  >
                    <div className={cn(
                      "mt-1 p-2 rounded-xl flex-shrink-0 transition-colors",
                      notification.type === 'alert' 
                        ? "bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400" 
                        : "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                    )}>
                      {notification.type === 'alert' ? <AlertCircle size={16} /> : <Bell size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-[13px] leading-relaxed mb-1.5 break-words",
                        !notification.is_read ? "font-bold text-slate-900 dark:text-zinc-100" : "text-slate-600 dark:text-zinc-400"
                      )}>
                        {notification.message}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-zinc-500 font-medium">
                        <Clock size={10} />
                        {formatTime(notification.created_at)}
                        {!notification.is_read && (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            <span className="text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">New</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Individual Delete Button */}
                    <button
                      onClick={(e) => deleteNotification(e, notification.id)}
                      className="opacity-40 sm:opacity-0 group-hover:opacity-100 p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all self-center active:scale-90"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-20 flex flex-col items-center justify-center text-center px-6 bg-white dark:bg-black">
                <div className="w-16 h-16 bg-slate-50 dark:bg-zinc-900 rounded-2xl flex items-center justify-center mb-4 rotate-12 group">
                  <Bell size={28} className="text-slate-200 dark:text-zinc-800 transition-transform group-hover:-rotate-12" />
                </div>
                <h4 className="font-bold text-slate-800 dark:text-zinc-200 mb-1">No notifications</h4>
                <p className="text-xs text-slate-500 dark:text-zinc-500 max-w-[200px] leading-relaxed">
                  You're all caught up! Updates about your expenses will appear here.
                </p>
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="px-4 py-3 border-t border-slate-100 dark:border-zinc-800 bg-white dark:bg-black">
             <button 
                onClick={() => setIsOpen(false)}
                className="w-full text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors py-2"
              >
                Close Panel
              </button>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
