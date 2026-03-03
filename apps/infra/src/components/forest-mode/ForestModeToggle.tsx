import React from 'react';
import { TreePine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useForestMode } from '@/context/ForestModeContext';
import { useRole } from '@/context/RoleContext';
import { cn } from '@/lib/utils';

export function ForestModeToggle() {
  const { state, toggleForestMode } = useForestMode();
  const { canEdit } = useRole();

  // Watch-only users cannot access forest mode
  if (!canEdit()) return null;

  return (
    <Button
      variant={state.isActive ? 'success' : 'outline'}
      size="sm"
      onClick={toggleForestMode}
      className={cn(
        'gap-2 font-bold',
        state.isActive && 'animate-pulse'
      )}
    >
      {state.isActive ? (
        <>
          <X className="w-4 h-4" />
          <span className="hidden sm:inline">Poistu Metsämoodista</span>
          <span className="sm:hidden">Poistu</span>
        </>
      ) : (
        <>
          <TreePine className="w-4 h-4" />
          <span className="hidden sm:inline">Metsämoodi</span>
          <span className="sm:hidden">🌲</span>
        </>
      )}
    </Button>
  );
}
