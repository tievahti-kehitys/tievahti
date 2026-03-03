/**
 * Road Mass Calculation Engine
 * 
 * Reads bearing capacity measurement points and computes:
 * - Required structural layer thicknesses (Odemark)
 * - Repair segments with influence/merge/cut logic
 * - Material quantities (KaM16, KaM32, KaM56, Geotextile, Ditch)
 * - Writes generated project_items to DB (re-run safe)
 * - Returns map JSON for repair segment visualization
 */

import { supabase } from '@/integrations/supabase/client';
import { haversineDistance } from '@/lib/roadGeometryUtils';

// ── Fixed constants ──
const A = 0.15; // m
const E_MOD_BASE = 280; // MN/m²
const DENSITY = 2.4; // t/m³

// ── Catalog item IDs – resolved dynamically at runtime ──
// These are looked up by name so they work across different Supabase environments.
type CatalogIds = {
  KAM16: string;
  KAM32: string;
  KAM56: string;
  GEOTEXTILE: string;
  OJA_KAIVUU: string;
};

let _catalogIds: CatalogIds | null = null;

async function getCatalogIds(): Promise<CatalogIds> {
  if (_catalogIds) return _catalogIds;

  const { data, error } = await supabase
    .from('catalog_items')
    .select('id, name')
    .in('name', ['KaM 16 (tiivistetty)', 'KaM 32 (tiivistetty)', 'KaM 0/56 (tiivistetty)', 'Suodatinkangas', 'Ojan kaivuu']);

  if (error || !data) throw new Error('Katalogi-ID:ien haku epäonnistui: ' + error?.message);

  const byName = new Map(data.map(r => [r.name, r.id]));

  const ids: CatalogIds = {
    KAM16: byName.get('KaM 16 (tiivistetty)') ?? '',
    KAM32: byName.get('KaM 32 (tiivistetty)') ?? '',
    KAM56: byName.get('KaM 0/56 (tiivistetty)') ?? '',
    GEOTEXTILE: byName.get('Suodatinkangas') ?? '',
    OJA_KAIVUU: byName.get('Ojan kaivuu') ?? '',
  };

  const missing = Object.entries(ids).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) throw new Error(`Puuttuvat katalogituotteet: ${missing.join(', ')}`);

  _catalogIds = ids;
  return ids;
}

// ── Types ──
export interface MassCalcGlobalSettings {
  influenceDistanceM: number;
  cutLengthM: number;
  surfaceThicknessM: number;
  springFactor: number;
}

export interface BranchData {
  id: string;
  name: string;
  targetBearingCapacity: number;
  roadWidth: number;
}

export interface NormalizedPoint {
  station: number;
  measuredValue: number;
  effectiveMeasured: number;
  deficit: number;
  hReq: number;
  latitude: number;
  longitude: number;
  invalid: boolean;
}

export interface RepairSegment {
  id: number;
  start: number;       // FWD station start
  end: number;         // FWD station end
  chainageStart: number; // road chainage start (meters along road polyline)
  chainageEnd: number;   // road chainage end
  lengthM: number;     // chainage-based length (= chainageEnd - chainageStart)
  hSeg: number; // dominant thickness (m)
  thickness32: number;
  thickness56: number;
  volume32: number;
  weight32: number;
  volume56: number;
  weight56: number;
  needsGeotextile: boolean;
  geoArea: number;
}

export interface BranchResult {
  branch: BranchData;
  branchEnd: number;
  chainageMin: number;   // road chainage of first measurement point
  chainageMax: number;   // road chainage of last measurement point
  points: NormalizedPoint[];
  segments: RepairSegment[];
  kam16Volume: number;
  kam16Weight: number;
  ojaLength: number;
  totals: {
    kam16_m3: number; kam16_t: number;
    kam32_m3: number; kam32_t: number;
    kam56_m3: number; kam56_t: number;
    geo_m2: number;
  };
}

export interface MassCalcResult {
  runId: string;
  branches: BranchResult[];
  globalSettings: MassCalcGlobalSettings;
  grandTotals: {
    kam16_m3: number; kam16_t: number;
    kam32_m3: number; kam32_t: number;
    kam56_m3: number; kam56_t: number;
  };
}

