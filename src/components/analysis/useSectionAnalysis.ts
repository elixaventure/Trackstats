import { useMemo } from "react";
import { compareLaps, lapHasGps, type SectionResult } from "@/domain/routeAnalysis";
import type { GpsPoint, Lap, Route } from "@/domain/types";

function bestGpsLap(laps: Lap[], points: GpsPoint[]): Lap | null {
  return laps.filter((l) => l.valid && lapHasGps(points, l)).sort((a, b) => a.durationMs - b.durationMs)[0] ?? null;
}

/** Fastest GPS-covered lap of each session, compared section by section. */
export function useSectionAnalysis(route: Route | null, cur: { laps: Lap[]; points: GpsPoint[] }, ref: { laps: Lap[]; points: GpsPoint[] } | null) {
  return useMemo(() => {
    if (!route || !cur.points.length) return { sections: [] as SectionResult[], curLap: null, refLap: null };
    const curLap = bestGpsLap(cur.laps, cur.points);
    const refLap = ref && ref.points.length ? bestGpsLap(ref.laps, ref.points) : null;
    if (!curLap) return { sections: [], curLap: null, refLap };
    const sections = compareLaps(route, { points: cur.points, lap: curLap }, refLap && ref ? { points: ref.points, lap: refLap } : null);
    return { sections, curLap, refLap };
  }, [route, cur.laps, cur.points, ref]);
}
