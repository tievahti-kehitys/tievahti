import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { ProductGeometry } from '@/types/project';

export type ForestModePhase = 'BROWSE' | 'ADD_LOCAL_POINT' | 'ADD_INTERVAL_LINE' | 'EDIT_GEOMETRY';
export type SegmentMode = 'road-snap' | 'gps-tracking' | 'freeform';

export interface ForestModeState {
  isActive: boolean;
  phase: ForestModePhase;
  // ADD_LOCAL_POINT
  pendingPoint: [number, number] | null;
  // ADD_INTERVAL_LINE
  segmentPoints: [number, number][];
  segmentMode: SegmentMode;
  isGpsTracking: boolean;
  // EDIT_GEOMETRY
  editingGeometryItemId: string | null;
  editingOriginalGeometry: ProductGeometry | null;
}

interface ForestModeContextType {
  state: ForestModeState;
  toggleForestMode: () => void;
  setForestMode: (active: boolean) => void;
  // Phase transitions
  enterAddPoint: () => void;
  enterAddInterval: (mode?: SegmentMode) => void;
  enterEditGeometry: (id: string, originalGeometry: ProductGeometry) => void;
  returnToBrowse: () => void;
  // ADD_LOCAL_POINT
  setPendingPoint: (point: [number, number] | null) => void;
  // ADD_INTERVAL_LINE
  setSegmentMode: (mode: SegmentMode) => void;
  addSegmentPoint: (point: [number, number]) => void;
  clearSegmentPoints: () => void;
  startGpsTracking: () => void;
  stopGpsTracking: () => void;
  // Backward compat for normal mode geometry editing
  setEditingGeometryItemId: (id: string | null) => void;
}

const initialState: ForestModeState = {
  isActive: false,
  phase: 'BROWSE',
  pendingPoint: null,
  segmentPoints: [],
  segmentMode: 'freeform',
  isGpsTracking: false,
  editingGeometryItemId: null,
  editingOriginalGeometry: null,
};

const ForestModeContext = createContext<ForestModeContextType | null>(null);

export function ForestModeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ForestModeState>(initialState);
  const gpsWatchIdRef = useRef<number | null>(null);

  const stopGpsInternal = useCallback(() => {
    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
  }, []);

  const toggleForestMode = useCallback(() => {
    stopGpsInternal();
    setState(prev => prev.isActive ? initialState : { ...initialState, isActive: true });
  }, [stopGpsInternal]);

  const setForestMode = useCallback((active: boolean) => {
    stopGpsInternal();
    setState(active ? { ...initialState, isActive: true } : initialState);
  }, [stopGpsInternal]);

  // --- Phase transitions ---

  const enterAddPoint = useCallback(() => {
    setState(prev => ({
      ...prev,
      phase: 'ADD_LOCAL_POINT',
      pendingPoint: null,
      segmentPoints: [],
      isGpsTracking: false,
      editingGeometryItemId: null,
      editingOriginalGeometry: null,
    }));
  }, []);

  const enterAddInterval = useCallback((mode: SegmentMode = 'freeform') => {
    setState(prev => ({
      ...prev,
      phase: 'ADD_INTERVAL_LINE',
      segmentMode: mode,
      pendingPoint: null,
      segmentPoints: [],
      isGpsTracking: false,
      editingGeometryItemId: null,
      editingOriginalGeometry: null,
    }));
  }, []);

  const enterEditGeometry = useCallback((id: string, originalGeometry: ProductGeometry) => {
    setState(prev => ({
      ...prev,
      phase: 'EDIT_GEOMETRY',
      editingGeometryItemId: id,
      editingOriginalGeometry: originalGeometry,
      pendingPoint: null,
      segmentPoints: [],
      isGpsTracking: false,
    }));
  }, []);

  const returnToBrowse = useCallback(() => {
    stopGpsInternal();
    setState(prev => ({
      ...prev,
      phase: 'BROWSE',
      pendingPoint: null,
      segmentPoints: [],
      isGpsTracking: false,
      editingGeometryItemId: null,
      editingOriginalGeometry: null,
    }));
  }, [stopGpsInternal]);

  // --- ADD_LOCAL_POINT actions ---

  const setPendingPoint = useCallback((point: [number, number] | null) => {
    setState(prev => ({ ...prev, pendingPoint: point }));
  }, []);

  // --- ADD_INTERVAL_LINE actions ---

  const setSegmentMode = useCallback((mode: SegmentMode) => {
    stopGpsInternal();
    setState(prev => ({
      ...prev,
      segmentMode: mode,
      segmentPoints: [],
      isGpsTracking: false,
    }));
  }, [stopGpsInternal]);

  const addSegmentPoint = useCallback((point: [number, number]) => {
    setState(prev => ({
      ...prev,
      segmentPoints: [...prev.segmentPoints, point],
    }));
  }, []);

  const clearSegmentPoints = useCallback(() => {
    stopGpsInternal();
    setState(prev => ({
      ...prev,
      segmentPoints: [],
      isGpsTracking: false,
    }));
  }, [stopGpsInternal]);

  const startGpsTracking = useCallback(() => {
    if (!navigator.geolocation) return;
    setState(prev => ({ ...prev, isGpsTracking: true }));

    let lastRecordedTime = 0;
    const RECORD_INTERVAL_MS = 5000;

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastRecordedTime >= RECORD_INTERVAL_MS) {
          lastRecordedTime = now;
          const point: [number, number] = [position.coords.latitude, position.coords.longitude];
          setState(prev => ({
            ...prev,
            segmentPoints: [...prev.segmentPoints, point],
          }));
        }
      },
      (error) => console.error('GPS tracking error:', error),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  const stopGpsTracking = useCallback(() => {
    stopGpsInternal();
    setState(prev => ({ ...prev, isGpsTracking: false }));
  }, [stopGpsInternal]);

  // Backward compat: set editing item without full phase transition (for normal mode)
  const setEditingGeometryItemId = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, editingGeometryItemId: id }));
  }, []);

  return (
    <ForestModeContext.Provider
      value={{
        state,
        toggleForestMode,
        setForestMode,
        enterAddPoint,
        enterAddInterval,
        enterEditGeometry,
        returnToBrowse,
        setPendingPoint,
        setSegmentMode,
        addSegmentPoint,
        clearSegmentPoints,
        startGpsTracking,
        stopGpsTracking,
        setEditingGeometryItemId,
      }}
    >
      {children}
    </ForestModeContext.Provider>
  );
}

export function useForestMode() {
  const context = useContext(ForestModeContext);
  if (!context) {
    throw new Error('useForestMode must be used within a ForestModeProvider');
  }
  return context;
}