// ── Helpers ──
const r2 = (n: number) => Math.round(n * 100) / 100;

// ── Odemark Solver ──
function odemarkPredicted(ea: number, h: number): number {
  if (ea <= 0 || h < 0) return 0;
  const ratio = h / A;
  const sqTerm = Math.sqrt(1 + 0.81 * ratio * ratio);
  const invSq = 1 / sqTerm;
  const eRatio = ea / E_MOD_BASE;
  const sqTerm2 = Math.sqrt(1 + 0.81 * ratio * ratio * Math.pow(E_MOD_BASE / ea, 2 / 3));
  const invSq2 = 1 / sqTerm2;
  const denominator = (1 - invSq) * eRatio + invSq2;
  if (denominator <= 0) return 0;
  return ea / denominator;
}

function solveOdemarkThickness(ea: number, target: number): number {
  if (ea <= 0) return 0;
  if (odemarkPredicted(ea, 0) >= target) return 0;

  let hMin = 0;
  let hMax = 2.0;
  // Expand if needed
  while (odemarkPredicted(ea, hMax) < target && hMax < 5.0) {
    hMax += 1.0;
  }
  if (odemarkPredicted(ea, hMax) < target) return hMax;

  for (let i = 0; i < 35; i++) {
    const mid = (hMin + hMax) / 2;
    if (odemarkPredicted(ea, mid) >= target) {
      hMax = mid;
    } else {
      hMin = mid;
    }
  }
  return hMax;
}

// ── Linear referencing: interpolate point at distance along polyline ──
function interpolateAtDistance(coords: [number, number][], targetDist: number): [number, number] | null {
  if (coords.length < 2) return coords[0] || null;
  let accum = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const segLen = haversineDistance(coords[i], coords[i + 1]);
    if (accum + segLen >= targetDist) {
      const frac = segLen > 0 ? (targetDist - accum) / segLen : 0;
      return [
        coords[i][0] + frac * (coords[i + 1][0] - coords[i][0]),
        coords[i][1] + frac * (coords[i + 1][1] - coords[i][1]),
      ];
    }
    accum += segLen;
  }
  return coords[coords.length - 1];
}

export function clipPolyline(coords: [number, number][], startDist: number, endDist: number): [number, number][] {
  if (coords.length < 2) return coords;
  const result: [number, number][] = [];
  let accum = 0;
  let started = false;

  for (let i = 0; i < coords.length - 1; i++) {
    const segLen = haversineDistance(coords[i], coords[i + 1]);
    const segStart = accum;
    const segEnd = accum + segLen;

    if (!started && segEnd >= startDist) {
      // Start point on this segment
      const frac = segLen > 0 ? Math.max(0, startDist - segStart) / segLen : 0;
      result.push([
        coords[i][0] + frac * (coords[i + 1][0] - coords[i][0]),
        coords[i][1] + frac * (coords[i + 1][1] - coords[i][1]),
      ]);
      started = true;
    }

    if (started) {
      if (segEnd >= endDist) {
        // End point on this segment
        const frac = segLen > 0 ? Math.max(0, endDist - segStart) / segLen : 0;
        result.push([
          coords[i][0] + frac * (coords[i + 1][0] - coords[i][0]),
          coords[i][1] + frac * (coords[i + 1][1] - coords[i][1]),
        ]);
        break;
      } else {
        result.push(coords[i + 1]);
      }
    }
    accum += segLen;
  }
  return result;
}

