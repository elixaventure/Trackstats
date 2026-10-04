import { summarise } from "@/domain/stats";
import { topSpeedKph } from "@/domain/geo";
import { flagOutliers } from "@/domain/laps";
import type {
  GpsPoint, Lap, LeaderboardEntry, RiderProfile, Route, Session, TimingConfig, TimingEvent, TrackCondition, Transponder,
  TransponderAssignment,
} from "@/domain/types";
import { stableUuid } from "@/lib/id";
import type { DbState } from "../db";
import { SCHEMA_VERSION } from "../db";
import { demoPeople } from "./riders";
import { gaussian, mulberry32 } from "./rng";
import { demoRoutes, SECTOR_PROFILES } from "./routes";
import { geometryFor, lapGps, sectorDurations } from "./traces";

type RouteKey = "bacup" | "woodland" | "sprint";
interface Plan { rider: "alex" | "charlie"; route: RouteKey; daysAgo: number; cond: TrackCondition; best: number; laps: number; tag: "personal" | "shared1" | "shared2" | null; outlier?: boolean; notes?: string }

const DAY = 86400000;

// Alex's Bacup bests (seconds) tell the product story: 2:16.84 → 2:08.42 in seven weeks.
const PLANS: Plan[] = [
  ...([
    [49, "dry", 136.84, 7, "shared1", "First time out with a timing tag."],
    [45, "dry", 135.9, 8, "shared1"], [42, "wet", 141.2, 6, "shared1", "Heavy rain, ruts in the hairpin."],
    [38, "dry", 134.7, 8, "shared1"], [35, "damp", 134.95, 8, "shared1"], [31, "dry", 133.8, 9, "personal", "New personal tag."],
    [28, "muddy", 140.1, 7, "personal", "Went down in the rollers on lap 4."], [24, "dry", 133.1, 9, "personal"],
    [21, "dry", 132.12, 10, "personal", "Finally jumping the top double."], [17, "wet", 137.6, 6, "personal"],
    [14, "dry", 132.4, 9, "personal"], [10, "mixed", 135.0, 8, "personal"], [7, "dry", 132.55, 9, "personal"],
    [1, "dry", 128.42, 10, "personal", "Rollers flowing. Committed to the berm line."],
  ] as const).map(([daysAgo, cond, best, laps, tag, notes], i): Plan => ({ rider: "alex", route: "bacup", daysAgo, cond, best, laps, tag, notes, outlier: i === 6 })),
  ...([[41, "dry", 602.4], [27, "damp", 588.9], [20, "muddy", 611.0], [13, "dry", 571.3], [6, "dry", 566.0], [2, "dry", 561.8]] as const)
    .map(([daysAgo, cond, best]): Plan => ({ rider: "alex", route: "woodland", daysAgo, cond, best, laps: 3, tag: null })),
  ...([[34, "dry", 61.8], [20, "dry", 60.4], [6, "dry", 58.9]] as const)
    .map(([daysAgo, cond, best]): Plan => ({ rider: "alex", route: "sprint", daysAgo, cond, best, laps: 6, tag: "personal" })),
  ...([[42, "wet", 168.3], [35, "damp", 161.2], [28, "muddy", 166.0], [14, "dry", 155.7], [7, "dry", 153.1]] as const)
    .map(([daysAgo, cond, best]): Plan => ({ rider: "charlie", route: "bacup", daysAgo, cond, best, laps: 6, tag: "shared2" })),
];

const TIMING: Record<RouteKey, TimingConfig> = {
  bacup: { mode: "lap", pods: [{ podId: "POD-A", role: "start_finish" }], isLoop: true },
  woodland: { mode: "gps", pods: [], isLoop: true },
  sprint: { mode: "start_finish", pods: [{ podId: "POD-A", role: "start" }, { podId: "POD-B", role: "finish" }], isLoop: false },
};

function lapTimes(plan: Plan, progress: number, rand: () => number): number[] {
  const spread = (plan.route === "woodland" ? 9 : plan.route === "sprint" ? 0.9 : 1.6) * (1.25 - progress * 0.6);
  const raw = Array.from({ length: plan.laps }, (_, i) => {
    const warmup = i === 0 && plan.route !== "sprint" ? spread * 2.5 : 0;
    const fatigue = i > 5 ? (i - 5) * spread * 0.25 : 0;
    return Math.abs(gaussian(rand)) * spread + warmup + fatigue;
  });
  if (plan.outlier) raw[3] = (raw[3] ?? 0) + 31;
  const min = Math.min(...raw.filter((_, i) => !(plan.outlier && i === 3)));
  return raw.map((x) => Math.round((plan.best + x - min) * 1000));
}

