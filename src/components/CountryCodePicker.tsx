import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { cn } from '../lib/utils';

export interface Country {
  name: string;
  code: string;
  dialCode: string;
  flag: string;
  format: string;
}

export const COUNTRIES: Country[] = [
  { name: 'India', code: 'IN', dialCode: '+91', flag: '🇮🇳', format: '98765 43210' },
  { name: 'United States', code: 'US', dialCode: '+1', flag: '🇺🇸', format: '555 123 4567' },
  { name: 'United Arab Emirates', code: 'AE', dialCode: '+971', flag: '🇦🇪', format: '50 123 4567' },
  { name: 'United Kingdom', code: 'GB', dialCode: '+44', flag: '🇬🇧', format: '7123 456789' },
  { name: 'Canada', code: 'CA', dialCode: '+1', flag: '🇨🇦', format: '555 123 4567' },
  { name: 'Australia', code: 'AU', dialCode: '+61', flag: '🇦🇺', format: '412 345 678' },
  { name: 'Singapore', code: 'SG', dialCode: '+65', flag: '🇸🇬', format: '8123 4567' },
  { name: 'Germany', code: 'DE', dialCode: '+49', flag: '🇩🇪', format: '151 23456789' },
  { name: 'Saudi Arabia', code: 'SA', dialCode: '+966', flag: '🇸🇦', format: '50 123 4567' },
];

export const formatPhoneNumber = (val: string, country: Country) => {
  const digits = val.replace(/\D/g, '');
  if (country.code === 'IN') {
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)} ${digits.slice(5, 10)}`;
  } else if (country.code === 'US' || country.code === 'CA') {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
  } else if (country.code === 'AE') {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
    return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 9)}`;
  } else if (country.code === 'GB') {
    if (digits.length <= 4) return digits;
    return `${digits.slice(0, 4)} ${digits.slice(4, 10)}`;
  } else if (country.code === 'AU') {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3, 6)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
  } else {
    if (digits.length <= 4) return digits;
    if (digits.length <= 8) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
    return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
  }
};

interface CountryCodePickerProps {
  selectedCountry: Country;
  onSelectCountry: (country: Country) => void;
  phoneNumber: string;
  onPhoneNumberChange: (val: string) => void;
  theme: 'light' | 'dark';
  isDesktop?: boolean;
  disabled?: boolean;
}

export const CountryCodePicker: React.FC<CountryCodePickerProps> = ({
  selectedCountry,
  onSelectCountry,
  phoneNumber,
  onPhoneNumberChange,
  theme,
  isDesktop = false,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const filteredCountries = COUNTRIES.filter(
    c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.dialCode.includes(search) ||
      c.code.toLowerCase().includes(search.toLowerCase())
  );

  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const formatted = formatPhoneNumber(rawVal, selectedCountry);
    onPhoneNumberChange(formatted);
  };

  return (
    <div className="relative flex flex-col w-full" ref={dropdownRef}>
      <div
        className={cn(
          "flex items-center w-full border rounded-2xl transition-all focus-within:ring-4 relative overflow-visible",
          theme === 'dark'
            ? "bg-zinc-950/50 border-zinc-800 text-slate-100 focus-within:border-[#3b82f6] focus-within:ring-blue-950/40"
            : "bg-slate-50/50 border-blue-100 text-slate-800 focus-within:border-[#3b82f6] focus-within:ring-blue-100/50",
          disabled && "opacity-75 cursor-not-allowed"
        )}
      >
        {/* Country Select Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center gap-1.5 px-3 sm:px-4 py-3 shrink-0 select-none border-r cursor-pointer",
            theme === 'dark' ? "border-zinc-800 hover:bg-zinc-900/40" : "border-blue-100 hover:bg-slate-100/40",
            disabled && "cursor-not-allowed"
          )}
        >
          <span className="text-base leading-none">{selectedCountry.flag}</span>
          <span className={cn("text-xs font-bold font-mono tracking-tight", isDesktop && "text-[13px]")}>
            {selectedCountry.dialCode}
          </span>
          <ChevronDown size={12} className="text-slate-400 shrink-0" />
        </button>

        {/* Separator Pipe Display */}
        <span className="text-slate-300 dark:text-zinc-800 px-1 font-mono text-xs select-none">|</span>

        {/* Real Phone Input Field */}
        <input
          type="tel"
          required
          disabled={disabled}
          value={phoneNumber}
          onChange={handlePhoneInputChange}
          placeholder={selectedCountry.format}
          className={cn(
            "w-full bg-transparent border-none outline-none font-bold py-3 px-3 placeholder:text-[#94a3b8]/50 tracking-wider text-xs",
            isDesktop && "text-[13px] py-3.5 px-4"
          )}
        />
      </div>

      {/* Floating Country Code Search Popover */}
      {isOpen && !disabled && (
        <div
          className={cn(
            "absolute left-0 right-0 z-[110] mt-13 rounded-2xl shadow-xl border p-2 transition-colors duration-200 max-h-60 overflow-y-auto",
            theme === 'dark' ? "bg-zinc-950 border-zinc-850" : "bg-white border-blue-105 border-slate-200"
          )}
        >
          {/* Search Box */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input
              type="text"
              autoFocus
              placeholder="Search country..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={cn(
                "w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500",
                theme === 'dark' ? "border-zinc-800 bg-zinc-900 text-slate-100" : "border-slate-100 bg-slate-50 text-slate-800"
              )}
            />
          </div>

          {/* List options */}
          <div className="space-y-0.5 overflow-y-auto max-h-40">
            {filteredCountries.length > 0 ? (
              filteredCountries.map(country => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => {
                    onSelectCountry(country);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={cn(
                    "w-full flex items-center justify-between p-2 rounded-xl text-left text-xs font-bold transition-all cursor-pointer",
                    theme === 'dark' ? "hover:bg-zinc-900 text-slate-200" : "hover:bg-slate-50 text-slate-700",
                    selectedCountry.code === country.code && (theme === 'dark' ? "bg-zinc-900 text-blue-400" : "bg-slate-50 text-blue-600")
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{country.flag}</span>
                    <span>{country.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="text-slate-400 text-[11px]">{country.dialCode}</span>
                    {selectedCountry.code === country.code && <Check size={12} className="text-blue-500 shrink-0" />}
                  </div>
                </button>
              ))
            ) : (
              <div className="text-center p-3 text-[10px] font-medium text-slate-400">
                No country matched
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
