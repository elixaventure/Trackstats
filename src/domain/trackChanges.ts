import type { Route, TrackChange } from "./types";

const DAY = 86400000;

/** Is this report still worth showing? Hazards/closures until cleared; everything else for 30 days. */
export function isCurrent(c: TrackChange, now = Date.now()): boolean {
  if (c.resolvedAt != null) return false;
  if (c.severity === "hazard" || c.kind === "closed") return true;
  return now - c.createdAt <= 30 * DAY;
}

export function changesFor(routeId: string, all: TrackChange[]): TrackChange[] {
  return all.filter((c) => c.routeId === routeId).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * What a rider should hear about before riding a track: anything reported since
 * their last ride there (or in the last 30 days if they've never ridden it), plus
 * any hazard or closure that's still open, however old.
 */
export function headsUp(routeId: string, all: TrackChange[], lastRodeAt: number | null, now = Date.now()): TrackChange[] {
  const since = lastRodeAt ?? now - 30 * DAY;
  return changesFor(routeId, all).filter((c) => c.resolvedAt == null && (c.createdAt > since || c.severity === "hazard" || c.kind === "closed"));
}

/** Reports from the track's owner are shown as official notices. */
export const isOfficial = (c: TrackChange, route: Route) => c.reportedByUserId === route.createdByUserId;

/** Changes that make lap times before and after hard to compare, oldest first (for chart markers). */
export const timeBreaks = (routeId: string, all: TrackChange[]) =>
  all.filter((c) => c.routeId === routeId && c.affectsTimes).sort((a, b) => a.createdAt - b.createdAt);
