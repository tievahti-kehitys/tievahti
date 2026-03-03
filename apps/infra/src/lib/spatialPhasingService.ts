/**
 * Spatial Phasing Service
 *
 * Uses Turf.js to determine which project items fall inside a drawn polygon,
 * split linear items at the polygon boundary, and prepare database operations.
 */

import * as turf from '@turf/turf';
import { ProductInstance, ProductGeometry } from '@/types/project';

export interface SplitResult {
  /** Items fully inside the polygon – just update their category_id */
  insideItems: string[];
  /** New item records for the "inside" portion of split lines */
  newInsideSegments: Array<{
    originalId: string;
    geometry: ProductGeometry;
  }>;
  /** Updated geometry for the "outside" portion of the original record */
  updatedOutsideSegments: Array<{
    id: string;
    geometry: ProductGeometry;
  }>;
  /** Additional outside segments that need new uncategorized records */
  newOutsideSegments: Array<{
    originalId: string;
    geometry: ProductGeometry;
  }>;
}

/**
 * Convert our [lat, lng] coordinate arrays to GeoJSON [lng, lat] and back.
 */
function toGeoJSONCoords(coords: [number, number][]): [number, number][] {
  return coords.map(([lat, lng]) => [lng, lat]);
}

function fromGeoJSONCoords(coords: number[][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
}

/**
 * Analyse products against a drawn polygon and produce split instructions.
 *
 * @param polygon Polygon vertices in [lat, lng] format (closed ring)
 * @param products All project products to evaluate
 * @returns SplitResult with item IDs to update and new segments to create
 */
export function analysePolygonSelection(
  polygon: [number, number][],
  products: ProductInstance[]
): SplitResult {
  const polyCoords = toGeoJSONCoords(polygon);
  // Ensure closed ring
  const first = polyCoords[0];
  const last = polyCoords[polyCoords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    polyCoords.push([...first] as [number, number]);
  }

  const turfPoly = turf.polygon([polyCoords]);

  const insideItems: string[] = [];
  const newInsideSegments: SplitResult['newInsideSegments'] = [];
  const updatedOutsideSegments: SplitResult['updatedOutsideSegments'] = [];
  const newOutsideSegments: SplitResult['newOutsideSegments'] = [];

  console.log(`[SpatialPhasing] Analysing ${products.length} products against polygon with ${polyCoords.length} vertices`);

  for (const product of products) {
    if (product.geometry.type === 'point') {
      const [lat, lng] = product.geometry.coordinates;
      const pt = turf.point([lng, lat]);
      if (turf.booleanPointInPolygon(pt, turfPoly)) {
        insideItems.push(product.id);
      }
    } else if (product.geometry.type === 'line') {
      const lineCoords = toGeoJSONCoords(product.geometry.coordinates);
      if (lineCoords.length < 2) continue;

      const line = turf.lineString(lineCoords);

      // Check if any point is inside the polygon
      const pointsInside = lineCoords.filter((c) =>
        turf.booleanPointInPolygon(turf.point(c), turfPoly)
      );

      // Check if fully inside
      if (pointsInside.length === lineCoords.length) {
        insideItems.push(product.id);
        console.log(`[SpatialPhasing] ${product.id} fully inside`);
        continue;
      }

      // Check intersection
      const intersects = turf.booleanIntersects(line, turfPoly) || pointsInside.length > 0;
      if (!intersects) continue;

      console.log(`[SpatialPhasing] ${product.id} intersects polygon (${pointsInside.length}/${lineCoords.length} points inside)`);

      // Split the line at polygon boundary
      try {
        const polyBoundary = turf.polygonToLine(turfPoly);
        const split = turf.lineSplit(line, polyBoundary as any);

        if (!split || split.features.length <= 1) {
          // Could not split — check midpoint
          const mid = turf.midpoint(
            turf.point(lineCoords[0]),
            turf.point(lineCoords[lineCoords.length - 1])
          );
          if (turf.booleanPointInPolygon(mid, turfPoly)) {
            insideItems.push(product.id);
          }
          continue;
        }

        const insideParts: number[][][] = [];
        const outsideParts: number[][][] = [];

        for (const feature of split.features) {
          const coords = feature.geometry.coordinates;
          if (coords.length < 2) continue;
          const midIdx = Math.floor(coords.length / 2);
          const midPt = turf.point(coords[midIdx]);
          if (turf.booleanPointInPolygon(midPt, turfPoly)) {
            insideParts.push(coords);
          } else {
            outsideParts.push(coords);
          }
        }

        // Create new records for inside parts
        for (const part of insideParts) {
          newInsideSegments.push({
            originalId: product.id,
            geometry: {
              type: 'line',
              coordinates: fromGeoJSONCoords(part),
            },
          });
        }

        // Update original with outside parts
        if (outsideParts.length > 0) {
          updatedOutsideSegments.push({
            id: product.id,
            geometry: {
              type: 'line',
              coordinates: fromGeoJSONCoords(outsideParts[0]),
            },
          });

          // Additional outside parts become new uncategorized items
          for (let i = 1; i < outsideParts.length; i++) {
            newOutsideSegments.push({
              originalId: product.id,
              geometry: {
                type: 'line',
                coordinates: fromGeoJSONCoords(outsideParts[i]),
              },
            });
          }
        } else {
          // All parts are inside — treat as fully inside
          insideItems.push(product.id);
          // Remove the inside segments we added since we'll use insideItems instead
          newInsideSegments.splice(newInsideSegments.length - insideParts.length, insideParts.length);
        }
      } catch (err) {
        console.warn('Line split failed for product', product.id, err);
        const mid = turf.midpoint(
          turf.point(lineCoords[0]),
          turf.point(lineCoords[lineCoords.length - 1])
        );
        if (turf.booleanPointInPolygon(mid, turfPoly)) {
          insideItems.push(product.id);
        }
      }
    }
    // Polygon geometry products: check centroid
    else if (product.geometry.type === 'polygon') {
      const coords = toGeoJSONCoords(product.geometry.coordinates);
      if (coords.length < 4) continue;
      const centroid = turf.centroid(turf.polygon([coords]));
      if (turf.booleanPointInPolygon(centroid, turfPoly)) {
        insideItems.push(product.id);
      }
    }
  }

  console.log(`[SpatialPhasing] Result: ${insideItems.length} inside, ${newInsideSegments.length} split-inside, ${updatedOutsideSegments.length} updated-outside, ${newOutsideSegments.length} new-outside`);
  return { insideItems, newInsideSegments, updatedOutsideSegments, newOutsideSegments };
}

/**
 * Distance between two [lat,lng] coordinates in degrees.
 */
function coordDist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Snap threshold: allow up to ~2m worth of floating-point drift from lineSplit.
 * 0.00002 degrees ≈ 2m at Finnish latitudes.
 */
const SNAP_THRESHOLD = 0.00002;

/**
 * Merge adjacent line segments that share an endpoint and have identical properties.
 *
 * Improvements over the basic version:
 * - Larger snap threshold to handle floating-point drift from lineSplit
 * - Merges regardless of category (used after category removal, all items are null)
 * - Iterates to merge chains of 3+ segments
 */
export function mergeAdjacentSegments(
  items: ProductInstance[],
  targetId: string
): { mergedGeometry: ProductGeometry; mergedIds: string[] } | null {
  const target = items.find((i) => i.id === targetId);
  if (!target || target.geometry.type !== 'line') return null;

  // Find merge candidates: same product definition, same parameters, same category
  const candidates = items.filter(
    (i) =>
      i.id !== targetId &&
      i.geometry.type === 'line' &&
      i.productDefinitionId === target.productDefinitionId &&
      JSON.stringify(i.parameters) === JSON.stringify(target.parameters) &&
      (i.categoryId ?? null) === (target.categoryId ?? null)
  );

  let currentCoords = [...(target.geometry.coordinates as [number, number][])];
  const mergedIds: string[] = [];
  let merged = true;

  while (merged) {
    merged = false;
    for (const candidate of candidates) {
      if (mergedIds.includes(candidate.id)) continue;
      if (candidate.geometry.type !== 'line') continue;

      const candCoords = candidate.geometry.coordinates as [number, number][];

      const currentStart = currentCoords[0];
      const currentEnd = currentCoords[currentCoords.length - 1];
      const candStart = candCoords[0];
      const candEnd = candCoords[candCoords.length - 1];

      if (coordDist(currentEnd, candStart) < SNAP_THRESHOLD) {
        // end → start: append
        currentCoords = [...currentCoords, ...candCoords.slice(1)];
        mergedIds.push(candidate.id);
        merged = true;
      } else if (coordDist(currentEnd, candEnd) < SNAP_THRESHOLD) {
        // end → end: append reversed
        currentCoords = [...currentCoords, ...[...candCoords].reverse().slice(1)];
        mergedIds.push(candidate.id);
        merged = true;
      } else if (coordDist(currentStart, candEnd) < SNAP_THRESHOLD) {
        // start ← end: prepend
        currentCoords = [...candCoords, ...currentCoords.slice(1)];
        mergedIds.push(candidate.id);
        merged = true;
      } else if (coordDist(currentStart, candStart) < SNAP_THRESHOLD) {
        // start ← start: prepend reversed
        currentCoords = [...[...candCoords].reverse(), ...currentCoords.slice(1)];
        mergedIds.push(candidate.id);
        merged = true;
      }
    }
  }

  if (mergedIds.length === 0) return null;

  return {
    mergedGeometry: { type: 'line', coordinates: currentCoords },
    mergedIds,
  };
}
