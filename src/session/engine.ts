import { store } from "@/data/store";
import { kvDel, kvGet, kvSet, loadGps, saveGps } from "@/data/persist";
import { routePb } from "@/data/selectors";
import { buildGeometry, elevationGain, gpsToLine, polylineLength, topSpeedKph, type RouteGeometry, type Xy } from "@/domain/geo";
import { gateCrossings, prepareGates, type PreparedGate } from "@/domain/gates";
import { computeLaps, openLapStart } from "@/domain/laps";
import { summarise } from "@/domain/stats";
import type { GpsPoint, Lap, PodRole, RideType, Route, Session, TimingConfig, TimingEvent, TrackCondition } from "@/domain/types";
import { uuid } from "@/lib/id";
import { createLocationProvider, type LocationProvider } from "@/location";
import { GpsSampler } from "@/location/sampler";
import { outbox } from "@/sync/outbox";
import { getTimingProvider, type PassingEvent, type TimingStatus } from "@/timing";

export interface RideSetup {
  rideType: RideType;
  routeId: string | null;
  timing: TimingConfig;
  condition: TrackCondition;
  notes: string;
  /** First participant carries the phone (GPS). Others are timed by tag only. */
  participants: { riderId: string; bikeId: string | null; transponderId: string | null }[];
}

interface Participant { riderId: string; sessionId: string; transponderId: string | null; tagCode: string | null; pbMs: number | null }

interface ActiveRide { setup: RideSetup; participants: Participant[]; startedAt: number }

export type GpsState = "off" | "searching" | "good" | "fair" | "poor" | "denied" | "error";

export interface RideSnapshot {
  ride: ActiveRide | null;
  gps: { state: GpsState; accuracyM: number | null; message: string | null; points: number; lastFixAt: number | null; provider: string | null };
  timing: TimingStatus | null;
  /** Bumped on every lap/event so views can re-read laps from the store. */
  rev: number;
}

const ACTIVE_KEY = "active-ride";
const GPS_FLUSH_MS = 15000;

/**
 * Runs a ride entirely on the device. Timing events, laps and GPS are written to
 * IndexedDB as they happen; nothing waits for the network, and a reload or crash
 * resumes the ride from local storage.
 */
class RideEngine {
  private snap: RideSnapshot = { ride: null, gps: { state: "off", accuracyM: null, message: null, points: 0, lastFixAt: null, provider: null }, timing: null, rev: 0 };
  private listeners = new Set<() => void>();
  private unsubs: (() => void)[] = [];
  private location: LocationProvider | null = null;
  private sampler = new GpsSampler();
  private points: GpsPoint[] = [];
  private lastFlush = 0;
  private geom: RouteGeometry | null = null;
  private gates: PreparedGate[] = [];
  private prevXy: Xy | null = null;
  private prevT = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = () => this.snap;
  get active() { return this.snap.ride != null; }

  async start(setup: RideSetup): Promise<string> {
    if (this.snap.ride) throw new Error("A ride is already running");
    const st = store.getState();
    const route = setup.routeId ? st.routes[setup.routeId] ?? null : null;
    const startedAt = Date.now();
    const participants: Participant[] = setup.participants.map((p) => {
      const tag = p.transponderId ? st.transponders[p.transponderId] : undefined;
      return {
        riderId: p.riderId, sessionId: uuid(), transponderId: p.transponderId, tagCode: tag?.code ?? null,
        pbMs: route ? routePb(st, p.riderId, route)?.ms ?? null : null,
      };
    });
    const sessions: Session[] = participants.map((p, i) => ({
      id: p.sessionId, riderId: p.riderId, bikeId: setup.participants[i]!.bikeId, routeId: route?.id ?? null,
      routeConfigVersion: route?.configVersion ?? null, transponderId: p.transponderId, rideType: setup.rideType,
      timing: setup.timing, condition: setup.condition, notes: setup.notes, status: "active", startedAt, endedAt: null,
      summary: null, hasGps: i === 0,
      simulated: st.settings.simulateGps || (setup.timing.mode !== "gps" && getTimingProvider().getStatus().isSimulated),
    }));
    store.upsert("sessions", sessions);
    const ride: ActiveRide = { setup, participants, startedAt };
    await kvSet(ACTIVE_KEY, ride);
    await this.attach(ride, []);
    return participants[0]!.sessionId;
  }

  /** Resume after reload/crash. */
  async restore(): Promise<boolean> {
    const ride = await kvGet<ActiveRide>(ACTIVE_KEY);
    if (!ride || this.snap.ride) return false;
    const s = store.getState().sessions[ride.participants[0]!.sessionId];
    if (!s || s.status !== "active") { await kvDel(ACTIVE_KEY); return false; }
    await this.attach(ride, await loadGps(s.id));
    return true;
  }