export function generateDemo(userId: string, now = Date.now()): { state: DbState; gps: Record<string, GpsPoint[]> } {
  const people = demoPeople(userId, now);
  const routes = demoRoutes(userId, now);
  const riders: Record<string, RiderProfile> = { [people.alex.id]: people.alex, [people.charlie.id]: people.charlie };
  for (const f of people.friends) riders[f.id] = f;

  const sessions: Session[] = [];
  const laps: Lap[] = [];
  const events: TimingEvent[] = [];
  const assignments: TransponderAssignment[] = [...people.assignments];
  const gps: Record<string, GpsPoint[]> = {};
  const bestSoFar = new Map<string, number>();
  const tagFor = (t: Plan["tag"]): Transponder | null => (t ? people.tags[t] : null);

  const ordered = [...PLANS].sort((a, b) => b.daysAgo - a.daysAgo);
  ordered.forEach((plan, idx) => {
    const rand = mulberry32(1000 + idx);
    const route: Route = routes[plan.route];
    const rider = plan.rider === "alex" ? people.alex : people.charlie;
    const bike = plan.rider === "charlie" ? people.bikes.ktm85 : plan.route === "woodland" ? people.bikes.ktm350 : people.bikes.crf;
    const sessionId = stableUuid(`session:${plan.rider}:${plan.route}:${plan.daysAgo}`);
    const startAt = now - plan.daysAgo * DAY - (now % DAY) + (plan.rider === "charlie" ? 9.5 : 10.25) * 3600000 + Math.round(rand() * 1800000);
    const progress = Math.min(1, (49 - plan.daysAgo) / 48);
    const times = lapTimes(plan, progress, rand);
    const tag = tagFor(plan.tag);
    const g = geometryFor(route);
    const points: GpsPoint[] = [];
    const sessionEvents: TimingEvent[] = [];
    const ev = (at: number, role: TimingEvent["role"], podId: string): TimingEvent => ({
      id: stableUuid(`${sessionId}:ev:${sessionEvents.length}`), sessionId, riderId: rider.id, transponderId: tag?.id ?? null,
      tagCode: tag?.code ?? null, podId, role, source: tag ? "transponder" : "gps", at, signalStrength: tag ? -48 : null,
    });

    let t = startAt + 90000;
    const sessionLaps: Lap[] = [];
    times.forEach((ms, i) => {
      const durations = sectorDurations(route, SECTOR_PROFILES[plan.route], ms, progress, rand);
      points.push(...lapGps(g, route, t, durations, rand));
      if (route.isLoop) {
        if (i === 0) sessionEvents.push(ev(t, "start_finish", tag ? "POD-A" : "GPS-SF"));
        sessionEvents.push(ev(t + ms, "start_finish", tag ? "POD-A" : "GPS-SF"));
      } else {
        sessionEvents.push(ev(t, "start", "POD-A"), ev(t + ms, "finish", "POD-B"));
      }
      sessionLaps.push({
        id: stableUuid(`${sessionId}:lap:${i + 1}`), sessionId, riderId: rider.id, lapNumber: i + 1, startedAt: t, durationMs: ms,
        splitsMs: [], source: tag ? "transponder" : "gps", valid: true,
      });
      t += ms + (route.isLoop ? 0 : 100000 + rand() * 60000); // ride back down between sprint runs
    });
    const flagged = flagOutliers(sessionLaps);
    const endAt = t + 120000;
    const pbKey = `${rider.id}:${route.id}`;
    const prevPb = bestSoFar.get(pbKey) ?? null;
    const summary = summarise(flagged, endAt - startAt, prevPb, {
      distanceM: Math.round(route.distanceM * times.length),
      topSpeedKph: topSpeedKph(points),
      elevationGainM: route.elevationGainM != null ? route.elevationGainM * times.length : null,
    });
    if (summary.fastestLapMs != null) bestSoFar.set(pbKey, Math.min(prevPb ?? Infinity, summary.fastestLapMs));

    sessions.push({
      id: sessionId, riderId: rider.id, bikeId: bike.id, routeId: route.id, routeConfigVersion: route.configVersion,
      transponderId: tag?.id ?? null, rideType: route.routeType, timing: TIMING[plan.route], condition: plan.cond, notes: plan.notes ?? "",
      status: "completed", startedAt: startAt, endedAt: endAt, summary, hasGps: true, isDemo: true,
    });
    laps.push(...flagged);
    events.push(...sessionEvents);
    gps[sessionId] = points;
    if (tag && tag.ownership === "shared") {
      assignments.push({ id: stableUuid(`${sessionId}:assign`), transponderId: tag.id, riderId: rider.id, assignedByUserId: userId, assignedAt: startAt, releasedAt: endAt });
    }
    if (tag) tag.lastSeenAt = Math.max(tag.lastSeenAt ?? 0, endAt - 120000);
  });

  const byId = <T extends { id: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x]));
  return {
    state: {
      schemaVersion: SCHEMA_VERSION,
      user: { id: userId, email: null, createdAt: now - 70 * DAY },
      activeRiderId: people.alex.id,
      riders,
      bikes: byId(Object.values(people.bikes)),
      groups: byId(Object.values(people.groups)),
      groupMembers: byId(people.members),
      transponders: byId(Object.values(people.tags)),
      assignments: byId(assignments),
      routes: byId(Object.values(routes)),
      sessions: byId(sessions),
      laps: byId(laps),
      timingEvents: byId(events),
      leaderboard: byId(otherRiderEntries(routes, people.friends, now)),
      settings: { simulateGps: false, simSpeed: 1, demoMode: true },
    },
    gps,
  };
}

