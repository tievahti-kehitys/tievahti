/**
 * Utilities for working with road geometry
 */

type LatLng = [number, number]; // [lat, lon]

/**
 * Calculate the distance between two points using Haversine formula
 */
export function haversineDistance(point1: LatLng, point2: LatLng): number {
  const R = 6371000; // Earth's radius in meters
  const lat1 = point1[0] * Math.PI / 180;
  const lat2 = point2[0] * Math.PI / 180;
  const deltaLat = (point2[0] - point1[0]) * Math.PI / 180;
  const deltaLon = (point2[1] - point1[1]) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Find the closest point on a line segment to a given point
 * Returns the interpolated point on the segment and the index of the segment start
 */
function closestPointOnSegment(
  point: LatLng,
  segmentStart: LatLng,
  segmentEnd: LatLng
): { point: LatLng; t: number } {
  const dx = segmentEnd[1] - segmentStart[1];
  const dy = segmentEnd[0] - segmentStart[0];
  
  if (dx === 0 && dy === 0) {
    return { point: segmentStart, t: 0 };
  }
  
  // Calculate projection parameter t (0 = start, 1 = end)
  const t = Math.max(0, Math.min(1, 
    ((point[0] - segmentStart[0]) * dy + (point[1] - segmentStart[1]) * dx) /
    (dy * dy + dx * dx)
  ));
  
  // Interpolate the point
  const closestPoint: LatLng = [
    segmentStart[0] + t * dy,
    segmentStart[1] + t * dx
  ];
  
  return { point: closestPoint, t };
}

/**
 * Find the closest point on a polyline to a given point
 * Returns the point, segment index, and parameter t within that segment
 */
export function findClosestPointOnRoad(
  point: LatLng,
  roadCoordinates: LatLng[]
): { 
  point: LatLng; 
  segmentIndex: number; 
  t: number;
  distance: number;
} {
  let minDistance = Infinity;
  let closestPoint: LatLng = roadCoordinates[0];
  let closestSegmentIndex = 0;
  let closestT = 0;

  for (let i = 0; i < roadCoordinates.length - 1; i++) {
    const { point: projectedPoint, t } = closestPointOnSegment(
      point,
      roadCoordinates[i],
      roadCoordinates[i + 1]
    );
    
    const distance = haversineDistance(point, projectedPoint);
    
    if (distance < minDistance) {
      minDistance = distance;
      closestPoint = projectedPoint;
      closestSegmentIndex = i;
      closestT = t;
    }
  }

  return {
    point: closestPoint,
    segmentIndex: closestSegmentIndex,
    t: closestT,
    distance: minDistance
  };
}

/**
 * Extract a segment of the road geometry between two points
 * The points are snapped to the road and the segment between them is returned
 */
export function extractRoadSegment(
  startPoint: LatLng,
  endPoint: LatLng,
  roadCoordinates: LatLng[]
): LatLng[] {
  if (roadCoordinates.length < 2) {
    return [startPoint, endPoint];
  }

  // Find closest points on road for both input points
  const startSnap = findClosestPointOnRoad(startPoint, roadCoordinates);
  const endSnap = findClosestPointOnRoad(endPoint, roadCoordinates);

  // Determine order: we want to go from lower index to higher index
  let fromSnap = startSnap;
  let toSnap = endSnap;
  let reversed = false;

  // Compare positions: use segment index + t to determine position along road
  const startPosition = startSnap.segmentIndex + startSnap.t;
  const endPosition = endSnap.segmentIndex + endSnap.t;

  if (startPosition > endPosition) {
    // Swap if start is after end
    fromSnap = endSnap;
    toSnap = startSnap;
    reversed = true;
  }

  // Build the segment
  const segment: LatLng[] = [];

  // Add the starting snap point
  segment.push(fromSnap.point);

  // Add all intermediate road vertices
  const startSegmentIndex = fromSnap.segmentIndex;
  const endSegmentIndex = toSnap.segmentIndex;

  for (let i = startSegmentIndex + 1; i <= endSegmentIndex; i++) {
    segment.push(roadCoordinates[i]);
  }

  // Add the ending snap point (if different from last vertex)
  const lastPoint = segment[segment.length - 1];
  if (haversineDistance(lastPoint, toSnap.point) > 0.1) { // > 0.1m apart
    segment.push(toSnap.point);
  }

  // If we reversed, reverse the result to maintain original direction
  if (reversed) {
    segment.reverse();
  }

  return segment;
}

/**
 * Snap a point to the nearest point on the road
 */
export function snapToRoad(point: LatLng, roadCoordinates: LatLng[]): LatLng {
  if (roadCoordinates.length === 0) {
    return point;
  }
  
  const result = findClosestPointOnRoad(point, roadCoordinates);
  return result.point;
}

/**
 * Calculate the total length of a polyline
 */
export function calculatePolylineLength(coordinates: LatLng[]): number {
  let length = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    length += haversineDistance(coordinates[i], coordinates[i + 1]);
  }
  return length;
}
