import React, { useState, useCallback } from 'react';
import { useForestMode } from '@/context/ForestModeContext';
import { useProject } from '@/context/ProjectContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { ForestModeToolbar } from './ForestModeToolbar';
import { ForestModeHUD } from './ForestModeHUD';
import { ForestModeProductSelector } from './ForestModeProductSelector';
import { extractRoadSegment } from '@/lib/roadGeometryUtils';
import { toast } from 'sonner';

export function ForestModeOverlay() {
  const {
    state,
    returnToBrowse,
    setPendingPoint,
    addSegmentPoint,
    clearSegmentPoints,
    stopGpsTracking,
  } = useForestMode();
  const { project, addProduct, updateProduct } = useProject();
  const geolocation = useGeolocation();

  const [showProductSelector, setShowProductSelector] = useState(false);

  // ---- GPS one-shot location ----
  const handleGpsLocation = useCallback(() => {
    geolocation.getCurrentPosition();

    const checkPosition = setInterval(() => {
      if (geolocation.position) {
        clearInterval(checkPosition);

        if (state.phase === 'ADD_LOCAL_POINT') {
          setPendingPoint(geolocation.position);
          toast.success('GPS-sijainti asetettu');
        } else if (state.phase === 'ADD_INTERVAL_LINE') {
          addSegmentPoint(geolocation.position);
          if (state.segmentMode === 'road-snap') {
            toast.success(
              state.segmentPoints.length === 0
                ? 'Alkupiste lisätty GPS-sijainnista'
                : 'Loppupiste lisätty GPS-sijainnista',
            );
          } else {
            toast.success(
              `Piste ${state.segmentPoints.length + 1} lisätty GPS-sijainnista`,
            );
          }
        }
      }
    }, 100);

    setTimeout(() => clearInterval(checkPosition), 15000);
  }, [
    geolocation,
    state.phase,
    state.segmentMode,
    state.segmentPoints.length,
    addSegmentPoint,
    setPendingPoint,
  ]);

  // ---- Save handler ----
  const handleSave = useCallback(() => {
    if (state.phase === 'ADD_LOCAL_POINT') {
      if (!state.pendingPoint) {
        toast.info('Napauta karttaa tai käytä GPS-nappia');
        return;
      }
      setShowProductSelector(true);
      return;
    }

    if (state.phase === 'ADD_INTERVAL_LINE') {
      if (state.isGpsTracking) stopGpsTracking();
      if (state.segmentPoints.length < 2) {
        toast.info('Lisää vähintään 2 pistettä');
        return;
      }
      setShowProductSelector(true);
      return;
    }

    if (state.phase === 'EDIT_GEOMETRY') {
      toast.success('Sijainti tallennettu');
      returnToBrowse();
    }
  }, [state, stopGpsTracking, returnToBrowse]);

  // ---- Cancel handler ----
  const handleCancel = useCallback(() => {
    if (
      state.phase === 'EDIT_GEOMETRY' &&
      state.editingGeometryItemId &&
      state.editingOriginalGeometry
    ) {
      updateProduct(state.editingGeometryItemId, {
        geometry: state.editingOriginalGeometry,
      });
      toast.info('Muokkaus peruutettu');
    }
    clearSegmentPoints();
    returnToBrowse();
  }, [
    state.phase,
    state.editingGeometryItemId,
    state.editingOriginalGeometry,
    updateProduct,
    clearSegmentPoints,
    returnToBrowse,
  ]);

  // ---- Product selected → create & save ----
  const handleProductSelected = useCallback(
    (itemId: string, parameters: Record<string, number>) => {
      if (state.phase === 'ADD_LOCAL_POINT') {
        if (!state.pendingPoint) return;
        addProduct({
          productDefinitionId: itemId,
          geometry: { type: 'point' as const, coordinates: state.pendingPoint },
          parameters,
          photos: [],
          notes: '',
          visible: true,
          locked: false,
        });
      } else if (state.phase === 'ADD_INTERVAL_LINE') {
        if (state.segmentPoints.length < 2) return;

        let lineCoordinates = state.segmentPoints;

        if (
          state.segmentMode === 'road-snap' &&
          project?.roadGeometry
        ) {
          // Flatten all segments into one continuous coordinate array for snapping
          const allSegments = project.roadGeometry.segments;
          const roadCoords =
            allSegments && allSegments.length > 0
              ? allSegments.flat()
              : project.roadGeometry.coordinates;

          if (roadCoords && roadCoords.length >= 2) {
            const start = state.segmentPoints[0];
            const end = state.segmentPoints[state.segmentPoints.length - 1];
            lineCoordinates = extractRoadSegment(start, end, roadCoords);
            if (lineCoordinates.length < 2) {
              toast.error(
                'Virhe: tien geometriaa ei löytynyt valittujen pisteiden väliltä',
              );
              return;
            }
          }
        }

        addProduct({
          productDefinitionId: itemId,
          geometry: { type: 'line' as const, coordinates: lineCoordinates },
          parameters,
          photos: [],
          notes: '',
          visible: true,
          locked: false,
        });
      }

      toast.success('Kohde lisätty kartalle!');
      setShowProductSelector(false);
      returnToBrowse();
    },
    [
      state.phase,
      state.segmentMode,
      state.segmentPoints,
      state.pendingPoint,
      project?.roadGeometry,
      addProduct,
      returnToBrowse,
    ],
  );

  if (!state.isActive) return null;

  return (
    <>
      {/* BROWSE → show toolbar with Point / Interval buttons */}
      {state.phase === 'BROWSE' && <ForestModeToolbar />}

      {/* ADD / EDIT → show HUD with Save / Cancel */}
      {state.phase !== 'BROWSE' && (
        <ForestModeHUD
          onSave={handleSave}
          onCancel={handleCancel}
          onGpsLocation={handleGpsLocation}
          gpsLoading={geolocation.loading}
        />
      )}

      {/* Product selector dialog */}
      <ForestModeProductSelector
        open={showProductSelector}
        onClose={() => setShowProductSelector(false)}
        geometryType={state.phase === 'ADD_LOCAL_POINT' ? 'point' : 'line'}
        onProductSelected={handleProductSelected}
      />

      {/* GPS error toast */}
      {geolocation.error && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg text-sm">
          {geolocation.error}
        </div>
      )}

      {/* GPS tracking indicator */}
      {state.isGpsTracking && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-success text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-white animate-pulse" />
          <span className="text-sm font-medium">
            GPS-seuranta aktiivinen • {state.segmentPoints.length} pistettä
          </span>
        </div>
      )}
    </>
  );
}
