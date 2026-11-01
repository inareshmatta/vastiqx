import type { SectorCode, Vec2 } from "./types";
import { SECTORS } from "./types";

export const EPS = 1e-7;

export function round(n: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, k: number): Vec2 {
  return { x: a.x * k, y: a.y * k };
}

export function length(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function samePoint(a: Vec2, b: Vec2, tol = 0.002): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bbox(points: Vec2[]): BBox {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

export function bboxOfPolygons(polys: Vec2[][]): BBox {
  return bbox(polys.flat());
}

export function bboxWidth(b: BBox): number {
  return b.maxX - b.minX;
}

export function bboxDepth(b: BBox): number {
  return b.maxY - b.minY;
}

export function bboxArea(b: BBox): number {
  return Math.max(0, bboxWidth(b)) * Math.max(0, bboxDepth(b));
}

export function bboxCenter(b: BBox): Vec2 {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

export function rectPolygon(x0: number, y0: number, x1: number, y1: number): Vec2[] {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

export function rectFromCenter(c: Vec2, width: number, depth: number): Vec2[] {
  return rectPolygon(c.x - width / 2, c.y - depth / 2, c.x + width / 2, c.y + depth / 2);
}

export function polygonSignedArea(poly: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function polygonArea(poly: Vec2[]): number {
  return Math.abs(polygonSignedArea(poly));
}

export function polygonPerimeter(poly: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    sum += distance(poly[i]!, poly[(i + 1) % poly.length]!);
  }
  return sum;
}

export function polygonCentroid(poly: Vec2[]): Vec2 {
  const signed = polygonSignedArea(poly);
  if (Math.abs(signed) < EPS) {
    const b = bbox(poly);
    return bboxCenter(b);
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const c = poly[(i + 1) % poly.length]!;
    const cross = a.x * c.y - c.x * a.y;
    cx += (a.x + c.x) * cross;
    cy += (a.y + c.y) * cross;
  }
  return { x: cx / (6 * signed), y: cy / (6 * signed) };
}

/** Width (x extent) / depth (y extent) of a room polygon's bounding box. */
export function polygonExtents(poly: Vec2[]): { width: number; depth: number } {
  const b = bbox(poly);
  return { width: bboxWidth(b), depth: bboxDepth(b) };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i]!;
    const pj = poly[j]!;
    const intersects =
      pi.y > p.y !== pj.y > p.y &&
      p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y || EPS) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } {
  const ab = sub(b, a);
  const len2 = ab.x * ab.x + ab.y * ab.y;
  if (len2 < EPS) return { point: a, t: 0 };
  let t = ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / len2;
  t = Math.max(0, Math.min(1, t));
  return { point: lerp(a, b, t), t };
}

export function distancePointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  return distance(p, closestPointOnSegment(p, a, b).point);
}

export function segmentLength(a: Vec2, b: Vec2): number {
  return distance(a, b);
}

export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

/** True when the open segments cross (shared endpoints do not count). */
export function segmentsIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const d1 = cross(sub(a2, a1), sub(b1, a1));
  const d2 = cross(sub(a2, a1), sub(b2, a1));
  const d3 = cross(sub(b2, b1), sub(a1, b1));
  const d4 = cross(sub(b2, b1), sub(a2, b1));
  const straddles = (p: number, q: number) => (p > EPS && q < -EPS) || (p < -EPS && q > EPS);
  return straddles(d1, d2) && straddles(d3, d4);
}

export function segmentsOverlapCollinear(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2, tol = 0.01): boolean {
  const d = sub(a2, a1);
  const len = length(d);
  if (len < tol) return false;
  const ux = d.x / len;
  const uy = d.y / len;
  const distOf = (p: Vec2) => Math.abs((p.x - a1.x) * uy - (p.y - a1.y) * ux);
  if (distOf(b1) > tol || distOf(b2) > tol) return false;
  const tOf = (p: Vec2) => (p.x - a1.x) * ux + (p.y - a1.y) * uy;
  const t1 = tOf(b1);
  const t2 = tOf(b2);
  const lo = Math.max(0, Math.min(t1, t2));
  const hi = Math.min(len, Math.max(t1, t2));
  return hi - lo > tol;
}

