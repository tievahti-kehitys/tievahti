import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as turf from '@turf/turf';
import { snapToExistingRoad, SNAP_THRESHOLD_METERS } from '@/lib/roadGeometryHelpers';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@/lib/leafletPolylineOffset'; // Adds offset support to L.Polyline
import { Pencil, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useBearingCapacityContext } from '@/context/BearingCapacityContext';
import { useProject } from '@/context/ProjectContext';
import { useCatalog, CatalogItem } from '@/context/CatalogContext';
import { useForestMode } from '@/context/ForestModeContext';
import { useRoadGeoEditor } from '@/context/RoadGeometryEditorContext';
import { useCategoryFilter } from '@/context/CategoryFilterContext';
import { useItemClassification } from '@/context/ItemClassificationContext';
import { MapToolbar } from './MapToolbar';
import { MapLocateButton } from './MapLocateButton';
import { ProductEditorDialog } from '../dialogs/ProductEditorDialog';
import { AddProductDialog } from '../dialogs/AddProductDialog';
import { CategoryAssignmentDialog } from '../dialogs/CategoryAssignmentDialog';
import { ForestModeOverlay } from '../forest-mode/ForestModeOverlay';
import { ForestModeLayerPicker } from '../forest-mode/ForestModeLayerPicker';
import { ForestModeToggle } from '../forest-mode/ForestModeToggle';
import { extractRoadSegment } from '@/lib/roadGeometryUtils';
import { v4 as uuidv4 } from 'uuid';
import { ProductInstance, RoadGeometry } from '@/types/project';
import { cn } from '@/lib/utils';
import { resolveMarkerImage } from '@/assets/markers';
import { getFillIconSvg } from '@/lib/fillIconSvg';
import { useChildCompositions } from '@/hooks/useChildCompositions';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { useGeolocation } from '@/hooks/useGeolocation';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

type BasemapType = 'peruskartta' | 'maastokartta' | 'ortokuva';
export type DrawingMode = 'none' | 'point' | 'line' | 'polygon' | 'road' | 'road-edit' | 'road-product' | 'area-delete';

type RoadSnap = { point: [number, number]; segIndex: number; t: number };

// Working tile layers (no API key required)
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

// Tile layer performance options for smooth mobile experience
const getTileOptions = (isMobile: boolean): L.TileLayerOptions => ({
  keepBuffer: isMobile ? 4 : 2, // Keep more tiles in buffer
  updateWhenIdle: false, // Update immediately
  updateWhenZooming: false, // Don't update during pinch-zoom
  tileSize: 256,
  zoomOffset: 0,
  detectRetina: true, // Better quality on high-DPI screens
  crossOrigin: 'anonymous',
});

