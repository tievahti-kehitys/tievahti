import React, { createContext, useContext, useState, useCallback } from 'react';

export type RoadGeoEditorPhase = 'IDLE' | 'PLACING_START' | 'PLACING_END' | 'EDITING';

export interface SnapInfo {
  snapped: boolean;
  segmentIndex: number;
  distance: number;
}

export interface RoadGeoEditorState {
  isActive: boolean;
  phase: RoadGeoEditorPhase;
  startPoint: [number, number] | null; // [lat, lng]
  endPoint: [number, number] | null;
  startSnap: SnapInfo | null;
  endSnap: SnapInfo | null;
  fetchedPolyline: [number, number][] | null; // Decoded coordinates from Google
  editedPolyline: [number, number][] | null; // User-edited version
  isFetching: boolean;
  targetBranchId: string | null; // Which branch to save to
}

interface RoadGeoEditorContextType {
  state: RoadGeoEditorState;
  activate: () => void;
  deactivate: () => void;
  startPlacingStart: () => void;
  startPlacingEnd: () => void;
  setStartPoint: (point: [number, number], snap?: SnapInfo) => void;
  setEndPoint: (point: [number, number], snap?: SnapInfo) => void;
  setFetchedPolyline: (coords: [number, number][]) => void;
  updateEditedPolyline: (coords: [number, number][]) => void;
  setIsFetching: (v: boolean) => void;
  setTargetBranchId: (id: string | null) => void;
  reset: () => void;
}

const initialState: RoadGeoEditorState = {
  isActive: false,
  phase: 'IDLE',
  startPoint: null,
  endPoint: null,
  startSnap: null,
  endSnap: null,
  fetchedPolyline: null,
  editedPolyline: null,
  isFetching: false,
  targetBranchId: null,
};

const RoadGeoEditorContext = createContext<RoadGeoEditorContextType | null>(null);

export function RoadGeoEditorProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RoadGeoEditorState>(initialState);

  const activate = useCallback(() => {
    setState(prev => ({ ...prev, isActive: true, phase: 'IDLE' }));
  }, []);

  const deactivate = useCallback(() => {
    setState(initialState);
  }, []);

  const startPlacingStart = useCallback(() => {
    setState(prev => ({ ...prev, phase: 'PLACING_START' }));
  }, []);

  const startPlacingEnd = useCallback(() => {
    setState(prev => ({ ...prev, phase: 'PLACING_END' }));
  }, []);

  const setStartPoint = useCallback((point: [number, number], snap?: SnapInfo) => {
    setState(prev => ({ ...prev, startPoint: point, startSnap: snap || null, phase: 'IDLE' }));
  }, []);

  const setEndPoint = useCallback((point: [number, number], snap?: SnapInfo) => {
    setState(prev => ({ ...prev, endPoint: point, endSnap: snap || null, phase: 'IDLE' }));
  }, []);

  const setFetchedPolyline = useCallback((coords: [number, number][]) => {
    setState(prev => ({
      ...prev,
      fetchedPolyline: coords,
      editedPolyline: [...coords],
      phase: 'EDITING',
    }));
  }, []);

  const updateEditedPolyline = useCallback((coords: [number, number][]) => {
    setState(prev => ({ ...prev, editedPolyline: coords }));
  }, []);

  const setIsFetching = useCallback((v: boolean) => {
    setState(prev => ({ ...prev, isFetching: v }));
  }, []);

  const setTargetBranchId = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, targetBranchId: id }));
  }, []);

  const reset = useCallback(() => {
    setState(prev => ({
      ...prev,
      phase: 'IDLE',
      startPoint: null,
      endPoint: null,
      startSnap: null,
      endSnap: null,
      fetchedPolyline: null,
      editedPolyline: null,
      isFetching: false,
    }));
  }, []);

  return (
    <RoadGeoEditorContext.Provider
      value={{
        state,
        activate,
        deactivate,
        startPlacingStart,
        startPlacingEnd,
        setStartPoint,
        setEndPoint,
        setFetchedPolyline,
        updateEditedPolyline,
        setIsFetching,
        setTargetBranchId,
        reset,
      }}
    >
      {children}
    </RoadGeoEditorContext.Provider>
  );
}

export function useRoadGeoEditor() {
  const ctx = useContext(RoadGeoEditorContext);
  if (!ctx) throw new Error('useRoadGeoEditor must be used within RoadGeoEditorProvider');
  return ctx;
}