export function polygonSelfIntersects(poly: Vec2[]): boolean {
  const n = poly.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = poly[i]!;
    const a2 = poly[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      if (j === i || j === (i + 1) % n || (j + 1) % n === i) continue;
      const b1 = poly[j]!;
      const b2 = poly[(j + 1) % n]!;
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

export function isOrthogonalPolygon(poly: Vec2[], tol = 0.01): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if (Math.abs(a.x - b.x) > tol && Math.abs(a.y - b.y) > tol) return false;
  }
  return true;
}

/**
 * Union area of a set of polygons using deterministic rasterisation with a
 * documented cell size. Used for built-up/coverage estimates where exact
 * polygon boolean operations would need a full geometry kernel.
 */
export function unionArea(polys: Vec2[][], cell = 0.1): number {
  const valid = polys.filter((p) => p.length >= 3 && polygonArea(p) > 0.001);
  if (valid.length === 0) return 0;
  const b = bbox(valid.flat());
  if (bboxArea(b) <= 0) return 0;
  const prepared = valid.map((poly) => ({ poly, b: bbox(poly) }));
  let area = 0;
  for (let y = b.minY + cell / 2; y < b.maxY; y += cell) {
    for (let x = b.minX + cell / 2; x < b.maxX; x += cell) {
      const p = { x, y };
      for (const { poly, b: pb } of prepared) {
        if (x < pb.minX || x > pb.maxX || y < pb.minY || y > pb.maxY) continue;
        if (pointInPolygon(p, poly)) {
          area += cell * cell;
          break;
        }
      }
    }
  }
  return round(area, 2);
}

export function distanceToBoundary(p: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    best = Math.min(best, distancePointToSegment(p, poly[i]!, poly[(i + 1) % poly.length]!));
  }
  return best;
}

/** Deterministic raster overlap area between two polygons (m2). */
export function polygonOverlapArea(a: Vec2[], b: Vec2[], cell = 0.05): number {
  const ba = bbox(a);
  const bb = bbox(b);
  const minX = Math.max(ba.minX, bb.minX);
  const maxX = Math.min(ba.maxX, bb.maxX);
  const minY = Math.max(ba.minY, bb.minY);
  const maxY = Math.min(ba.maxY, bb.maxY);
  if (maxX <= minX || maxY <= minY) return 0;
  let area = 0;
  for (let y = minY + cell / 2; y < maxY; y += cell) {
    for (let x = minX + cell / 2; x < maxX; x += cell) {
      const p = { x, y };
      if (pointInPolygon(p, a) && pointInPolygon(p, b)) area += cell * cell;
    }
  }
  return area;
}

export function rectToPolygon(r: { x: number; y: number; width: number; depth: number }): Vec2[] {
  return rectPolygon(r.x, r.y, r.x + r.width, r.y + r.depth);
}

/** Footprint polygon of a wall (rectangle swept around the baseline). */
export function wallFootprint(start: Vec2, end: Vec2, thickness: number): Vec2[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return [];
  const nx = (-dy / len) * (thickness / 2);
  const ny = (dx / len) * (thickness / 2);
  const a = { x: start.x + nx, y: start.y + ny };
  const b = { x: end.x + nx, y: end.y + ny };
  const c = { x: end.x - nx, y: end.y - ny };
  const d = { x: start.x - nx, y: start.y - ny };
  return [a, b, c, d];
}

export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a < 0) a += 360;
  return a;
}

/** Sector index 0..7 for a bearing: 0 = N, 1 = NE ... clockwise. */
export function sectorIndex(bearing: number): number {
  const a = normalizeAngle(bearing);
  return Math.round(a / 45) % 8;
}

export function sectorOfBearing(bearing: number): SectorCode {
  return SECTORS[sectorIndex(bearing)]!;
}