// ── Segmentation ──
function buildSegments(
  points: NormalizedPoint[],
  branchEnd: number,
  influenceDistance: number,
  cutLength: number,
): RepairSegment[] {
  // Step 1: Build influence intervals from bad points
  const badPoints = points.filter(p => p.hReq > 0 && !p.invalid);
  if (badPoints.length === 0) return [];

  const intervals: { start: number; end: number }[] = badPoints.map(p => ({
    start: Math.max(0, p.station - influenceDistance),
    end: Math.min(branchEnd, p.station + influenceDistance),
  }));

  // Step 2: Merge overlapping intervals
  intervals.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    if (intervals[i].start <= last.end) {
      last.end = Math.max(last.end, intervals[i].end);
    } else {
      merged.push({ ...intervals[i] });
    }
  }

  // Step 3: For each merged interval, compute dominance & forced cuts
  const segments: RepairSegment[] = [];
  let segId = 1;

  for (const interval of merged) {
    const length = interval.end - interval.start;
    
    if (length <= cutLength) {
      // Single segment
      const hSeg = dominantThickness(badPoints, interval.start, interval.end);
      segments.push(createSegment(segId++, interval.start, interval.end, hSeg, 0));
    } else {
      // Forced cut into pieces
      const pieces: { start: number; end: number; hSeg: number }[] = [];
      let pos = interval.start;
      while (pos < interval.end) {
        const pieceEnd = Math.min(pos + cutLength, interval.end);
        const hSeg = dominantThickness(badPoints, pos, pieceEnd);
        pieces.push({ start: pos, end: pieceEnd, hSeg });
        pos = pieceEnd;
      }

      // End handling: merge last short piece if appropriate
      if (pieces.length >= 2) {
        const last = pieces[pieces.length - 1];
        const prev = pieces[pieces.length - 2];
        const lastLen = last.end - last.start;
        if (lastLen < 46 && Math.abs(last.hSeg - prev.hSeg) <= 0.02) {
          prev.end = last.end;
          prev.hSeg = Math.max(prev.hSeg, last.hSeg);
          pieces.pop();
        }
      }

      for (const piece of pieces) {
        segments.push(createSegment(segId++, piece.start, piece.end, piece.hSeg, 0));
      }
    }
  }

  return segments;
}

function dominantThickness(badPoints: NormalizedPoint[], start: number, end: number): number {
  let maxH = 0;
  for (const p of badPoints) {
    if (p.station >= start && p.station <= end) {
      maxH = Math.max(maxH, p.hReq);
    }
  }
  // Also check points whose influence zones overlap this segment
  // (a point outside the segment but whose influence still covers it)
  return maxH;
}

function createSegment(id: number, start: number, end: number, hSeg: number, _roadWidth: number): RepairSegment {
  const lengthM = r2(end - start);
  const thickness32 = r2(Math.min(hSeg, 0.10));
  const thickness56 = r2(Math.max(0, hSeg - 0.10));

  return {
    id,
    start: r2(start),
    end: r2(end),
    chainageStart: 0, // will be set later in processBranch
    chainageEnd: 0,
    lengthM,
    hSeg: r2(hSeg),
    thickness32,
    thickness56,
    volume32: 0, // computed later with roadWidth
    weight32: 0,
    volume56: 0,
    weight56: 0,
    needsGeotextile: thickness56 > 0,
    geoArea: 0,
  };
}

function computeSegmentQuantities(seg: RepairSegment, roadWidth: number): RepairSegment {
  const vol32 = r2(seg.lengthM * roadWidth * seg.thickness32);
  const vol56 = r2(seg.lengthM * roadWidth * seg.thickness56);
  return {
    ...seg,
    volume32: vol32,
    weight32: r2(vol32 * DENSITY),
    volume56: vol56,
    weight56: r2(vol56 * DENSITY),
    geoArea: seg.needsGeotextile ? r2(seg.lengthM * roadWidth) : 0,
  };
}

// ── Main Engine ──
export async function runMassCalculation(
  projectId: string,
  branchIds: string[],
): Promise<MassCalcResult> {
  // 1. Fetch global settings
  const globalSettings = await fetchGlobalSettings(projectId);

  // 2. Create run
  const runId = crypto.randomUUID();
  await supabase.from('mass_calc_runs').insert({
    id: runId,
    project_id: projectId,
    branch_ids: branchIds,
    settings: globalSettings as any,
    status: 'running',
  });

  // 3. Delete ALL existing mass_calc items for this project before recalculating
  //    This ensures previous calculations are fully replaced, not just per-branch.
  await supabase
    .from('project_items')
    .delete()
    .eq('project_id', projectId)
    .eq('source', 'mass_calc');

  // 4. Process each branch (strict isolation – no project road geometry needed)
  const branchResults: BranchResult[] = [];

  for (const branchId of branchIds) {
    const result = await processBranch(branchId, projectId, runId, globalSettings);
    branchResults.push(result);
  }

  // 5. Compute grand totals
  const grandTotals = {
    kam16_m3: r2(branchResults.reduce((s, b) => s + b.totals.kam16_m3, 0)),
    kam16_t: r2(branchResults.reduce((s, b) => s + b.totals.kam16_t, 0)),
    kam32_m3: r2(branchResults.reduce((s, b) => s + b.totals.kam32_m3, 0)),
    kam32_t: r2(branchResults.reduce((s, b) => s + b.totals.kam32_t, 0)),
    kam56_m3: r2(branchResults.reduce((s, b) => s + b.totals.kam56_m3, 0)),
    kam56_t: r2(branchResults.reduce((s, b) => s + b.totals.kam56_t, 0)),
  };

  // 6. Update run status
  await supabase.from('mass_calc_runs').update({ status: 'completed' }).eq('id', runId);

  return { runId, branches: branchResults, globalSettings, grandTotals };
}

