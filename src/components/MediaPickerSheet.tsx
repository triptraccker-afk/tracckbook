import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Image as ImageIcon, X, AlertCircle, RefreshCw, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';

interface MediaPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPhoto: () => void;
  onCaptureCamera: (e: React.ChangeEvent<HTMLInputElement>) => void;
  theme: 'light' | 'dark';
}

export default function MediaPickerSheet({
  isOpen,
  onClose,
  onSelectPhoto,
  onCaptureCamera,
  theme
}: MediaPickerSheetProps) {
  const [showPermissionError, setShowPermissionError] = useState(false);
  const [isCheckingPermission, setIsCheckingPermission] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Reset error state when modal opens
  useEffect(() => {
    if (isOpen) {
      setShowPermissionError(false);
      setIsCheckingPermission(false);
    }
  }, [isOpen]);

  // Request & check camera permission proactively to handle error screens
  const handleCameraTap = async () => {
    setIsCheckingPermission(true);
    setShowPermissionError(false);
    
    try {
      // Prompt user for camera permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: { ideal: 'environment' } } 
      });
      
      // Stop all tracks immediately as we only want to check permission/initialize
      stream.getTracks().forEach(track => track.stop());
      setIsCheckingPermission(false);
      
      // Trigger the environment capture camera file input
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      }
    } catch (err: any) {
      console.warn('[Camera Check] Camera permission denied or not available:', err);
      setIsCheckingPermission(false);
      setShowPermissionError(true);
    }
  };

  const handleRetryPermission = () => {
    handleCameraTap();
  };

  const handleUsePhotosInstead = () => {
    onClose();
    onSelectPhoto();
  };

  return (
    <>
      {/* Hidden system environment/rear camera capture input */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={cameraInputRef}
        onChange={(e) => {
          onCaptureCamera(e);
          onClose();
        }}
        className="hidden"
      />

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[999] flex items-end justify-center">
            {/* Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
            />

            {/* Bottom Sheet Modal Container */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 350 }}
              className={cn(
                "w-full max-w-lg rounded-t-[2.5rem] p-6 pb-10 shadow-[0_-12px_40px_rgba(0,0,0,0.15)] border-t pointer-events-auto relative",
                theme === 'dark'
                  ? "bg-zinc-950/95 border-zinc-900 text-white"
                  : "bg-white/95 border-slate-200 text-slate-800"
              )}
            >
              {/* Drag Accent Indicator Handle */}
              <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none">
                <div className={cn(
                  "w-12 h-1 rounded-full",
                  theme === 'dark' ? "bg-zinc-800" : "bg-slate-300"
                )} />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between mb-6 mt-1">
                <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
                  <span>Add Document</span>
                </h3>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-900 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <AnimatePresence mode="wait">
                {/* 1. CAMERA ACCESS DENIED UI */}
                {showPermissionError ? (
                  <motion.div
                    key="permission-denied"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="space-y-5 py-2"
                  >
                    <div className="flex items-start gap-3.5 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500">
                      <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-extrabold text-[15px]">Permission Required</p>
                        <p className={cn(
                          "text-xs leading-relaxed font-semibold",
                          theme === 'dark' ? "text-slate-300" : "text-slate-600"
                        )}>
                          Camera access is required to capture receipts. Please allow camera access in your browser settings.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={handleUsePhotosInstead}
                        className={cn(
                          "flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-colors cursor-pointer border",
                          theme === 'dark'
                            ? "bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-white"
                            : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
                        )}
                      >
                        Use Photos Instead
                      </button>
                      <button
                        onClick={handleRetryPermission}
                        className="flex-1 py-3 px-4 rounded-xl text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-500/15"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry Access
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  /* 2. CHOOSE ACTION SELECTION UI */
                  <motion.div
                    key="action-selection"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    {/* Camera Action Option */}
                    <button
                      onClick={handleCameraTap}
                      disabled={isCheckingPermission}
                      className={cn(
                        "w-full p-4 rounded-2xl border flex items-center justify-between text-left transition-all active:scale-[0.99] cursor-pointer group hover:border-indigo-500",
                        theme === 'dark'
                          ? "bg-zinc-900/60 border-zinc-800 hover:bg-zinc-900 text-white"
                          : "bg-slate-50 border-slate-200/80 hover:bg-white text-slate-800 shadow-sm"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500 group-hover:scale-110 transition-transform">
                          {isCheckingPermission ? (
                            <RefreshCw className="w-6 h-6 animate-spin" />
                          ) : (
                            <Camera className="w-6 h-6" />
                          )}
                        </div>
                        <div>
                          <p className="font-extrabold text-[15px] tracking-tight">Camera</p>
                          <p className={cn(
                            "text-xs leading-none mt-1",
                            theme === 'dark' ? "text-slate-400" : "text-slate-500"
                          )}>Take a photo of your receipt or bill instantly</p>
                        </div>
                      </div>
                      <ChevronUp className="w-5 h-5 text-slate-400 rotate-90" />
                    </button>

                    {/* Photos Action Option */}
                    <button
                      onClick={handleUsePhotosInstead}
                      className={cn(
                        "w-full p-4 rounded-2xl border flex items-center justify-between text-left transition-all active:scale-[0.99] cursor-pointer group hover:border-indigo-500",
                        theme === 'dark'
                          ? "bg-zinc-900/60 border-zinc-800 hover:bg-zinc-900 text-white"
                          : "bg-slate-50 border-slate-200/80 hover:bg-white text-slate-800 shadow-sm"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500 group-hover:scale-110 transition-transform">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-extrabold text-[15px] tracking-tight">Photos</p>
                          <p className={cn(
                            "text-xs leading-none mt-1",
                            theme === 'dark' ? "text-slate-400" : "text-slate-500"
                          )}>Browse existing receipts from photo gallery</p>
                        </div>
                      </div>
                      <ChevronUp className="w-5 h-5 text-slate-400 rotate-90" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
