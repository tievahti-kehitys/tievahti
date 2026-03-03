/**
 * Leaflet PolylineOffset plugin - TypeScript port
 * Adds `offset` option to L.Polyline for pixel-level parallel line rendering.
 * Offset is in pixels: positive = right of line direction, negative = left.
 */
import L from 'leaflet';

function forEachPair<T>(list: T[], callback: (a: T, b: T) => void) {
  if (!list || list.length < 1) return;
  for (let i = 1; i < list.length; i++) {
    callback(list[i - 1], list[i]);
  }
}

interface Point { x: number; y: number }

function lineEquation(pt1: Point, pt2: Point): { a: number; b: number } | { x: number } | null {
  if (pt1.x === pt2.x) {
    return pt1.y === pt2.y ? null : { x: pt1.x };
  }
  const a = (pt2.y - pt1.y) / (pt2.x - pt1.x);
  return { a, b: pt1.y - a * pt1.x };
}

function intersection(l1a: Point, l1b: Point, l2a: Point, l2b: Point): Point | null {
  const line1 = lineEquation(l1a, l1b);
  const line2 = lineEquation(l2a, l2b);
  if (line1 === null || line2 === null) return null;

  if ('x' in line1) {
    return 'x' in line2
      ? null
      : { x: line1.x, y: (line2 as any).a * line1.x + (line2 as any).b };
  }
  if ('x' in line2) {
    return { x: line2.x, y: (line1 as any).a * line2.x + (line1 as any).b };
  }

  const l1 = line1 as { a: number; b: number };
  const l2 = line2 as { a: number; b: number };
  if (l1.a === l2.a) return null;

  const x = (l2.b - l1.b) / (l1.a - l2.a);
  return { x, y: l1.a * x + l1.b };
}

function signedArea(p1: Point, p2: Point, p3: Point): number {
  return (p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y);
}

function intersects(l1a: Point, l1b: Point, l2a: Point, l2b: Point): boolean {
  return (
    signedArea(l1a, l1b, l2a) * signedArea(l1a, l1b, l2b) < 0 &&
    signedArea(l2a, l2b, l1a) * signedArea(l2a, l2b, l1b) < 0
  );
}

function translatePoint(pt: Point, dist: number, heading: number): Point {
  return {
    x: pt.x + dist * Math.cos(heading),
    y: pt.y + dist * Math.sin(heading),
  };
}

interface OffsetSegment {
  offsetAngle: number;
  original: [Point, Point];
  offset: [Point, Point];
}