/**
 * Direction of a point relative to a centre, expressed in true-north sectors.
 * `northBearing` is the angle of true north measured clockwise from +Y.
 */
export function directionOf(point: Vec2, centre: Vec2, northBearing: number): {
  sector: SectorCode;
  bearing: number;
  index: number;
} {
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  const mathBearing = (Math.atan2(dx, dy) * 180) / Math.PI; // 0 = +Y (plan north)
  const bearing = normalizeAngle(mathBearing + northBearing);
  return { sector: sectorOfBearing(bearing), bearing, index: sectorIndex(bearing) };
}

export function sectorMidBearing(sector: SectorCode): number {
  return SECTORS.indexOf(sector) * 45;
}

const OPPOSITE: Record<SectorCode, SectorCode> = {
  N: "S",
  NE: "SW",
  E: "W",
  SE: "NW",
  S: "N",
  SW: "NE",
  W: "E",
  NW: "SE",
};

export function oppositeSector(s: SectorCode): SectorCode {
  return OPPOSITE[s];
}

/** Angle in radians of the plan-space direction for a true-north sector. */
export function sectorPlanAngle(s: SectorCode, northBearing: number): number {
  const bearing = sectorMidBearing(s);
  const mathDeg = bearing - northBearing;
  return (mathDeg * Math.PI) / 180;
}

export function insetRect(
  r: { x0: number; y0: number; x1: number; y1: number },
  inset: { north: number; south: number; east: number; west: number },
): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: r.x0 + inset.west,
    y0: r.y0 + inset.south,
    x1: r.x1 - inset.east,
    y1: r.y1 - inset.north,
  };
}

export function snap(v: number, step: number): number {
  return Math.round(v / step) * step;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function polygonBoundsInside(poly: Vec2[], bounds: BBox, tol = 0.01): boolean {
  return poly.every(
    (p) =>
      p.x >= bounds.minX - tol &&
      p.x <= bounds.maxX + tol &&
      p.y >= bounds.minY - tol &&
      p.y <= bounds.maxY + tol,
  );
}

export function polygonFromPoints(points: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    if (!out.length || !samePoint(out[out.length - 1]!, p)) out.push({ x: round(p.x), y: round(p.y) });
  }
  if (out.length > 1 && samePoint(out[0]!, out[out.length - 1]!)) out.pop();
  return out;
}

/** Split a rect into `weights.length` slices along its longer usable axis. */
export function sliceRect(
  rect: { x0: number; y0: number; x1: number; y1: number },
  weights: number[],
  axis: "x" | "y",
): { x0: number; y0: number; x1: number; y1: number }[] {
  const total = weights.reduce((a, b) => a + Math.max(0.01, b), 0);
  const out: { x0: number; y0: number; x1: number; y1: number }[] = [];
  let cursor = axis === "x" ? rect.x0 : rect.y0;
  const end = axis === "x" ? rect.x1 : rect.y1;
  const span = end - cursor;
  for (let i = 0; i < weights.length; i++) {
    const w = Math.max(0.01, weights[i]!) / total;
    const next = i === weights.length - 1 ? end : cursor + span * w;
    out.push(
      axis === "x"
        ? { x0: cursor, y0: rect.y0, x1: next, y1: rect.y1 }
        : { x0: rect.x0, y0: cursor, x1: rect.x1, y1: next },
    );
    cursor = next;
  }
  return out;
}

export function rectArea(r: { x0: number; y0: number; x1: number; y1: number }): number {
  return Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
}

export function rectCenter(r: { x0: number; y0: number; x1: number; y1: number }): Vec2 {
  return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
}

export function pointInRect(p: Vec2, r: { x0: number; y0: number; x1: number; y1: number }): boolean {
  return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
}

export function rectsOverlap(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
  tol = 0.01,
): boolean {
  return a.x0 < b.x1 - tol && a.x1 > b.x0 + tol && a.y0 < b.y1 - tol && a.y1 > b.y0 + tol;
}