  private async attach(ride: ActiveRide, existingPoints: GpsPoint[]) {
    const st = store.getState();
    const route = ride.setup.routeId ? st.routes[ride.setup.routeId] ?? null : null;
    this.points = existingPoints;
    this.sampler.reset();
    this.prevXy = null;
    this.setupGates(route, ride.setup.timing);
    this.snap = { ...this.snap, ride, gps: { ...this.snap.gps, state: "searching", points: existingPoints.length, message: null } };
    this.emit();

    if (ride.setup.timing.mode !== "gps") {
      const provider = getTimingProvider();
      this.unsubs.push(provider.subscribeToStatus((t) => { this.snap = { ...this.snap, timing: t }; this.emit(); }));
      this.unsubs.push(provider.subscribeToPassingEvents((e) => this.onPassing(e)));
      this.snap = { ...this.snap, timing: provider.getStatus() };
      for (const p of ride.participants) if (p.tagCode) void provider.assignTransponder(p.tagCode, p.riderId);
      void provider.connect().catch(() => undefined);
    }

    const sim = st.settings.simulateGps;
    const simLine = route?.polyline ?? Object.values(st.routes)[0]?.polyline;
    this.location = createLocationProvider({ simulate: sim, simulateLine: simLine, speedFactor: st.settings.simSpeed, isLoop: route?.isLoop ?? true });
    this.snap = { ...this.snap, gps: { ...this.snap.gps, provider: this.location.label } };
    await this.location.start((p) => this.onFix(p), (kind, message) => {
      this.snap = { ...this.snap, gps: { ...this.snap.gps, state: kind === "denied" ? "denied" : "error", message } };
      this.emit();
    });
    this.watchdog = setInterval(() => {
      const last = this.snap.gps.lastFixAt;
      if (last && Date.now() - last > 10000 && this.snap.gps.state !== "denied") {
        this.snap = { ...this.snap, gps: { ...this.snap.gps, state: "searching" } };
        this.emit();
      }
    }, 3000);
  }

  private setupGates(route: Route | null, timing: TimingConfig) {
    this.geom = null;
    this.gates = [];
    if (!route || timing.mode !== "gps" || route.polyline.length < 2) return;
    this.geom = buildGeometry(route.polyline);
    this.gates = prepareGates(this.geom, route.gates);
  }

  private onPassing(e: PassingEvent) {
    const ride = this.snap.ride;
    if (!ride) return;
    const p = ride.participants.find((x) => x.tagCode === e.tagCode);
    const pod = ride.setup.timing.pods.find((x) => x.podId === e.podId);
    if (!p || !pod) return; // someone else's tag, or a pod not used in this set-up
    this.record({ participant: p, role: pod.role, podId: e.podId, at: e.at, source: "transponder", signal: e.signalStrength });
  }

  private onFix(raw: GpsPoint) {
    const acc = raw.accuracyM;
    const state: GpsState = acc <= 10 ? "good" : acc <= 25 ? "fair" : "poor";
    this.snap = { ...this.snap, gps: { ...this.snap.gps, state, accuracyM: Math.round(acc), lastFixAt: Date.now(), message: null } };
    if (!this.sampler.accept(raw)) { this.emit(); return; }
    this.points.push(raw);
    this.snap = { ...this.snap, gps: { ...this.snap.gps, points: this.points.length } };
    this.detectGateCrossing(raw);
    if (Date.now() - this.lastFlush > GPS_FLUSH_MS) void this.flushGps();
    this.emit();
  }

  private detectGateCrossing(p: GpsPoint) {
    if (!this.geom || !this.snap.ride || p.accuracyM > 30) return;
    const xy = this.geom.proj.toXy(p.lat, p.lng);
    const prev = this.prevXy;
    const prevT = this.prevT;
    this.prevXy = xy;
    this.prevT = p.t;
    if (!prev || p.t - prevT > 10000) return;
    for (const c of gateCrossings(this.gates, { xy: prev, t: prevT }, { xy, t: p.t })) {
      this.record({ participant: this.snap.ride.participants[0]!, role: c.role, podId: `GPS-${c.role}`, at: c.at, source: "gps", signal: null });
    }
  }

  /** Manual lap mark (GPS-only rides without a gate, or as a backup). */
  markLap() {
    const ride = this.snap.ride;
    if (!ride) return;
    this.record({ participant: ride.participants[0]!, role: "start_finish", podId: "MANUAL", at: Date.now(), source: "manual", signal: null });
  }