export function MapContainer() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layersRef = useRef<L.LayerGroup>(L.layerGroup());
  const userLocationLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const currentZoomRef = useRef(7);
  const [zoomRenderTick, setZoomRenderTick] = useState(0);
  const isMobile = useIsMobile();
  const hasFittedToRoadRef = useRef<string | null>(null);
  const geolocation = useGeolocation({ enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });

  const [basemap, setBasemap] = useState<BasemapType>('peruskartta');
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('none');
  const [showCadastre, setShowCadastre] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [roadProductSnaps, setRoadProductSnaps] = useState<RoadSnap[]>([]);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  
  const forestMode = useForestMode();
  const roadGeoEditor = useRoadGeoEditor();

  // Dialogs
  const [showProductEditor, setShowProductEditor] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [pendingProductGeometry, setPendingProductGeometry] = useState<ProductInstance['geometry'] | null>(null);
  const [showCategoryAssignment, setShowCategoryAssignment] = useState(false);
  const [pendingCategoryPolygon, setPendingCategoryPolygon] = useState<[number, number][] | null>(null);

  const { project, allProducts, addProduct, updateProduct, removeProduct, setRoadGeometry, selectedProductId, setSelectedProductId } = useProject();
  const { items } = useCatalog();
  const { filter, categories } = useCategoryFilter();
  const itemClassification = useItemClassification();
  const { branches: bearingBranches, points: bearingPoints, mergedRoadSegments, updateBranchGeometry } = useBearingCapacityContext();

  // Listen for drawing mode change events from ProjectPanel
  useEffect(() => {
    const handler = (e: Event) => {
      const mode = (e as CustomEvent).detail?.mode as DrawingMode;
      if (!mode) return;
      setDrawingMode(mode);
    };
    window.addEventListener('drawing-mode-change', handler);
    return () => window.removeEventListener('drawing-mode-change', handler);
  }, []);

  // Listen for branch-road-edit events from BranchManager
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.action === 'stop') {
        setEditingBranchId(null);
        setDrawingPoints([]);
        setDrawingMode('none');
        return;
      }
      if (!detail?.branchId) return;
      if (detail.action === 'draw') {
        setEditingBranchId(detail.branchId);
        setDrawingPoints([]);
        setDrawingMode('road-edit');
      } else if (detail.action === 'google') {
        // Set editing branch for visual mode but don't set drawingMode
        // (Google flow uses roadGeoEditor context)
        setEditingBranchId(detail.branchId);
      }
    };
    window.addEventListener('branch-road-edit', handler);
    return () => window.removeEventListener('branch-road-edit', handler);
  }, []);
  
  // Helper to get catalog item by ID
  const getItemById = (id: string): CatalogItem | undefined => {
    return items.find(item => item.id === id);
  };

  // Collect parent IDs for line products (operations) to fetch child compositions
  const parentItemIds = useMemo(() => {
    return allProducts
      .filter(p => p.visible && p.geometry.type === 'line')
      .map(p => p.productDefinitionId)
      .filter((id, i, arr) => arr.indexOf(id) === i); // unique
  }, [allProducts]);

  // Fetch child compositions for all visible line products
  const { data: compositionsMap } = useChildCompositions(parentItemIds);

  // Initialize map with mobile-optimized settings
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      maxZoom: 22,
      center: [61.5, 24.0],
      zoom: 7,
      zoomControl: !isMobile, // Hide default zoom control on mobile
      tap: true, // Enable tap for mobile
      tapTolerance: 15, // More tolerant tapping for mobile
      touchZoom: true,
      bounceAtZoomLimits: false, // Smoother zoom on mobile
    });

    // Create custom panes for product render order (z-index layering)
    // Pane zIndex values: tilePane=200, overlayPane=400, markerPane=600
    map.createPane('productsBehind');
    map.getPane('productsBehind')!.style.zIndex = '350'; // behind road overlayPane
    map.createPane('productsNormal');
    map.getPane('productsNormal')!.style.zIndex = '450'; // default – above roads
    map.createPane('productsAbove');
    map.getPane('productsAbove')!.style.zIndex = '500';
    map.createPane('productsTop');
    map.getPane('productsTop')!.style.zIndex = '550';

    // Add mobile-positioned zoom control
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

    layersRef.current.addTo(map);
    userLocationLayerRef.current.addTo(map);
    mapInstanceRef.current = map;

    // Start watching geolocation for persistent marker
    geolocation.getCurrentPosition();
    // Track zoom changes for dynamic styling
    map.on('zoomend', () => {
      currentZoomRef.current = map.getZoom();
      // Force re-render of layers so dynamic stroke widths/offsets update
      setZoomRenderTick(t => t + 1);
    });

    // Fix for mobile: invalidate size after layout settles
    // This ensures tiles load in correct position when container size changes
    const invalidateTimer = setTimeout(() => {
      map.invalidateSize();
    }, 100);

    // Also handle window resize events
    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);

    // Use ResizeObserver to detect container size changes (e.g. sidebar toggle, forest mode)
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    if (mapRef.current) {
      resizeObserver.observe(mapRef.current);
    }

    return () => {
      clearTimeout(invalidateTimer);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

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

  // Auto-fit map to branch geometries when project changes
  useEffect(() => {
    if (!mapInstanceRef.current || mergedRoadSegments.length === 0) return;
    const allCoords = mergedRoadSegments.flat();
    if (allCoords.length < 2) return;
    const fitKey = project?.id || '';
    if (hasFittedToRoadRef.current === fitKey) return;
    hasFittedToRoadRef.current = fitKey;

    const bounds = L.latLngBounds(allCoords.map(c => L.latLng(c[0], c[1])));
    mapInstanceRef.current.fitBounds(bounds, {
      padding: [60, 60],
      maxZoom: 16,
      animate: true,
    });
  }, [project?.id, mergedRoadSegments]);

  // Render user location marker on map
  useEffect(() => {
    const layer = userLocationLayerRef.current;
    layer.clearLayers();

    if (!geolocation.position) return;

    const [lat, lng] = geolocation.position;
    const accuracy = geolocation.accuracy || 30;

    // Accuracy circle
    L.circle([lat, lng], {
      radius: accuracy,
      color: 'hsl(215 100% 50%)',
      fillColor: 'hsl(215 100% 50%)',
      fillOpacity: 0.1,
      weight: 1,
      interactive: false,
    }).addTo(layer);

    // User dot
    const dotSize = 16;
    const userIcon = L.divIcon({
      html: `<div style="width:${dotSize}px;height:${dotSize}px;background:hsl(215,100%,50%);border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
      className: 'user-location-marker',
      iconSize: [dotSize, dotSize],
      iconAnchor: [dotSize / 2, dotSize / 2],
    });
    L.marker([lat, lng], { icon: userIcon, interactive: false }).addTo(layer);
  }, [geolocation.position, geolocation.accuracy]);

  // Handle "locate me" button
  const handleLocateMe = useCallback(() => {
    geolocation.getCurrentPosition();
    const check = setInterval(() => {
      if (geolocation.position && mapInstanceRef.current) {
        clearInterval(check);
        const [lat, lng] = geolocation.position;
        const accuracy = geolocation.accuracy || 200;
        const bounds = L.latLng(lat, lng).toBounds(Math.max(accuracy * 4, 500));
        mapInstanceRef.current.fitBounds(bounds, {
          maxZoom: 16,
          animate: true,
        });
      }
    }, 100);
    setTimeout(() => clearInterval(check), 15000);
  }, [geolocation]);

  // Handle basemap change with mobile-optimized tile options
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    
    // Remove old layer and add new one
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

  // Handle cursor change for drawing mode and road geo editor
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const container = mapInstanceRef.current.getContainer();
    const isPlacing = roadGeoEditor.state.phase === 'PLACING_START' || roadGeoEditor.state.phase === 'PLACING_END';
    const isGoogleEdit = roadGeoEditor.state.isActive && roadGeoEditor.state.targetBranchId;
    container.style.cursor = (drawingMode !== 'none' || isPlacing || isGoogleEdit) ? 'crosshair' : '';
  }, [drawingMode, roadGeoEditor.state.phase]);

  // Snap click to nearest position on road (uses merged branch geometries)
  const snapToRoad = useCallback(
    (clickPoint: [number, number]): RoadSnap | null => {
      if (mergedRoadSegments.length === 0) return null;
      const coords = mergedRoadSegments.flat() as [number, number][];
      if (!coords.length) return null;
      return snapPointToPolyline(clickPoint, coords);
    },
    [mergedRoadSegments]
  );

  // Extract the road polyline segment between two snapped positions
  const getRoadSegmentBetweenSnaps = useCallback(
    (start: RoadSnap, end: RoadSnap): [number, number][] => {
      if (mergedRoadSegments.length === 0) return [start.point, end.point];
      const coords = mergedRoadSegments.flat() as [number, number][];
      if (!coords.length) return [start.point, end.point];
      return slicePolylineBetweenSnaps(coords, start, end);
    },
    [mergedRoadSegments]
  );

  // Area delete handler: find items inside polygon and delete with confirmation
  const handleAreaDelete = useCallback((polygonPoints: [number, number][]) => {
    if (!allProducts || allProducts.length === 0) return;

    const closedRing = [...polygonPoints, polygonPoints[0]];
    // Convert to GeoJSON [lng, lat] format
    const polyCoords = closedRing.map(([lat, lng]) => [lng, lat] as [number, number]);
    const turfPoly = turf.polygon([polyCoords]);

    const itemsToDelete: string[] = [];

    for (const product of allProducts) {
      if (product.geometry.type === 'point') {
        const [lat, lng] = product.geometry.coordinates;
        const pt = turf.point([lng, lat]);
        if (turf.booleanPointInPolygon(pt, turfPoly)) {
          itemsToDelete.push(product.id);
        }
      } else if (product.geometry.type === 'line') {
        const lineCoords = product.geometry.coordinates;
        if (lineCoords.length < 2) continue;
        // Check if midpoint or any point is inside
        const geoCoords = lineCoords.map(([lat, lng]) => [lng, lat] as [number, number]);
        const anyInside = geoCoords.some(c => turf.booleanPointInPolygon(turf.point(c), turfPoly));
        if (anyInside) {
          itemsToDelete.push(product.id);
        }
      } else if (product.geometry.type === 'polygon') {
        const coords = product.geometry.coordinates;
        if (coords.length < 3) continue;
        const geoCoords = coords.map(([lat, lng]) => [lng, lat] as [number, number]);
        const centroid = turf.centroid(turf.polygon([[...geoCoords, geoCoords[0]]]));
        if (turf.booleanPointInPolygon(centroid, turfPoly)) {
          itemsToDelete.push(product.id);
        }
      }
    }

    if (itemsToDelete.length === 0) {
      toast.info('Alueelta ei löytynyt toimenpiteitä poistettavaksi');
      return;
    }

    // Show confirmation
    const confirmed = window.confirm(
      `Haluatko poistaa ${itemsToDelete.length} toimenpide${itemsToDelete.length > 1 ? 'ttä' : 'en'} valitulta alueelta?`
    );

    if (confirmed) {
      itemsToDelete.forEach(id => removeProduct(id));
      toast.success(`${itemsToDelete.length} toimenpide${itemsToDelete.length > 1 ? 'ttä' : ''} poistettu`);
    }
  }, [allProducts, removeProduct]);

  // Complete drawing function - defined before the click handler that uses it
  const completeDrawing = useCallback(() => {
    if ((drawingMode === 'road' || drawingMode === 'road-edit') && editingBranchId && drawingPoints.length >= 2) {
      const branch = bearingBranches.find(b => b.id === editingBranchId);
      const existingCoords: [number, number][] = (branch?.geometry as any)?.coordinates || [];

      let newCoords: [number, number][];
      if (existingCoords.length >= 2) {
        const firstDrawn = drawingPoints[0];
        const dStart = calculateDistance(firstDrawn[0], firstDrawn[1], existingCoords[0][0], existingCoords[0][1]);
        const dEnd = calculateDistance(firstDrawn[0], firstDrawn[1], existingCoords[existingCoords.length - 1][0], existingCoords[existingCoords.length - 1][1]);
        if (dEnd <= dStart) {
          newCoords = [...existingCoords, ...drawingPoints];
        } else {
          newCoords = [...drawingPoints.reverse(), ...existingCoords];
        }
      } else {
        newCoords = [...drawingPoints];
      }

      updateBranchGeometry(editingBranchId, { coordinates: newCoords });
      toast.success(`Tielinja päivitetty (${newCoords.length} pistettä)`);
      setEditingBranchId(null);
      window.dispatchEvent(new CustomEvent('branch-edit-done'));
    } else if (drawingMode === 'line' && drawingPoints.length >= 2) {
      setPendingProductGeometry({ type: 'line', coordinates: drawingPoints });
      setShowAddProduct(true);
    } else if (drawingMode === 'polygon' && drawingPoints.length >= 3) {
      const closedRing: [number, number][] = [...drawingPoints, drawingPoints[0]];
      setPendingCategoryPolygon(closedRing);
      setShowCategoryAssignment(true);
    } else if (drawingMode === 'area-delete' && drawingPoints.length >= 3) {
      handleAreaDelete(drawingPoints);
    }

    setDrawingPoints([]);
    setDrawingMode('none');
  }, [drawingMode, drawingPoints, editingBranchId, bearingBranches, updateBranchGeometry, handleAreaDelete]);

  // Handle map click for drawing (normal mode and forest mode)
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
            if (snap.snapped) {
              roadGeoEditor.setStartPoint(snap.point, { snapped: true, segmentIndex: snap.segmentIndex, distance: snap.distance });
              return;
            }
          }
          roadGeoEditor.setStartPoint(newPoint);
          return;
        }
        if (roadGeoEditor.state.phase === 'PLACING_END') {
          if (mergedRoadSegments.length > 0) {
            const snap = snapToExistingRoad(newPoint, mergedRoadSegments, SNAP_THRESHOLD_METERS);
            if (snap.snapped) {
              roadGeoEditor.setEndPoint(snap.point, { snapped: true, segmentIndex: snap.segmentIndex, distance: snap.distance });
              return;
            }
          }
          roadGeoEditor.setEndPoint(newPoint);
          return;
        }
      }

      // Forest Mode click handling
      if (forestMode.state.isActive) {
        if (forestMode.state.phase === 'ADD_LOCAL_POINT') {
          forestMode.setPendingPoint(newPoint);
        } else if (forestMode.state.phase === 'ADD_INTERVAL_LINE') {
          forestMode.addSegmentPoint(newPoint);
        }
        return;
      }
      
      // Normal mode click handling
      if (drawingMode === 'none') return;

      if (drawingMode === 'road-edit') {
        if (!editingBranchId) return;

        const branch = bearingBranches.find(b => b.id === editingBranchId);
        const branchCoords: [number, number][] = (branch?.geometry as any)?.coordinates || [];

        // If already building a multi-point sequence, just add
        if (drawingPoints.length > 0) {
          setDrawingPoints(prev => [...prev, newPoint]);
          return;
        }

        // If branch has no geometry, start fresh
        if (branchCoords.length === 0) {
          setDrawingPoints([newPoint]);
          return;
        }

        // Snap click to nearest endpoint and extend
        const dStart = calculateDistance(newPoint[0], newPoint[1], branchCoords[0][0], branchCoords[0][1]);
        const dEnd = calculateDistance(newPoint[0], newPoint[1], branchCoords[branchCoords.length - 1][0], branchCoords[branchCoords.length - 1][1]);

        // Try snapping to other branches
        const snap = snapToExistingRoad(newPoint, mergedRoadSegments, SNAP_THRESHOLD_METERS);
        const snappedPoint: [number, number] = snap.snapped ? snap.point : newPoint;

        if (dEnd <= dStart) {
          updateBranchGeometry(editingBranchId, { coordinates: [...branchCoords, snappedPoint] });
        } else {
          updateBranchGeometry(editingBranchId, { coordinates: [snappedPoint, ...branchCoords] });
        }
        return;
      }

      if (drawingMode === 'point') {
        setPendingProductGeometry({ type: 'point', coordinates: newPoint });
        setShowAddProduct(true);
        setDrawingMode('none');
      } else if (drawingMode === 'road-product') {
        // Snap to road
        const snapped = snapToRoad(newPoint);
        if (!snapped) {
          alert('Piirrä ensin tie kartalle!');
          return;
        }

        setRoadProductSnaps(prev => {
          const updated = [...prev, snapped];
          if (updated.length === 2) {
            // Complete the road product
            const segment = getRoadSegmentBetweenSnaps(updated[0], updated[1]);
            setPendingProductGeometry({ type: 'line', coordinates: segment });
            setShowAddProduct(true);
            setDrawingMode('none');
            return [];
          }
          return updated;
        });
      } else {
        setDrawingPoints(prev => [...prev, newPoint]);
      }
    };

    // Handle double-click/double-tap to complete drawing on mobile
    const handleDblClick = () => {
      if (forestMode.state.isActive) return;
      if (drawingMode === 'road-edit') {
        if (drawingPoints.length >= 2) {
          completeDrawing();
        }
        return;
      }
      if (drawingMode === 'none' || drawingMode === 'point') return;
      
      // Complete the drawing
      if (drawingPoints.length >= 2 && (drawingMode === 'line' || drawingMode === 'road')) {
        completeDrawing();
      } else if (drawingPoints.length >= 3 && (drawingMode === 'polygon' || drawingMode === 'area-delete')) {
        completeDrawing();
      }
    };

    map.on('click', handleClick);
    map.on('dblclick', handleDblClick);
    return () => {
      map.off('click', handleClick);
      map.off('dblclick', handleDblClick);
    };
  }, [drawingMode, snapToRoad, getRoadSegmentBetweenSnaps, forestMode.state.isActive, forestMode.state.phase, forestMode.state.segmentPoints, forestMode.addSegmentPoint, forestMode.setPendingPoint, drawingPoints.length, completeDrawing, roadGeoEditor.state.isActive, roadGeoEditor.state.phase, roadGeoEditor.setStartPoint, roadGeoEditor.setEndPoint]);

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawingPoints([]);
        setRoadProductSnaps([]);
        setDrawingMode('none');
        if (editingBranchId) {
          setEditingBranchId(null);
          window.dispatchEvent(new CustomEvent('branch-edit-done'));
        }
        // Also exit item classification focus mode
        itemClassification.stopClassification();
      } else if (e.key === 'Enter') {
        if (drawingMode === 'road-edit') {
          completeDrawing();
        } else if (drawingPoints.length > 0) {
          completeDrawing();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && drawingPoints.length > 0) {
        e.preventDefault();
        setDrawingPoints(prev => prev.slice(0, -1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawingMode, drawingPoints, completeDrawing, itemClassification]);

  // Dynamic zoom-based scaling functions - smooth transitions
  const getZoomScale = useCallback((zoom: number) => {
    // Base zoom is 13 (good overview level), use logarithmic scaling for smoothness
    const baseZoom = 13;
    const diff = zoom - baseZoom;
    // Smoother exponential scaling with damping factor
    const scale = Math.pow(1.4, diff);
    return Math.max(0.4, Math.min(2.5, scale));
  }, []);

  const getDynamicMarkerSize = useCallback((baseSize: number, zoom: number) => {
    const scale = getZoomScale(zoom);
    // Smooth scaling with gentler min/max bounds and linear interpolation
    const smoothScale = 0.3 + scale * 0.7; // Range 0.3 to 2.05
    const size = baseSize * smoothScale;
    // Clamp with gentler bounds for smooth visual transitions
    return Math.max(10, Math.min(40, size));
  }, [getZoomScale]);

  const getDynamicStrokeWidth = useCallback((baseWidth: number, zoom: number) => {
    // Gentle exponential scaling for line thickness – no upper cap for wide area lines
    const baseZoom = 15;
    const diff = zoom - baseZoom;
    const scale = Math.pow(1.15, diff);
    const width = baseWidth * scale;
    return Math.max(1, width);
  }, []);

  // Lane-based offset: strokeOffset is a "lane number" (1, 2, 3... or -1, -2, -3...)
  // Offset scales with zoom just like stroke width so lanes don't overlap when zoomed in
  const LANE_WIDTH_PX = 10; // base pixels between each lane at baseZoom
  const getDynamicOffset = useCallback((laneNumber: number, zoom: number) => {
    if (!laneNumber) return 0;
    const baseZoom = 15;
    const diff = zoom - baseZoom;
    const scale = Math.pow(1.15, diff); // same scale as stroke width
    return laneNumber * LANE_WIDTH_PX * scale;
  }, []);

  // Render layers
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const layers = layersRef.current;
    layers.clearLayers();

    // === Branch-based road geometry rendering ===
    if (mergedRoadSegments.length > 0) {
      const segments = mergedRoadSegments;
      const roadWeight = getDynamicStrokeWidth(8, currentZoomRef.current);

      // --- Pre-compute junctions for seamless visual merging ---
      const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.0001;
      const junctionMap = new Map<string, { point: [number, number]; dirs: { lat: number; lng: number }[] }>();
      
      if (segments.length > 1) {
        for (let sIdx = 0; sIdx < segments.length; sIdx++) {
          const seg = segments[sIdx];
          if (seg.length < 2) continue;
          const endpoints = [
            { pt: seg[0], next: seg[1] },
            { pt: seg[seg.length - 1], next: seg[seg.length - 2] },
          ];
          for (const { pt, next } of endpoints) {
            for (let oIdx = 0; oIdx < segments.length; oIdx++) {
              if (oIdx === sIdx) continue;
              for (const ov of segments[oIdx]) {
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
      }

      const computeJunctionEdgePoints = (jp: [number, number], dirs: { lat: number; lng: number }[], halfWidth: number, stubMultiplier: number): [number, number][] => {
        const degPerMeterLat = 1 / 111320;
        const cosLat = Math.cos(jp[0] * Math.PI / 180);
        const degPerMeterLng = degPerMeterLat / cosLat;
        const stubDist = halfWidth * stubMultiplier;
        const points: [number, number][] = [];
        for (const dir of dirs) {
          const perpLat = -dir.lng;
          const perpLng = dir.lat;
          const stubLat = jp[0] + dir.lat * stubDist * degPerMeterLat;
          const stubLng = jp[1] + dir.lng * stubDist * degPerMeterLng;
          const ofsLat = perpLat * halfWidth * degPerMeterLat;
          const ofsLng = perpLng * halfWidth * degPerMeterLng;
          points.push([stubLat + ofsLat, stubLng + ofsLng]);
          points.push([stubLat - ofsLat, stubLng - ofsLng]);
        }
        points.sort((a, b) => Math.atan2(a[1] - jp[1], a[0] - jp[0]) - Math.atan2(b[1] - jp[1], b[0] - jp[0]));
        return points;
      };

      const metersPerPixel = 156543.03 * Math.cos((segments[0]?.[0]?.[0] || 61) * Math.PI / 180) / Math.pow(2, currentZoomRef.current);
      const halfWidthMeters = (roadWeight / 2) * metersPerPixel;

      // PASS 1: All outlines
      segments.forEach((segCoords) => {
        if (segCoords.length < 2) return;
        const coords = segCoords.map(c => L.latLng(c[0], c[1]));
        L.polyline(coords, { color: '#505050', weight: roadWeight, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(layers);
      });

      // PASS 2: Junction outline polygons
      junctionMap.forEach(({ point: jp, dirs }) => {
        if (dirs.length < 2) return;
        const edgePoints = computeJunctionEdgePoints(jp, dirs, halfWidthMeters, 2.5);
        L.polygon(edgePoints.map(p => L.latLng(p[0], p[1])), {
          color: '#505050', fillColor: '#505050', fillOpacity: 1, weight: 0, interactive: false,
        }).addTo(layers);
      });

      // PASS 3: All fills
      segments.forEach((segCoords) => {
        if (segCoords.length < 2) return;
        const coords = segCoords.map(c => L.latLng(c[0], c[1]));
        L.polyline(coords, { color: '#888888', weight: roadWeight * 0.7, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(layers);
      });

      // PASS 3b: Connector lines between nearby segment endpoints
      if (segments.length > 1) {
        for (let i = 0; i < segments.length; i++) {
          const segA = segments[i];
          if (segA.length < 2) continue;
          const endpointsA = [segA[0], segA[segA.length - 1]];
          for (let j = i + 1; j < segments.length; j++) {
            const segB = segments[j];
            if (segB.length < 2) continue;
            const endpointsB = [segB[0], segB[segB.length - 1]];
            for (const epA of endpointsA) {
              for (const epB of endpointsB) {
                const dist = Math.hypot(epA[0] - epB[0], epA[1] - epB[1]);
                if (dist > 0.0000001 && dist < 0.0005) {
                  const connCoords = [L.latLng(epA[0], epA[1]), L.latLng(epB[0], epB[1])];
                  L.polyline(connCoords, { color: '#505050', weight: roadWeight, opacity: 1, lineCap: 'round', interactive: false }).addTo(layers);
                  L.polyline(connCoords, { color: '#888888', weight: roadWeight * 0.7, opacity: 1, lineCap: 'round', interactive: false }).addTo(layers);
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
        }).addTo(layers);
      });

      // PASS 5: Center lines
      segments.forEach((segCoords) => {
        if (segCoords.length < 2) return;
        const coords = segCoords.map(c => L.latLng(c[0], c[1]));
        L.polyline(coords, { color: '#ffffff', weight: Math.max(1, roadWeight * 0.15), opacity: 0.6, dashArray: '8, 12', interactive: false }).addTo(layers);
      });

      // PASS 6: Interactive hit areas with branch popups
      // Suppress popups when user is in any interactive/editing mode
      const suppressBranchPopups = drawingMode !== 'none'
        || !!forestMode.state.editingGeometryItemId
        || !!itemClassification.state.activeItemId
        || roadGeoEditor.state.isActive;

      if (!suppressBranchPopups) {
        bearingBranches.forEach(branch => {
          const geo = branch.geometry as any;
          if (!geo) return;
          const coords: [number, number][] = geo.coordinates?.length >= 2
            ? geo.coordinates
            : (geo.segments?.length > 0 && geo.segments[0]?.length >= 2 ? geo.segments[0] : []);
          if (coords.length < 2) return;
          const latLngs = coords.map(c => L.latLng(c[0], c[1]));

          const pointCount = bearingPoints.filter(p => p.branchId === branch.id).length;
          const popupHtml = `
            <div style="font-family: sans-serif; font-size: 13px; line-height: 1.6;">
              <strong>🛣️ ${branch.name}</strong><br/>
              Tavoitekantavuus: ${branch.targetBearingCapacity} MN/m²<br/>
              Tien leveys: ${branch.roadWidth} m<br/>
              Mittauspisteitä: ${pointCount} kpl
            </div>
          `;
          const hitArea = L.polyline(latLngs, { color: 'transparent', weight: 24, opacity: 0, interactive: true }).addTo(layers);
          hitArea.bindPopup(popupHtml);
        });
      }

      // Branch geometry editing - render editable vertices when in road-edit mode
      // Also activate when Google search is active for a branch
      const activeEditBranchId = editingBranchId || (roadGeoEditor.state.isActive ? roadGeoEditor.state.targetBranchId : null);
      const isInEditMode = (drawingMode === 'road-edit' && editingBranchId) || (roadGeoEditor.state.isActive && roadGeoEditor.state.targetBranchId);

      if (activeEditBranchId && isInEditMode) {
        const editBranch = bearingBranches.find(b => b.id === activeEditBranchId);
        const editCoords: [number, number][] = (editBranch?.geometry as any)?.coordinates || [];

        if (editCoords.length >= 2) {
          const editLatLngs = editCoords.map(c => L.latLng(c[0], c[1]));
          const strokeWidth = getDynamicStrokeWidth(6, currentZoomRef.current);

          // Editable polyline highlight - GREEN
          L.polyline(editLatLngs, { color: '#15803d', weight: strokeWidth + 2, opacity: 0.5 }).addTo(layers);
          L.polyline(editLatLngs, { color: '#22C55E', weight: strokeWidth, opacity: 0.9 }).addTo(layers);

          // Clickable invisible line to add vertices
          const clickableLine = L.polyline(editLatLngs, { color: 'transparent', weight: strokeWidth + 12, opacity: 0 }).addTo(layers);
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
            updateBranchGeometry(activeEditBranchId!, { coordinates: newCoords });
          });

          // Vertex handles - check snap for endpoints
          const vertexSize = getDynamicMarkerSize(14, currentZoomRef.current);
          const canDelete = editCoords.length > 2;

          // Pre-compute which endpoints are snapped to other branches
          const isEndpointSnapped = (coord: [number, number], branchId: string): boolean => {
            for (const otherBranch of bearingBranches) {
              if (otherBranch.id === branchId) continue;
              const otherCoords: [number, number][] = (otherBranch.geometry as any)?.coordinates || [];
              if (otherCoords.length < 2) continue;
              for (const oc of otherCoords) {
                const dist = Math.hypot(coord[0] - oc[0], coord[1] - oc[1]);
                if (dist < 0.0003) return true; // ~30m threshold
              }
            }
            return false;
          };

          editCoords.forEach((coord, idx) => {
            const isEndpoint = idx === 0 || idx === editCoords.length - 1;
            let bg: string;
            if (isEndpoint) {
              const snapped = isEndpointSnapped(coord, activeEditBranchId!);
              bg = snapped ? '#3B82F6' : '#F97316'; // Blue if snapped, orange if not
            } else {
              bg = '#22C55E'; // Green for midpoints
            }
            const deleteHtml = canDelete && !isEndpoint
              ? `<div style="position:absolute;top:-8px;right:-8px;width:16px;height:16px;background:#EF4444;border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:white;line-height:1;cursor:pointer;z-index:10;">×</div>`
              : '';
            const vertexIcon = L.divIcon({
              html: `<div style="position:relative;width:${vertexSize}px;height:${vertexSize}px;background:${bg};border:2px solid white;border-radius:50%;cursor:grab;box-shadow:0 2px 4px rgba(0,0,0,0.3);">${deleteHtml}</div>`,
              className: 'vertex-handle',
              iconSize: [vertexSize, vertexSize],
              iconAnchor: [vertexSize / 2, vertexSize / 2],
            });
            const vertexMarker = L.marker(coord, { icon: vertexIcon, draggable: true, zIndexOffset: 1000 }).addTo(layers);
            vertexMarker.on('dragend', (e: any) => {
              const newLatLng = e.target.getLatLng();
              let finalPoint: [number, number] = [newLatLng.lat, newLatLng.lng];
              // Snap endpoints to other branches
              if (isEndpoint) {
                const snap = snapToExistingRoad(finalPoint, mergedRoadSegments, SNAP_THRESHOLD_METERS);
                if (snap.snapped) finalPoint = snap.point;
              }
              const newCoords = [...editCoords];
              newCoords[idx] = finalPoint;
              updateBranchGeometry(activeEditBranchId!, { coordinates: newCoords });
            });
            vertexMarker.on('click', (e: L.LeafletMouseEvent) => {
              L.DomEvent.stopPropagation(e);
              if (!canDelete || isEndpoint) return;
              const newCoords = editCoords.filter((_, i) => i !== idx);
              updateBranchGeometry(activeEditBranchId!, { coordinates: newCoords });
            });
          });
        }

        // Measurement points are HIDDEN during edit mode - no rendering here
      }
    }

    // Hide ALL product markers and other overlays during road-edit mode or Google search mode
    const isRoadEditActive = drawingMode === 'road-edit' || (roadGeoEditor.state.isActive && roadGeoEditor.state.targetBranchId);
    if (isRoadEditActive) {
      // Only road geometry + editing vertices + branch measurement points are shown
      // Render drawing points preview for extending the branch
      if (drawingPoints.length > 0) {
        const coords = drawingPoints.map(c => L.latLng(c[0], c[1]));
        if (drawingPoints.length >= 2) {
          L.polyline(coords, {
            color: '#22C3F3',
            weight: getDynamicStrokeWidth(4, currentZoomRef.current),
            opacity: 0.8,
            dashArray: '8, 8',
          }).addTo(layers);
        }
        const pointRadius = getDynamicMarkerSize(6, currentZoomRef.current);
        drawingPoints.forEach(point => {
          L.circleMarker(point, {
            radius: pointRadius,
            color: '#22C3F3',
            fillColor: '#ffffff',
            fillOpacity: 1,
            weight: 2,
          }).addTo(layers);
        });
      }
      // Skip rendering products below
    } else {

    // Product markers – hide during forest mode add/edit phases
    const forestNonBrowse = forestMode.state.isActive && forestMode.state.phase !== 'BROWSE';
    // Focus mode: only show the active item and its related segments
    const focusItemId = itemClassification.state.activeItemId;

    allProducts.forEach(product => {
      if (!product.visible) return;

      // Focus mode: show all instances of the same catalog item
      const isFocusItem = focusItemId ? product.id === focusItemId : false;
      const isSameDefinitionInFocus = focusItemId
        ? (() => {
            const targetProduct = allProducts.find(p => p.id === focusItemId);
            return targetProduct && product.productDefinitionId === targetProduct.productDefinitionId;
          })()
        : false;
      // Hide products that are unrelated to the focused item's definition
      if (focusItemId && !isSameDefinitionInFocus) return;

      // Category filter (only apply when not in focus mode)
      if (!focusItemId) {
        if (filter === 'uncategorized' && product.categoryId) return;
        if (filter !== 'all' && filter !== 'uncategorized' && product.categoryId !== filter) return;
      }
      // Hide other products during forest mode add/edit phases
      if (forestNonBrowse) {
        if (forestMode.state.phase !== 'EDIT_GEOMETRY' || forestMode.state.editingGeometryItemId !== product.id) {
          return;
        }
      }

      const definition = getItemById(product.productDefinitionId);
      const color = product.colorOverride || definition?.markerStyle?.color || '#22C3F3';
      const isSelected = selectedProductId === product.id;

      // Get line style from catalog definition's markerStyle
      const markerStyle = definition?.markerStyle;
      const baseStrokeWidth = markerStyle?.lineWidth || 4;
      const baseStrokeOffset = markerStyle?.strokeOffset || 0;
      const dashArray = markerStyle?.dashArray;
      const renderOrder = markerStyle?.renderOrder ?? 1;
      const fillIcon = markerStyle?.fillIcon;

      // Select Leaflet pane based on renderOrder
      const paneName = renderOrder === 0 ? 'productsBehind'
        : renderOrder === 2 ? 'productsAbove'
        : renderOrder >= 3 ? 'productsTop'
        : 'productsNormal';

      // Focus mode visual overrides: muted sequential palette for classified segments
      // Palette: soft muted colors, ordered by category creation time
      const FOCUS_CATEGORY_PALETTE = [
        '#5B8DB8', // muted blue
        '#6BAA75', // muted green
        '#C97B7B', // muted red
        '#C9965A', // muted orange
        '#9B7BB8', // muted purple
        '#6BAAA8', // muted teal
        '#B8A45B', // muted yellow
        '#B87B9B', // muted pink
      ];
      let focusCategoryColor: string | null = null;
      let focusCategoryName: string | null = null;
      if (focusItemId && product.categoryId) {
        const catIdx = categories.findIndex(c => c.id === product.categoryId);
        focusCategoryColor = FOCUS_CATEGORY_PALETTE[catIdx >= 0 ? catIdx % FOCUS_CATEGORY_PALETTE.length : 0];
        focusCategoryName = catIdx >= 0 ? categories[catIdx].name : null;
      }
      // No dimming: all items full opacity, classified get palette color
      const effectiveColor = focusCategoryColor ?? color;
      const effectiveOpacity = markerStyle?.opacity ?? 1;

      if (product.geometry.type === 'point') {
        // Dynamic marker size based on zoom
        const baseMarkerSize = definition?.markerStyle?.size || 20;
        const markerSize = getDynamicMarkerSize(baseMarkerSize, currentZoomRef.current);
        const halfSize = markerSize / 2;
        
        let iconHtml: string;
        // Resolve marker image from builtin: prefix or URL
        const rawMarkerImage = product.customMarkerImage || definition?.markerStyle?.image;
        const resolvedMarkerImage = resolveMarkerImage(rawMarkerImage);
        
        // Determine anchor point - for custom images, anchor at bottom center (pin style)
        // For geometric shapes, anchor at center
        const hasCustomImage = !!resolvedMarkerImage;
        const iconAnchorX = halfSize;
        const iconAnchorY = hasCustomImage ? markerSize : halfSize; // Bottom for images, center for shapes
        
        if (resolvedMarkerImage) {
          iconHtml = `<img src="${resolvedMarkerImage}" style="width:${markerSize}px;height:${markerSize}px;object-fit:contain;transition:transform 0.15s;${isSelected ? 'transform:scale(1.2);' : ''}" />`;
        } else if (definition?.markerStyle?.shape === 'square') {
          iconHtml = `<div style="width:${markerSize}px;height:${markerSize}px;background:${color};border:2px solid white;border-radius:3px;box-shadow:0 2px 4px rgba(0,0,0,0.3);transition:transform 0.15s;${isSelected ? 'transform:scale(1.2);' : ''}"></div>`;
        } else if (definition?.markerStyle?.shape === 'triangle') {
          iconHtml = `<div style="width:0;height:0;border-left:${halfSize}px solid transparent;border-right:${halfSize}px solid transparent;border-bottom:${markerSize}px solid ${color};filter:drop-shadow(0 2px 2px rgba(0,0,0,0.3));transition:transform 0.15s;${isSelected ? 'transform:scale(1.2);' : ''}"></div>`;
        } else {
          iconHtml = `<div style="width:${markerSize}px;height:${markerSize}px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);transition:transform 0.15s;${isSelected ? 'transform:scale(1.2);' : ''}"></div>`;
        }

        const icon = L.divIcon({
          html: iconHtml,
          className: 'custom-marker',
          iconSize: [markerSize, markerSize],
          iconAnchor: [iconAnchorX, iconAnchorY],
        });

        // Check if this product is being edited for geometry
        const isEditingThisGeometry = forestMode.state.editingGeometryItemId === product.id;

        const marker = L.marker(product.geometry.coordinates, { 
          icon,
          draggable: isEditingThisGeometry,
        }).addTo(layers);
        
        marker.on('click', () => {
          if (forestMode.state.editingGeometryItemId) return; // Block clicks during geometry editing
          if (forestMode.state.isActive && forestMode.state.phase !== 'BROWSE') return;
          setEditingProductId(product.id);
          setShowProductEditor(true);
        });
        
        // Handle drag end to update coordinates
        if (isEditingThisGeometry) {
          marker.on('dragend', (e) => {
            const newLatLng = e.target.getLatLng();
            updateProduct(product.id, {
              geometry: {
                type: 'point',
                coordinates: [newLatLng.lat, newLatLng.lng],
              },
            });
          });
        }
      }

      if (product.geometry.type === 'line') {
        const coords = product.geometry.coordinates.map(c => L.latLng(c[0], c[1]));
        
        // Check if this product is being edited for geometry
        const isEditingThisGeometry = forestMode.state.editingGeometryItemId === product.id;
        
        // Dynamic offset based on lane number (strokeOffset) - rendered as pixel offset by PolylineOffset plugin
        const dynamicOffset = getDynamicOffset(baseStrokeOffset, currentZoomRef.current);

        // Dynamic stroke width based on zoom - use catalog definition's lineWidth
        const strokeWidth = getDynamicStrokeWidth(baseStrokeWidth, currentZoomRef.current);

        const line = L.polyline(coords, {
          color: isEditingThisGeometry ? '#22C55E' : effectiveColor,
          weight: isEditingThisGeometry ? strokeWidth + 3 : (isFocusItem ? strokeWidth + 3 : (isSelected ? strokeWidth + 2 : strokeWidth)),
          opacity: isEditingThisGeometry ? 1 : effectiveOpacity,
          dashArray: isEditingThisGeometry ? undefined : dashArray,
          offset: isEditingThisGeometry ? 0 : dynamicOffset,
          smoothFactor: dynamicOffset !== 0 ? 1.8 : 1,
          pane: paneName,
        } as any).addTo(layers);

        // Fill icon pattern: place repeating icons across the line area
        if (fillIcon && !isEditingThisGeometry && coords.length >= 2) {
          // Icon size: smaller, fixed relative to stroke, capped low
          const iconSize = Math.max(10, Math.min(18, Math.round(strokeWidth * 0.22)));
          const svgContent = getFillIconSvg(fillIcon, iconSize, '#000000');
          if (svgContent) {
            const spacingAlong = iconSize * 2.8; // more spacing for even distribution
            const map = mapInstanceRef.current!;
            let totalPx = 0;
            const segPxLengths: number[] = [];
            for (let i = 0; i < coords.length - 1; i++) {
              const p1 = map.latLngToContainerPoint(coords[i]);
              const p2 = map.latLngToContainerPoint(coords[i + 1]);
              segPxLengths.push(Math.hypot(p2.x - p1.x, p2.y - p1.y));
              totalPx += segPxLengths[segPxLengths.length - 1];
            }
            // Place icons near the edges of the line (inside), not at center
            const halfWeight = strokeWidth / 2;
            const edgeInset = iconSize * 0.6; // inset from outer edge
            const rowOffsets: number[] = [];
            if (halfWeight <= iconSize * 1.2) {
              // Narrow line: just two edge rows
              const off = Math.max(0, halfWeight - edgeInset);
              rowOffsets.push(off, -off);
            } else {
              // Wide line: edges + fill rows between, skipping center
              const outerOff = halfWeight - edgeInset;
              rowOffsets.push(outerOff, -outerOff);
              const rowSpacing = iconSize * 1.8;
              for (let off = outerOff - rowSpacing; off > iconSize * 0.5; off -= rowSpacing) {
                rowOffsets.push(off, -off);
              }
            }
            const iconCount = Math.floor(totalPx / spacingAlong);
            if (iconCount > 0 && iconCount * rowOffsets.length < 500) {
              for (let n = 0; n < iconCount; n++) {
                const targetPx = spacingAlong * (n + 0.5);
                let accum = 0;
                for (let si = 0; si < segPxLengths.length; si++) {
                  if (accum + segPxLengths[si] >= targetPx || si === segPxLengths.length - 1) {
                    const t = segPxLengths[si] > 0 ? (targetPx - accum) / segPxLengths[si] : 0.5;
                    const baseLat = coords[si].lat + (coords[si + 1].lat - coords[si].lat) * t;
                    const baseLng = coords[si].lng + (coords[si + 1].lng - coords[si].lng) * t;
                    // Calculate perpendicular direction for offset rows
                    const dLat = coords[si + 1].lat - coords[si].lat;
                    const dLng = coords[si + 1].lng - coords[si].lng;
                    const len = Math.hypot(dLat, dLng);
                    const perpLat = len > 0 ? -dLng / len : 0;
                    const perpLng = len > 0 ? dLat / len : 0;
                    // Meters per degree approximation
                    const basePoint = map.latLngToContainerPoint(L.latLng(baseLat, baseLng));
                    const refPoint = map.latLngToContainerPoint(L.latLng(baseLat + perpLat * 0.001, baseLng + perpLng * 0.001));
                    const pxPerUnit = Math.hypot(refPoint.x - basePoint.x, refPoint.y - basePoint.y) / 0.001;

                    for (let ri = 0; ri < rowOffsets.length; ri++) {
                      const rowOff = rowOffsets[ri];
                      // Stagger every other row for natural look
                      const stagger = ri % 2 === 1 ? spacingAlong * 0.5 : 0;
                      const adjustedTarget = targetPx + stagger;
                      if (adjustedTarget > totalPx) continue;

                      const offsetInDeg = pxPerUnit > 0 ? rowOff / pxPerUnit : 0;
                      const lat = baseLat + perpLat * offsetInDeg;
                      const lng = baseLng + perpLng * offsetInDeg;
                      const el = L.divIcon({
                        html: `<div style="width:${iconSize}px;height:${iconSize}px;opacity:0.18;pointer-events:none;display:flex;align-items:center;justify-content:center;">${svgContent}</div>`,
                        className: '',
                        iconSize: [iconSize, iconSize],
                        iconAnchor: [iconSize / 2, iconSize / 2],
                      });
                      L.marker(L.latLng(lat, lng), { icon: el, interactive: false, pane: paneName } as any).addTo(layers);
                    }
                    break;
                  }
                  accum += segPxLengths[si];
                }
              }
            }
          }
        }

        // In focus mode, show a label badge at midpoint of classified segments
        if (focusItemId && product.categoryId && focusCategoryColor && focusCategoryName && coords.length > 0) {
          const midIdx = Math.floor(coords.length / 2);
          const midPoint = coords[midIdx];
          const labelIcon = L.divIcon({
            html: `<div style="background:${focusCategoryColor};color:#fff;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25);pointer-events:none;letter-spacing:0.01em;">${focusCategoryName}</div>`,
            className: 'focus-category-label',
            iconAnchor: [0, -6],
          });
          L.marker(midPoint, { icon: labelIcon, interactive: false, zIndexOffset: 500 }).addTo(layers);
        }

        line.on('click', (e) => {
          if (isEditingThisGeometry) {
            // Add new vertex at clicked position
            const clickLatLng = e.latlng;
            const clickPoint: [number, number] = [clickLatLng.lat, clickLatLng.lng];
            
            // Find the segment where to insert the new point
            const originalCoords = product.geometry.coordinates as [number, number][];
            let bestIdx = 1;
            let bestDist = Infinity;
            
            for (let i = 0; i < originalCoords.length - 1; i++) {
              const a = originalCoords[i];
              const b = originalCoords[i + 1];
              // Project point onto segment
              const ax = a[0], ay = a[1];
              const bx = b[0], by = b[1];
              const px = clickPoint[0], py = clickPoint[1];
              const vx = bx - ax, vy = by - ay;
              const len2 = vx * vx + vy * vy;
              let t = len2 === 0 ? 0 : ((px - ax) * vx + (py - ay) * vy) / len2;
              t = Math.max(0, Math.min(1, t));
              const projX = ax + vx * t;
              const projY = ay + vy * t;
              const dist = Math.hypot(px - projX, py - projY);
              if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i + 1;
              }
            }
            
            // Insert new point
            const newCoords: [number, number][] = [...originalCoords];
            newCoords.splice(bestIdx, 0, clickPoint);
            updateProduct(product.id, {
              geometry: { type: 'line', coordinates: newCoords },
            });
          } else {
            if (forestMode.state.editingGeometryItemId) return; // Block clicks during geometry editing
            if (forestMode.state.isActive && forestMode.state.phase !== 'BROWSE') return;
            setEditingProductId(product.id);
            setShowProductEditor(true);
          }
        });
        
        // Render vertex handles when editing
        if (isEditingThisGeometry) {
          const vertexSize = getDynamicMarkerSize(14, currentZoomRef.current);
          const originalCoords = product.geometry.coordinates as [number, number][];
          const canDelete = originalCoords.length > 2; // keep at least 2 points

          originalCoords.forEach((coord, idx) => {
            const isEndpoint = idx === 0 || idx === originalCoords.length - 1;
            // Delete handle (red ×) shown on non-endpoint vertices always, endpoints only when >2 pts
            const showDelete = canDelete;
            const bg = isEndpoint ? '#3B82F6' : '#22C55E';
            const deleteHtml = showDelete
              ? `<div style="position:absolute;top:-8px;right:-8px;width:16px;height:16px;background:#EF4444;border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:white;line-height:1;cursor:pointer;z-index:10;">×</div>`
              : '';
            const vertexIcon = L.divIcon({
              html: `<div style="position:relative;width:${vertexSize}px;height:${vertexSize}px;background:${bg};border:2px solid white;border-radius:50%;cursor:grab;box-shadow:0 2px 4px rgba(0,0,0,0.3);">${deleteHtml}</div>`,
              className: 'vertex-handle',
              iconSize: [vertexSize, vertexSize],
              iconAnchor: [vertexSize / 2, vertexSize / 2],
            });
            
            const vertexMarker = L.marker(coord, { 
              icon: vertexIcon,
              draggable: true,
              zIndexOffset: 1000,
            }).addTo(layers);
            
            vertexMarker.on('dragend', (e) => {
              const newLatLng = e.target.getLatLng();
              const newCoords: [number, number][] = [...(product.geometry.coordinates as [number, number][])];
              newCoords[idx] = [newLatLng.lat, newLatLng.lng];
              updateProduct(product.id, {
                geometry: { type: 'line', coordinates: newCoords },
              });
            });

            // Click on vertex = delete the point (if allowed)
            vertexMarker.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
              if (!canDelete) return;
              const newCoords: [number, number][] = (product.geometry.coordinates as [number, number][]).filter((_, i) => i !== idx);
              updateProduct(product.id, {
                geometry: { type: 'line', coordinates: newCoords },
              });
            });
          });
        }

        // Render child products (compositions) as separate lines with their own offsets
        if (!isEditingThisGeometry) {
          const childCompositions = compositionsMap?.[product.productDefinitionId] || [];
          childCompositions.forEach(composition => {
            const childItem = composition.childItem;
            if (!childItem) return;

            const childMarkerStyle = childItem.markerStyle;
            const childColor = childMarkerStyle?.color || '#888888';
            const childBaseStrokeWidth = childMarkerStyle?.lineWidth || 3;
            const childBaseOffset = childMarkerStyle?.strokeOffset || 0;
            const childDashArray = childMarkerStyle?.dashArray;

            // Apply child's own offset using PolylineOffset plugin (pixel-based)
            const childDynamicOffset = getDynamicOffset(childBaseOffset, currentZoomRef.current);

            const childStrokeWidth = getDynamicStrokeWidth(childBaseStrokeWidth, currentZoomRef.current);

            const childLine = L.polyline(coords, {
              color: childColor,
              weight: childStrokeWidth,
              opacity: childMarkerStyle?.opacity ?? 1,
              dashArray: childDashArray,
              offset: childDynamicOffset,
smoothFactor: childDynamicOffset !== 0 ? 1.8 : 1,
            } as any).addTo(layers);

            // Clicking child line also opens the parent product editor
            childLine.on('click', () => {
              setEditingProductId(product.id);
              setShowProductEditor(true);
            });
          });
        }
      }

      if (product.geometry.type === 'polygon') {
        const coords = product.geometry.coordinates.map(c => L.latLng(c[0], c[1]));
        const strokeWidth = getDynamicStrokeWidth(2, currentZoomRef.current);
        const polygon = L.polygon(coords, {
          color: color,
          fillColor: color,
          fillOpacity: 0.3,
          weight: isSelected ? strokeWidth + 1 : strokeWidth,
        }).addTo(layers);

        polygon.on('click', () => {
          if (forestMode.state.isActive && forestMode.state.phase !== 'BROWSE') return;
          setEditingProductId(product.id);
          setShowProductEditor(true);
        });
      }
    });

    // Drawing preview
    if (drawingPoints.length > 0) {
      const coords = drawingPoints.map(c => L.latLng(c[0], c[1]));
      const isAreaDelete = drawingMode === 'area-delete';
      const isPolygonMode = drawingMode === 'polygon' || isAreaDelete;

      if (drawingPoints.length >= 2) {
        if (isPolygonMode && drawingPoints.length >= 3) {
          // Show polygon preview
          L.polygon(coords, {
            color: isAreaDelete ? '#ef4444' : '#7FC646',
            fillColor: isAreaDelete ? '#ef4444' : '#7FC646',
            fillOpacity: isAreaDelete ? 0.15 : 0.1,
            weight: getDynamicStrokeWidth(2, currentZoomRef.current),
            dashArray: '6, 6',
          }).addTo(layers);
        } else {
          L.polyline(coords, {
            color: isAreaDelete ? '#ef4444' : (drawingMode === 'road' ? '#22C3F3' : '#7FC646'),
            weight: getDynamicStrokeWidth(drawingMode === 'road' ? 4 : 3, currentZoomRef.current),
            opacity: 0.8,
            dashArray: '8, 8',
          }).addTo(layers);
        }
      }

      const pointRadius = getDynamicMarkerSize(6, currentZoomRef.current);
      drawingPoints.forEach(point => {
        L.circleMarker(point, {
          radius: pointRadius,
          color: isAreaDelete ? '#ef4444' : (drawingMode === 'road' ? '#22C3F3' : '#7FC646'),
          fillColor: '#ffffff',
          fillOpacity: 1,
          weight: 2,
        }).addTo(layers);
      });
    }

    // Road product points preview
    if (roadProductSnaps.length > 0) {
      const pointRadius = getDynamicMarkerSize(8, currentZoomRef.current);
      roadProductSnaps.forEach(({ point }) => {
        L.circleMarker(point, {
          radius: pointRadius,
          color: '#FEAD2D',
          fillColor: '#ffffff',
          fillOpacity: 1,
          weight: 3,
        }).addTo(layers);
      });
    }
    
    // Forest Mode: segment points preview (ADD_INTERVAL_LINE)
    if (forestMode.state.isActive && forestMode.state.phase === 'ADD_INTERVAL_LINE' && forestMode.state.segmentPoints.length > 0) {
      const pointRadius = getDynamicMarkerSize(10, currentZoomRef.current);
      forestMode.state.segmentPoints.forEach((point, idx) => {
        L.circleMarker(point, {
          radius: pointRadius,
          color: '#22C55E',
          fillColor: idx === 0 ? '#22C55E' : '#ffffff',
          fillOpacity: 1,
          weight: 3,
        }).addTo(layers);
      });
      
      // Draw preview line – for road-snap, follow road geometry
      if (forestMode.state.segmentPoints.length >= 2) {
        let previewCoords = forestMode.state.segmentPoints;
        
        if (forestMode.state.segmentMode === 'road-snap' && mergedRoadSegments.length > 0) {
          const roadCoords = mergedRoadSegments.flat() as [number, number][];
          if (roadCoords.length >= 2) {
            const extracted = extractRoadSegment(
              forestMode.state.segmentPoints[0],
              forestMode.state.segmentPoints[forestMode.state.segmentPoints.length - 1],
              roadCoords,
            );
            if (extracted.length >= 2) {
              previewCoords = extracted;
            }
          }
        }
        
        const coords = previewCoords.map(c => L.latLng(c[0], c[1]));
        L.polyline(coords, {
          color: '#22C55E',
          weight: getDynamicStrokeWidth(4, currentZoomRef.current),
          opacity: 0.8,
          dashArray: '8, 8',
        }).addTo(layers);
      }
    }
    
    // Forest Mode: pending point preview (ADD_LOCAL_POINT)
    if (forestMode.state.isActive && forestMode.state.phase === 'ADD_LOCAL_POINT' && forestMode.state.pendingPoint) {
      const pointRadius = getDynamicMarkerSize(12, currentZoomRef.current);
      L.circleMarker(forestMode.state.pendingPoint, {
        radius: pointRadius,
        color: '#22C55E',
        fillColor: '#22C55E',
        fillOpacity: 0.8,
        weight: 3,
      }).addTo(layers);
    }

    // Road Geometry Editor: start/end markers and editable polyline
    if (roadGeoEditor.state.isActive) {
      // Start marker - show snap visual if snapped
      if (roadGeoEditor.state.startPoint) {
        const markerSize = getDynamicMarkerSize(16, currentZoomRef.current);
        const isSnapped = roadGeoEditor.state.startSnap?.snapped;
        const startIcon = L.divIcon({
          html: `<div style="width:${markerSize}px;height:${markerSize}px;background:${isSnapped ? '#3B82F6' : '#22C55E'};border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);${isSnapped ? 'outline:3px solid #3B82F6;outline-offset:2px;' : ''}"></div>`,
          className: 'road-geo-start',
          iconSize: [markerSize, markerSize],
          iconAnchor: [markerSize / 2, markerSize / 2],
        });
        L.marker(roadGeoEditor.state.startPoint, { icon: startIcon, interactive: false }).addTo(layers);
        // Snap ring indicator
        if (isSnapped) {
          L.circleMarker(roadGeoEditor.state.startPoint, {
            radius: markerSize * 0.8,
            color: '#3B82F6',
            fillColor: '#3B82F6',
            fillOpacity: 0.15,
            weight: 2,
            dashArray: '4, 4',
          }).addTo(layers);
        }
      }

      // End marker - show snap visual if snapped
      if (roadGeoEditor.state.endPoint) {
        const markerSize = getDynamicMarkerSize(16, currentZoomRef.current);
        const isSnapped = roadGeoEditor.state.endSnap?.snapped;
        const endIcon = L.divIcon({
          html: `<div style="width:${markerSize}px;height:${markerSize}px;background:${isSnapped ? '#3B82F6' : '#EF4444'};border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);${isSnapped ? 'outline:3px solid #3B82F6;outline-offset:2px;' : ''}"></div>`,
          className: 'road-geo-end',
          iconSize: [markerSize, markerSize],
          iconAnchor: [markerSize / 2, markerSize / 2],
        });
        L.marker(roadGeoEditor.state.endPoint, { icon: endIcon, interactive: false }).addTo(layers);
        if (isSnapped) {
          L.circleMarker(roadGeoEditor.state.endPoint, {
            radius: markerSize * 0.8,
            color: '#3B82F6',
            fillColor: '#3B82F6',
            fillOpacity: 0.15,
            weight: 2,
            dashArray: '4, 4',
          }).addTo(layers);
        }
      }

      // Editable polyline
      if (roadGeoEditor.state.editedPolyline && roadGeoEditor.state.editedPolyline.length >= 2) {
        const coords = roadGeoEditor.state.editedPolyline.map(c => L.latLng(c[0], c[1]));
        const strokeWidth = getDynamicStrokeWidth(6, currentZoomRef.current);

        // Polyline outline
        L.polyline(coords, { color: '#1D4ED8', weight: strokeWidth + 2, opacity: 0.5 }).addTo(layers);
        // Polyline fill
        L.polyline(coords, { color: '#3B82F6', weight: strokeWidth, opacity: 0.9 }).addTo(layers);

        // Clickable invisible line to add vertices
        const clickableLine = L.polyline(coords, { color: 'transparent', weight: strokeWidth + 12, opacity: 0 }).addTo(layers);
        clickableLine.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          const clickPoint: [number, number] = [e.latlng.lat, e.latlng.lng];
          const polyCoords = roadGeoEditor.state.editedPolyline!;

          // Find the segment where to insert
          let bestIdx = 1;
          let bestDist = Infinity;
          for (let i = 0; i < polyCoords.length - 1; i++) {
            const a = polyCoords[i];
            const b = polyCoords[i + 1];
            const proj = projectPointOnSegment(clickPoint, a, b);
            const dist = Math.hypot(clickPoint[0] - proj[0], clickPoint[1] - proj[1]);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i + 1;
            }
          }

          const newCoords: [number, number][] = [...polyCoords];
          newCoords.splice(bestIdx, 0, clickPoint);
          roadGeoEditor.updateEditedPolyline(newCoords);
        });

        // Vertex handles for dragging
        const vertexSize = getDynamicMarkerSize(12, currentZoomRef.current);
        roadGeoEditor.state.editedPolyline.forEach((coord, idx) => {
          const isEndpoint = idx === 0 || idx === roadGeoEditor.state.editedPolyline!.length - 1;
          const vertexIcon = L.divIcon({
            html: `<div style="width:${vertexSize}px;height:${vertexSize}px;background:${isEndpoint ? '#3B82F6' : '#60A5FA'};border:2px solid white;border-radius:50%;cursor:grab;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
            className: 'vertex-handle',
            iconSize: [vertexSize, vertexSize],
            iconAnchor: [vertexSize / 2, vertexSize / 2],
          });

          const vertexMarker = L.marker(coord, {
            icon: vertexIcon,
            draggable: true,
          }).addTo(layers);

          vertexMarker.on('dragend', (e: any) => {
            const newLatLng = e.target.getLatLng();
            const newCoords: [number, number][] = [...roadGeoEditor.state.editedPolyline!];
            newCoords[idx] = [newLatLng.lat, newLatLng.lng];
            roadGeoEditor.updateEditedPolyline(newCoords);
          });
        });
      }
    }

    } // end of else (not road-edit mode)
  }, [project, allProducts, selectedProductId, drawingPoints, roadProductSnaps, drawingMode, items, zoomRenderTick, getDynamicMarkerSize, getDynamicStrokeWidth, getDynamicOffset, compositionsMap, forestMode.state.isActive, forestMode.state.phase, forestMode.state.segmentPoints, forestMode.state.segmentMode, forestMode.state.editingGeometryItemId, forestMode.state.pendingPoint, updateProduct, roadGeoEditor.state.isActive, roadGeoEditor.state.startPoint, roadGeoEditor.state.endPoint, roadGeoEditor.state.startSnap, roadGeoEditor.state.endSnap, roadGeoEditor.state.editedPolyline, roadGeoEditor.updateEditedPolyline, filter, itemClassification.state.activeItemId, bearingBranches, bearingPoints, editingBranchId, updateBranchGeometry, mergedRoadSegments]);

  const handleProductAdded = (productDefinitionId: string) => {
    if (pendingProductGeometry) {
      const definition = getItemById(productDefinitionId);
      
      // Build parameters from definition's defaultParameters
      const params: Record<string, number> = {};
      if (definition?.defaultParameters) {
        definition.defaultParameters.forEach(p => {
          params[p.slug] = p.default;
        });
      }

      addProduct({
        productDefinitionId,
        geometry: pendingProductGeometry,
        parameters: params,
        photos: [],
        notes: '',
        visible: true,
        locked: false,
      });
      setPendingProductGeometry(null);
    }
    setShowAddProduct(false);
  };
  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full z-0" />

      {/* Normal mode toolbar - hidden in forest mode */}
      {!forestMode.state.isActive && (
        <MapToolbar
          basemap={basemap}
          onBasemapChange={setBasemap}
          drawingMode={drawingMode}
          onDrawingModeChange={(mode) => {
            setDrawingMode(mode);
            if (mode === 'none') {
              setDrawingPoints([]);
              setRoadProductSnaps([]);
              setEditingBranchId(null);
            }
          }}
          showCadastre={showCadastre}
          onCadastreToggle={() => setShowCadastre(!showCadastre)}
          hasRoad={mergedRoadSegments.length > 0}
        />
      )}

      {/* Map action buttons - top right corner, stacked vertically */}
      <div className={cn(
        'absolute right-4 z-10 flex flex-col gap-2',
        'top-4'
      )}>
        {/* Forest mode toggle - only in normal mode */}
        {!forestMode.state.isActive && (
          <ForestModeToggle />
        )}
        {/* Locate me */}
        <MapLocateButton
          onClick={handleLocateMe}
          loading={geolocation.loading}
          hasPosition={!!geolocation.position}
        />
      </div>

      {/* Forest mode: map layer picker button - left side below zoom */}
      {forestMode.state.isActive && (
        <ForestModeLayerPicker
          basemap={basemap}
          onBasemapChange={setBasemap}
        />
      )}
      
      {/* Forest Mode Overlay */}
      <ForestModeOverlay />

      {/* Normal mode geometry editing bar - shown when editing a product's geometry outside forest mode */}
      {!forestMode.state.isActive && forestMode.state.editingGeometryItemId && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-card rounded-xl shadow-2xl border-2 border-border px-4 py-3">
          <div className="text-xs font-medium text-muted-foreground mr-2">
            <Pencil className="w-4 h-4 inline mr-1 text-primary" />
            Muokkaa sijaintia
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              // Cancel: revert geometry
              const editId = forestMode.state.editingGeometryItemId;
              if (editId && forestMode.state.editingOriginalGeometry) {
                updateProduct(editId, { geometry: forestMode.state.editingOriginalGeometry });
              }
              forestMode.returnToBrowse();
              if (editId) {
                setEditingProductId(editId);
                setShowProductEditor(true);
              }
            }}
          >
            <X className="w-3.5 h-3.5" />
            Peruuta
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              // Confirm: keep changes
              const editId = forestMode.state.editingGeometryItemId;
              forestMode.returnToBrowse();
              if (editId) {
                setEditingProductId(editId);
                setShowProductEditor(true);
              }
            }}
          >
            <Save className="w-3.5 h-3.5" />
            Valmis
          </Button>
        </div>
      )}

      {/* Product Editor Dialog */}
      {showProductEditor && editingProductId && (
        <ProductEditorDialog
          productId={editingProductId}
          onClose={() => {
            setShowProductEditor(false);
            setEditingProductId(null);
          }}
        />
      )}

      {/* Add Product Dialog - Normal mode only */}
      {showAddProduct && !forestMode.state.isActive && (
        <AddProductDialog
          onSelect={handleProductAdded}
          onClose={() => {
            setShowAddProduct(false);
            setPendingProductGeometry(null);
          }}
          geometryType={pendingProductGeometry?.type || 'point'}
        />
      )}

      {/* Category Assignment Dialog - for polygon tool */}
      <CategoryAssignmentDialog
        open={showCategoryAssignment}
        onOpenChange={(open) => {
          setShowCategoryAssignment(open);
          if (!open) setPendingCategoryPolygon(null);
        }}
        polygon={pendingCategoryPolygon}
      />
    </div>
  );
}

