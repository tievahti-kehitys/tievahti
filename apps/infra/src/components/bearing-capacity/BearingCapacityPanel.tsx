import React, { useCallback } from 'react';
import { useProject } from '@/context/ProjectContext';
import { useBearingCapacityContext } from '@/context/BearingCapacityContext';
import { useRole } from '@/context/RoleContext';
import { BranchManager } from './BranchManager';
import { MassCalcPanel } from './MassCalcPanel';
import { Loader2, BarChart3 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FWDMeasurementPoint, parseFWDFile, extractBranchName } from '@/lib/fwdParser';
import { v4 as uuidv4 } from 'uuid';
import { haversineDistance, findClosestPointOnRoad } from '@/lib/roadGeometryUtils';

type LatLng = [number, number];

const COVERAGE_THRESHOLD_M = 2;
const MERGE_SNAP_M = 30;

/**
 * Merge new coordinates into existing road segments by trimming
 * the overlapping portion and splicing the unique part into the
 * nearest existing segment. This avoids duplicate parallel lines.
 */
function mergeNewCoordsIntoSegments(
  existingSegments: LatLng[][],
  newCoords: LatLng[]
): LatLng[][] {
  if (existingSegments.length === 0) return [newCoords];

  const allExisting = existingSegments.flat();
  if (allExisting.length < 2) return [...existingSegments, newCoords];

  // 1. Trim covered points from start of new coords
  let trimStart = 0;
  while (trimStart < newCoords.length) {
    const d = findClosestPointOnRoad(newCoords[trimStart], allExisting).distance;
    if (d > COVERAGE_THRESHOLD_M) break;
    trimStart++;
  }

  // 2. Trim covered points from end of new coords
  let trimEnd = newCoords.length - 1;
  while (trimEnd > trimStart) {
    const d = findClosestPointOnRoad(newCoords[trimEnd], allExisting).distance;
    if (d > COVERAGE_THRESHOLD_M) break;
    trimEnd--;
  }

  if (trimStart > trimEnd) return existingSegments; // fully covered

  // The unique (uncovered) portion of the new geometry
  const uniquePart = newCoords.slice(trimStart, trimEnd + 1);

  // 3. Find connection anchors on new coords (last covered point on each side)
  const startAnchor = trimStart > 0 ? newCoords[trimStart - 1] : null;
  const endAnchor = trimEnd < newCoords.length - 1 ? newCoords[trimEnd + 1] : null;

  // 4. Find where anchors snap onto existing segment vertices
  const findSnapOnSegments = (anchor: LatLng) => {
    let bestSeg = -1, bestIdx = 0, bestDist = Infinity;
    for (let s = 0; s < existingSegments.length; s++) {
      const seg = existingSegments[s];
      for (let i = 0; i < seg.length; i++) {
        const d = haversineDistance(anchor, seg[i]);
        if (d < bestDist) {
          bestDist = d;
          bestSeg = s;
          bestIdx = i;
        }
      }
    }
    return { segIdx: bestSeg, vertexIdx: bestIdx, distance: bestDist };
  };

  const startSnap = startAnchor ? findSnapOnSegments(startAnchor) : null;
  const endSnap = endAnchor ? findSnapOnSegments(endAnchor) : null;

  const result = existingSegments.map(s => [...s]);

  // Case A: both ends connect to the same existing segment → splice into it
  if (
    startSnap && endSnap &&
    startSnap.distance <= MERGE_SNAP_M && endSnap.distance <= MERGE_SNAP_M &&
    startSnap.segIdx === endSnap.segIdx
  ) {
    const sIdx = startSnap.segIdx;
    const seg = result[sIdx];
    const lo = Math.min(startSnap.vertexIdx, endSnap.vertexIdx);
    const hi = Math.max(startSnap.vertexIdx, endSnap.vertexIdx);
    const before = seg.slice(0, lo + 1);
    const after = seg.slice(hi);
    const ordered = startSnap.vertexIdx <= endSnap.vertexIdx ? uniquePart : [...uniquePart].reverse();
    result[sIdx] = [...before, ...ordered, ...after];
    return result;
  }

  // Case B: start connects near end of an existing segment → append
  if (startSnap && startSnap.distance <= MERGE_SNAP_M) {
    const seg = result[startSnap.segIdx];
    const isNearEnd = startSnap.vertexIdx >= seg.length - 3;
    const isNearStart = startSnap.vertexIdx <= 2;
    if (isNearEnd) {
      result[startSnap.segIdx] = [...seg.slice(0, startSnap.vertexIdx + 1), ...uniquePart];
      if (endSnap && endSnap.distance <= MERGE_SNAP_M && endSnap.segIdx !== startSnap.segIdx) {
        const endSeg = result[endSnap.segIdx];
        result[startSnap.segIdx] = [...result[startSnap.segIdx], ...endSeg.slice(endSnap.vertexIdx)];
        result.splice(endSnap.segIdx, 1);
      }
      return result;
    }
    if (isNearStart) {
      result[startSnap.segIdx] = [...[...uniquePart].reverse(), ...seg.slice(startSnap.vertexIdx)];
      return result;
    }
    // Mid-segment connection: split and extend
    result[startSnap.segIdx] = [...seg.slice(0, startSnap.vertexIdx + 1), ...uniquePart];
    return result;
  }

  // Case C: end connects to an existing segment → prepend/append
  if (endSnap && endSnap.distance <= MERGE_SNAP_M) {
    const seg = result[endSnap.segIdx];
    const isNearStart = endSnap.vertexIdx <= 2;
    const isNearEnd = endSnap.vertexIdx >= seg.length - 3;
    if (isNearStart) {
      result[endSnap.segIdx] = [...uniquePart, ...seg.slice(endSnap.vertexIdx)];
      return result;
    }
    if (isNearEnd) {
      result[endSnap.segIdx] = [...seg.slice(0, endSnap.vertexIdx + 1), ...[...uniquePart].reverse()];
      return result;
    }
    // Mid-segment connection
    result[endSnap.segIdx] = [...uniquePart, ...seg.slice(endSnap.vertexIdx)];
    return result;
  }

  // Case D: no connection → add as new segment
  result.push(uniquePart);
  return result;
}

