import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RoadBranch } from '@/hooks/useBearingCapacity';
import { useIsMobile } from '@/hooks/use-mobile';
import { MapLocateButton } from '@/components/map/MapLocateButton';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useBearingCapacityContext } from '@/context/BearingCapacityContext';
import { useProject } from '@/context/ProjectContext';
import { useMassCalc } from '@/hooks/useMassCalc';
import { useRoadGeoEditor } from '@/context/RoadGeometryEditorContext';
import { snapToExistingRoad, SNAP_THRESHOLD_METERS } from '@/lib/roadGeometryHelpers';
import { Layers, X, Map as MapIcon, Mountain, Image, Filter, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type BasemapType = 'peruskartta' | 'maastokartta' | 'ortokuva';

const basemaps: Record<BasemapType, { name: string; url: string; attribution: string; maxNativeZoom: number }> = {
  peruskartta: {
    name: 'Peruskartta',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxNativeZoom: 19,
  },
  maastokartta: {
    name: 'Maastokartta',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxNativeZoom: 17,
  },
  ortokuva: {
    name: 'Ilmakuva',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
    maxNativeZoom: 18,
  },
};

const getTileOptions = (isMobile: boolean): L.TileLayerOptions => ({
  keepBuffer: isMobile ? 4 : 2,
  updateWhenIdle: false,
  updateWhenZooming: false,
  tileSize: 256,
  zoomOffset: 0,
  detectRetina: true,
  crossOrigin: 'anonymous',
});

function getPointColor(diff: number): string {
  if (diff > 10) return '#00ff00';
  if (diff >= 0) return '#ffff00';
  if (diff > -20) return '#ff0000';
  if (diff > -40) return '#c70202';
  return '#9c0202';
}

function getPointLabel(diff: number): string {
  if (diff > 10) return 'Hyvä';
  if (diff >= 0) return 'Tyydyttävä';
  if (diff > -20) return 'Heikko';
  if (diff > -40) return 'Huono';
  return 'Erittäin heikko';
}

/** Project point onto line segment, return closest point */
function projectPointOnSegment(p: [number, number], a: [number, number], b: [number, number]): [number, number] {
  const dx = b[1] - a[1], dy = b[0] - a[0];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dy + (p[1] - a[1]) * dx) / len2));
  return [a[0] + t * dy, a[1] + t * dx];
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return Math.hypot(lat1 - lat2, lng1 - lng2);
}

