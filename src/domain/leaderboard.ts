import type { Bike, Lap, LeaderboardEntry, RiderProfile, Route, Session, TimingSource, TrackCondition } from "./types";

export type Period = "all" | "year" | "30d" | "7d";
export type ConditionFilter = "all" | TrackCondition;

export interface LeaderboardFilter {
  routeId: string;
  /** Transponder and GPS-timed laps are ranked separately: their accuracy differs by an order of magnitude. */
  source: Exclude<TimingSource, "manual">;
  riderClass: string | "all";
  condition: ConditionFilter;
  period: Period;
  /** null = everyone; otherwise only these rider ids (a group or friends list). */
  riderIds: Set<string> | null;
}

export interface LeaderboardRow extends LeaderboardEntry { rank: number; gapMs: number }

const PERIOD_MS: Record<Exclude<Period, "all">, number> = { year: 365 * 86400000, "30d": 30 * 86400000, "7d": 7 * 86400000 };

/** Best valid lap of each completed session for the given riders, as leaderboard entries. */
export function entriesFromSessions(
  sessions: Session[], laps: Lap[], riders: Record<string, RiderProfile>, bikes: Record<string, Bike>,
): LeaderboardEntry[] {
  const lapsBySession = new Map<string, Lap[]>();
  for (const l of laps) {
    if (!l.valid || l.source === "manual") continue;
    const arr = lapsBySession.get(l.sessionId) ?? [];
    arr.push(l);
    lapsBySession.set(l.sessionId, arr);
  }
  const out: LeaderboardEntry[] = [];
  for (const s of sessions) {
    if (s.status !== "completed" || s.simulated || !s.routeId || s.routeConfigVersion == null) continue;
    const best = (lapsBySession.get(s.id) ?? []).reduce<Lap | null>((a, b) => (!a || b.durationMs < a.durationMs ? b : a), null);
    const rider = riders[s.riderId];
    if (!best || !rider) continue;
    const bike = s.bikeId ? bikes[s.bikeId] : undefined;
    out.push({
      id: `own-${s.id}`,
      routeId: s.routeId,
      routeConfigVersion: s.routeConfigVersion,
      riderId: rider.id,
      riderName: rider.name,
      raceNumber: rider.raceNumber,
      riderClass: bike?.bikeClass ?? rider.riderClass,
      bikeLabel: bike ? `${bike.manufacturer} ${bike.model}` : "",
      condition: s.condition,
      source: best.source,
      lapMs: best.durationMs,
      setAt: best.startedAt,
      sessionId: s.id,
    });
  }
  return out;
}

export function buildLeaderboard(route: Route, entries: LeaderboardEntry[], f: LeaderboardFilter, now = Date.now()): LeaderboardRow[] {
  const bestByRider = new Map<string, LeaderboardEntry>();
  for (const e of entries) {
    if (e.routeId !== f.routeId || e.routeConfigVersion !== route.configVersion) continue;
    if (e.source !== f.source) continue;
    if (f.riderClass !== "all" && e.riderClass !== f.riderClass) continue;
    if (f.condition !== "all" && e.condition !== f.condition) continue;
    if (f.period !== "all" && now - e.setAt > PERIOD_MS[f.period]) continue;
    if (f.riderIds && !f.riderIds.has(e.riderId)) continue;
    const prev = bestByRider.get(e.riderId);
    if (!prev || e.lapMs < prev.lapMs) bestByRider.set(e.riderId, e);
  }
  const sorted = [...bestByRider.values()].sort((a, b) => a.lapMs - b.lapMs);
  const leader = sorted[0]?.lapMs ?? 0;
  return sorted.map((e, i) => ({ ...e, rank: i + 1, gapMs: e.lapMs - leader }));
}

export function riderRank(route: Route, entries: LeaderboardEntry[], riderId: string, source: LeaderboardFilter["source"]): number | null {
  const rows = buildLeaderboard(route, entries, { routeId: route.id, source, riderClass: "all", condition: "all", period: "all", riderIds: null });
  return rows.find((r) => r.riderId === riderId)?.rank ?? null;
}