export function BearingCapacityPanel() {
  const { project } = useProject();
  const { branches, points, loading, addBranch, updateBranch, deleteBranch, uploadFWDFile, deletePointsForBranch, refresh, updateBranchGeometry } = useBearingCapacityContext();
  const { canEdit } = useRole();
  const isReadOnly = !canEdit();

  const findUncoveredGroups = useCallback((parsedPoints: FWDMeasurementPoint[]): FWDMeasurementPoint[][] => {
    const segments = project?.roadGeometry?.segments;
    if (!segments || segments.length === 0) return [parsedPoints];

    const allRoadCoords = segments.flat() as LatLng[];
    if (allRoadCoords.length < 2) return [parsedPoints];

    const isNearRoad = (lat: number, lng: number): boolean => {
      const result = findClosestPointOnRoad([lat, lng], allRoadCoords);
      return result.distance <= COVERAGE_THRESHOLD_M;
    };

    const covered = parsedPoints.map(p => isNearRoad(p.latitude, p.longitude));

    const groups: FWDMeasurementPoint[][] = [];
    let i = 0;
    while (i < parsedPoints.length) {
      if (!covered[i]) {
        const startIdx = i;
        while (i < parsedPoints.length && !covered[i]) i++;
        const endIdx = i;

        const group: FWDMeasurementPoint[] = [];
        if (startIdx > 0 && covered[startIdx - 1]) {
          group.push(parsedPoints[startIdx - 1]);
        }
        for (let j = startIdx; j < endIdx; j++) {
          group.push(parsedPoints[j]);
        }
        if (endIdx < parsedPoints.length && covered[endIdx]) {
          group.push(parsedPoints[endIdx]);
        }
        if (group.length >= 2) {
          groups.push(group);
        }
      } else {
        i++;
      }
    }

    return groups;
  }, [project?.roadGeometry]);

  const fetchRoadGeometryForGroup = useCallback(async (groupPoints: FWDMeasurementPoint[]): Promise<LatLng[] | null> => {
    if (groupPoints.length < 2) return null;

    const first = groupPoints[0];
    const last = groupPoints[groupPoints.length - 1];

    let waypoints: { lat: number; lng: number }[] = [];
    if (groupPoints.length > 2) {
      const intermediates = groupPoints.slice(1, -1);
      if (intermediates.length <= 25) {
        waypoints = intermediates.map(p => ({ lat: p.latitude, lng: p.longitude }));
      } else {
        const step = intermediates.length / 25;
        for (let i = 0; i < 25; i++) {
          const idx = Math.floor(i * step);
          waypoints.push({ lat: intermediates[idx].latitude, lng: intermediates[idx].longitude });
        }
      }
    }

    try {
      const { data, error } = await supabase.functions.invoke('google-directions', {
        body: {
          startLat: first.latitude,
          startLng: first.longitude,
          endLat: last.latitude,
          endLng: last.longitude,
          waypoints,
        },
      });

      if (error) throw error;
      if (!data?.coordinates || data.coordinates.length < 2) {
        console.warn('No road geometry returned from Google');
        return null;
      }

      return data.coordinates as LatLng[];
    } catch (err) {
      console.error('Road geometry fetch failed:', err);
      return null;
    }
  }, []);

  const handleUploadFWD = useCallback(async (branchId: string, fileContent: string) => {
    const parsedPoints = await uploadFWDFile(branchId, fileContent);

    // Fetch road geometry for the ENTIRE branch's measurement points
    // and save it to BOTH the project road geometry AND the branch's own geometry
    const allBranchCoords: LatLng[] = parsedPoints.map(p => [p.latitude, p.longitude] as LatLng);

    // Fetch full branch road geometry from Google Directions
    let branchRoadCoords: LatLng[] | null = null;
    if (parsedPoints.length >= 2) {
      branchRoadCoords = await fetchRoadGeometryForGroup(parsedPoints);
    }

    // Save branch's own geometry to road_branches.geometry (STRICT ISOLATION)
    if (branchRoadCoords && branchRoadCoords.length >= 2) {
      await supabase
        .from('road_branches')
        .update({ geometry: { coordinates: branchRoadCoords } as any })
        .eq('id', branchId);
    } else if (allBranchCoords.length >= 2) {
      // Fallback: store measurement points as geometry
      await supabase
        .from('road_branches')
        .update({ geometry: { coordinates: allBranchCoords } as any })
        .eq('id', branchId);
    }

    // Refresh branches so map picks up the new geometry
    await refresh();

    toast.success('Tiegeometria haettu ja tallennettu haaralle');

    return parsedPoints;
  }, [uploadFWDFile, fetchRoadGeometryForGroup, refresh]);

  const handleBatchImport = useCallback(async (files: { branchName: string; content: string }[]) => {
    for (const file of files) {
      // Create branch with default values
      await addBranch(file.branchName, 80, 4);
    }
    // Re-fetch branches to get newly created IDs
    await refresh();

    // Now fetch branches again to get IDs
    const { data: freshBranches } = await supabase
      .from('road_branches')
      .select('id, name')
      .eq('project_id', project!.id)
      .order('created_at', { ascending: true });

    if (!freshBranches) throw new Error('Haarojen haku epäonnistui');

    for (const file of files) {
      const branch = freshBranches.find(b => b.name === file.branchName);
      if (!branch) continue;
      await handleUploadFWD(branch.id, file.content);
    }
  }, [addBranch, refresh, project, handleUploadFWD]);

  if (!project) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Valitse ensin projekti.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-primary" />
        <h2 className="text-sm font-bold text-sidebar-foreground">Kantavuusmittaus</h2>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {isReadOnly && (
        <div className="flex items-center gap-2 px-3 py-2 bg-sidebar-accent/50 rounded-lg border border-sidebar-border text-xs text-sidebar-foreground/60">
          <Loader2 className="w-3.5 h-3.5 hidden" />
          <span>Katseluoikeus – FWD-datan tuonti ja haarojen hallinta ei sallittu.</span>
        </div>
      )}

      <BranchManager
        branches={branches}
        points={points}
        onAddBranch={isReadOnly ? async () => {} : addBranch}
        onUpdateBranch={isReadOnly ? async () => {} : updateBranch}
        onDeleteBranch={isReadOnly ? async () => {} : deleteBranch}
        onUploadFWD={isReadOnly ? async () => [] : handleUploadFWD}
        onDeletePoints={isReadOnly ? async () => {} : deletePointsForBranch}
        onClearGeometry={isReadOnly ? async () => {} : async (id) => { await updateBranchGeometry(id, null); }}
        onBatchImport={isReadOnly ? async () => {} : handleBatchImport}
        readOnly={isReadOnly}
      />

      {/* Mass Calculation Section */}
      {branches.length > 0 && (
        <>
          <Separator className="bg-sidebar-border" />
          <MassCalcPanel />
        </>
      )}
    </div>
  );
}