// Helper functions
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function projectPointOnSegment(point: [number, number], p1: [number, number], p2: [number, number]): [number, number] {
  const [px, py] = point;
  const [x1, y1] = p1;
  const [x2, y2] = p2;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) return p1;

  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  return [x1 + t * dx, y1 + t * dy];
}

// Offset a polyline by a distance in meters
function offsetPolyline(coords: L.LatLng[], offsetMeters: number): L.LatLng[] {
  if (coords.length < 2 || offsetMeters === 0) return coords;

  // Work in projected meters (EPSG:3857) to keep offset stable and avoid wiggle/overlap on curves.
  const pts = coords.map((c) => L.CRS.EPSG3857.project(c));

  const segNormals: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) {
      segNormals.push({ x: 0, y: 0 });
      continue;
    }
    // Left-hand normal of the segment direction
    segNormals.push({ x: -dy / len, y: dx / len });
  }

  const miterLimit = Math.abs(offsetMeters) * 4;
  const out: L.Point[] = [];

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];

    const n = (idx: number) => segNormals[Math.max(0, Math.min(segNormals.length - 1, idx))] ?? { x: 0, y: 0 };

    // Endpoints: simple shift by the nearest segment normal
    if (i === 0) {
      const nn = n(0);
      out.push(L.point(p.x + nn.x * offsetMeters, p.y + nn.y * offsetMeters));
      continue;
    }
    if (i === pts.length - 1) {
      const nn = n(segNormals.length - 1);
      out.push(L.point(p.x + nn.x * offsetMeters, p.y + nn.y * offsetMeters));
      continue;
    }

    // Vertex: miter join between adjacent segment offsets
    const nPrev = n(i - 1);
    const nNext = n(i);

    const mx = nPrev.x + nNext.x;
    const my = nPrev.y + nNext.y;
    const mLen = Math.hypot(mx, my);

    // If normals cancel out (almost 180° turn), fall back to next normal.
    if (mLen < 1e-6) {
      out.push(L.point(p.x + nNext.x * offsetMeters, p.y + nNext.y * offsetMeters));
      continue;
    }

    const miterX = mx / mLen;
    const miterY = my / mLen;

    // Scale miter to keep constant offset distance
    const dot = miterX * nNext.x + miterY * nNext.y;
    let scale = Math.abs(dot) < 1e-6 ? offsetMeters : offsetMeters / dot;

    if (Math.abs(scale) > miterLimit) {
      scale = Math.sign(scale) * miterLimit;
    }

    out.push(L.point(p.x + miterX * scale, p.y + miterY * scale));
  }

  return out.map((p) => L.CRS.EPSG3857.unproject(p));
}

