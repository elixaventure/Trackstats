import { riderRank } from "./leaderboard";
import { comparableSessions, hasFiveWithin } from "./stats";
import type { Achievement, Lap, LeaderboardEntry, Route, Session } from "./types";

interface Input {
  riderId: string;
  sessions: Session[];
  laps: Lap[];
  routes: Route[];
  entries: LeaderboardEntry[];
}

/**
 * Achievements are derived from riding history rather than stored as counters, so
 * they can never drift out of step with the data (and re-sync cleanly).
 */
export function computeAchievements({ riderId, sessions, laps, routes, entries }: Input): Achievement[] {
  const mine = sessions.filter((s) => s.riderId === riderId && s.status === "completed").sort((a, b) => a.startedAt - b.startedAt);
  const lapsBySession = new Map<string, Lap[]>();
  for (const l of laps) if (l.riderId === riderId) lapsBySession.set(l.sessionId, [...(lapsBySession.get(l.sessionId) ?? []), l]);

  const at = (s: Session | undefined) => ({ achievedAt: s?.endedAt ?? s?.startedAt ?? null, sessionId: s?.id ?? null });
  const list: Achievement[] = [];
  const add = (key: string, title: string, description: string, hit: { achievedAt: number | null; sessionId: string | null }) =>
    list.push({ key, title, description, ...hit });

  add("first_session", "First session", "Record your first timed session.", at(mine[0]));
  add("first_pb", "First PB", "Beat a previous personal best on any route.", at(mine.find((s) => s.summary?.isPb && s.summary.previousPbMs != null)));

  // Improvement milestones: first session on a route where PB beats that route's first best by X%.
  const improvedBy = (pct: number) => {
    let hit: Session | undefined;
    for (const r of routes) {
      const comp = comparableSessions(mine, r.id, r.configVersion);
      const first = comp[0]?.summary?.fastestLapMs;
      if (!first) continue;
      const s = comp.find((x) => x.summary!.fastestLapMs! <= first * (1 - pct / 100));
      if (s && (!hit || s.startedAt < hit.startedAt)) hit = s;
    }
    return at(hit);
  };
  add("improve_5", "5% faster", "Improve a route PB by 5% over your first session there.", improvedBy(5));
  add("improve_10", "10% faster", "Improve a route PB by 10% over your first session there.", improvedBy(10));
  add("sessions_10", "10 sessions", "Complete ten sessions.", at(mine[9]));

  let lapCount = 0;
  let hundred: Session | undefined;
  for (const s of mine) {
    lapCount += lapsBySession.get(s.id)?.length ?? 0;
    if (lapCount >= 100) { hundred = s; break; }
  }
  add("laps_100", "100 timed laps", "Clock up one hundred timed laps.", at(hundred));
  add("five_within_2", "Metronome", "Five laps in a row within 2 seconds of each other.",
    at(mine.find((s) => hasFiveWithin([...(lapsBySession.get(s.id) ?? [])].sort((a, b) => a.lapNumber - b.lapNumber)))));

  let bestRank: number | null = null;
  for (const r of routes) {
    const rank = riderRank(r, entries, riderId, "transponder") ?? riderRank(r, entries, riderId, "gps");
    if (rank != null && (bestRank == null || rank < bestRank)) bestRank = rank;
  }
  // Rank badges reflect the current standing; there's no historical rank log yet.
  const rankHit = (n: number) => ({ achievedAt: bestRank != null && bestRank <= n ? Date.now() : null, sessionId: null });
  add("top_100", "Top 100", "Reach the top 100 on any route leaderboard.", rankHit(100));
  add("top_50", "Top 50", "Reach the top 50 on any route leaderboard.", rankHit(50));
  add("top_10", "Top 10", "Reach the top 10 on any route leaderboard.", rankHit(10));
  return list;
}
