import React from 'react';
import { MapPin, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useForestMode } from '@/context/ForestModeContext';

/**
 * BROWSE-phase bottom toolbar: shows two large buttons
 * to enter ADD_LOCAL_POINT or ADD_INTERVAL_LINE.
 */
export function ForestModeToolbar() {
  const { enterAddPoint, enterAddInterval } = useForestMode();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t-2 border-border shadow-2xl safe-area-pb">
      <div className="flex gap-2 px-2 py-3">
        <Button
          variant="outline"
          size="lg"
          onClick={enterAddPoint}
          className="flex-1 min-w-0 h-14 text-sm font-bold rounded-xl gap-2 border-2"
        >
          <MapPin className="w-5 h-5 shrink-0" />
          <span className="truncate">Paikallinen</span>
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => enterAddInterval()}
          className="flex-1 min-w-0 h-14 text-sm font-bold rounded-xl gap-2 border-2"
        >
          <ArrowLeftRight className="w-5 h-5 shrink-0" />
          <span className="truncate">Tievälillinen</span>
        </Button>
      </div>
    </div>
  );
}
