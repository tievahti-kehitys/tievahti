import React, { useState, useCallback, useEffect } from 'react';
import { useRoadGeoEditor } from '@/context/RoadGeometryEditorContext';
import { useProject } from '@/context/ProjectContext';
import { useBearingCapacityContext } from '@/context/BearingCapacityContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import {
  Search,
  MapPin,
  Route,
  Save,
  Loader2,
  X,
  Navigation,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';

interface PlaceResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  placeId: string;
}

interface RoadGeometryEditorPanelProps {
  embedded?: boolean;
  targetBranchId?: string;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function RoadGeometryEditorPanel({ embedded = false, targetBranchId: propBranchId }: RoadGeometryEditorPanelProps) {
  const { project } = useProject();
  const editor = useRoadGeoEditor();
  const { state } = editor;
  const { branches, refresh } = useBearingCapacityContext();

  const effectiveBranchId = propBranchId || state.targetBranchId;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  // Activate editor when panel mounts with a target branch
  useEffect(() => {
    if (effectiveBranchId) {
      editor.activate();
      editor.setTargetBranchId(effectiveBranchId);
    }
    return () => {
      if (!embedded) editor.deactivate();
    };
  }, [effectiveBranchId]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-places-search', {
        body: { query: searchQuery },
      });
      if (error) throw error;
      setSearchResults(data?.results || []);
    } catch (err: any) {
      toast.error('Haku epäonnistui: ' + (err.message || 'Tuntematon virhe'));
    }
    setIsSearching(false);
  }, [searchQuery]);

  const handleSelectPlace = useCallback((place: PlaceResult) => {
    window.dispatchEvent(new CustomEvent('road-geo-editor:flyto', {
      detail: { lat: place.lat, lng: place.lng },
    }));
    setSearchResults([]);
    toast.success(`Siirrytty: ${place.name}`);
  }, []);

  const handleFetchRoad = useCallback(async () => {
    if (!state.startPoint || !state.endPoint) {
      toast.error('Aseta alku- ja loppupiste ensin');
      return;
    }
    editor.setIsFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-directions', {
        body: {
          startLat: state.startPoint[0],
          startLng: state.startPoint[1],
          endLat: state.endPoint[0],
          endLng: state.endPoint[1],
        },
      });
      if (error) throw error;
      if (!data?.coordinates?.length) {
        toast.error('Reittiä ei löytynyt');
        return;
      }
      editor.setFetchedPolyline(data.coordinates);
      toast.success(`Reittigeometria haettu (${data.coordinates.length} pistettä, ${Math.round(data.distance)} m)`);
    } catch (err: any) {
      toast.error('Reitin haku epäonnistui: ' + (err.message || 'Tuntematon virhe'));
    }
    editor.setIsFetching(false);
  }, [state.startPoint, state.endPoint, editor]);

  const handleSave = useCallback(async () => {
    if (!state.editedPolyline?.length) {
      toast.error('Hae ensin tien geometria');
      return;
    }
    if (!effectiveBranchId) {
      toast.error('Valitse haara ensin');
      return;
    }
    setSaving(true);
    try {
      const newCoords = state.editedPolyline as [number, number][];
      const branch = branches.find(b => b.id === effectiveBranchId);
      const existingCoords: [number, number][] = (branch?.geometry as any)?.coordinates || [];

      let finalCoords: [number, number][];
      if (existingCoords.length >= 2) {
        // Find best merge strategy based on closest endpoints
        const dStartEnd = calculateDistance(newCoords[0][0], newCoords[0][1], existingCoords[existingCoords.length - 1][0], existingCoords[existingCoords.length - 1][1]);
        const dEndStart = calculateDistance(newCoords[newCoords.length - 1][0], newCoords[newCoords.length - 1][1], existingCoords[0][0], existingCoords[0][1]);
        const dStartStart = calculateDistance(newCoords[0][0], newCoords[0][1], existingCoords[0][0], existingCoords[0][1]);
        const dEndEnd = calculateDistance(newCoords[newCoords.length - 1][0], newCoords[newCoords.length - 1][1], existingCoords[existingCoords.length - 1][0], existingCoords[existingCoords.length - 1][1]);

        const minDist = Math.min(dStartEnd, dEndStart, dStartStart, dEndEnd);
        if (minDist === dStartEnd) {
          finalCoords = [...existingCoords, ...newCoords];
        } else if (minDist === dEndStart) {
          finalCoords = [...newCoords, ...existingCoords];
        } else if (minDist === dStartStart) {
          finalCoords = [...[...newCoords].reverse(), ...existingCoords];
        } else {
          finalCoords = [...existingCoords, ...[...newCoords].reverse()];
        }
      } else {
        finalCoords = newCoords;
      }

      await supabase
        .from('road_branches')
        .update({ geometry: { coordinates: finalCoords } })
        .eq('id', effectiveBranchId);

      await refresh();

      const totalLength = finalCoords.reduce((sum, coord, i) => {
        if (i === 0) return 0;
        return sum + calculateDistance(finalCoords[i - 1][0], finalCoords[i - 1][1], coord[0], coord[1]);
      }, 0);

      toast.success(`Tielinja tallennettu haaralle (${(totalLength / 1000).toFixed(2)} km)`);
      editor.reset();
    } catch (err: any) {
      toast.error('Tallennus epäonnistui: ' + (err.message || 'Tuntematon virhe'));
    }
    setSaving(false);
  }, [state.editedPolyline, effectiveBranchId, editor, branches, refresh]);

  // --- Render sections ---

  const targetBranch = branches.find(b => b.id === effectiveBranchId);
  const branchGeoInfo = targetBranch?.geometry ? (targetBranch.geometry as any)?.coordinates?.length || 0 : 0;

  const renderSearchSection = () => (
    <div className="space-y-2">
      <label className="text-xs font-bold text-sidebar-foreground/70 uppercase tracking-wider">
        Hae paikkaa
      </label>
      <div className="flex gap-1">
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="esim. Mannerheimintie"
          className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm"
        />
        <Button
          variant="secondary"
          size="icon"
          onClick={handleSearch}
          disabled={isSearching || !searchQuery.trim()}
        >
          {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>
      {searchResults.length > 0 && (
        <div className="bg-sidebar-accent rounded-lg border border-sidebar-border overflow-hidden">
          {searchResults.map((place, idx) => (
            <button
              key={place.placeId || idx}
              onClick={() => handleSelectPlace(place)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 transition-colors border-b border-sidebar-border last:border-0"
            >
              <p className="font-semibold text-sidebar-foreground truncate">{place.name}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">{place.address}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderPointsSection = () => (
    <div className="space-y-2">
      <label className="text-xs font-bold text-sidebar-foreground/70 uppercase tracking-wider">
        Reitin pisteet
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={state.phase === 'PLACING_START' ? 'default' : 'outline'}
          size="sm"
          onClick={() => editor.startPlacingStart()}
          className="text-xs"
        >
          <MapPin className="w-3.5 h-3.5 mr-1" />
          {state.startPoint ? 'Alkupiste ✓' : 'Alkupiste'}
        </Button>
        <Button
          variant={state.phase === 'PLACING_END' ? 'default' : 'outline'}
          size="sm"
          onClick={() => editor.startPlacingEnd()}
          className="text-xs"
        >
          <Navigation className="w-3.5 h-3.5 mr-1" />
          {state.endPoint ? 'Loppupiste ✓' : 'Loppupiste'}
        </Button>
      </div>
      {state.startPoint && (
        <p className="text-[10px] text-sidebar-foreground/50">
          Alku: {state.startPoint[0].toFixed(5)}, {state.startPoint[1].toFixed(5)}
          {state.startSnap?.snapped && (
            <span className="ml-1 text-blue-400 font-semibold">🧲 Kiinnitetty tiehen</span>
          )}
        </p>
      )}
      {state.endPoint && (
        <p className="text-[10px] text-sidebar-foreground/50">
          Loppu: {state.endPoint[0].toFixed(5)}, {state.endPoint[1].toFixed(5)}
          {state.endSnap?.snapped && (
            <span className="ml-1 text-blue-400 font-semibold">🧲 Kiinnitetty tiehen</span>
          )}
        </p>
      )}
      {branchGeoInfo > 0 && (
        <p className="text-[10px] text-sidebar-foreground/50 bg-sidebar-accent/50 rounded px-2 py-1">
          Haaran tie: {branchGeoInfo} pistettä
        </p>
      )}
    </div>
  );

  const renderFetchButton = () => (
    <Button
      onClick={handleFetchRoad}
      disabled={!state.startPoint || !state.endPoint || state.isFetching}
      className="w-full"
      size="sm"
    >
      {state.isFetching ? (
        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
      ) : (
        <Route className="w-4 h-4 mr-1" />
      )}
      Hae tien muoto
    </Button>
  );

  const renderEditingInfo = () => {
    if (state.phase !== 'EDITING' || !state.editedPolyline) return null;
    return (
      <div className="bg-sidebar-accent/50 rounded-lg p-3 border border-sidebar-border space-y-2">
        <p className="text-xs text-sidebar-foreground/70">
          <strong>{state.editedPolyline.length}</strong> pistettä. Muokkaa geometriaa kartalla:
        </p>
        <ul className="text-[10px] text-sidebar-foreground/50 space-y-0.5 list-disc pl-3">
          <li>Vedä pisteitä siirtääksesi niitä</li>
          <li>Klikkaa viivaa lisätäksesi uuden pisteen</li>
        </ul>
        <Button
          variant="outline"
          size="sm"
          onClick={editor.reset}
          className="w-full text-xs"
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1" />
          Aloita alusta
        </Button>
      </div>
    );
  };

  const renderSaveSection = () => {
    if (state.phase !== 'EDITING' || !state.editedPolyline) return null;
    return (
      <div className="space-y-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          variant="success"
          className="w-full"
          size="sm"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-1" />
          )}
          {branchGeoInfo > 0 ? 'Lisää geometria haaraan' : 'Tallenna haaran tieksi'}
        </Button>
      </div>
    );
  };

  const renderPhaseIndicator = () => {
    if (state.phase !== 'PLACING_START' && state.phase !== 'PLACING_END') return null;
    return (
      <div className="bg-primary/10 rounded-lg p-3 border border-primary/20 text-center">
        <p className="text-xs font-semibold text-primary">
          {state.phase === 'PLACING_START'
            ? '🎯 Klikkaa kartalla alkupistettä'
            : '🎯 Klikkaa kartalla loppupistettä'}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.activate()}
          className="mt-1 text-xs"
        >
          <X className="w-3 h-3 mr-1" />
          Peruuta
        </Button>
      </div>
    );
  };

  if (!project) {
    if (embedded) return null;
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Valitse ensin projekti.
      </div>
    );
  }

  // Embedded with targetBranchId: render sections directly
  if (embedded && propBranchId) {
    return (
      <div className="mt-2 space-y-3 border-t border-sidebar-border pt-2">
        {renderSearchSection()}
        {renderPointsSection()}
        {renderFetchButton()}
        {renderEditingInfo()}
        {renderSaveSection()}
        {renderPhaseIndicator()}
      </div>
    );
  }

  // Standalone mode
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Route className="w-5 h-5 text-primary" />
        <h2 className="text-sm font-bold text-sidebar-foreground">Tiegeometria</h2>
      </div>
      {renderSearchSection()}
      {renderPointsSection()}
      {renderFetchButton()}
      {renderEditingInfo()}
      {renderSaveSection()}
      {renderPhaseIndicator()}
    </div>
  );
}