async function fetchGlobalSettings(projectId: string): Promise<MassCalcGlobalSettings> {
  const { data } = await supabase
    .from('mass_calc_settings')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();

  if (data) {
    return {
      influenceDistanceM: Number(data.influence_distance_m),
      cutLengthM: Number(data.cut_length_m),
      surfaceThicknessM: Number(data.surface_thickness_m),
      springFactor: Number(data.spring_factor),
    };
  }
  // Create default settings
  const defaults: MassCalcGlobalSettings = {
    influenceDistanceM: 25,
    cutLengthM: 100,
    surfaceThicknessM: 0.05,
    springFactor: 1.0,
  };
  await supabase.from('mass_calc_settings').insert({
    project_id: projectId,
    influence_distance_m: defaults.influenceDistanceM,
    cut_length_m: defaults.cutLengthM,
    surface_thickness_m: defaults.surfaceThicknessM,
    spring_factor: defaults.springFactor,
  });
  return defaults;
}

// getRoadCoords and getRoadSegments removed — no longer needed with strict branch isolation

/** Project a lat/lon point onto a polyline, returning the distance along the polyline */
function projectPointOnPolyline(point: [number, number], polyline: [number, number][]): { chainage: number; dist: number } {
  let bestDist = Infinity;
  let bestChainage = 0;
  let accum = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const segLen = haversineDistance(polyline[i], polyline[i + 1]);
    if (segLen === 0) { accum += segLen; continue; }

    // Vector math for projection (using lat/lon as approximate planar coords)
    const dx = polyline[i + 1][0] - polyline[i][0];
    const dy = polyline[i + 1][1] - polyline[i][1];
    const px = point[0] - polyline[i][0];
    const py = point[1] - polyline[i][1];
    let t = (px * dx + py * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));

    const projLat = polyline[i][0] + t * dx;
    const projLon = polyline[i][1] + t * dy;
    const d = haversineDistance(point, [projLat, projLon]);

    if (d < bestDist) {
      bestDist = d;
      bestChainage = accum + t * segLen;
    }
    accum += segLen;
  }
  return { chainage: bestChainage, dist: bestDist };
}

// findBestSegmentForBranch removed — strict branch isolation means each branch
// MUST use its own stored geometry (road_branches.geometry) or measurement points.
// No heuristic matching against project road segments.

/** Build a linear mapping from FWD station values to road chainages.
 *  Projects first and last measurement points onto the road segment,
 *  then linearly interpolates all stations between them. */
function buildStationToChainageMapper(
  points: { station: number; latitude: number; longitude: number }[],
  roadCoords: [number, number][],
): (station: number) => number {
  if (points.length === 0 || roadCoords.length < 2) return (s) => s;

  const first = points[0];
  const last = points[points.length - 1];
  const firstChainage = projectPointOnPolyline([first.latitude, first.longitude], roadCoords).chainage;
  const lastChainage = projectPointOnPolyline([last.latitude, last.longitude], roadCoords).chainage;

  const stationSpan = last.station - first.station;
  const chainageSpan = lastChainage - firstChainage;

  if (stationSpan === 0) return () => firstChainage;

  // Linear mapping: station → road chainage
  return (station: number) => {
    const t = (station - first.station) / stationSpan;
    return firstChainage + t * chainageSpan;
  };
}

