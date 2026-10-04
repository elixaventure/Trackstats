import type { DbState } from "./db";
import type { Lap, Route, Session } from "@/domain/types";
import { comparableSessions } from "@/domain/stats";

export const myRiders = (s: DbState) => Object.values(s.riders).filter((r) => r.ownerUserId === s.user.id).sort((a, b) => a.createdAt - b.createdAt);

export const activeRider = (s: DbState) => s.riders[s.activeRiderId] ?? myRiders(s)[0] ?? null;

export const riderBikes = (s: DbState, riderId: string) => Object.values(s.bikes).filter((b) => b.riderId === riderId && !b.archived);

export const riderSessions = (s: DbState, riderId: string): Session[] =>
  Object.values(s.sessions).filter((x) => x.riderId === riderId && x.status === "completed").sort((a, b) => b.startedAt - a.startedAt);

export function lapsBySession(s: DbState): Map<string, Lap[]> {
  const m = new Map<string, Lap[]>();
  for (const l of Object.values(s.laps)) {
    const arr = m.get(l.sessionId);
    if (arr) arr.push(l);
    else m.set(l.sessionId, [l]);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.lapNumber - b.lapNumber);
  return m;
}

export const sessionLaps = (s: DbState, sessionId: string) =>
  Object.values(s.laps).filter((l) => l.sessionId === sessionId).sort((a, b) => a.lapNumber - b.lapNumber);

/** Current PB on a route's current configuration, optionally only from sessions before a time. */
export function routePb(s: DbState, riderId: string, route: Route, before?: number): { ms: number; session: Session } | null {
  let best: { ms: number; session: Session } | null = null;
  for (const x of comparableSessions(Object.values(s.sessions), route.id, route.configVersion)) {
    if (x.riderId !== riderId || (before != null && x.startedAt >= before)) continue;
    const ms = x.summary!.fastestLapMs!;
    if (!best || ms < best.ms) best = { ms, session: x };
  }
  return best;
}

export const visibleRoutes = (s: DbState) =>
  Object.values(s.routes).filter((r) => r.visibility === "public" || r.createdByUserId === s.user.id).sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name));

export function groupsForRider(s: DbState, riderId: string) {
  const ids = new Set(Object.values(s.groupMembers).filter((m) => m.riderId === riderId).map((m) => m.groupId));
  return Object.values(s.groups).filter((g) => ids.has(g.id));
}

export const groupRiderIds = (s: DbState, groupId: string) =>
  new Set(Object.values(s.groupMembers).filter((m) => m.groupId === groupId).map((m) => m.riderId));

export function bikeLabel(s: DbState, bikeId: string | null | undefined) {
  const b = bikeId ? s.bikes[bikeId] : undefined;
  return b ? `${b.manufacturer} ${b.model}` : "No bike";
}
