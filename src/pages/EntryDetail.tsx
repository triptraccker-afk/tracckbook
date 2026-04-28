import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Loader2, Calendar, Tag, CreditCard, Receipt, AlertCircle } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';

export default function EntryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEntry() {
      if (!id || !supabase) return;

      try {
        const { data, error } = await supabase
          .from('entries')
          .select('*, attachments(*)')
          .eq('id', id)
          .single();

        if (error) throw error;
        setEntry(data);
      } catch (err: any) {
        console.error('Error fetching entry:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchEntry();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-black">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-black p-4">
        <AlertCircle className="text-red-500 mb-4" size={48} />
        <h1 className="text-xl font-bold mb-2">Entry Not Found</h1>
        <p className="text-slate-500 mb-6 text-center">We couldn't find the entry you're looking for or it may have been deleted.</p>
        <button 
          onClick={() => navigate('/')}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black pb-12">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-black/80 backdrop-blur-lg border-b border-slate-200 dark:border-white/10 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <button 
            onClick={() => navigate('/')}
            className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-bold">Entry Details</h1>
        </div>
      </div>

      <main className="max-w-2xl mx-auto p-4 mt-4">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-sm">
          {/* Amount Section */}
          <div className={cn(
            "p-8 flex flex-col items-center justify-center border-b border-slate-100 dark:border-white/5",
            entry.type === 'in' ? "bg-emerald-50/30 dark:bg-emerald-500/5" : "bg-rose-50/30 dark:bg-rose-500/5"
          )}>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-2">
              {entry.type === 'in' ? 'Cash In' : 'Cash Out'}
            </p>
            <h2 className={cn(
              "text-4xl font-bold",
              entry.type === 'in' ? "text-emerald-600" : "text-rose-600"
            )}>
              {formatCurrency(entry.amount)}
            </h2>
          </div>

          {/* Details Section */}
          <div className="p-6 space-y-6">
            <div>
              <p className="text-sm text-slate-500 mb-1">Description</p>
              <p className="text-lg font-medium leading-relaxed">
                {entry.description || 'No description'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-slate-100 dark:bg-white/5 rounded-lg">
                  <Calendar size={18} className="text-slate-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Date & Time</p>
                  <p className="text-sm font-medium">
                    {new Date(entry.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-slate-100 dark:bg-white/5 rounded-lg">
                  <Tag size={18} className="text-slate-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Category</p>
                  <p className="text-sm font-medium">{entry.category}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-slate-100 dark:bg-white/5 rounded-lg">
                  <CreditCard size={18} className="text-slate-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Payment Mode</p>
                  <p className="text-sm font-medium">{entry.mode}</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="p-2 bg-slate-100 dark:bg-white/5 rounded-lg">
                  <Receipt size={18} className="text-slate-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Attachments</p>
                  <p className="text-sm font-medium">{entry.attachments?.length || 0} Images</p>
                </div>
              </div>
            </div>

            {/* Images Section */}
            {entry.attachments && entry.attachments.length > 0 && (
              <div className="pt-6 border-t border-slate-100 dark:border-white/5">
                <p className="text-sm text-slate-500 mb-4">Bills & Attachments</p>
                <div className="grid grid-cols-1 gap-4">
                  {entry.attachments.map((att: any, idx: number) => (
                    <div key={att.id || idx} className="rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
                      <img 
                        src={att.file_url} 
                        alt={`Attachment ${idx + 1}`} 
                        className="w-full h-auto object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
