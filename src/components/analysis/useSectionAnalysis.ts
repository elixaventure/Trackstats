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

/** Laps of a ride that have enough GPS to analyse, in lap order. */
export function gpsLaps(laps: Lap[], points: GpsPoint[]): Lap[] {
  return laps.filter((l) => lapHasGps(points, l)).sort((a, b) => a.lapNumber - b.lapNumber);
}

/**
 * Compare two laps section by section and continuously. By default the fastest
 * GPS-covered lap of each ride; pass lap ids to pick particular laps, including
 * two laps of the same ride.
 */
export function useSectionAnalysis(
  route: Route | null,
  cur: { laps: Lap[]; points: GpsPoint[] },
  ref: { laps: Lap[]; points: GpsPoint[] } | null,
  pick: { curLapId?: string | null; refLapId?: string | null } = {},
): Analysis {
  const { curLapId, refLapId } = pick;
  return useMemo(() => {
    if (!route || !cur.points.length) return { sections: [], delta: null, curLap: null, refLap: null };
    const curLap = (curLapId && cur.laps.find((l) => l.id === curLapId && lapHasGps(cur.points, l))) || bestGpsLap(cur.laps, cur.points);
    const refLap = !ref || !ref.points.length ? null
      : (refLapId && refLapId !== curLap?.id && ref.laps.find((l) => l.id === refLapId && lapHasGps(ref.points, l))) || bestGpsLap(ref.laps.filter((l) => l.id !== curLap?.id), ref.points);
    if (!curLap) return { sections: [], delta: null, curLap: null, refLap };
    const a = { points: cur.points, lap: curLap };
    const b = refLap && ref ? { points: ref.points, lap: refLap } : null;
    return { sections: compareLaps(route, a, b), delta: b ? lapDelta(route, a, b) : null, curLap, refLap };
  }, [route, cur.laps, cur.points, ref, curLapId, refLapId]);
}
