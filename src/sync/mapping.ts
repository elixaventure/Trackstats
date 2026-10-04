import type { DbState, EntityTable } from "@/data/db";
import type { GpsPoint, Route } from "@/domain/types";

/** Local store table → Postgres table. */
export const TABLES: Record<EntityTable, string> = {
  riders: "rider_profiles",
  bikes: "bikes",
  groups: "groups",
  groupMembers: "group_members",
  transponders: "transponders",
  assignments: "transponder_assignments",
  routes: "routes",
  sessions: "sessions",
  timingEvents: "timing_events",
  laps: "laps",
  leaderboard: "leaderboard_entries",
};

/** Parents before children so foreign keys are satisfied. */
export const PUSH_ORDER: EntityTable[] = [
  "riders", "bikes", "groups", "groupMembers", "transponders", "assignments", "routes", "sessions", "timingEvents", "laps",
];

// Never pushed: images go to Storage (not yet wired), demo flag is local-only, polyline/sectors have their own tables.
const SKIP = new Set(["isDemo", "imageDataUrl", "polyline", "sectors", "favourite"]);

const snake = (k: string) => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const isTimeKey = (k: string) => /At$/.test(k);

export function toRow(obj: object): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP.has(k)) continue;
    row[snake(k)] = isTimeKey(k) && typeof v === "number" ? new Date(v).toISOString() : v;
  }
  return row;
}

export function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const ck = camel(k);
    out[ck] = isTimeKey(ck) && typeof v === "string" ? Date.parse(v) : v;
  }
  return out as T;
}

export function routeChildRows(r: Route) {
  return {
    points: r.polyline.map((p, i) => ({ route_id: r.id, seq: i, lng: p[0], lat: p[1], altitude_m: p[2] })),
    sectors: r.sectors.map((s, i) => ({ id: s.id, route_id: r.id, seq: i, name: s.name, end_distance_m: s.endDistanceM })),
  };
}

export function gpsRows(sessionId: string, pts: GpsPoint[]) {
  return pts.map((p) => ({
    session_id: sessionId, t: new Date(p.t).toISOString(), lat: p.lat, lng: p.lng,
    accuracy_m: p.accuracyM, speed_mps: p.speedMps, heading: p.heading, altitude_m: p.altitudeM,
  }));
}

export function rowFor(s: DbState, table: EntityTable, key: string): object | undefined {
  return (s[table] as Record<string, object>)[key];
}
