import React, { useState, useRef, useEffect } from 'react';
import { Layers, Map, Mountain, Image, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ForestModeLayerPickerProps {
  basemap: 'peruskartta' | 'maastokartta' | 'ortokuva';
  onBasemapChange: (basemap: 'peruskartta' | 'maastokartta' | 'ortokuva') => void;
}

const basemapOptions = [
  { id: 'peruskartta' as const, icon: Map, label: 'Peruskartta' },
  { id: 'maastokartta' as const, icon: Mountain, label: 'Maastokartta' },
  { id: 'ortokuva' as const, icon: Image, label: 'Ilmakuva' },
];

export function ForestModeLayerPicker({ basemap, onBasemapChange }: ForestModeLayerPickerProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click (but not when clicking the toggle button itself)
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      // Ignore clicks on the toggle button - let onClick handle that
      if (buttonRef.current?.contains(e.target as Node)) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <div className="absolute top-4 left-4 z-10">
      <Button
        ref={buttonRef}
        variant="secondary"
        size="icon"
        className="shadow-lg w-11 h-11"
        onClick={() => setOpen(prev => !prev)}
      >
        {open ? <X className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
      </Button>

      {open && (
        <div ref={panelRef} className="absolute top-14 left-0 bg-card rounded-lg shadow-lg border border-border p-2 min-w-[170px]">
          <div className="px-2 py-1 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
            Taustakartta
          </div>
          {basemapOptions.map(option => (
            <button
              key={option.id}
              onClick={() => {
                onBasemapChange(option.id);
                setOpen(false);
              }}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-3 rounded-md text-sm font-medium',
                basemap === option.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-foreground',
              )}
            >
              <option.icon className="w-5 h-5" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
