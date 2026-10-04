import type { GpsPoint, LngLatAlt, TimingGate } from "./types";

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Flat x/y metres around a reference point. Accurate enough at track scale (a few km). */
export interface Xy { x: number; y: number }
export function makeProjector(refLat: number, refLng: number) {
  const kx = (Math.PI / 180) * R * Math.cos(rad(refLat));
  const ky = (Math.PI / 180) * R;
  return {
    toXy: (lat: number, lng: number): Xy => ({ x: (lng - refLng) * kx, y: (lat - refLat) * ky }),
    toLngLat: (p: Xy): [number, number] => [refLng + p.x / kx, refLat + p.y / ky],
  };
}

export function cumulativeDistances(line: LngLatAlt[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    out.push(out[i - 1]! + haversineM(a[1], a[0], b[1], b[0]));
  }
  return out;
}

export function polylineLength(line: LngLatAlt[]): number {
  const c = cumulativeDistances(line);
  return c[c.length - 1] ?? 0;
}

/** Total climb, ignoring wobbles smaller than `thresholdM` (GPS altitude is noisy). */
export function elevationGain(alts: (number | null)[], thresholdM = 3): number | null {
  const vals = alts.filter((a): a is number => a != null && Number.isFinite(a));
  if (vals.length < 2) return null;
  let gain = 0;
  let ref = vals[0]!;
  for (const v of vals) {
    if (v - ref >= thresholdM) { gain += v - ref; ref = v; }
    else if (ref - v >= thresholdM) ref = v;
  }
  return Math.round(gain);
}

export interface RouteGeometry {
  line: LngLatAlt[];
  cum: number[];
  length: number;
  xy: Xy[];
  proj: ReturnType<typeof makeProjector>;
}

export function buildGeometry(line: LngLatAlt[]): RouteGeometry {
  const first = line[0] ?? [0, 0, null];
  const proj = makeProjector(first[1], first[0]);
  const cum = cumulativeDistances(line);
  return { line, cum, length: cum[cum.length - 1] ?? 0, xy: line.map((p) => proj.toXy(p[1], p[0])), proj };
}

/** Position and direction of travel at a distance along the route. */
export function pointAtDistance(g: RouteGeometry, d: number): { xy: Xy; dir: Xy; lngLat: [number, number] } {
  const dd = Math.max(0, Math.min(g.length, d));
  let i = 1;
  while (i < g.cum.length - 1 && g.cum[i]! < dd) i++;
  const a = g.xy[i - 1]!;
  const b = g.xy[i]!;
  const seg = g.cum[i]! - g.cum[i - 1]! || 1;
  const t = (dd - g.cum[i - 1]!) / seg;
  const xy = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { xy, dir: { x: (b.x - a.x) / len, y: (b.y - a.y) / len }, lngLat: g.proj.toLngLat(xy) };
}

export interface Projection { distanceM: number; offsetM: number }

/**
 * Snap a point onto the route. `hint` restricts the search to a window ahead of the
 * last known position so that loops which pass close to themselves don't jump.
 */
export function projectOntoRoute(g: RouteGeometry, p: Xy, hint?: { fromM: number; toM: number }): Projection {
  let best: Projection = { distanceM: 0, offsetM: Infinity };
  for (let i = 1; i < g.xy.length; i++) {
    if (hint && (g.cum[i]! < hint.fromM || g.cum[i - 1]! > hint.toM)) continue;
    const a = g.xy[i - 1]!;
    const b = g.xy[i]!;
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
    const cx = a.x + vx * t;
    const cy = a.y + vy * t;
    const off = Math.hypot(p.x - cx, p.y - cy);
    if (off < best.offsetM) best = { distanceM: g.cum[i - 1]! + t * (g.cum[i]! - g.cum[i - 1]!), offsetM: off };
  }
  return best;
}

export function gateLine(g: RouteGeometry, gate: TimingGate): [Xy, Xy] {
  const { xy, dir } = pointAtDistance(g, gate.distanceM);
  const nx = -dir.y;
  const ny = dir.x;
  return [
    { x: xy.x + nx * gate.halfWidthM, y: xy.y + ny * gate.halfWidthM },
    { x: xy.x - nx * gate.halfWidthM, y: xy.y - ny * gate.halfWidthM },
  ];
}

/** Fraction t along p1→p2 where it crosses q1→q2, or null. */
export function segmentIntersection(p1: Xy, p2: Xy, q1: Xy, q2: Xy): number | null {
  const rx = p2.x - p1.x, ry = p2.y - p1.y;
  const sx = q2.x - q1.x, sy = q2.y - q1.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q1.x - p1.x) * sy - (q1.y - p1.y) * sx) / den;
  const u = ((q1.x - p1.x) * ry - (q1.y - p1.y) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** Douglas–Peucker in metres. Keeps recorded routes small without losing shape. */
export function simplify(line: LngLatAlt[], toleranceM: number): LngLatAlt[] {
  if (line.length < 3) return line.slice();
  const first = line[0]!;
  const proj = makeProjector(first[1], first[0]);
  const pts = line.map((p) => proj.toXy(p[1], p[0]));
  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const a = pts[s]!, b = pts[e]!;
    const vx = b.x - a.x, vy = b.y - a.y;
    const len = Math.hypot(vx, vy) || 1;
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const p = pts[i]!;
      const d = Math.abs(vx * (a.y - p.y) - vy * (a.x - p.x)) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx >= 0 && maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

export function gpsToLine(points: GpsPoint[]): LngLatAlt[] {
  return points.map((p) => [p.lng, p.lat, p.altitudeM]);
}

export function topSpeedKph(points: GpsPoint[]): number | null {
  // Use the 2nd highest smoothed speed so a single GPS spike can't set a record.
  const speeds: number[] = [];
  for (let i = 2; i < points.length; i++) {
    const a = points[i - 2]!, c = points[i]!;
    const dt = (c.t - a.t) / 1000;
    if (dt <= 0 || dt > 6 || c.accuracyM > 25) continue;
    const derived = haversineM(a.lat, a.lng, c.lat, c.lng) / dt;
    speeds.push(c.speedMps != null ? (c.speedMps + derived) / 2 : derived);
  }
  if (speeds.length < 3) return null;
  speeds.sort((x, y) => y - x);
  return Math.round(speeds[1]! * 3.6);
}

export function bounds(line: [number, number][] | LngLatAlt[]): [[number, number], [number, number]] | null {
  if (!line.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of line) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  }
  return [[minX, minY], [maxX, maxY]];
}

/** Portion of the route between two distances, with interpolated end points. */
export function subLine(g: RouteGeometry, fromM: number, toM: number): LngLatAlt[] {
  const alt = (d: number) => {
    let i = 1;
    while (i < g.cum.length - 1 && g.cum[i]! < d) i++;
    return g.line[i]?.[2] ?? null;
  };
  const at = (d: number): LngLatAlt => { const p = pointAtDistance(g, d).lngLat; return [p[0], p[1], alt(d)]; };
  const out: LngLatAlt[] = [at(fromM)];
  for (let i = 0; i < g.line.length; i++) if (g.cum[i]! > fromM && g.cum[i]! < toM) out.push(g.line[i]!);
  out.push(at(toM));
  return out;
}

/** Re-start a closed loop at a new start/finish point. */
export function rotateLoop(g: RouteGeometry, startM: number): LngLatAlt[] {
  if (startM <= 0.5 || startM >= g.length - 0.5) return g.line.slice();
  return [...subLine(g, startM, g.length), ...subLine(g, 0, startM).slice(1)];
}