export function BearingCapacityMapView() {
  const { branches, points, updateBranchGeometry, mergedRoadSegments } = useBearingCapacityContext();
  const { project } = useProject();
  const { mapSegments } = useMassCalc(project?.id);
  const roadGeoEditor = useRoadGeoEditor();
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  // Editing state
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const originalGeometryRef = useRef<any>(null); // Store original geometry for cancel

  const isEditing = !!editingBranchId || (roadGeoEditor.state.isActive && !!roadGeoEditor.state.targetBranchId);
  const activeBranchId = editingBranchId || (roadGeoEditor.state.isActive ? roadGeoEditor.state.targetBranchId : null);

  const filteredPoints = selectedBranchId
    ? points.filter(p => p.branchId === selectedBranchId)
    : points;

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const roadLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const repairLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const userLocationLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const editLayerRef = useRef<L.LayerGroup>(L.layerGroup());

  const [basemap, setBasemap] = useState<BasemapType>('peruskartta');
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const isMobile = useIsMobile();
  const geolocation = useGeolocation({ enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  const currentZoomRef = useRef(13);

  const basemapOptions = [
    { id: 'peruskartta' as const, icon: MapIcon, label: 'Peruskartta' },
    { id: 'maastokartta' as const, icon: Mountain, label: 'Maastokartta' },
    { id: 'ortokuva' as const, icon: Image, label: 'Ilmakuva' },
  ];

  const branchMap = useMemo(() => {
    const m: Record<string, RoadBranch> = {};
    branches.forEach(b => { m[b.id] = b; });
    return m;
  }, [branches]);

  // Listen for branch-road-edit events from BranchManager
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.action === 'stop') {
        cancelEditing();
        return;
      }
      if (!detail?.branchId) return;

      // Store original geometry for cancel
      const branch = branches.find(b => b.id === detail.branchId);
      originalGeometryRef.current = branch?.geometry ? JSON.parse(JSON.stringify(branch.geometry)) : null;

      if (detail.action === 'draw') {
        setEditingBranchId(detail.branchId);
        setDrawingPoints([]);
      } else if (detail.action === 'google') {
        setEditingBranchId(detail.branchId);
      }

      // Auto-fit map to the branch being edited
      const geo = branch?.geometry as any;
      const coords: [number, number][] = geo?.coordinates || [];
      if (coords.length >= 2 && mapInstanceRef.current) {
        const bounds = L.latLngBounds(coords.map(c => L.latLng(c[0], c[1])));
        mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, animate: true });
      }
    };
    window.addEventListener('branch-road-edit', handler);
    return () => window.removeEventListener('branch-road-edit', handler);
  }, [branches]);

  // Listen for road-geo-editor flyTo events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.lat != null && detail?.lng != null && mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([detail.lat, detail.lng], 15, { animate: true });
      }
    };
    window.addEventListener('road-geo-editor:flyto', handler);
    return () => window.removeEventListener('road-geo-editor:flyto', handler);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [61.5, 24.0],
      zoom: 13,
      maxZoom: 22,
      zoomControl: !isMobile,
      tap: true,
      tapTolerance: 15,
      touchZoom: true,
      bounceAtZoomLimits: false,
    });

    if (isMobile) {
      L.control.zoom({ position: 'bottomright' }).addTo(map);
    }

    const basemapConfig = basemaps[basemap];
    const tileOptions = getTileOptions(isMobile);
    tileLayerRef.current = L.tileLayer(basemapConfig.url, {
      ...tileOptions,
      attribution: basemapConfig.attribution,
      maxNativeZoom: basemapConfig.maxNativeZoom,
      maxZoom: 22,
    }).addTo(map);

    markersLayerRef.current.addTo(map);
    roadLayerRef.current.addTo(map);
    repairLayerRef.current.addTo(map);
    userLocationLayerRef.current.addTo(map);
    editLayerRef.current.addTo(map);
    mapInstanceRef.current = map;

    map.on('zoomend', () => {
      currentZoomRef.current = map.getZoom();
    });

    geolocation.getCurrentPosition();

    const invalidateTimer = setTimeout(() => map.invalidateSize(), 100);
    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    if (mapRef.current) resizeObserver.observe(mapRef.current);

    return () => {
      clearTimeout(invalidateTimer);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle basemap change
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    tileLayerRef.current.remove();
    const basemapConfig = basemaps[basemap];
    const tileOptions = getTileOptions(isMobile);
    tileLayerRef.current = L.tileLayer(basemapConfig.url, {
      ...tileOptions,
      attribution: basemapConfig.attribution,
      maxNativeZoom: basemapConfig.maxNativeZoom,
      maxZoom: 22,
    }).addTo(mapInstanceRef.current);
  }, [basemap, isMobile]);

  // Cursor management
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const container = mapInstanceRef.current.getContainer();
    const isPlacing = roadGeoEditor.state.phase === 'PLACING_START' || roadGeoEditor.state.phase === 'PLACING_END';
    container.style.cursor = (editingBranchId || isPlacing) ? 'crosshair' : '';
  }, [editingBranchId, roadGeoEditor.state.phase]);

  // Map click handler for drawing/editing
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    const handleClick = (e: L.LeafletMouseEvent) => {
      const newPoint: [number, number] = [e.latlng.lat, e.latlng.lng];

      // Road Geometry Editor click handling (Google search flow)
      if (roadGeoEditor.state.isActive) {
        if (roadGeoEditor.state.phase === 'PLACING_START') {
          if (mergedRoadSegments.length > 0) {
            const snap = snapToExistingRoad(newPoint, mergedRoadSegments, SNAP_THRESHOLD_METERS);
            if (snap.snapped) { roadGeoEditor.setStartPoint(snap.point, { snapped: true, segmentIndex: snap.segmentIndex, distance: snap.distance }); return; }
          }
          roadGeoEditor.setStartPoint(newPoint);
          return;
        }
        if (roadGeoEditor.state.phase === 'PLACING_END') {
          if (mergedRoadSegments.length > 0) {
            const snap = snapToExistingRoad(newPoint, mergedRoadSegments, SNAP_THRESHOLD_METERS);
            if (snap.snapped) { roadGeoEditor.setEndPoint(snap.point, { snapped: true, segmentIndex: snap.segmentIndex, distance: snap.distance }); return; }
          }
          roadGeoEditor.setEndPoint(newPoint);
          return;
        }
        return;
      }

      // Manual drawing mode
      if (!editingBranchId) return;

      const branch = branches.find(b => b.id === editingBranchId);
      const branchCoords: [number, number][] = (branch?.geometry as any)?.coordinates || [];

      // If already building multi-point, just add
      if (drawingPoints.length > 0) {
        setDrawingPoints(prev => [...prev, newPoint]);
        return;
      }

      // If branch has no geometry, start fresh
      if (branchCoords.length === 0) {
        setDrawingPoints([newPoint]);
        return;
      }

      // Snap and extend endpoint
      const dStart = calculateDistance(newPoint[0], newPoint[1], branchCoords[0][0], branchCoords[0][1]);
      const dEnd = calculateDistance(newPoint[0], newPoint[1], branchCoords[branchCoords.length - 1][0], branchCoords[branchCoords.length - 1][1]);
      const snap = snapToExistingRoad(newPoint, mergedRoadSegments, SNAP_THRESHOLD_METERS);
      const snappedPoint: [number, number] = snap.snapped ? snap.point : newPoint;

      if (dEnd <= dStart) {
        updateBranchGeometry(editingBranchId, { coordinates: [...branchCoords, snappedPoint] });
      } else {
        updateBranchGeometry(editingBranchId, { coordinates: [snappedPoint, ...branchCoords] });
      }
    };

    const handleDblClick = () => {
      if (!editingBranchId || drawingPoints.length < 2) return;
      completeDrawing();
    };

    map.on('click', handleClick);
    map.on('dblclick', handleDblClick);
    return () => { map.off('click', handleClick); map.off('dblclick', handleDblClick); };
  }, [editingBranchId, drawingPoints.length, branches, mergedRoadSegments, roadGeoEditor.state.isActive, roadGeoEditor.state.phase]);

  // Cancel editing — revert to original geometry
  const cancelEditing = useCallback(() => {
    if (editingBranchId && originalGeometryRef.current) {
      updateBranchGeometry(editingBranchId, originalGeometryRef.current);
      toast.info('Muokkaus peruutettu');
    }
    originalGeometryRef.current = null;
    setDrawingPoints([]);
    setEditingBranchId(null);
  }, [editingBranchId, updateBranchGeometry]);

  // Confirm editing — accept current state
  const confirmEditing = useCallback(() => {
    if (editingBranchId && drawingPoints.length >= 2) {
      // Complete multi-point drawing first
      const branch = branches.find(b => b.id === editingBranchId);
      const existingCoords: [number, number][] = (branch?.geometry as any)?.coordinates || [];
      let newCoords: [number, number][];
      if (existingCoords.length >= 2) {
        const firstDrawn = drawingPoints[0];
        const dStart = calculateDistance(firstDrawn[0], firstDrawn[1], existingCoords[0][0], existingCoords[0][1]);
        const dEnd = calculateDistance(firstDrawn[0], firstDrawn[1], existingCoords[existingCoords.length - 1][0], existingCoords[existingCoords.length - 1][1]);
        newCoords = dEnd <= dStart ? [...existingCoords, ...drawingPoints] : [...drawingPoints.reverse(), ...existingCoords];
      } else {
        newCoords = [...drawingPoints];
      }
      updateBranchGeometry(editingBranchId, { coordinates: newCoords });
    }
    originalGeometryRef.current = null;
    toast.success('Tielinja tallennettu');
    setDrawingPoints([]);
    setEditingBranchId(null);
  }, [editingBranchId, drawingPoints, branches, updateBranchGeometry]);

  // Complete drawing (multi-point sequence via double-click)
  const completeDrawing = useCallback(() => {
    if (!editingBranchId || drawingPoints.length < 2) return;
    const branch = branches.find(b => b.id === editingBranchId);
    const existingCoords: [number, number][] = (branch?.geometry as any)?.coordinates || [];

    let newCoords: [number, number][];
    if (existingCoords.length >= 2) {
      const firstDrawn = drawingPoints[0];
      const dStart = calculateDistance(firstDrawn[0], firstDrawn[1], existingCoords[0][0], existingCoords[0][1]);
      const dEnd = calculateDistance(firstDrawn[0], firstDrawn[1], existingCoords[existingCoords.length - 1][0], existingCoords[existingCoords.length - 1][1]);
      newCoords = dEnd <= dStart ? [...existingCoords, ...drawingPoints] : [...drawingPoints.reverse(), ...existingCoords];
    } else {
      newCoords = [...drawingPoints];
    }

    updateBranchGeometry(editingBranchId, { coordinates: newCoords });
    setDrawingPoints([]);
    // Stay in edit mode — user can continue editing vertices or press Valmis/Enter
  }, [editingBranchId, drawingPoints, branches, updateBranchGeometry]);

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isEditing) return;
      if (e.key === 'Escape') {
        cancelEditing();
      } else if (e.key === 'Enter') {
        if (drawingPoints.length >= 2) {
          completeDrawing();
        } else {
          confirmEditing();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && drawingPoints.length > 0) {
        e.preventDefault();
        setDrawingPoints(prev => prev.slice(0, -1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, drawingPoints, completeDrawing, confirmEditing, cancelEditing]);

  // Render user location
  useEffect(() => {
    const layer = userLocationLayerRef.current;
    layer.clearLayers();
    if (!geolocation.position) return;

    const [lat, lng] = geolocation.position;
    const accuracy = geolocation.accuracy || 30;
    L.circle([lat, lng], { radius: accuracy, color: 'hsl(215 100% 50%)', fillColor: 'hsl(215 100% 50%)', fillOpacity: 0.1, weight: 1, interactive: false }).addTo(layer);
    const dotSize = 16;
    const userIcon = L.divIcon({
      html: `<div style="width:${dotSize}px;height:${dotSize}px;background:hsl(215,100%,50%);border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
      className: 'user-location-marker',
      iconSize: [dotSize, dotSize],
      iconAnchor: [dotSize / 2, dotSize / 2],
    });
    L.marker([lat, lng], { icon: userIcon, interactive: false }).addTo(layer);
  }, [geolocation.position, geolocation.accuracy]);

  // Render road geometries — multi-pass rendering matching main map style
  useEffect(() => {
    const layer = roadLayerRef.current;
    layer.clearLayers();

    const allCoords: [number, number][] = [];
    const roadWeight = 10;

    // Collect all segment coordinate arrays and popup data for multi-pass rendering
    const segmentData: { coords: [number, number][]; branch: RoadBranch; isActive: boolean }[] = [];

    const drawnBranches = new Set<string>();
    branches.forEach(branch => {
      const geo = branch.geometry as any;
      if (!geo) return;
      const coords: [number, number][] = geo.coordinates?.length >= 2
        ? geo.coordinates
        : (geo.segments?.length > 0 && geo.segments[0]?.length >= 2 ? geo.segments[0] : []);
      if (coords.length < 2) return;
      drawnBranches.add(branch.id);
      allCoords.push(...coords);
      segmentData.push({ coords, branch, isActive: branch.id === activeBranchId });
    });

    branches.forEach(branch => {
      if (drawnBranches.has(branch.id)) return;
      const branchPoints = points.filter(p => p.branchId === branch.id).sort((a, b) => a.station - b.station);
      if (branchPoints.length < 2) return;
      const coords: [number, number][] = branchPoints.map(p => [p.latitude, p.longitude]);
      allCoords.push(...coords);
      segmentData.push({ coords, branch, isActive: branch.id === activeBranchId });
    });

    const inactiveSegments = segmentData.filter(s => !s.isActive);
    const allSegCoords = inactiveSegments.map(s => s.coords);

    // --- Pre-compute junctions for seamless visual merging ---
    const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.0003;
    const junctionMap = new Map<string, { point: [number, number]; dirs: { lat: number; lng: number }[] }>();

    for (let sIdx = 0; sIdx < allSegCoords.length; sIdx++) {
      const seg = allSegCoords[sIdx];
      if (seg.length < 2) continue;
      const endpoints = [
        { pt: seg[0], next: seg[1] },
        { pt: seg[seg.length - 1], next: seg[seg.length - 2] },
      ];
      for (const { pt, next } of endpoints) {
        for (let oIdx = 0; oIdx < allSegCoords.length; oIdx++) {
          if (oIdx === sIdx) continue;
          for (const ov of allSegCoords[oIdx]) {
            if (near(pt, ov)) {
              const key = `${pt[0].toFixed(6)},${pt[1].toFixed(6)}`;
              if (!junctionMap.has(key)) junctionMap.set(key, { point: pt, dirs: [] });
              const dLat = next[0] - pt[0];
              const dLng = next[1] - pt[1];
              const len = Math.hypot(dLat, dLng);
              if (len > 0) {
                const entry = junctionMap.get(key)!;
                const normalized = { lat: dLat / len, lng: dLng / len };
                if (!entry.dirs.some(d => Math.hypot(d.lat - normalized.lat, d.lng - normalized.lng) < 0.01)) {
                  entry.dirs.push(normalized);
                }
              }
              break;
            }
          }
        }
      }
    }

    const computeJunctionEdgePoints = (jp: [number, number], dirs: { lat: number; lng: number }[], halfWidth: number, stubMultiplier: number): [number, number][] => {
      const degPerMeterLat = 1 / 111320;
      const cosLat = Math.cos(jp[0] * Math.PI / 180);
      const degPerMeterLng = degPerMeterLat / cosLat;
      const stubDist = halfWidth * stubMultiplier;
      const pts: [number, number][] = [];
      for (const dir of dirs) {
        const perpLat = -dir.lng;
        const perpLng = dir.lat;
        const stubLat = jp[0] + dir.lat * stubDist * degPerMeterLat;
        const stubLng = jp[1] + dir.lng * stubDist * degPerMeterLng;
        const ofsLat = perpLat * halfWidth * degPerMeterLat;
        const ofsLng = perpLng * halfWidth * degPerMeterLng;
        pts.push([stubLat + ofsLat, stubLng + ofsLng]);
        pts.push([stubLat - ofsLat, stubLng - ofsLng]);
      }
      pts.sort((a, b) => Math.atan2(a[1] - jp[1], a[0] - jp[0]) - Math.atan2(b[1] - jp[1], b[0] - jp[0]));
      return pts;
    };

    const metersPerPixel = 156543.03 * Math.cos((allSegCoords[0]?.[0]?.[0] || 61) * Math.PI / 180) / Math.pow(2, currentZoomRef.current);
    const halfWidthMeters = (roadWeight / 2) * metersPerPixel;

    // PASS 1: All outlines
    allSegCoords.forEach(segCoords => {
      const latLngs = segCoords.map(c => L.latLng(c[0], c[1]));
      L.polyline(latLngs, { color: '#505050', weight: roadWeight, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(layer);
    });

    // PASS 2: Junction outline polygons
    junctionMap.forEach(({ point: jp, dirs }) => {
      if (dirs.length < 2) return;
      const edgePoints = computeJunctionEdgePoints(jp, dirs, halfWidthMeters, 2.5);
      L.polygon(edgePoints.map(p => L.latLng(p[0], p[1])), {
        color: '#505050', fillColor: '#505050', fillOpacity: 1, weight: 0, interactive: false,
      }).addTo(layer);
    });

    // PASS 3: All fills
    allSegCoords.forEach(segCoords => {
      const latLngs = segCoords.map(c => L.latLng(c[0], c[1]));
      L.polyline(latLngs, { color: '#888888', weight: roadWeight * 0.7, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(layer);
    });

    // PASS 3b: Connector lines between nearby segment endpoints
    if (allSegCoords.length > 1) {
      for (let i = 0; i < allSegCoords.length; i++) {
        const segA = allSegCoords[i];
        if (segA.length < 2) continue;
        const endpointsA = [segA[0], segA[segA.length - 1]];
        for (let j = i + 1; j < allSegCoords.length; j++) {
          const segB = allSegCoords[j];
          if (segB.length < 2) continue;
          const endpointsB = [segB[0], segB[segB.length - 1]];
          for (const epA of endpointsA) {
            for (const epB of endpointsB) {
              const dist = Math.hypot(epA[0] - epB[0], epA[1] - epB[1]);
              if (dist > 0.0000001 && dist < 0.0005) {
                const connCoords = [L.latLng(epA[0], epA[1]), L.latLng(epB[0], epB[1])];
                L.polyline(connCoords, { color: '#505050', weight: roadWeight, opacity: 1, lineCap: 'round', interactive: false }).addTo(layer);
                L.polyline(connCoords, { color: '#888888', weight: roadWeight * 0.7, opacity: 1, lineCap: 'round', interactive: false }).addTo(layer);
              }
            }
          }
        }
      }
    }

    // PASS 4: Junction fill polygons
    junctionMap.forEach(({ point: jp, dirs }) => {
      if (dirs.length < 2) return;
      const fillHalfWidth = halfWidthMeters * 0.7;
      const fillEdgePoints = computeJunctionEdgePoints(jp, dirs, fillHalfWidth, 2.5);
      L.polygon(fillEdgePoints.map(p => L.latLng(p[0], p[1])), {
        color: '#888888', fillColor: '#888888', fillOpacity: 1, weight: 0, interactive: false,
      }).addTo(layer);
    });

    // PASS 5: Center lines
    allSegCoords.forEach(segCoords => {
      const latLngs = segCoords.map(c => L.latLng(c[0], c[1]));
      L.polyline(latLngs, { color: '#ffffff', weight: Math.max(1, roadWeight * 0.15), opacity: 0.6, dashArray: '8, 12', interactive: false }).addTo(layer);
    });

    // PASS 6: Interactive hit areas with branch popups
    inactiveSegments.forEach(({ coords, branch }) => {
      const latLngs = coords.map(c => L.latLng(c[0], c[1]));
      const pointCount = points.filter(p => p.branchId === branch.id).length;
      const popupHtml = `
        <div style="font-family: sans-serif; font-size: 13px; line-height: 1.6;">
          <strong>🛣️ ${branch.name}</strong><br/>
          Tavoitekantavuus: ${branch.targetBearingCapacity} MN/m²<br/>
          Tien leveys: ${branch.roadWidth} m<br/>
          Mittauspisteitä: ${pointCount} kpl
        </div>
      `;
      const hitArea = L.polyline(latLngs, { color: 'transparent', weight: 24, opacity: 0, interactive: true }).addTo(layer);
      hitArea.bindPopup(popupHtml);
    });

    if (filteredPoints.length === 0 && mapInstanceRef.current && allCoords.length >= 2) {
      const bounds = L.latLngBounds(allCoords);
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [branches, points, filteredPoints.length, activeBranchId]);

  // Render edit layer (green line + vertex handles) when editing a branch
  useEffect(() => {
    const layer = editLayerRef.current;
    layer.clearLayers();

    if (!activeBranchId) return;

    const editBranch = branches.find(b => b.id === activeBranchId);
    const editCoords: [number, number][] = (editBranch?.geometry as any)?.coordinates || [];

    if (editCoords.length >= 2) {
      const editLatLngs = editCoords.map(c => L.latLng(c[0], c[1]));

      // Green polyline
      L.polyline(editLatLngs, { color: '#15803d', weight: 8, opacity: 0.5 }).addTo(layer);
      L.polyline(editLatLngs, { color: '#22C55E', weight: 6, opacity: 0.9 }).addTo(layer);

      // Clickable invisible line to add vertices
      const clickableLine = L.polyline(editLatLngs, { color: 'transparent', weight: 18, opacity: 0 }).addTo(layer);
      clickableLine.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        const clickPoint: [number, number] = [e.latlng.lat, e.latlng.lng];
        let bestIdx = 1, bestDist = Infinity;
        for (let i = 0; i < editCoords.length - 1; i++) {
          const proj = projectPointOnSegment(clickPoint, editCoords[i], editCoords[i + 1]);
          const dist = Math.hypot(clickPoint[0] - proj[0], clickPoint[1] - proj[1]);
          if (dist < bestDist) { bestDist = dist; bestIdx = i + 1; }
        }
        const newCoords = [...editCoords];
        newCoords.splice(bestIdx, 0, clickPoint);
        updateBranchGeometry(activeBranchId, { coordinates: newCoords });
      });

      // Vertex handles
      const vertexSize = 14;
      const canDelete = editCoords.length > 2;

      const isEndpointSnapped = (coord: [number, number], branchId: string): boolean => {
        for (const otherBranch of branches) {
          if (otherBranch.id === branchId) continue;
          const otherCoords: [number, number][] = (otherBranch.geometry as any)?.coordinates || [];
          if (otherCoords.length < 2) continue;
          for (const oc of otherCoords) {
            if (Math.hypot(coord[0] - oc[0], coord[1] - oc[1]) < 0.0003) return true;
          }
        }
        return false;
      };

      editCoords.forEach((coord, idx) => {
        const isEndpoint = idx === 0 || idx === editCoords.length - 1;
        let bg: string;
        if (isEndpoint) {
          bg = isEndpointSnapped(coord, activeBranchId) ? '#3B82F6' : '#F97316';
        } else {
          bg = '#22C55E';
        }

        const vertexIcon = L.divIcon({
          html: `<div style="width:${vertexSize}px;height:${vertexSize}px;background:${bg};border:2px solid white;border-radius:50%;cursor:grab;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
          className: 'vertex-handle',
          iconSize: [vertexSize, vertexSize],
          iconAnchor: [vertexSize / 2, vertexSize / 2],
        });
        const vertexMarker = L.marker(coord, { icon: vertexIcon, draggable: true, zIndexOffset: 1000 }).addTo(layer);

        vertexMarker.on('dragend', (e: any) => {
          const newLatLng = e.target.getLatLng();
          let finalPoint: [number, number] = [newLatLng.lat, newLatLng.lng];
          if (isEndpoint) {
            const snap = snapToExistingRoad(finalPoint, mergedRoadSegments, SNAP_THRESHOLD_METERS);
            if (snap.snapped) finalPoint = snap.point;
          }
          const newCoords = [...editCoords];
          newCoords[idx] = finalPoint;
          updateBranchGeometry(activeBranchId, { coordinates: newCoords });
        });

        vertexMarker.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          if (!canDelete || isEndpoint) return;
          const newCoords = editCoords.filter((_, i) => i !== idx);
          updateBranchGeometry(activeBranchId, { coordinates: newCoords });
        });
      });
    }

    // Drawing points preview
    if (drawingPoints.length > 0) {
      const coords = drawingPoints.map(c => L.latLng(c[0], c[1]));
      if (drawingPoints.length >= 2) {
        L.polyline(coords, { color: '#22C3F3', weight: 4, opacity: 0.8, dashArray: '8, 8' }).addTo(layer);
      }
      drawingPoints.forEach(point => {
        L.circleMarker(point, { radius: 6, color: '#22C3F3', fillColor: '#ffffff', fillOpacity: 1, weight: 2 }).addTo(layer);
      });
    }

    // Google editor markers (start/end points)
    if (roadGeoEditor.state.isActive && roadGeoEditor.state.startPoint) {
      const sp = roadGeoEditor.state.startPoint;
      L.circleMarker(sp, { radius: 8, color: '#22C55E', fillColor: '#22C55E', fillOpacity: 0.8, weight: 2 }).addTo(layer);
    }
    if (roadGeoEditor.state.isActive && roadGeoEditor.state.endPoint) {
      const ep = roadGeoEditor.state.endPoint;
      L.circleMarker(ep, { radius: 8, color: '#EF4444', fillColor: '#EF4444', fillOpacity: 0.8, weight: 2 }).addTo(layer);
    }
  }, [activeBranchId, branches, drawingPoints, mergedRoadSegments, updateBranchGeometry, roadGeoEditor.state]);

  // Locate me
  const handleLocateMe = useCallback(() => {
    geolocation.getCurrentPosition();
    const check = setInterval(() => {
      if (geolocation.position && mapInstanceRef.current) {
        clearInterval(check);
        const [lat, lng] = geolocation.position;
        const accuracy = geolocation.accuracy || 200;
        const bounds = L.latLng(lat, lng).toBounds(Math.max(accuracy * 4, 500));
        mapInstanceRef.current.fitBounds(bounds, { maxZoom: 16, animate: true });
      }
    }, 100);
    setTimeout(() => clearInterval(check), 15000);
  }, [geolocation]);

  // Update markers (measurement points) — HIDDEN during edit mode
  useEffect(() => {
    const layer = markersLayerRef.current;
    layer.clearLayers();
    const map = mapInstanceRef.current;
    if (!map || filteredPoints.length === 0 || isEditing) return;

    const latLngs: L.LatLng[] = [];

    filteredPoints.forEach(point => {
      const branch = branchMap[point.branchId];
      if (!branch) return;

      const target = branch.targetBearingCapacity;
      const diff = point.measuredValue - target;
      const fillColor = getPointColor(diff);
      const label = getPointLabel(diff);

      const circleMarker = L.circleMarker([point.latitude, point.longitude], {
        color: '#000000', fillColor, radius: 7, fillOpacity: 1.0, weight: 2,
      });

      circleMarker.bindPopup(`
        <div style="font-family: sans-serif; font-size: 13px; line-height: 1.5;">
          <strong>${branch.name}</strong><br/>
          <span style="display:inline-flex;align-items:center;gap:4px;">
            <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="${fillColor}" stroke="#000" stroke-width="1.5"/></svg>
            ${label}
          </span><br/>
          Paalu: ${point.station} m<br/>
          Kantavuus: <strong>${point.measuredValue}</strong> MN/m²<br/>
          Tavoite: ${target} MN/m²<br/>
          Erotus: ${diff > 0 ? '+' : ''}${diff.toFixed(1)} MN/m²<br/>
          <span style="color: #666; font-size: 11px;">
            ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}
          </span>
        </div>
      `);
      circleMarker.addTo(layer);
      latLngs.push(L.latLng(point.latitude, point.longitude));
    });

    if (latLngs.length > 0) {
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [filteredPoints, branchMap, isEditing]);

  // Render repair segments from mass calculation
  useEffect(() => {
    const layer = repairLayerRef.current;
    layer.clearLayers();
    if (!mapInstanceRef.current || mapSegments.length === 0 || isEditing) return;

    for (const seg of mapSegments) {
      if (seg.coordinates.length < 2) continue;
      const polyline = L.polyline(seg.coordinates as [number, number][], {
        color: '#ff3333', weight: 8, opacity: 0.7, lineCap: 'butt',
      });
      polyline.bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; line-height: 1.6;">
          <strong>${seg.branchName} – Korjausjakso #${seg.segmentId}</strong><br/>
          <span style="color: #666;">${seg.interval}</span><br/>
          KaM 0/32: ${seg.thickness32mm.toFixed(2)} mm · ${seg.volume32.toFixed(2)} m³ · ${seg.weight32.toFixed(2)} tn<br/>
          ${seg.thickness56mm > 0 ? `KaM 0/56: ${seg.thickness56mm.toFixed(2)} mm · ${seg.volume56.toFixed(2)} m³ · ${seg.weight56.toFixed(2)} tn<br/>` : ''}
          ${seg.geoArea > 0 ? `Suodatinkangas: ${seg.geoArea.toFixed(2)} m²<br/>` : ''}
        </div>
      `);
      polyline.addTo(layer);
    }
  }, [mapSegments, isEditing]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />

      {/* Map controls overlay - top right */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
        <MapLocateButton onClick={handleLocateMe} hasPosition={!!geolocation.position} />
      </div>

      {/* Editing toolbar - top center */}
      {isEditing && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-card/95 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg border border-border">
          <span className="text-xs font-semibold text-foreground/70 mr-1">
            {branches.find(b => b.id === activeBranchId)?.name || 'Muokkaus'}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8"
            onClick={cancelEditing}
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Peruuta
          </Button>
          <Button
            size="sm"
            className="text-xs h-8"
            onClick={confirmEditing}
          >
            <Check className="w-3.5 h-3.5 mr-1" />
            Valmis
          </Button>
        </div>
      )}

      {/* Basemap & branch filter overlay - top left */}
      <div className="absolute top-4 left-[68px] z-[1000] flex items-start gap-2">
        <Button
          variant="secondary"
          size="icon"
          className="shadow-lg w-11 h-11 shrink-0"
          onClick={() => { setShowLayerPicker(prev => !prev); setShowBranchPicker(false); }}
        >
          {showLayerPicker ? <X className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
        </Button>

        {branches.length > 0 && !isEditing && (
          <Button
            variant="secondary"
            size="icon"
            className={cn("shadow-lg w-11 h-11 shrink-0", selectedBranchId && "bg-primary text-primary-foreground hover:bg-primary/90")}
            onClick={() => { setShowBranchPicker(prev => !prev); setShowLayerPicker(false); }}
          >
            {showBranchPicker ? <X className="w-5 h-5" /> : <Filter className="w-5 h-5" />}
          </Button>
        )}
      </div>

      {/* Layer picker dropdown */}
      {showLayerPicker && (
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setShowLayerPicker(false)} />
          <div className="absolute top-[68px] left-[68px] z-[1000] bg-card rounded-md shadow-lg border border-border overflow-hidden min-w-[160px]">
            <div className="px-3 py-2 text-[10px] font-bold text-foreground/60 uppercase tracking-widest bg-muted/50 border-b border-border">
              Taustakartta
            </div>
            <div className="p-1">
              {basemapOptions.map(option => (
                <button
                  key={option.id}
                  onClick={() => { setBasemap(option.id); setShowLayerPicker(false); }}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-3 py-2.5 rounded text-sm font-semibold transition-all duration-150",
                    basemap === option.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground/80 hover:text-foreground"
                  )}
                >
                  <option.icon className="w-4 h-4" />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Branch picker dropdown */}
      {showBranchPicker && (
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setShowBranchPicker(false)} />
          <div className="absolute top-[68px] left-[124px] z-[1000] bg-card rounded-md shadow-lg border border-border overflow-hidden min-w-[180px]">
            <div className="px-3 py-2 text-[10px] font-bold text-foreground/60 uppercase tracking-widest bg-muted/50 border-b border-border">
              Suodata haaralla
            </div>
            <div className="p-1">
              <button
                onClick={() => { setSelectedBranchId(null); setShowBranchPicker(false); }}
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-2.5 rounded text-sm font-semibold transition-all duration-150",
                  !selectedBranchId
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground/80 hover:text-foreground"
                )}
              >
                Kaikki haarat
              </button>
              {branches.map(b => (
                <button
                  key={b.id}
                  onClick={() => { setSelectedBranchId(b.id); setShowBranchPicker(false); }}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-3 py-2.5 rounded text-sm font-semibold transition-all duration-150",
                    selectedBranchId === b.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground/80 hover:text-foreground"
                  )}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Legend overlay - bottom left (hidden during editing) */}
      {!isEditing && (
        <div className="absolute bottom-8 left-3 z-[1000] bg-background/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md border border-border">
          <div className="flex flex-col gap-1 text-xs">
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#00ff00" stroke="#000" strokeWidth="2"/></svg>
              Hyvä (&gt;10 yli)
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#ffff00" stroke="#000" strokeWidth="2"/></svg>
              Tyydyttävä (0–10 yli)
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#ff0000" stroke="#000" strokeWidth="2"/></svg>
              Heikko (0–20 ali)
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#c70202" stroke="#000" strokeWidth="2"/></svg>
              Huono (20–40 ali)
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#9c0202" stroke="#000" strokeWidth="2"/></svg>
              Erittäin heikko (&gt;40 ali)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