async function processBranch(
  branchId: string,
  projectId: string,
  runId: string,
  settings: MassCalcGlobalSettings,
): Promise<BranchResult & { effectiveRoadCoords: [number, number][] }> {
  // Fetch branch data
  const { data: branchRow } = await supabase
    .from('road_branches')
    .select('*')
    .eq('id', branchId)
    .single();

  if (!branchRow) throw new Error(`Branch ${branchId} not found`);

  const branch: BranchData = {
    id: branchRow.id,
    name: branchRow.name,
    targetBearingCapacity: Number(branchRow.target_bearing_capacity),
    roadWidth: Number(branchRow.road_width),
  };

  // Fetch measurement points
  const { data: rawPoints } = await supabase
    .from('measurement_points')
    .select('*')
    .eq('branch_id', branchId)
    .order('station', { ascending: true });

  if (!rawPoints || rawPoints.length === 0) {
    return { ...emptyBranchResult(branch), effectiveRoadCoords: [] };
  }

  // Step A: Normalize points
  const target = branch.targetBearingCapacity;
  const normalizedPoints: NormalizedPoint[] = rawPoints.map(p => {
    const measuredValue = Number(p.measured_value);
    const effectiveMeasured = r2(measuredValue * settings.springFactor);
    const invalid = effectiveMeasured <= 0;
    const deficit = r2(Math.max(0, target - effectiveMeasured));
    const hReq = (!invalid && deficit > 0)
      ? r2(solveOdemarkThickness(effectiveMeasured, target))
      : 0;
    return {
      station: Number(p.station),
      measuredValue,
      effectiveMeasured,
      deficit,
      hReq,
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      invalid,
    };
  });

  // Determine road geometry for this branch – STRICT ISOLATION.
  // Priority: 1) Branch's own stored geometry (road_branches.geometry) — saved during FWD upload
  //           2) Measurement points as polyline (guarantees strict branch isolation)
  // NO heuristic segment matching — this eliminates cross-branch contamination at junctions.
  const branchGeo = branchRow.geometry as any;
  const branchOwnCoords: [number, number][] = branchGeo?.coordinates?.length >= 2
    ? branchGeo.coordinates
    : (branchGeo?.segments?.length > 0 && branchGeo.segments[0].length >= 2
        ? branchGeo.segments[0]
        : []);

  let effectiveRoadCoords: [number, number][];
  if (branchOwnCoords.length >= 2) {
    // Branch has its own stored geometry – follows actual road curves
    effectiveRoadCoords = branchOwnCoords;
  } else {
    // No stored geometry – use measurement points as polyline (strict isolation fallback)
    effectiveRoadCoords = normalizedPoints.length >= 2
      ? normalizedPoints.map(p => [p.latitude, p.longitude] as [number, number])
      : [];
  }

  // Build station → road chainage mapping by projecting measurement points onto road
  const stationToChainage = buildStationToChainageMapper(normalizedPoints, effectiveRoadCoords);

  // Branch station range from measurement data
  const minStation = r2(Math.min(...normalizedPoints.map(p => p.station)));
  const maxStation = r2(Math.max(...normalizedPoints.map(p => p.station)));
  const branchEnd = maxStation; // kept for segmentation compatibility

  // Compute actual road length from chainage mapping (may differ from FWD station span)
  const chainageStart = stationToChainage(minStation);
  const chainageEnd = stationToChainage(maxStation);
  const roadLength = r2(Math.abs(chainageEnd - chainageStart));

  // Step B: Segmentation (uses FWD station values internally)
  const rawSegments = buildSegments(normalizedPoints, branchEnd, settings.influenceDistanceM, settings.cutLengthM);

  // Map segment stations to road chainages and recompute lengths/quantities
  const mappedSegments = rawSegments.map(s => {
    const cStart = r2(stationToChainage(s.start));
    const cEnd = r2(stationToChainage(s.end));
    const chainageLength = r2(Math.abs(cEnd - cStart));
    return computeSegmentQuantities({
      ...s,
      chainageStart: Math.min(cStart, cEnd),
      chainageEnd: Math.max(cStart, cEnd),
      lengthM: chainageLength,
    }, branch.roadWidth);
  });

  const segments = mappedSegments;

  // Step C: Whole-branch quantities – use road length, not FWD station span
  const kam16Vol = r2(roadLength * branch.roadWidth * settings.surfaceThicknessM);
  const kam16Weight = r2(kam16Vol * DENSITY);

  // Totals
  const totals = {
    kam16_m3: kam16Vol,
    kam16_t: kam16Weight,
    kam32_m3: r2(segments.reduce((s, seg) => s + seg.volume32, 0)),
    kam32_t: r2(segments.reduce((s, seg) => s + seg.weight32, 0)),
    kam56_m3: r2(segments.reduce((s, seg) => s + seg.volume56, 0)),
    kam56_t: r2(segments.reduce((s, seg) => s + seg.weight56, 0)),
    geo_m2: r2(segments.reduce((s, seg) => s + seg.geoArea, 0)),
  };

  // DB Write-back
  await writeBackToDb(projectId, branchId, runId, branch, segments, chainageStart, chainageEnd, settings, effectiveRoadCoords);

  return {
    branch, branchEnd,
    chainageMin: r2(chainageStart),
    chainageMax: r2(chainageEnd),
    points: normalizedPoints, segments,
    kam16Volume: kam16Vol, kam16Weight, ojaLength: roadLength, totals,
    effectiveRoadCoords,
  };
}

