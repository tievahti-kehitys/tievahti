import React from 'react';
import { TreePine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useForestMode } from '@/context/ForestModeContext';
import tievahtiLogo from '@/assets/tievahti-logo.svg';

export function ForestModeHeader() {
  const { state, setForestMode } = useForestMode();

  if (!state.isActive) return null;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-card border-b border-border shadow-sm safe-area-pt">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Logo and title */}
        <div className="flex items-center gap-2">
          <img src={tievahtiLogo} alt="Tievahti" className="w-8 h-8" />
          <div className="flex items-center gap-1.5 bg-success/15 text-success px-2 py-1 rounded-md">
            <TreePine className="w-4 h-4" />
            <span className="font-bold text-sm">Metsämoodi</span>
          </div>
        </div>

        {/* Exit button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setForestMode(false)}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <X className="w-5 h-5" />
          <span className="hidden sm:inline">Poistu</span>
        </Button>
      </div>
    </header>
  );
}