function snapPointToPolyline(
  clickPoint: [number, number],
  polyline: [number, number][]
): RoadSnap | null {
  if (polyline.length < 2) return null;

  const click = L.CRS.EPSG3857.project(L.latLng(clickPoint[0], clickPoint[1]));

  let best: RoadSnap | null = null;
  let bestDist2 = Infinity;

  for (let i = 0; i < polyline.length - 1; i++) {
    const aLL = polyline[i];
    const bLL = polyline[i + 1];

    const a = L.CRS.EPSG3857.project(L.latLng(aLL[0], aLL[1]));
    const b = L.CRS.EPSG3857.project(L.latLng(bLL[0], bLL[1]));

    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    if (len2 === 0) continue;

    const wx = click.x - a.x;
    const wy = click.y - a.y;
    let t = (wx * vx + wy * vy) / len2;
    t = Math.max(0, Math.min(1, t));

    const projX = a.x + vx * t;
    const projY = a.y + vy * t;
    const dx = click.x - projX;
    const dy = click.y - projY;
    const dist2 = dx * dx + dy * dy;

    if (dist2 < bestDist2) {
      bestDist2 = dist2;
      best = {
        segIndex: i,
        t,
        point: [
          aLL[0] + (bLL[0] - aLL[0]) * t,
          aLL[1] + (bLL[1] - aLL[1]) * t,
        ],
      };
    }
  }

  return best;
}

function slicePolylineBetweenSnaps(
  polyline: [number, number][],
  start: RoadSnap,
  end: RoadSnap
): [number, number][] {
  if (polyline.length < 2) return [start.point, end.point];

  const startPos = start.segIndex + start.t;
  const endPos = end.segIndex + end.t;

  const forward = (a: RoadSnap, b: RoadSnap): [number, number][] => {
    const out: [number, number][] = [];
    out.push(a.point);

    // include intermediate vertices
    for (let i = a.segIndex + 1; i <= b.segIndex; i++) {
      const v = polyline[i];
      const prev = out[out.length - 1];
      if (!prev || prev[0] !== v[0] || prev[1] !== v[1]) out.push(v);
    }

    const last = out[out.length - 1];
    if (!last || last[0] !== b.point[0] || last[1] !== b.point[1]) out.push(b.point);
    return out;
  };

  if (startPos <= endPos) return forward(start, end);
  return forward(end, start).slice().reverse();
}