function emptyBranchResult(branch: BranchData): BranchResult {
  return {
    branch,
    branchEnd: 0,
    chainageMin: 0,
    chainageMax: 0,
    points: [],
    segments: [],
    kam16Volume: 0,
    kam16Weight: 0,
    ojaLength: 0,
    totals: { kam16_m3: 0, kam16_t: 0, kam32_m3: 0, kam32_t: 0, kam56_m3: 0, kam56_t: 0, geo_m2: 0 },
  };
}

// ── DB Write-back ──
async function writeBackToDb(
  projectId: string,
  branchId: string,
  runId: string,
  branch: BranchData,
  segments: RepairSegment[],
  chainageMin: number,
  chainageMax: number,
  settings: MassCalcGlobalSettings,
  roadCoords: [number, number][],
) {
  // 0. Resolve catalog IDs dynamically (works across environments)
  const CATALOG_IDS = await getCatalogIds();

  // Note: Project-level deletion already done in runMassCalculation before processing branches.
  // No per-branch deletion needed here.

  const items: any[] = [];

  // Helper to build geometry from chainage interval using road coords
  const buildLineGeometry = (cStart: number, cEnd: number) => {
    const lo = Math.min(cStart, cEnd);
    const hi = Math.max(cStart, cEnd);
    if (roadCoords.length >= 2) {
      const clipped = clipPolyline(roadCoords, lo, hi);
      if (clipped.length >= 2) {
        return { type: 'line', coordinates: clipped };
      }
    }
    // Fallback: use interpolated points
    const p1 = interpolateAtDistance(roadCoords, lo);
    const p2 = interpolateAtDistance(roadCoords, hi);
    if (p1 && p2) return { type: 'line', coordinates: [p1, p2] };
    return { type: 'point', coordinates: [0, 0] };
  };

  // 2. KaM16 - whole branch
  items.push({
    project_id: projectId,
    catalog_item_id: CATALOG_IDS.KAM16,
    geometry: buildLineGeometry(chainageMin, chainageMax),
    user_parameters: {
      leveys_m: branch.roadWidth,
      paksuus_m: settings.surfaceThicknessM,
    },
    notes: `Massalaskenta: ${branch.name} – KaM 0/16 pintamurske`,
    source: 'mass_calc',
    mass_calc_run_id: runId,
    mass_calc_branch_id: branchId,
    chainage_start: r2(chainageMin),
    chainage_end: r2(chainageMax),
  });

  // 3. OJA_KAIVUU - whole branch
  items.push({
    project_id: projectId,
    catalog_item_id: CATALOG_IDS.OJA_KAIVUU,
    geometry: buildLineGeometry(chainageMin, chainageMax),
    user_parameters: {},
    notes: `Massalaskenta: ${branch.name} – Ojan kaivuu`,
    source: 'mass_calc',
    mass_calc_run_id: runId,
    mass_calc_branch_id: branchId,
    chainage_start: r2(chainageMin),
    chainage_end: r2(chainageMax),
  });

  // 4. Repair segments (use chainage values from segments)
  for (const seg of segments) {
    const geom = buildLineGeometry(seg.chainageStart, seg.chainageEnd);

    // KaM32
    if (seg.thickness32 > 0) {
      items.push({
        project_id: projectId,
        catalog_item_id: CATALOG_IDS.KAM32,
        geometry: geom,
        user_parameters: {
          leveys_m: branch.roadWidth,
          paksuus_m: seg.thickness32,
        },
        notes: `Massalaskenta: ${branch.name} – KaM 0/32 [${seg.chainageStart.toFixed(0)}–${seg.chainageEnd.toFixed(0)} m]`,
        source: 'mass_calc',
        mass_calc_run_id: runId,
        mass_calc_branch_id: branchId,
        chainage_start: seg.chainageStart,
        chainage_end: seg.chainageEnd,
      });
    }

    // KaM56
    if (seg.thickness56 > 0) {
      items.push({
        project_id: projectId,
        catalog_item_id: CATALOG_IDS.KAM56,
        geometry: geom,
        user_parameters: {
          leveys_m: branch.roadWidth,
          paksuus_m: seg.thickness56,
        },
        notes: `Massalaskenta: ${branch.name} – KaM 0/56 [${seg.chainageStart.toFixed(0)}–${seg.chainageEnd.toFixed(0)} m]`,
        source: 'mass_calc',
        mass_calc_run_id: runId,
        mass_calc_branch_id: branchId,
        chainage_start: seg.chainageStart,
        chainage_end: seg.chainageEnd,
      });

      // Geotextile
      items.push({
        project_id: projectId,
        catalog_item_id: CATALOG_IDS.GEOTEXTILE,
        geometry: geom,
        user_parameters: {
          pituus_m: seg.lengthM,
          leveys_m: branch.roadWidth,
        },
        notes: `Massalaskenta: ${branch.name} – Suodatinkangas [${seg.chainageStart.toFixed(0)}–${seg.chainageEnd.toFixed(0)} m]`,
        source: 'mass_calc',
        mass_calc_run_id: runId,
        mass_calc_branch_id: branchId,
        chainage_start: seg.chainageStart,
        chainage_end: seg.chainageEnd,
      });
    }
  }

  // 5. Insert all items (use upsert to handle any remaining ID conflicts gracefully)
  if (items.length > 0) {
    // Add explicit UUIDs so upsert can match on id
    const itemsWithIds = items.map(item => ({ ...item, id: crypto.randomUUID() }));
    const { error } = await supabase.from('project_items').upsert(itemsWithIds, { onConflict: 'id' });
    if (error) {
      console.error('Mass calc DB write error:', error);
      throw new Error('Massalaskennan tulosten tallennus epäonnistui');
    }
  }
}

