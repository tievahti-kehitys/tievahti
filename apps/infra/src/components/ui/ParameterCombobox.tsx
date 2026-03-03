import React, { useState, useMemo, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';


interface ParameterComboboxProps {
  options: number[];
  value: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * A combobox that shows dropdown options but also allows typing a custom value.
 */
export function ParameterCombobox({ options, value, onChange, className, disabled }: ParameterComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    if (!open) {
      setInputValue(String(value));
    }
  }, [value, open]);

  // Always show all options – typing sets the value directly but doesn't filter the list
  const filtered = options;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);
    const num = parseFloat(raw.replace(',', '.'));
    if (!isNaN(num)) {
      onChange(num);
    }
    if (!open) setOpen(true);
  };

  const handleSelect = (opt: number) => {
    onChange(opt);
    setInputValue(String(opt));
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setOpen(false);
    }
  };

  return (
    <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-border bg-input px-3 py-1 text-sm transition-colors",
            disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-primary/50",
            className
          )}
          onClick={() => {
            if (disabled) return;
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
        >
          <span className="truncate">{value}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] bg-popover z-[9999]"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="p-2 border-b border-border">
          <Input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="h-8 text-sm"
            placeholder="Kirjoita arvo..."
          />
        </div>
        <div className="max-h-48 overflow-y-auto overscroll-contain p-1">
            {filtered.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-2">Ei tuloksia</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors",
                    opt === value && "bg-accent/50 font-medium"
                  )}
                >
                  {opt}
                </button>
              ))
            )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
