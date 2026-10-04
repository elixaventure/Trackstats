import { buildGeometry, pointAtDistance, projectOntoRoute, type RouteGeometry } from "./geo";
import type { GpsPoint, Lap, Route } from "./types";

/**
 * GPS section analysis.
 *
 * Phone GPS is typically good to 3–10 m and samples once a second, so section
 * times derived from it carry real uncertainty (roughly ±0.3–1 s per section).
 * Every comparison therefore carries an uncertainty estimate, and a delta smaller
 * than that is reported as "equal" rather than as a gain or loss. Lap times
 * themselves come from the timing source (transponder or gate) and are not
 * affected by this.
 */

export type Verdict = "faster" | "equal" | "slower" | "unknown";

export interface Section { name: string; fromM: number; toM: number }

export interface TimelineSample { d: number; t: number; acc: number; v: number }

export interface SectionResult extends Section {
  timeMs: number | null;
  refMs: number | null;
  deltaMs: number | null;
  uncertaintyMs: number | null;
  verdict: Verdict;
  coords: [number, number][];
}

const MIN_EQUAL_MS = 300;
const MAX_SPEED_MPS = 45; // ~160 km/h; anything faster between fixes is a GPS jump

export function sectionsFor(route: Route, g: RouteGeometry = buildGeometry(route.polyline)): Section[] {
  const len = g.length;
  if (route.sectors.length) {
    const ends = [...route.sectors].sort((a, b) => a.endDistanceM - b.endDistanceM);
    let from = 0;
    const out: Section[] = [];
    for (const s of ends) {
      if (s.endDistanceM <= from + 1) continue;
      out.push({ name: s.name, fromM: from, toM: Math.min(len, s.endDistanceM) });
      from = s.endDistanceM;
    }
    if (len - from > 20) out.push({ name: "To finish", fromM: from, toM: len });
    return out;
  }
  const n = Math.max(4, Math.min(10, Math.round(len / 250)));
  return Array.from({ length: n }, (_, i) => ({
    name: `Section ${i + 1}`,
    fromM: (len / n) * i,
    toM: (len / n) * (i + 1),
  }));
}

/** GPS fixes recorded during a lap, mapped to distance-along-route. */
export function lapTimeline(g: RouteGeometry, points: GpsPoint[], lap: Lap): TimelineSample[] {
  const end = lap.startedAt + lap.durationMs;
  const inLap = points.filter((p) => p.t >= lap.startedAt && p.t <= end);
  const out: TimelineSample[] = [{ d: 0, t: lap.startedAt, acc: 3, v: 0 }];
  let lastD = 0;
  let lastT = lap.startedAt;
  for (const p of inLap) {
    const dt = Math.max(0.5, (p.t - lastT) / 1000);
    const xy = g.proj.toXy(p.lat, p.lng);
    const proj = projectOntoRoute(g, xy, { fromM: lastD - 30, toM: lastD + MAX_SPEED_MPS * dt + 30 });
    const tolerance = Math.max(20, p.accuracyM * 2);
    if (proj.offsetM > tolerance) continue; // off the route (or a bad fix)
    if (proj.distanceM < lastD) continue; // small backwards jitter
    const v = (proj.distanceM - lastD) / dt;
    if (v > MAX_SPEED_MPS) continue;
    out.push({ d: proj.distanceM, t: p.t, acc: p.accuracyM, v });
    lastD = proj.distanceM;
    lastT = p.t;
  }
  out.push({ d: g.length, t: end, acc: 3, v: out[out.length - 1]?.v ?? 0 });
  return out;
}

/** Interpolated time at a distance, plus an uncertainty estimate for that crossing. */
export function timeAt(tl: TimelineSample[], d: number): { t: number; u: number } | null {
  for (let i = 1; i < tl.length; i++) {
    const a = tl[i - 1]!;
    const b = tl[i]!;
    if (b.d >= d && a.d <= d) {
      const span = b.d - a.d;
      const f = span > 0 ? (d - a.d) / span : 0;
      const dtS = (b.t - a.t) / 1000;
      const speed = span / Math.max(0.5, dtS) || 1;
      // Interpolation error grows with the gap between fixes. Reported accuracy is a ~68%
      // radius; roughly half of it lies along the direction of travel, and dividing by
      // speed turns metres into seconds.
      const u = 0.1 * dtS + (0.5 * Math.max(a.acc, b.acc)) / Math.max(2, speed);
      return { t: a.t + f * (b.t - a.t), u: u * 1000 };
    }
  }
  return null;
}

function sectionTime(tl: TimelineSample[], s: Section) {
  const a = timeAt(tl, s.fromM);
  const b = timeAt(tl, s.toM);
  if (!a || !b) return null;
  // A big hole in coverage within the section makes the number guesswork.
  const inside = tl.filter((x) => x.d > s.fromM && x.d < s.toM).length;
  const expected = Math.max(1, (b.t - a.t) / 1000 / 3);
  if (s.toM - s.fromM > 60 && inside < Math.min(2, expected)) return null;
  return { ms: b.t - a.t, u: Math.hypot(a.u, b.u) };
}

export function compareLaps(
  route: Route,
  current: { points: GpsPoint[]; lap: Lap },
  reference: { points: GpsPoint[]; lap: Lap } | null,
): SectionResult[] {
  const g = buildGeometry(route.polyline);
  const sections = sectionsFor(route, g);
  const tlA = lapTimeline(g, current.points, current.lap);
  const tlB = reference ? lapTimeline(g, reference.points, reference.lap) : null;

  return sections.map((s) => {
    const a = sectionTime(tlA, s);
    const b = tlB ? sectionTime(tlB, s) : null;
    const coords = sectionCoords(g, s);
    if (!a || !b) {
      return { ...s, timeMs: a?.ms ?? null, refMs: b?.ms ?? null, deltaMs: null, uncertaintyMs: null, verdict: "unknown", coords };
    }
    const delta = a.ms - b.ms;
    const u = Math.max(MIN_EQUAL_MS, Math.hypot(a.u, b.u), b.ms * 0.015);
    const verdict: Verdict = Math.abs(delta) <= u ? "equal" : delta < 0 ? "faster" : "slower";
    return { ...s, timeMs: a.ms, refMs: b.ms, deltaMs: delta, uncertaintyMs: u, verdict, coords };
  });
}

export function sectionCoords(g: RouteGeometry, s: Section): [number, number][] {
  const out: [number, number][] = [pointAtDistance(g, s.fromM).lngLat];
  for (let i = 0; i < g.cum.length; i++) {
    if (g.cum[i]! > s.fromM && g.cum[i]! < s.toM) out.push([g.line[i]![0], g.line[i]![1]]);
  }
  out.push(pointAtDistance(g, s.toM).lngLat);
  return out;
}

/** True when enough of the lap was covered by usable GPS fixes to analyse it. */
export function lapHasGps(points: GpsPoint[], lap: Lap): boolean {
  const end = lap.startedAt + lap.durationMs;
  const n = points.filter((p) => p.t >= lap.startedAt && p.t <= end && p.accuracyM <= 30).length;
  return n >= Math.max(5, (lap.durationMs / 1000) * 0.3);
}
