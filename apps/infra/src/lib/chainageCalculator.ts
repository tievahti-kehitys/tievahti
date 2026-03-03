/**
 * Automatic chainage (paalu) calculation for project items.
 * Finds the nearest road branch and calculates distance along it.
 */

import { supabase } from '@/integrations/supabase/client';
import { haversineDistance, findClosestPointOnRoad, calculatePolylineLength } from './roadGeometryUtils';

type LatLng = [number, number];

interface BranchGeometry {
  id: string;
  coordinates: LatLng[]; // flattened from segments
}

/**
 * Flatten a branch geometry (which may have segments) into a single coordinate array.
 */
function flattenBranchGeometry(geometry: any): LatLng[] {
  if (!geometry) return [];
  // MultiLineString-style: { segments: LatLng[][] }
  if (geometry.segments && Array.isArray(geometry.segments) && geometry.segments.length > 0) {
    return geometry.segments.flat() as LatLng[];
  }
  // Legacy: { coordinates: LatLng[] }
  if (geometry.coordinates && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates as LatLng[];
  }
  return [];
}

/**
 * Calculate distance along a polyline from its start to a projected point.
 */
function distanceAlongPolyline(
  roadCoords: LatLng[],
  segmentIndex: number,
  t: number,
): number {
  let distance = 0;
  // Sum full segments before the snap segment
  for (let i = 0; i < segmentIndex; i++) {
    distance += haversineDistance(roadCoords[i], roadCoords[i + 1]);
  }
  // Add partial segment
  if (segmentIndex < roadCoords.length - 1) {
    const segLength = haversineDistance(roadCoords[segmentIndex], roadCoords[segmentIndex + 1]);
    distance += segLength * t;
  }
  return distance;
}

/**
 * Find nearest branch and calculate chainage for a single point.
 */
function calcChainageForPoint(
  point: LatLng,
  branches: BranchGeometry[],
): { branchId: string; chainage: number } | null {
  let bestBranch: string | null = null;
  let bestChainage = 0;
  let bestDistance = Infinity;

  for (const branch of branches) {
    if (branch.coordinates.length < 2) continue;
    const snap = findClosestPointOnRoad(point, branch.coordinates);
    if (snap.distance < bestDistance) {
      bestDistance = snap.distance;
      bestBranch = branch.id;
      bestChainage = distanceAlongPolyline(branch.coordinates, snap.segmentIndex, snap.t);
    }
  }

  if (!bestBranch) return null;
  return { branchId: bestBranch, chainage: Math.round(bestChainage) };
}

export interface ChainageResult {
  chainageStart: number;
  chainageEnd?: number;
}

/**
 * Calculate chainage for a product geometry (point or line) based on project's road branches.
 * Returns null if no branches exist or geometry is invalid.
 */
export async function calculateChainage(
  projectId: string,
  geometry: { type: string; coordinates: any },
): Promise<ChainageResult | null> {
  // Fetch branches
  const { data: branchRows, error } = await supabase
    .from('road_branches')
    .select('id, geometry')
    .eq('project_id', projectId);

  if (error || !branchRows || branchRows.length === 0) return null;

  const branches: BranchGeometry[] = branchRows
    .map(r => ({
      id: r.id,
      coordinates: flattenBranchGeometry(r.geometry),
    }))
    .filter(b => b.coordinates.length >= 2);

  if (branches.length === 0) return null;

  if (geometry.type === 'point') {
    const coords = geometry.coordinates as LatLng;
    const result = calcChainageForPoint(coords, branches);
    if (!result) return null;
    return { chainageStart: result.chainage };
  }

  if (geometry.type === 'line' || geometry.type === 'polygon') {
    const coords = geometry.coordinates as LatLng[];
    if (!coords || coords.length < 2) return null;
    const startResult = calcChainageForPoint(coords[0], branches);
    const endResult = calcChainageForPoint(coords[coords.length - 1], branches);
    if (!startResult) return null;
    return {
      chainageStart: startResult.chainage,
      chainageEnd: endResult?.chainage,
    };
  }

  return null;
}
