import React, { useState } from 'react';
import {
  Map,
  Mountain,
  Image,
  MousePointer2,
  Pencil,
  Square,
  Route,
  Grid3X3,
  Undo,
  GitBranch,
  Layers,
  X,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DrawingMode } from './MapContainer';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { useRole } from '@/context/RoleContext';

interface MapToolbarProps {
  basemap: 'peruskartta' | 'maastokartta' | 'ortokuva';
  onBasemapChange: (basemap: 'peruskartta' | 'maastokartta' | 'ortokuva') => void;
  drawingMode: DrawingMode;
  onDrawingModeChange: (mode: DrawingMode) => void;
  showCadastre: boolean;
  onCadastreToggle: () => void;
  hasRoad?: boolean;
}

export function MapToolbar({
  basemap,
  onBasemapChange,
  drawingMode,
  onDrawingModeChange,
  showCadastre,
  onCadastreToggle,
  hasRoad = false,
}: MapToolbarProps) {
  const isMobile = useIsMobile();
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [showDesktopLayers, setShowDesktopLayers] = useState(true);
  const { canEdit } = useRole();
  const canEditMap = canEdit();
  
  const basemapOptions = [
    { id: 'peruskartta' as const, icon: Map, label: 'Peruskartta' },
    { id: 'maastokartta' as const, icon: Mountain, label: 'Maastokartta' },
    { id: 'ortokuva' as const, icon: Image, label: 'Ilmakuva' },
  ];

  const PointIcon = ({ className }: { className?: string }) => (
    <div className={cn("w-2.5 h-2.5 rounded-full bg-current", className)} />
  );

  const drawingTools: Array<{
    id: DrawingMode;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    disabled?: boolean;
    tooltip?: string;
  }> = [
    { id: 'none', icon: MousePointer2, label: 'Valitse' },
    { id: 'road-product', icon: GitBranch, label: 'Tuote tiellä', disabled: !hasRoad || !canEditMap, tooltip: !canEditMap ? 'Ei muokkausoikeutta' : hasRoad ? 'Valitse kaksi pistettä tieltä' : 'Piirrä ensin tie' },
    { id: 'point', icon: PointIcon, label: 'Piste', disabled: !canEditMap, tooltip: !canEditMap ? 'Ei muokkausoikeutta' : undefined },
    { id: 'line', icon: Pencil, label: 'Viiva', disabled: !canEditMap, tooltip: !canEditMap ? 'Ei muokkausoikeutta' : undefined },
    { id: 'polygon', icon: Square, label: 'Kategorisointi', disabled: !canEditMap, tooltip: !canEditMap ? 'Ei muokkausoikeutta' : undefined },
    { id: 'area-delete', icon: Trash2, label: 'Aluepoisto', disabled: !canEditMap, tooltip: !canEditMap ? 'Ei muokkausoikeutta' : 'Piirrä alue ja poista toimenpiteet' },
  ];

  // Mobile layout
  if (isMobile) {
    return (
      <>
        {/* Mobile layer picker toggle - top left, accounting for hamburger */}
        <Button
          variant="secondary"
          size="icon"
          className="absolute top-4 left-16 z-10 shadow-lg"
          onClick={() => setShowLayerPicker(!showLayerPicker)}
        >
          <Layers className="w-5 h-5" />
        </Button>

        {/* Mobile layer picker dropdown */}
        {showLayerPicker && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowLayerPicker(false)} />
            <div className="absolute top-16 left-4 z-20 bg-card rounded-lg shadow-lg border border-border p-2 min-w-[180px]">
              <div className="px-2 py-1 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Taustakartta
              </div>
              {basemapOptions.map(option => (
                <button
                  key={option.id}
                  onClick={() => {
                    onBasemapChange(option.id);
                    setShowLayerPicker(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-3 rounded-md text-sm font-medium",
                    basemap === option.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  <option.icon className="w-5 h-5" />
                  <span>{option.label}</span>
                </button>
              ))}
              <div className="border-t border-border my-2" />
              <button
                onClick={() => {
                  onCadastreToggle();
                  setShowLayerPicker(false);
                }}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-3 rounded-md text-sm font-medium",
                  showCadastre
                    ? "bg-success text-white"
                    : "hover:bg-muted text-foreground"
                )}
              >
                <Grid3X3 className="w-5 h-5" />
                <span>Kiinteistöt</span>
              </button>
            </div>
          </>
        )}

        {/* Mobile drawing tools - bottom bar, centered */}
        <div className="absolute left-1/2 -translate-x-1/2 z-10 flex items-center justify-center gap-1 bg-card rounded-2xl shadow-lg border border-border px-3 py-2" style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          {drawingTools.map(tool => {
            const IconComponent = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => !tool.disabled && onDrawingModeChange(tool.id)}
                disabled={tool.disabled}
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-150 shrink-0",
                  tool.disabled && "opacity-40 cursor-not-allowed",
                  (drawingMode === tool.id || (tool.id === 'road' && drawingMode === 'road-edit'))
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground/70 hover:text-foreground"
                )}
                title={tool.tooltip || tool.label}
              >
                <IconComponent className="w-5 h-5" />
              </button>
            );
          })}

          {(drawingMode !== 'none' && drawingMode !== 'road-edit') && (
            <>
              <div className="w-px h-7 bg-border shrink-0 mx-0.5" />
              <button
                onClick={() => onDrawingModeChange('none')}
                className="flex items-center justify-center w-10 h-10 rounded-xl hover:bg-destructive/15 text-foreground/60 hover:text-destructive transition-all duration-150 shrink-0"
                title="Peruuta"
              >
                <X className="w-5 h-5" />
              </button>
            </>
          )}
          {drawingMode === 'road-edit' && (
            <>
              <div className="w-px h-7 bg-border shrink-0 mx-0.5" />
              <button
                onClick={() => onDrawingModeChange('none')}
                className="flex items-center justify-center w-10 h-10 rounded-xl hover:bg-destructive/15 text-foreground/60 hover:text-destructive transition-all duration-150 shrink-0"
                title="Valmis"
              >
                <X className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        {/* Mobile drawing mode indicator */}
        {(drawingMode !== 'none') && (
          <div className="absolute bottom-24 left-4 right-4 z-10 bg-foreground text-background rounded-lg shadow-lg px-4 py-3 text-center">
            <p className="text-sm font-medium">
              {drawingMode === 'point' && 'Napauta karttaa lisätäksesi pisteen'}
              {drawingMode === 'line' && 'Napauta pisteitä, kaksoisnapauta lopettaaksesi'}
              {drawingMode === 'polygon' && 'Piirrä alue kohteiden kategorisointia varten'}
              {drawingMode === 'road' && 'Napauta tienpisteet, kaksoisnapauta lopettaaksesi'}
              {drawingMode === 'road-edit' && 'Siirrä pisteitä, napauta tietä lisätäksesi pisteen, napauta karttaa jatkaaksesi tietä'}
              {drawingMode === 'road-product' && 'Valitse alkupiste tieltä, sitten loppupiste'}
              {drawingMode === 'area-delete' && 'Piirrä alue – alueen sisällä olevat toimenpiteet poistetaan'}
            </p>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* Top-left: Layer toggle + layer picker opens to the right */}
      <div className="absolute top-4 left-4 z-10 flex items-start gap-2">
        <Button
          variant="secondary"
          size="icon"
          className="shadow-lg w-11 h-11 shrink-0"
          onClick={() => setShowDesktopLayers(prev => !prev)}
        >
          {showDesktopLayers ? <X className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
        </Button>

        {showDesktopLayers && (
          <div className="flex flex-col bg-card rounded-md shadow-lg border border-border overflow-hidden">
            <div className="px-3 py-2 text-[10px] font-bold text-foreground/60 uppercase tracking-widest bg-muted/50 border-b border-border">
              Taustakartta
            </div>
            <div className="p-1">
              {basemapOptions.map(option => (
                <button
                  key={option.id}
                  onClick={() => onBasemapChange(option.id)}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-3 py-2.5 rounded text-sm font-semibold transition-all duration-150",
                    basemap === option.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground/80 hover:text-foreground"
                  )}
                  title={option.label}
                >
                  <option.icon className="w-4 h-4" />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>

            <div className="border-t border-border" />

            <div className="p-1">
              <button
                onClick={onCadastreToggle}
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-2.5 rounded text-sm font-semibold transition-all duration-150",
                  showCadastre
                    ? "bg-success text-white"
                    : "hover:bg-muted text-foreground/80 hover:text-foreground"
                )}
                title="Kiinteistörajat"
              >
                <Grid3X3 className="w-4 h-4" />
                <span>Kiinteistöt</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drawing tools - always visible, positioned below layer picker */}
      <div className="absolute top-[72px] left-4 z-10 flex flex-col items-center bg-card rounded-md shadow-lg border border-border overflow-hidden w-[46px]">
        <div className="px-1 py-1.5 text-[9px] font-bold text-foreground/60 uppercase tracking-widest bg-muted/50 border-b border-border w-full text-center">
          Piirto
        </div>
        <div className="p-0.5 flex flex-col gap-0.5">
          {drawingTools.map(tool => {
            const IconComponent = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => !tool.disabled && onDrawingModeChange(tool.id)}
                disabled={tool.disabled}
                className={cn(
                  "flex items-center justify-center w-9 h-9 rounded transition-all duration-150",
                  tool.disabled && "opacity-40 cursor-not-allowed",
                  (drawingMode === tool.id || (tool.id === 'road' && drawingMode === 'road-edit'))
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground/70 hover:text-foreground"
                )}
                title={tool.tooltip || tool.label}
              >
                <IconComponent className="w-5 h-5" />
              </button>
            );
          })}
        </div>

        {drawingMode !== 'none' && (
          <>
            <div className="border-t border-border w-full" />
            <div className="p-0.5">
              <button
                onClick={() => onDrawingModeChange('none')}
                className="flex items-center justify-center w-9 h-9 rounded hover:bg-destructive/15 text-foreground/60 hover:text-destructive transition-all duration-150"
                title="Peruuta (ESC)"
              >
                <Undo className="w-5 h-5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Drawing mode indicator - Tievahti Infra styled */}
      {(drawingMode !== 'none') && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-foreground text-background rounded-md shadow-lg px-5 py-3">
          <p className="text-sm font-semibold">
            {drawingMode === 'point' && (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Klikkaa karttaa lisätäksesi pistemäisen tuotteen
              </span>
            )}
            {drawingMode === 'line' && (
              <span className="flex items-center gap-2">
                <span className="w-4 h-0.5 bg-success rounded" />
                Klikkaa aloittaaksesi viivan. <kbd className="px-1.5 py-0.5 bg-background/20 rounded text-xs font-mono">Enter</kbd> = valmis
              </span>
            )}
            {drawingMode === 'polygon' && (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-success bg-success/30 rounded-sm" />
                Piirrä alue kohteiden kategorisointia varten. <kbd className="px-1.5 py-0.5 bg-background/20 rounded text-xs font-mono">Enter</kbd> = valmis
              </span>
            )}
            {drawingMode === 'road' && (
              <span className="flex items-center gap-2">
                <Route className="w-4 h-4 text-primary" />
                Piirrä tie: klikkaa pisteitä. <kbd className="px-1.5 py-0.5 bg-background/20 rounded text-xs font-mono">Enter</kbd> = valmis
              </span>
            )}
            {drawingMode === 'road-edit' && (
              <span className="flex items-center gap-2">
                <Route className="w-4 h-4 text-success" />
                Muokkaa tietä: siirrä pisteitä, klikkaa tietä lisätäksesi, klikkaa karttaa jatkaaksesi. <kbd className="px-1.5 py-0.5 bg-background/20 rounded text-xs font-mono">Enter</kbd> = valmis, <kbd className="px-1.5 py-0.5 bg-background/20 rounded text-xs font-mono">ESC</kbd> = peruuta
              </span>
            )}
            {drawingMode === 'road-product' && (
              <span className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-info" />
                Valitse alkupiste tieltä, sitten loppupiste. Tuote seuraa tietä.
              </span>
            )}
            {drawingMode === 'area-delete' && (
              <span className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-destructive" />
                Piirrä alue poistettavien toimenpiteiden ympärille. <kbd className="px-1.5 py-0.5 bg-background/20 rounded text-xs font-mono">Enter</kbd> = valmis
              </span>
            )}
          </p>
        </div>
      )}
    </>
  );
}