const FIRST = ["Liam", "Josh", "Ryan", "Tom", "Ben", "Callum", "Harry", "Kieran", "Lewis", "Owen", "Jack", "Ethan", "Mason", "Nathan", "Reece", "Chloe", "Amy", "Luke", "Aaron", "Jordan"];
const LAST = ["Haworth", "Ashworth", "Greenwood", "Pickup", "Holt", "Crabtree", "Nuttall", "Whittaker", "Lord", "Barker", "Kershaw", "Hargreaves", "Duckworth", "Taylor", "Sutcliffe", "Riley"];
const CLASSES = ["MX1 Expert", "MX2 Clubman", "MX2 Expert", "Vets", "Clubman", "Youth 125"];
const CONDS: TrackCondition[] = ["dry", "dry", "dry", "damp", "wet", "mixed"];

function otherRiderEntries(routes: ReturnType<typeof demoRoutes>, friends: RiderProfile[], now: number): LeaderboardEntry[] {
  const rand = mulberry32(77);
  const out: LeaderboardEntry[] = [];
  const add = (route: Route, riderId: string, name: string, num: string, cls: string, lapMs: number, i: number, source: LeaderboardEntry["source"] = "transponder") =>
    out.push({
      id: stableUuid(`lb:${route.id}:${riderId}:${source}`), routeId: route.id, routeConfigVersion: route.configVersion, riderId, riderName: name,
      raceNumber: num, riderClass: cls, bikeLabel: "", condition: CONDS[i % CONDS.length]!, source, lapMs: Math.round(lapMs),
      setAt: now - Math.round(rand() * 120) * DAY, sessionId: null,
    });

  const friendBest: Record<string, [number, number, number]> = { "14": [118.9, 548.2, 55.1], "33": [126.8, 579.5, 59.6], "8": [139.4, 640.2, 64.2], "51": [144.7, 655.0, 66.8] };
  friends.forEach((f, i) => {
    const [b, w, s] = friendBest[f.raceNumber] ?? [140, 650, 66];
    add(routes.bacup, f.id, f.name, f.raceNumber, f.riderClass, b * 1000, i);
    add(routes.woodland, f.id, f.name, f.raceNumber, f.riderClass, w * 1000, i + 1, "gps");
    add(routes.sprint, f.id, f.name, f.raceNumber, f.riderClass, s * 1000, i + 2);
  });
  for (let i = 0; i < 46; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const rid = stableUuid(`other-rider:${i}`);
    const num = String(10 + ((i * 37) % 890));
    const cls = CLASSES[i % CLASSES.length]!;
    const skill = rand();
    add(routes.bacup, rid, name, num, cls, (112 + skill * 58) * 1000, i);
    if (i % 2 === 0) add(routes.woodland, rid, name, num, cls, (520 + skill * 190) * 1000, i, "gps");
    if (i % 3 === 0) add(routes.sprint, rid, name, num, cls, (53 + skill * 16) * 1000, i);
  }
  return out;
}
