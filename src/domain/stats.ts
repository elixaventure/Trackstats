import type { Lap, Session, SessionSummary, TrackCondition } from "./types";

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function stdDev(xs: number[]): number | null {
  const m = mean(xs);
  if (m == null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export const validLaps = (laps: Lap[]) => laps.filter((l) => l.valid);

/**
 * 0–100 consistency score from the coefficient of variation of valid laps.
 * 1% spread ≈ 90, 3% ≈ 70, 10%+ = 0. Shown alongside the raw ± seconds.
 */
export function consistencyScore(laps: Lap[]): number | null {
  const d = validLaps(laps).map((l) => l.durationMs);
  const sd = stdDev(d);
  const m = mean(d);
  if (sd == null || m == null) return null;
  return Math.max(0, Math.round(100 - (sd / m) * 1000));
}

export function summarise(laps: Lap[], durationMs: number, previousPbMs: number | null, gps: {
  distanceM: number | null; topSpeedKph: number | null; elevationGainM: number | null;
}): SessionSummary {
  const v = validLaps(laps).map((l) => l.durationMs);
  const fastest = v.length ? Math.min(...v) : null;
  return {
    durationMs,
    lapCount: laps.length,
    fastestLapMs: fastest,
    averageLapMs: v.length ? Math.round(mean(v)!) : null,
    consistencySdMs: v.length > 1 ? Math.round(stdDev(v)!) : null,
    previousPbMs,
    isPb: fastest != null && (previousPbMs == null || fastest < previousPbMs),
    ...gps,
  };
}

/** Five consecutive valid laps whose spread is within 2 seconds. */
export function hasFiveWithin(laps: Lap[], spreadMs = 2000): boolean {
  const d = laps.map((l) => (l.valid ? l.durationMs : null));
  for (let i = 0; i + 5 <= d.length; i++) {
    const w = d.slice(i, i + 5);
    if (w.some((x) => x == null)) continue;
    const nums = w as number[];
    if (Math.max(...nums) - Math.min(...nums) <= spreadMs) return true;
  }
  return false;
}

/** Sessions comparable for PB purposes: same route and same route configuration. */
export function comparableSessions(sessions: Session[], routeId: string, configVersion: number | null) {
  return sessions
    .filter((s) => s.status === "completed" && s.routeId === routeId && s.routeConfigVersion === configVersion && s.summary?.fastestLapMs != null)
    .sort((a, b) => a.startedAt - b.startedAt);
}

export interface ProgressPoint {
  sessionId: string;
  at: number;
  best: number;
  average: number | null;
  pbSoFar: number;
  isPb: boolean;
  condition: TrackCondition;
  bikeId: string | null;
  consistencySd: number | null;
}

export function progressSeries(sessions: Session[]): ProgressPoint[] {
  let pb = Infinity;
  return sessions.map((s) => {
    const best = s.summary!.fastestLapMs!;
    const isPb = best < pb;
    pb = Math.min(pb, best);
    return {
      sessionId: s.id,
      at: s.startedAt,
      best,
      average: s.summary!.averageLapMs,
      pbSoFar: pb,
      isPb,
      condition: s.condition,
      bikeId: s.bikeId,
      consistencySd: s.summary!.consistencySdMs,
    };
  });
}

export interface RouteImprovement {
  firstBestMs: number;
  pbMs: number;
  improvementMs: number;
  improvementPct: number;
  firstAt: number;
  pbAt: number;
  sessions: number;
  pbCount: number;
}

/** Compares the first recorded session's best lap with the current PB. */
export function routeImprovement(series: ProgressPoint[]): RouteImprovement | null {
  if (series.length < 2) return null;
  const first = series[0]!;
  const pbPoint = series.reduce((a, b) => (b.best < a.best ? b : a));
  const improvement = first.best - pbPoint.best;
  return {
    firstBestMs: first.best,
    pbMs: pbPoint.best,
    improvementMs: improvement,
    improvementPct: (improvement / first.best) * 100,
    firstAt: first.at,
    pbAt: pbPoint.at,
    sessions: series.length,
    pbCount: series.filter((p, i) => i > 0 && p.isPb).length,
  };
}

/** Best lap per condition group, so wet laps never hide inside a dry PB. */
export function conditionSplit(series: ProgressPoint[]) {
  const groups: Record<"dry" | "wet", ProgressPoint[]> = { dry: [], wet: [] };
  for (const p of series) (p.condition === "dry" || p.condition === "damp" ? groups.dry : groups.wet).push(p);
  const best = (ps: ProgressPoint[]) => (ps.length ? Math.min(...ps.map((p) => p.best)) : null);
  const avg = (ps: ProgressPoint[]) => mean(ps.map((p) => p.best));
  return {
    dry: { sessions: groups.dry.length, best: best(groups.dry), avgBest: avg(groups.dry) },
    wet: { sessions: groups.wet.length, best: best(groups.wet), avgBest: avg(groups.wet) },
  };
}

export function monthKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function sessionsPerMonth(sessions: Session[]): { month: string; label: string; sessions: number; hours: number }[] {
  const map = new Map<string, { sessions: number; ms: number; at: number }>();
  for (const s of sessions) {
    const k = monthKey(s.startedAt);
    const e = map.get(k) ?? { sessions: 0, ms: 0, at: s.startedAt };
    e.sessions += 1;
    e.ms += s.summary?.durationMs ?? 0;
    map.set(k, e);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, e]) => ({
      month,
      label: new Date(e.at).toLocaleString("en-GB", { month: "short" }),
      sessions: e.sessions,
      hours: Math.round((e.ms / 3600000) * 10) / 10,
    }));
}

/** Consecutive weeks (ending this week or last week) with at least one session. */
export function weekStreak(sessions: Session[], now = Date.now()): number {
  const week = (ms: number) => Math.floor((ms - 4 * 86400000) / (7 * 86400000)); // Monday-based weeks
  const weeks = new Set(sessions.map((s) => week(s.startedAt)));
  let w = week(now);
  if (!weeks.has(w)) w -= 1;
  let streak = 0;
  while (weeks.has(w)) { streak++; w--; }
  return streak;
}