// ── Map JSON builder ──
export interface MapRepairSegment {
  segmentId: number;
  branchName: string;
  interval: string;
  coordinates: [number, number][];
  thickness32mm: number;
  thickness56mm: number;
  volume32: number;
  weight32: number;
  volume56: number;
  weight56: number;
  geoArea: number;
}

export function buildMapJson(result: MassCalcResult): MapRepairSegment[] {
  const mapSegments: MapRepairSegment[] = [];
  for (const br of result.branches) {
    // Use the branch's own effective road coords for clipping (strict isolation)
    const branchRoadCoords = (br as any).effectiveRoadCoords as [number, number][] | undefined;
    const coordsToUse = branchRoadCoords && branchRoadCoords.length >= 2 ? branchRoadCoords : [];
    for (const seg of br.segments) {
      const coords = clipPolyline(coordsToUse, seg.chainageStart, seg.chainageEnd);
      mapSegments.push({
        segmentId: seg.id,
        branchName: br.branch.name,
        interval: `${seg.chainageStart.toFixed(0)}–${seg.chainageEnd.toFixed(0)} m`,
        coordinates: coords.length >= 2 ? coords : [],
        thickness32mm: r2(seg.thickness32 * 1000),
        thickness56mm: r2(seg.thickness56 * 1000),
        volume32: seg.volume32,
        weight32: seg.weight32,
        volume56: seg.volume56,
        weight56: seg.weight56,
        geoArea: seg.geoArea,
      });
    }
  }
  return mapSegments;
}
