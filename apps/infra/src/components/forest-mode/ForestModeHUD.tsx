import React, { useState, useCallback } from 'react';
import { useBearingCapacityContext } from '@/context/BearingCapacityContext';
import {
  MapPin,
  ArrowLeftRight,
  Locate,
  Check,
  X,
  Route,
  Navigation,
  Hand,
  Square,
  AlertTriangle,
  Pencil,
  LocateFixed,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForestMode, SegmentMode } from '@/context/ForestModeContext';
import { useProject } from '@/context/ProjectContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ForestModeHUDProps {
  onSave: () => void;
  onCancel: () => void;
  onGpsLocation: () => void;
  gpsLoading?: boolean;
}

export function ForestModeHUD({
  onSave,
  onCancel,
  onGpsLocation,
  gpsLoading = false,
}: ForestModeHUDProps) {
  const { state, setSegmentMode, startGpsTracking, stopGpsTracking, setPendingPoint, addSegmentPoint } =
    useForestMode();

  const { project } = useProject();
  const { mergedRoadSegments } = useBearingCapacityContext();
  const hasRoad = mergedRoadSegments.length > 0;

  const [showCoordInput, setShowCoordInput] = useState(false);
  const [coordInputStart, setCoordInputStart] = useState('');
  const [coordInputEnd, setCoordInputEnd] = useState('');

  const parseCoordInput = useCallback((input: string): [number, number] | null => {
    const parts = input.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return [parts[0], parts[1]];
    }
    return null;
  }, []);

  const handleApplyCoordInput = useCallback(() => {
    if (state.phase === 'ADD_LOCAL_POINT') {
      const coords = parseCoordInput(coordInputStart);
      if (!coords) {
        toast.error('Virheellinen muoto. Käytä: lat, lng');
        return;
      }
      setPendingPoint(coords);
      toast.success('Sijainti asetettu koordinaateista');
      setShowCoordInput(false);
      setCoordInputStart('');
    } else if (state.phase === 'ADD_INTERVAL_LINE') {
      const startCoords = parseCoordInput(coordInputStart);
      const endCoords = parseCoordInput(coordInputEnd);
      if (!startCoords) {
        toast.error('Virheellinen alkupiste. Käytä: lat, lng');
        return;
      }
      if (!endCoords) {
        toast.error('Virheellinen loppupiste. Käytä: lat, lng');
        return;
      }
      addSegmentPoint(startCoords);
      addSegmentPoint(endCoords);
      toast.success('Alku- ja loppupiste asetettu koordinaateista');
      setShowCoordInput(false);
      setCoordInputStart('');
      setCoordInputEnd('');
    }
  }, [state.phase, coordInputStart, coordInputEnd, parseCoordInput, setPendingPoint, addSegmentPoint]);

  const segmentModes: {
    mode: SegmentMode;
    icon: React.ReactNode;
    label: string;
  }[] = [
    {
      mode: 'road-snap',
      icon: <Route className="w-5 h-5" />,
      label: 'Tien mukaan',
    },
    {
      mode: 'gps-tracking',
      icon: <Navigation className="w-5 h-5" />,
      label: 'GPS-seuranta',
    },
    {
      mode: 'freeform',
      icon: <Hand className="w-5 h-5" />,
      label: 'Vapaamuoto',
    },
  ];

  // ---------- helpers ----------

  const canSave = (): boolean => {
    if (state.phase === 'ADD_LOCAL_POINT') return !!state.pendingPoint;
    if (state.phase === 'ADD_INTERVAL_LINE')
      return state.segmentPoints.length >= 2;
    if (state.phase === 'EDIT_GEOMETRY') return true;
    return false;
  };

  const isGpsTrackingPhase =
    state.phase === 'ADD_INTERVAL_LINE' &&
    state.segmentMode === 'gps-tracking';

  const handleMainAction = () => {
    if (isGpsTrackingPhase) {
      if (state.isGpsTracking) {
        stopGpsTracking();
        if (state.segmentPoints.length >= 2) onSave();
        return;
      }
      if (!state.isGpsTracking && state.segmentPoints.length === 0) {
        startGpsTracking();
        return;
      }
    }
    onSave();
  };

  const getSaveText = () => {
    if (state.phase === 'EDIT_GEOMETRY') return 'Tallenna sijainti';
    if (state.phase === 'ADD_LOCAL_POINT') return 'Tallenna';
    // ADD_INTERVAL_LINE
    if (state.segmentMode === 'gps-tracking') {
      if (state.isGpsTracking)
        return `Lopeta (${state.segmentPoints.length} pistettä)`;
      if (state.segmentPoints.length === 0) return 'Aloita seuranta';
      return `Tallenna (${state.segmentPoints.length} pistettä)`;
    }
    if (state.segmentPoints.length >= 2)
      return `Tallenna (${state.segmentPoints.length} pistettä)`;
    return 'Tallenna';
  };

  const getInstruction = (): string | null => {
    if (state.phase === 'ADD_LOCAL_POINT')
      return state.pendingPoint
        ? null
        : 'Napauta kartalle tai käytä GPS-nappia';
    if (state.phase === 'EDIT_GEOMETRY')
      return 'Vedä merkkiä tai taitekohtia muokataksesi sijaintia';
    if (
      state.phase === 'ADD_INTERVAL_LINE' &&
      state.segmentPoints.length === 0 &&
      !state.isGpsTracking
    ) {
      if (state.segmentMode === 'road-snap')
        return hasRoad
          ? 'Napauta kartalta alku- ja loppupiste'
          : null;
      if (state.segmentMode === 'gps-tracking')
        return 'Paina "Aloita seuranta" ja kävele reittiä pitkin';
      if (state.segmentMode === 'freeform')
        return 'Napauta kartalta pisteitä joista reitti kulkee';
    }
    return null;
  };

  // ---------- render ----------

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t-2 border-border shadow-2xl safe-area-pb">
      {/* Phase title */}
      <div className="flex items-center justify-center gap-2 py-2 border-b border-border bg-muted/30">
        {state.phase === 'ADD_LOCAL_POINT' && (
          <>
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Paikallinen kohde</span>
          </>
        )}
        {state.phase === 'ADD_INTERVAL_LINE' && (
          <>
            <ArrowLeftRight className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Tievälillinen kohde</span>
          </>
        )}
        {state.phase === 'EDIT_GEOMETRY' && (
          <>
            <Pencil className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Muokkaa sijaintia</span>
          </>
        )}
      </div>

      {/* Segment mode selector */}
      {state.phase === 'ADD_INTERVAL_LINE' && (
        <div className="flex border-b border-border bg-muted/30">
          {segmentModes.map(({ mode, icon, label }) => (
            <button
              key={mode}
              onClick={() => setSegmentMode(mode)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors',
                state.segmentMode === mode
                  ? 'bg-info/20 text-info border-b-2 border-info'
                  : 'text-muted-foreground hover:bg-muted/50',
              )}
            >
              {icon}
              <span className="text-[10px]">{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Road-snap warning when no road exists */}
      {state.phase === 'ADD_INTERVAL_LINE' &&
        state.segmentMode === 'road-snap' &&
        !hasRoad && (
          <div className="px-4 py-2 bg-warning/10 border-b border-warning/30">
            <p className="text-xs text-warning flex items-center justify-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Piirrä ensin tie kartalle perusmoodissa
            </p>
          </div>
        )}

      {/* Progress indicator */}
      {state.phase === 'ADD_INTERVAL_LINE' &&
        state.segmentPoints.length > 0 && (
          <div
            className={cn(
              'px-4 py-2 border-b border-border',
              state.isGpsTracking
                ? 'bg-success/10 border-success/30'
                : 'bg-info/10 border-info/30',
            )}
          >
            <p
              className={cn(
                'text-sm font-medium text-center',
                state.isGpsTracking ? 'text-success' : 'text-info',
              )}
            >
              {state.isGpsTracking ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-success animate-pulse mr-2" />
                  GPS-seuranta käynnissä – {state.segmentPoints.length} pistettä
                </>
              ) : state.segmentMode === 'road-snap' ? (
                state.segmentPoints.length === 1
                  ? '✓ Alkupiste valittu – valitse loppupiste'
                  : `✓ ${state.segmentPoints.length} pistettä valittu`
              ) : (
                `✓ ${state.segmentPoints.length} pistettä valittu${
                  state.segmentPoints.length < 2 ? ' – lisää vähintään 2' : ''
                }`
              )}
            </p>
          </div>
        )}

      {/* Instruction text */}
      {getInstruction() && (
        <div className="px-4 py-2 bg-muted/50 border-b border-border">
          <p className="text-xs text-muted-foreground text-center">
            {getInstruction()}
          </p>
        </div>
      )}

      {/* Coordinate input panel */}
      {showCoordInput && state.phase !== 'EDIT_GEOMETRY' && (
        <div className="px-3 py-2 border-b border-border bg-muted/50 space-y-2">
          {state.phase === 'ADD_LOCAL_POINT' ? (
            <div className="space-y-1">
              <Label className="text-xs">Koordinaatit (lat, lng)</Label>
              <Input
                value={coordInputStart}
                onChange={(e) => setCoordInputStart(e.target.value)}
                placeholder="61.4978, 23.7610"
                className="h-8 text-xs font-mono"
                autoFocus
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Alkupiste (lat, lng)</Label>
                <Input
                  value={coordInputStart}
                  onChange={(e) => setCoordInputStart(e.target.value)}
                  placeholder="61.4978, 23.7610"
                  className="h-8 text-xs font-mono"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Loppupiste (lat, lng)</Label>
                <Input
                  value={coordInputEnd}
                  onChange={(e) => setCoordInputEnd(e.target.value)}
                  placeholder="61.5012, 23.7680"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          )}
          {state.phase === 'ADD_INTERVAL_LINE' && hasRoad && (
            <p className="text-[10px] text-muted-foreground">
              Reitti kulkee automaattisesti tien geometriaa pitkin
            </p>
          )}
          <Button
            variant="success"
            size="sm"
            className="w-full h-8 text-xs"
            onClick={handleApplyCoordInput}
          >
            <LocateFixed className="w-3 h-3 mr-1" />
            Aseta sijainti
          </Button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 px-3 py-3">
        {/* Cancel */}
        <Button
          variant="outline"
          size="lg"
          onClick={onCancel}
          className="h-14 px-3 rounded-xl gap-1.5 font-bold text-sm shrink-0"
        >
          <X className="w-5 h-5 shrink-0" />
          <span>Peruuta</span>
        </Button>

        {/* Coordinate input toggle — not shown in EDIT or GPS-tracking mode */}
        {state.phase !== 'EDIT_GEOMETRY' && !isGpsTrackingPhase && (
          <Button
            variant={showCoordInput ? 'default' : 'outline'}
            size="lg"
            onClick={() => setShowCoordInput(!showCoordInput)}
            className="h-14 w-14 min-w-[3.5rem] shrink-0 p-0 rounded-xl"
            title="Syötä koordinaatit"
          >
            <LocateFixed className="w-6 h-6" />
          </Button>
        )}

        {/* GPS location — not shown in EDIT or GPS-tracking mode */}
        {state.phase !== 'EDIT_GEOMETRY' && !isGpsTrackingPhase && (
          <Button
            variant="outline"
            size="lg"
            onClick={onGpsLocation}
            disabled={gpsLoading}
            className="h-14 w-14 min-w-[3.5rem] shrink-0 p-0 rounded-xl"
          >
            <Locate className={cn('w-6 h-6', gpsLoading && 'animate-spin')} />
          </Button>
        )}

        {/* Save / main action */}
        <Button
          variant={state.isGpsTracking ? 'destructive' : 'success'}
          size="lg"
          onClick={handleMainAction}
          disabled={!canSave() && !isGpsTrackingPhase}
          className={cn(
            'flex-1 min-w-0 h-14 text-base font-bold rounded-xl gap-1.5',
            state.isGpsTracking && 'animate-pulse',
          )}
        >
          {state.isGpsTracking ? (
            <Square className="w-5 h-5 shrink-0" />
          ) : (
            <Check className="w-5 h-5 shrink-0" />
          )}
          <span className="truncate">{getSaveText()}</span>
        </Button>
      </div>
    </div>
  );
}
