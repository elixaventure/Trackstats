import { buildGeometry, pointAtDistance, type RouteGeometry } from "@/domain/geo";
import type { GpsPoint, Route } from "@/domain/types";
import { gaussian } from "./rng";

export interface SectorProfile { difficulty: readonly number[]; gain: readonly number[] }

/**
 * Split a lap time across the route's sectors. `progress` (0→1) shifts time out of
 * the sectors the rider is improving in, so GPS section analysis shows real
 * gains/losses rather than uniform scaling.
 */
export function sectorDurations(route: Route, profile: SectorProfile, lapMs: number, progress: number, rand: () => number): number[] {
  const ends = route.sectors.map((s) => s.endDistanceM);
  const fracs = ends.map((e, i) => (e - (ends[i - 1] ?? 0)) / route.distanceM);
  const weights = fracs.map((f, i) => f * profile.difficulty[i]! * (1 - profile.gain[i]! * progress) * (1 + gaussian(rand) * 0.012));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / total) * lapMs);
}

/** 1 Hz phone-quality GPS for one lap (3–8 m noise). */
export function lapGps(g: RouteGeometry, route: Route, startAt: number, durations: number[], rand: () => number): GpsPoint[] {
  const ends = route.sectors.map((s) => s.endDistanceM);
  const out: GpsPoint[] = [];
  const total = durations.reduce((a, b) => a + b, 0);
  const t0 = startAt + Math.round(rand() * 900);
  for (let t = t0; t < startAt + total; t += 1000) {
    let el = t - startAt;
    let i = 0;
    while (i < durations.length - 1 && el > durations[i]!) { el -= durations[i]!; i++; }
    const from = ends[i - 1] ?? 0;
    const to = ends[i]!;
    const f = Math.min(1, el / durations[i]!);
    const d = from + (to - from) * f;
    const p = pointAtDistance(g, d);
    const acc = 3 + rand() * 5;
    const [lng, lat] = g.proj.toLngLat({ x: p.xy.x + gaussian(rand) * acc * 0.5, y: p.xy.y + gaussian(rand) * acc * 0.5 });
    const k = Math.min(route.polyline.length - 1, Math.round((d / route.distanceM) * (route.polyline.length - 1)));
    out.push({
      t, lat, lng, accuracyM: Math.round(acc * 10) / 10,
      speedMps: Math.round(((to - from) / (durations[i]! / 1000)) * (0.85 + rand() * 0.3) * 10) / 10,
      heading: null,
      altitudeM: route.polyline[k]![2],
    });
  }
  return out;
}

export function geometryFor(route: Route) { return buildGeometry(route.polyline); }
