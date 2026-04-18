import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}

export function vibrate(pattern: number | number[] = 50) {
  if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
    // Only vibrate on mobile devices (simple check)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.navigator.vibrate(pattern);
    }
  }
}