  private record(x: { participant: Participant; role: PodRole; podId: string; at: number; source: TimingEvent["source"]; signal: number | null }) {
    const ride = this.snap.ride!;
    const ev: TimingEvent = {
      id: uuid(), sessionId: x.participant.sessionId, riderId: x.participant.riderId, transponderId: x.participant.transponderId,
      tagCode: x.participant.tagCode, podId: x.podId, role: x.role, source: x.source, at: x.at, signalStrength: x.signal,
    };
    store.upsert("timingEvents", [ev]);
    const events = Object.values(store.getState().timingEvents).filter((e) => e.sessionId === x.participant.sessionId);
    const config: TimingConfig = x.source === "manual" || ride.setup.timing.mode === "gps" ? { ...ride.setup.timing, pods: [] } : ride.setup.timing;
    store.upsert("laps", computeLaps(x.participant.sessionId, x.participant.riderId, events, config));
    void store.flush();
    this.snap = { ...this.snap, rev: this.snap.rev + 1 };
    this.emit();
  }

  liveFor(riderId: string): { laps: Lap[]; openSince: number | null; pbMs: number | null } {
    const ride = this.snap.ride;
    const p = ride?.participants.find((x) => x.riderId === riderId);
    if (!p) return { laps: [], openSince: null, pbMs: null };
    const st = store.getState();
    const laps = Object.values(st.laps).filter((l) => l.sessionId === p.sessionId).sort((a, b) => a.lapNumber - b.lapNumber);
    const events = Object.values(st.timingEvents).filter((e) => e.sessionId === p.sessionId);
    return { laps, openSince: openLapStart(events, riderId), pbMs: p.pbMs };
  }

  private async flushGps() {
    const ride = this.snap.ride;
    if (!ride) return;
    this.lastFlush = Date.now();
    await saveGps(ride.participants[0]!.sessionId, this.points);
  }

  /** Finish and summarise. Returns the primary session id. */
  async finish(): Promise<string> {
    const ride = this.snap.ride;
    if (!ride) throw new Error("No ride running");
    this.detach();
    await this.flushGps();
    const st = store.getState();
    const endedAt = Date.now();
    const sessions: Session[] = ride.participants.map((p, i) => {
      const laps = Object.values(st.laps).filter((l) => l.sessionId === p.sessionId);
      const pts = i === 0 ? this.points : [];
      const line = gpsToLine(pts);
      const summary = summarise(laps, endedAt - ride.startedAt, p.pbMs, {
        distanceM: pts.length > 1 ? Math.round(polylineLength(line)) : null,
        topSpeedKph: topSpeedKph(pts),
        elevationGainM: pts.length > 1 ? elevationGain(line.map((x) => x[2])) : null,
      });
      return { ...st.sessions[p.sessionId]!, status: "completed", endedAt, summary, hasGps: pts.length > 1 };
    });
    store.upsert("sessions", sessions);
    const tagsSeen = ride.participants.filter((p) => p.transponderId).map((p) => st.transponders[p.transponderId!]!).filter(Boolean);
    if (tagsSeen.length) store.upsert("transponders", tagsSeen.map((t) => ({ ...t, lastSeenAt: endedAt })));
    if (this.points.length > 1 && !st.settings.demoMode) outbox.enqueue([{ table: "gps_points", kind: "upsert", key: ride.participants[0]!.sessionId }]);
    await store.flush();
    await kvDel(ACTIVE_KEY);
    const id = ride.participants[0]!.sessionId;
    this.reset();
    return id;
  }

  /** Throw the ride away entirely. */
  async discard() {
    const ride = this.snap.ride;
    if (!ride) return;
    this.detach();
    const ids = ride.participants.map((p) => p.sessionId);
    const st = store.getState();
    store.remove("laps", Object.values(st.laps).filter((l) => ids.includes(l.sessionId)).map((l) => l.id));
    store.remove("timingEvents", Object.values(st.timingEvents).filter((e) => ids.includes(e.sessionId)).map((e) => e.id));
    store.remove("sessions", ids);
    await store.flush();
    await kvDel(ACTIVE_KEY);
    this.reset();
  }

  private detach() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.location?.stop();
    this.location = null;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  private reset() {
    this.points = [];
    this.snap = { ride: null, gps: { state: "off", accuracyM: null, message: null, points: 0, lastFixAt: null, provider: null }, timing: null, rev: this.snap.rev + 1 };
    this.emit();
  }

  private emit() { this.listeners.forEach((l) => l()); }
}

export const rideEngine = new RideEngine();
