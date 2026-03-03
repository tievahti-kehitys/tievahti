import React, { useState } from 'react';
import { Sidebar, PanelType } from './Sidebar';
import { MapContainer } from '../map/MapContainer';
import { BearingCapacityMapView } from '../bearing-capacity/BearingCapacityMapView';
import { useForestMode } from '@/context/ForestModeContext';
import { ForestModeHeader } from '@/components/forest-mode/ForestModeHeader';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BearingCapacityProvider } from '@/context/BearingCapacityContext';
import { RoadGeoEditorProvider } from '@/context/RoadGeometryEditorContext';

export function AppLayout() {
  const { state } = useForestMode();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [activePanel, setActivePanel] = useState<PanelType>('project');

  // Auto-switch to bearing panel after mass calc completes
  React.useEffect(() => {
    const handler = () => {
      setActivePanel('bearing');
      if (!sidebarOpen) setSidebarOpen(true);
    };
    window.addEventListener('mass-calc-complete', handler);
    return () => window.removeEventListener('mass-calc-complete', handler);
  }, [sidebarOpen]);

  const isBearingMode = activePanel === 'bearing';

  return (
    <RoadGeoEditorProvider>
    <BearingCapacityProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        {/* Hamburger menu */}
        {!state.isActive && !sidebarOpen && (
          <Button
            variant="secondary"
            size="icon"
            className="fixed z-[1001] shadow-lg w-11 h-11 top-4 left-4"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}
        
        <ForestModeHeader />
        
        {isMobile && sidebarOpen && !state.isActive && (
          <div 
            className="fixed inset-0 z-30 bg-black/50" 
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        <div className={cn(
          'transition-all duration-300 z-40 h-full shrink-0',
          state.isActive && 'w-0 min-w-0 overflow-hidden',
          !state.isActive && !sidebarOpen && 'w-0 min-w-0 overflow-hidden',
          isMobile && !state.isActive && sidebarOpen && 'fixed left-0 top-0 h-full',
          !isMobile && !state.isActive && sidebarOpen && 'relative'
        )}>
          <Sidebar
            onClose={() => setSidebarOpen(false)}
            activePanel={activePanel}
            onPanelChange={setActivePanel}
          />
        </div>
        
        <main className={cn(
          'flex-1 relative transition-all duration-300 min-w-0',
          state.isActive && 'pt-14'
        )}>
          {isBearingMode ? <BearingCapacityMapView /> : <MapContainer />}
        </main>
      </div>
    </BearingCapacityProvider>
    </RoadGeoEditorProvider>
  );
}
