import { buildGeometry, elevationGain, gpsToLine, haversineM, polylineLength, projectOntoRoute, topSpeedKph } from "@/domain/geo";
import { detectCrossings, prepareGates } from "@/domain/gates";
import { computeLaps } from "@/domain/laps";
import { summarise } from "@/domain/stats";
import type { GpsPoint, Lap, LngLatAlt, Route, Session, TimingEvent, TrackCondition } from "@/domain/types";
import { stableUuid } from "@/lib/id";
import type { ImportedTrack } from "./types";

export interface RouteMatch { route: Route; fraction: number }

/**
 * Which saved route was this ridden on? Share of fixes that sit on the route
 * (riders also sit in the pits, ride the access lane etc., so 100% is rare).
 */
export function matchRoutes(routes: Route[], points: GpsPoint[]): RouteMatch[] {
  if (points.length < 5) return [];
  const step = Math.max(1, Math.floor(points.length / 1500));
  const sample = points.filter((_, i) => i % step === 0);
  const out: RouteMatch[] = [];
  for (const route of routes) {
    if (route.polyline.length < 2) continue;
    const g = buildGeometry(route.polyline);
    // Quick reject: nothing within 2 km of the route start.
    const s = route.polyline[0]!;
    if (!sample.some((p) => haversineM(p.lat, p.lng, s[1], s[0]) < 2000)) continue;
    let near = 0;
    for (const p of sample) if (projectOntoRoute(g, g.proj.toXy(p.lat, p.lng)).offsetM <= Math.max(25, p.accuracyM * 2)) near++;
    out.push({ route, fraction: near / sample.length });
  }
  return out.filter((m) => m.fraction >= 0.3).sort((a, b) => b.fraction - a.fraction);
}

/** Timing events from the trace crossing the route's virtual gates. */
export function gateEvents(route: Route, points: GpsPoint[], sessionId: string, riderId: string): TimingEvent[] {
  const g = buildGeometry(route.polyline);
  // Same detector as live timing, so imported, live and re-timed rides agree.
  return detectCrossings(g, prepareGates(g, route.gates), route.isLoop, points).map((c, i) => ({
    id: stableUuid(`${sessionId}:gate:${i}`), sessionId, riderId, transponderId: null, tagCode: null,
    podId: `GPS-${c.role}`, role: c.role, source: "gps" as const, at: c.at, signalStrength: null,
  }));
}

/**
 * For a trace with no saved route: the first closed loop (back within 20 m of
 * where it started, after at least 300 m). The rider then trims it in the editor.
 */
export function firstLoop(points: GpsPoint[]): LngLatAlt[] {
  const line = gpsToLine(points.filter((p) => p.accuracyM <= 30));
  for (let start = 0; start < Math.min(line.length, 600); start += 5) {
    const s = line[start]!;
    let dist = 0;
    for (let j = start + 1; j < line.length; j++) {
      const a = line[j - 1]!, b = line[j]!;
      dist += haversineM(a[1], a[0], b[1], b[0]);
      if (dist > 300 && haversineM(b[1], b[0], s[1], s[0]) < 20) return line.slice(start, j + 1);
    }
  }
  return line;
}

export interface ImportPlan {
  session: Session;
  laps: Lap[];
  events: TimingEvent[];
  points: GpsPoint[];
}

export function buildImportedSession(opts: {
  track: ImportedTrack; route: Route | null; riderId: string; bikeId: string | null; condition: TrackCondition; notes: string;
  previousPbMs: number | null;
}): ImportPlan {
  const { track, route } = opts;
  const pts = track.points;
  const first = pts[0]!, last = pts[pts.length - 1]!;
  // Stable id: importing the same file twice updates rather than duplicates.
  const id = stableUuid(`import:${opts.riderId}:${track.kind}:${first.t}:${last.t}`);
  const events = route ? gateEvents(route, pts, id, opts.riderId) : [];
  const timing = { mode: "gps" as const, pods: [], isLoop: route?.isLoop ?? true };
  const laps = route ? computeLaps(id, opts.riderId, events, timing) : [];
  const line = gpsToLine(pts);
  const summary = summarise(laps, last.t - first.t, opts.previousPbMs, {
    distanceM: Math.round(polylineLength(line)),
    topSpeedKph: topSpeedKph(pts),
    elevationGainM: elevationGain(line.map((p) => p[2])),
  });
  const session: Session = {
    id, riderId: opts.riderId, bikeId: opts.bikeId, routeId: route?.id ?? null, routeConfigVersion: route?.configVersion ?? null,
    transponderId: null, rideType: route?.routeType ?? "free_ride", timing, condition: opts.condition, notes: opts.notes,
    status: "completed", startedAt: first.t, endedAt: last.t, summary, hasGps: true,
    importInfo: { kind: track.kind, fileNames: track.fileNames, device: track.device, rateHz: track.rateHz, videos: track.videos },
  };
  return { session, laps, events, points: pts };
}
