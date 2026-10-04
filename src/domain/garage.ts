import { mean } from "./stats";
import type { Bike, Lap, Route, Session, TrackCondition } from "./types";

const DAY = 86400000;
const isDryish = (c: TrackCondition) => c === "dry" || c === "damp";

export interface BikeStats {
  bike: Bike;
  sessions: number;
  laps: number;
  /** Total time out on the bike: a rough engine-hours figure for servicing. */
  ridingMs: number;
  lastRiddenAt: number | null;
  /** Best lap on each route ridden with this bike (current route layout only). */
  bests: { route: Route; ms: number; at: number }[];
}

export function bikeStats(bikes: Bike[], sessions: Session[], lapCount: (sessionId: string) => number, routes: Record<string, Route>): BikeStats[] {
  return bikes.map((bike) => {
    const mine = sessions.filter((s) => s.bikeId === bike.id && s.status === "completed");
    const bestByRoute = new Map<string, { route: Route; ms: number; at: number }>();
    for (const s of mine) {
      const route = s.routeId ? routes[s.routeId] : undefined;
      const ms = s.summary?.fastestLapMs;
      if (!route || ms == null || s.routeConfigVersion !== route.configVersion) continue;
      const prev = bestByRoute.get(route.id);
      if (!prev || ms < prev.ms) bestByRoute.set(route.id, { route, ms, at: s.startedAt });
    }
    return {
      bike,
      sessions: mine.length,
      laps: mine.reduce((a, s) => a + lapCount(s.id), 0),
      ridingMs: mine.reduce((a, s) => a + (s.summary?.durationMs ?? 0), 0),
      lastRiddenAt: mine.length ? Math.max(...mine.map((s) => s.startedAt)) : null,
      bests: [...bestByRoute.values()].sort((a, b) => a.route.name.localeCompare(b.route.name)),
    };
  });
}

export interface BikeComparisonRow {
  bike: Bike;
  /** Sessions on this route that matched the filter. */
  sessions: number;
  /** Average session-best lap over the recent sessions used for the comparison. */
  recentAvgMs: number | null;
  usedSessions: number;
  pbMs: number | null;
  firstAt: number;
  lastAt: number;
  /** Gap to the fastest bike's recent average (0 for the fastest). */
  gapMs: number | null;
}

export interface BikeComparison {
  rows: BikeComparisonRow[];
  /** False when the bikes' recent rides are far apart in time, so rider progress muddies the result. */
  sameEra: boolean;
  /** At least two bikes with two or more rides each. */
  enoughData: boolean;
}

/**
 * Which bike is the rider faster on, on one route?
 *
 * Comparing PBs is unfair: the bike ridden most recently usually wins simply
 * because the rider has improved. So we compare the average session-best over
 * the same number of recent rides on each bike (up to 5), in the same kind of
 * conditions, and flag it when those rides were months apart.
 */
export function compareBikes(route: Route, sessions: Session[], bikes: Bike[], opts: { dryOnly: boolean; recent?: number }): BikeComparison {
  const recent = opts.recent ?? 5;
  const usable = sessions.filter((s) =>
    s.status === "completed" && s.routeId === route.id && s.routeConfigVersion === route.configVersion &&
    s.summary?.fastestLapMs != null && s.bikeId != null && (!opts.dryOnly || isDryish(s.condition)),
  );
  const byBike = bikes
    .map((bike) => ({ bike, list: usable.filter((s) => s.bikeId === bike.id).sort((a, b) => b.startedAt - a.startedAt) }))
    .filter((x) => x.list.length > 0);
  // Use the same number of rides for every bike so one long history doesn't dominate.
  const n = Math.max(1, Math.min(recent, ...byBike.map((x) => x.list.length)));
  const rows: BikeComparisonRow[] = byBike.map(({ bike, list }) => {
    const used = list.slice(0, n);
    return {
      bike,
      sessions: list.length,
      recentAvgMs: Math.round(mean(used.map((s) => s.summary!.fastestLapMs!))!),
      usedSessions: used.length,
      pbMs: Math.min(...list.map((s) => s.summary!.fastestLapMs!)),
      firstAt: used[used.length - 1]!.startedAt,
      lastAt: used[0]!.startedAt,
      gapMs: null,
    };
  });
  const fastest = Math.min(...rows.map((r) => r.recentAvgMs ?? Infinity));
  for (const r of rows) r.gapMs = r.recentAvgMs != null ? r.recentAvgMs - fastest : null;
  rows.sort((a, b) => (a.recentAvgMs ?? Infinity) - (b.recentAvgMs ?? Infinity));

  // Same era: every bike's recent window overlaps (or sits within 30 days of) every other's.
  let sameEra = true;
  for (const a of rows) for (const b of rows) {
    if (a === b) continue;
    const gap = Math.max(a.firstAt, b.firstAt) - Math.min(a.lastAt, b.lastAt);
    if (gap > 30 * DAY) sameEra = false;
  }
  return { rows, sameEra, enoughData: rows.filter((r) => r.sessions >= 2).length >= 2 };
}

/** Routes where the rider has used at least two different bikes. */
export function routesWithSeveralBikes(routes: Route[], sessions: Session[]): Route[] {
  return routes.filter((r) => new Set(sessions.filter((s) => s.routeId === r.id && s.bikeId && s.status === "completed").map((s) => s.bikeId)).size >= 2);
}

export const lapCounter = (laps: Lap[]) => {
  const m = new Map<string, number>();
  for (const l of laps) m.set(l.sessionId, (m.get(l.sessionId) ?? 0) + 1);
  return (id: string) => m.get(id) ?? 0;
};