const PolylineOffset = {
  offsetPointLine(points: Point[], distance: number): OffsetSegment[] {
    const offsetSegments: OffsetSegment[] = [];

    forEachPair(points, (a, b) => {
      if (a.x === b.x && a.y === b.y) return;
      const segmentAngle = Math.atan2(a.y - b.y, a.x - b.x);
      const offsetAngle = segmentAngle - Math.PI / 2;

      offsetSegments.push({
        offsetAngle,
        original: [a, b],
        offset: [translatePoint(a, distance, offsetAngle), translatePoint(b, distance, offsetAngle)],
      });
    });

    return offsetSegments;
  },

  offsetPoints(pts: Point[], options: { smoothFactor?: number; offset: number }): Point[] {
    const simplified = L.LineUtil.simplify(
      pts.map(p => L.point(p.x, p.y)),
      options.smoothFactor || 0
    );
    const offsetSegments = this.offsetPointLine(
      simplified.map(p => ({ x: p.x, y: p.y })),
      options.offset
    );
    return this.joinLineSegments(offsetSegments, options.offset);
  },

  joinSegments(_s1: OffsetSegment, _s2: OffsetSegment, _offset: number): [Point, Point][] {
    return [];
  },

  joinOuterAngles(s1: OffsetSegment, s2: OffsetSegment, offset: number): [Point, Point][] {
    return this.circularArc(s1, s2, offset).filter(x => x) as [Point, Point][];
  },

  joinLineSegments(segments: OffsetSegment[], offset: number): Point[] {
    if (!segments.length) return [];

    let offsetSegments: [Point, Point][] = [];
    offsetSegments.push(segments[0].offset);

    forEachPair(segments, (s1, s2) => {
      offsetSegments = offsetSegments.concat(this.joinOuterAngles(s1, s2, offset));
      offsetSegments.push(s2.offset);
    });

    return this.cutInnerAngles(offsetSegments);
  },

  segmentAsVector(s: [Point, Point]): Point {
    return { x: s[1].x - s[0].x, y: s[1].y - s[0].y };
  },

  getSignedAngle(s1: [Point, Point], s2: [Point, Point]): number {
    const a = this.segmentAsVector(s1);
    const b = this.segmentAsVector(s2);
    return Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
  },

  circularArc(s1: OffsetSegment, s2: OffsetSegment, distance: number): ([Point, Point] | null)[] {
    if (s1.offsetAngle === s2.offsetAngle) return [];

    const signedAngle = this.getSignedAngle(s1.offset, s2.offset);
    if (signedAngle * distance > 0) return [];

    const points: Point[] = [];
    const center = s1.original[1];
    const rightOffset = distance > 0;
    let startAngle = rightOffset ? s2.offsetAngle : s1.offsetAngle;
    let endAngle = rightOffset ? s1.offsetAngle : s2.offsetAngle;
    if (endAngle < startAngle) endAngle += Math.PI * 2;

    const step = Math.PI / 8;
    points.push(rightOffset ? s2.offset[0] : s1.offset[1]);
    for (let alpha = startAngle + step; alpha < endAngle; alpha += step) {
      points.push(translatePoint(center, distance, alpha));
    }
    points.push(rightOffset ? s1.offset[1] : s2.offset[0]);

    const pts = rightOffset ? points.reverse() : points;
    const result: [Point, Point][] = [];
    forEachPair(pts, (p1, p2) => {
      result.push([p1, p2]);
    });
    return result;
  },

  cutInnerAngles(segments: [Point, Point][]): Point[] {
    let i = 0;
    while (true) {
      if (i + 1 >= segments.length) break;
      if (segments[i][1] === segments[i + 1][0]) {
        ++i;
        continue;
      }
      let j = i;
      while (true) {
        if (intersects(segments[j][0], segments[j][1], segments[i + 1][0], segments[i + 1][1])) {
          const p = intersection(segments[j][0], segments[j][1], segments[i + 1][0], segments[i + 1][1]);
          if (p) {
            segments[j][1] = p;
            segments[i + 1][0] = p;
          }
          if (j < i) {
            segments.splice(j + 1, i - j);
          }
          i = j + 1;
          break;
        }
        if (j === 0) {
          segments.splice(i + 1, 1);
          ++i;
          break;
        }
        --j;
      }
    }

    const points: Point[] = [];
    points.push(segments[0][0]);
    for (let i1 = 0; i1 < segments.length; ++i1) {
      points.push(segments[i1][1]);
    }
    return points;
  },
};

// Monkey-patch L.Polyline to support `offset` option
const originalProjectLatlngs = (L.Polyline.prototype as any)._projectLatlngs;

(L.Polyline.prototype as any)._projectLatlngs = function (
  latlngs: any[],
  result: any[],
  projectedBounds: any
) {
  const isFlat = latlngs.length > 0 && latlngs[0] instanceof L.LatLng;

  if (isFlat) {
    const ring = latlngs.map((ll: L.LatLng) => {
      const point = this._map.latLngToLayerPoint(ll);
      if (projectedBounds) projectedBounds.extend(point);
      return { x: point.x, y: point.y };
    });

    let finalRing = ring;
    if (this.options.offset) {
      finalRing = PolylineOffset.offsetPoints(ring, {
        offset: this.options.offset,
        smoothFactor: this.options.smoothFactor,
      });
    }

    result.push(finalRing.map((xy: Point) => L.point(xy.x, xy.y)));
  } else {
    latlngs.forEach((ll: any) => {
      this._projectLatlngs(ll, result, projectedBounds);
    });
  }
};

// Add setOffset method
(L.Polyline.prototype as any).setOffset = function (offset: number) {
  this.options.offset = offset;
  this.redraw();
  return this;
};

export default PolylineOffset;
