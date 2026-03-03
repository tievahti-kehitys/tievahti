/**
 * Helpers for working with MultiLineString road geometry (segments).
 * All coordinates are [lat, lng] tuples.
 */

import { RoadGeometry } from '@/types/project';
import { haversineDistance } from './roadGeometryUtils';

type LatLng = [number, number];

/**
 * Migrate legacy RoadGeometry (single coordinates array) to segments format.
 * If already has segments, returns as-is.
 */
export function ensureSegments(geo: RoadGeometry): RoadGeometry {
  if (geo.segments && geo.segments.length > 0) return geo;
  if (geo.coordinates && geo.coordinates.length >= 2) {
    return {
      ...geo,
      segments: [geo.coordinates],
    };
  }
  return { ...geo, segments: [] };
}

/**
 * Get all coordinates flattened from all segments.
 * Useful for bounds calculation, chainage, snapping products to road.
 */
export function getAllCoordinatesFlat(geo: RoadGeometry): LatLng[] {
  const segs = geo.segments || (geo.coordinates ? [geo.coordinates] : []);
  const result: LatLng[] = [];
  for (const seg of segs) {
    for (const coord of seg) {
      result.push(coord);
    }
  }
  return result;
}

/**
 * Get the "main line" coordinates — the first segment's coordinates,
 * for backward compatibility with code that expects a single line.
 */
export function getMainLineCoordinates(geo: RoadGeometry): LatLng[] {
  if (geo.segments && geo.segments.length > 0) return geo.segments[0];
  return geo.coordinates || [];
}

/**
 * Calculate total length across all segments.
 */
export function calculateTotalLength(segments: LatLng[][]): number {
  let total = 0;
  for (const seg of segments) {
    for (let i = 1; i < seg.length; i++) {
      total += haversineDistance(seg[i - 1], seg[i]);
    }
  }
  return total;
}

/**
 * Get the coordinates field for backward compat (flatten first segment).
 * When saving to DB, we still keep the `coordinates` field populated.
 */
export function getCoordinatesForCompat(geo: RoadGeometry): LatLng[] {
  return getMainLineCoordinates(geo);
}

/**
 * Snap threshold in meters for connecting to existing road segments.
 */
export const SNAP_THRESHOLD_METERS = 30;

export interface SnapResult {
  snapped: boolean;
  point: LatLng;
  segmentIndex: number; // which segment
  vertexIndex: number; // which vertex within segment
  t: number; // fraction along segment edge
  distance: number; // meters from original point
}

/**
 * Try to snap a point to the nearest point on any existing road segment.
 * Returns snap info if within threshold, otherwise returns unsnapped.
 */
export function snapToExistingRoad(
  point: LatLng,
  segments: LatLng[][],
  thresholdMeters: number = SNAP_THRESHOLD_METERS
): SnapResult {
  let bestDistance = Infinity;
  let bestPoint: LatLng = point;
  let bestSegIdx = -1;
  let bestVertIdx = 0;
  let bestT = 0;

  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const seg = segments[sIdx];
    for (let i = 0; i < seg.length - 1; i++) {
      const a = seg[i];
      const b = seg[i + 1];
      
      // Project point onto segment
      const dx = b[1] - a[1];
      const dy = b[0] - a[0];
      const len2 = dx * dx + dy * dy;
      
      let t = 0;
      let projPoint: LatLng;
      
      if (len2 === 0) {
        projPoint = a;
      } else {
        t = Math.max(0, Math.min(1, 
          ((point[0] - a[0]) * dy + (point[1] - a[1]) * dx) / len2
        ));
        projPoint = [a[0] + t * dy, a[1] + t * dx];
      }
      
      const dist = haversineDistance(point, projPoint);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestPoint = projPoint;
        bestSegIdx = sIdx;
        bestVertIdx = i;
        bestT = t;
      }
    }
  }

  return {
    snapped: bestDistance <= thresholdMeters && bestSegIdx >= 0,
    point: bestDistance <= thresholdMeters ? bestPoint : point,
    segmentIndex: bestSegIdx,
    vertexIndex: bestVertIdx,
    t: bestT,
    distance: bestDistance,
  };
}

/**
 * Append a new segment to existing segments.
 * Returns a new segments array with the new segment added.
 */
export function appendSegment(
  existingSegments: LatLng[][],
  newSegment: LatLng[]
): LatLng[][] {
  return [...existingSegments, newSegment];
}

/**
 * Insert a vertex into a segment if it doesn't already exist at that coordinate.
 * Used to ensure junction points are real vertices for topological exactness.
 * Returns a new segments array with the vertex inserted.
 */
export function insertVertexIfNeeded(
  segments: LatLng[][],
  segIdx: number,
  point: LatLng,
  toleranceCoord: number = 0.000001
): LatLng[][] {
  const seg = segments[segIdx];
  if (!seg || seg.length < 2) return segments;

  // Check if point already exists as a vertex
  for (const v of seg) {
    if (Math.abs(v[0] - point[0]) < toleranceCoord && Math.abs(v[1] - point[1]) < toleranceCoord) {
      return segments; // Already exists
    }
  }

  // Find the edge where the point should be inserted
  let bestIdx = 1;
  let bestDist = Infinity;
  for (let i = 0; i < seg.length - 1; i++) {
    const a = seg[i];
    const b = seg[i + 1];
    // Project point onto edge
    const dx = b[1] - a[1];
    const dy = b[0] - a[0];
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dy + (point[1] - a[1]) * dx) / len2));
    const proj: LatLng = [a[0] + t * dy, a[1] + t * dx];
    const dist = Math.hypot(point[0] - proj[0], point[1] - proj[1]);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i + 1;
    }
  }

  const newSeg: LatLng[] = [...seg];
  newSeg.splice(bestIdx, 0, point);
  return segments.map((s, i) => i === segIdx ? newSeg : s);
}

/**
 * Find the endpoints of all segments (first and last point of each).
 * Useful for UI display and connection logic.
 */
export function getSegmentEndpoints(segments: LatLng[][]): { start: LatLng; end: LatLng; segmentIndex: number }[] {
  return segments.map((seg, idx) => ({
    start: seg[0],
    end: seg[seg.length - 1],
    segmentIndex: idx,
  }));
}

/**
 * Check if a point is a junction (shared between multiple segments).
 * Returns the indices of segments that share this point.
 */
export function findJunctionSegments(
  point: LatLng,
  segments: LatLng[][],
  toleranceMeters: number = 1
): { segmentIndex: number; isStart: boolean }[] {
  const junctions: { segmentIndex: number; isStart: boolean }[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.length === 0) continue;
    
    if (haversineDistance(point, seg[0]) <= toleranceMeters) {
      junctions.push({ segmentIndex: i, isStart: true });
    }
    if (haversineDistance(point, seg[seg.length - 1]) <= toleranceMeters) {
      junctions.push({ segmentIndex: i, isStart: false });
    }
  }
  
  return junctions;
}
