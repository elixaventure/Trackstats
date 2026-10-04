import { useMemo } from "react";
import { compareLaps, lapDelta, lapHasGps, type ColourSegment, type DeltaPoint, type SectionResult } from "@/domain/routeAnalysis";
import type { GpsPoint, Lap, Route } from "@/domain/types";

function bestGpsLap(laps: Lap[], points: GpsPoint[]): Lap | null {
  return laps.filter((l) => l.valid && lapHasGps(points, l)).sort((a, b) => a.durationMs - b.durationMs)[0] ?? null;
}

export interface Analysis {
  sections: SectionResult[];
  delta: { points: DeltaPoint[]; segments: ColourSegment[] } | null;
  curLap: Lap | null;
  refLap: Lap | null;
}

/** Fastest GPS-covered lap of each session, compared section by section and continuously. */
export function useSectionAnalysis(route: Route | null, cur: { laps: Lap[]; points: GpsPoint[] }, ref: { laps: Lap[]; points: GpsPoint[] } | null): Analysis {
  return useMemo(() => {
    if (!route || !cur.points.length) return { sections: [], delta: null, curLap: null, refLap: null };
    const curLap = bestGpsLap(cur.laps, cur.points);
    const refLap = ref && ref.points.length ? bestGpsLap(ref.laps, ref.points) : null;
    if (!curLap) return { sections: [], delta: null, curLap: null, refLap };
    const a = { points: cur.points, lap: curLap };
    const b = refLap && ref ? { points: ref.points, lap: refLap } : null;
    return { sections: compareLaps(route, a, b), delta: b ? lapDelta(route, a, b) : null, curLap, refLap };
  }, [route, cur.laps, cur.points, ref]);
}
