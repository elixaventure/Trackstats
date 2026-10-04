import { uuid } from "@/lib/id";
import type { Bike, GpsPoint, Group, GroupMember, RiderProfile, Route, ServiceRecord, ServiceTask, TrackChange, Transponder } from "@/domain/types";
import { computeLaps } from "@/domain/laps";
import { defaultSchedule } from "@/domain/service";
import { summarise } from "@/domain/stats";
import { gateEvents } from "@/import/toSession";
import { getTimingProvider } from "@/timing";
import type { DbState, Settings } from "./db";
import { deleteGps } from "./persist";
import { store } from "./store";

const s = () => store.getState();

export function setActiveRider(riderId: string) {
  store.update((st) => ({ ...st, activeRiderId: riderId }));
}

export function updateSettings(patch: Partial<Settings>) {
  store.update((st) => ({ ...st, settings: { ...st.settings, ...patch } }));
}

export const saveRider = (r: RiderProfile) => store.upsert("riders", [r]);

export function addManagedRider(name: string): RiderProfile {
  const r: RiderProfile = {
    id: uuid(), ownerUserId: s().user.id, name, username: "", raceNumber: "", riderClass: "", ageCategory: null,
    homeRegion: null, imageDataUrl: null, visibility: "private", defaultBikeId: null, createdAt: Date.now(),
  };
  store.upsert("riders", [r]);
  return r;
}

export function saveBike(b: Bike) {
  store.upsert("bikes", [b]);
  ensureSchedule(b);
  const rider = s().riders[b.riderId];
  if (rider && !rider.defaultBikeId) saveRider({ ...rider, defaultBikeId: b.id });
}

export const saveTransponder = (t: Transponder) => store.upsert("transponders", [t]);

export function activeAssignment(st: DbState, transponderId: string) {
  return Object.values(st.assignments).find((a) => a.transponderId === transponderId && a.releasedAt == null) ?? null;
}

export function riderActiveTag(st: DbState, riderId: string) {
  const a = Object.values(st.assignments).find((x) => x.riderId === riderId && x.releasedAt == null);
  return a ? st.transponders[a.transponderId] ?? null : null;
}

/**
 * Hand a tag to a rider. Any current holder is released first. Laps already
 * recorded stay with whoever rode them: they reference the session, not the tag.
 */
export async function assignTransponder(transponderId: string, riderId: string) {
  const st = s();
  const now = Date.now();
  const toRelease = Object.values(st.assignments).filter(
    (a) => a.releasedAt == null && (a.transponderId === transponderId || a.riderId === riderId),
  );
  store.upsert("assignments", [
    ...toRelease.map((a) => ({ ...a, releasedAt: now })),
    { id: uuid(), transponderId, riderId, assignedByUserId: st.user.id, assignedAt: now, releasedAt: null },
  ]);
  const tag = st.transponders[transponderId];
  if (tag) await getTimingProvider().assignTransponder(tag.code, riderId).catch(() => undefined);
}

export async function releaseTransponder(transponderId: string) {
  const a = activeAssignment(s(), transponderId);
  if (!a) return;
  store.upsert("assignments", [{ ...a, releasedAt: Date.now() }]);
  const tag = s().transponders[transponderId];
  if (tag) await getTimingProvider().releaseTransponder(tag.code).catch(() => undefined);
}

export function saveGroup(g: Group) { store.upsert("groups", [g]); }

export function createGroup(name: string, kind: Group["kind"], managerRiderId: string): Group {
  const g: Group = { id: uuid(), name, kind, createdByUserId: s().user.id, createdAt: Date.now() };
  store.upsert("groups", [g]);
  addGroupMember(g.id, managerRiderId, "manager");
  return g;
}

export function addGroupMember(groupId: string, riderId: string, role: GroupMember["role"] = "rider") {
  const exists = Object.values(s().groupMembers).some((m) => m.groupId === groupId && m.riderId === riderId);
  if (!exists) store.upsert("groupMembers", [{ id: uuid(), groupId, riderId, role, joinedAt: Date.now() }]);
}

export const removeGroupMember = (memberId: string) => store.remove("groupMembers", [memberId]);

export function saveRoute(r: Route) { store.upsert("routes", [r]); }

export function toggleFavourite(routeId: string) {
  const r = s().routes[routeId];
  if (r) store.update((st) => ({ ...st, routes: { ...st.routes, [routeId]: { ...r, favourite: !r.favourite } } }));
}

export async function deleteSession(sessionId: string) {
  const st = s();
  store.remove("laps", Object.values(st.laps).filter((l) => l.sessionId === sessionId).map((l) => l.id));
  store.remove("timingEvents", Object.values(st.timingEvents).filter((e) => e.sessionId === sessionId).map((e) => e.id));
  store.remove("sessions", [sessionId]);
  await deleteGps(sessionId);
}

export function reportTrackChange(input: Pick<TrackChange, "routeId" | "kind" | "title" | "details" | "sectorId" | "severity" | "affectsTimes">): TrackChange {
  const st = s();
  const rider = st.riders[st.activeRiderId];
  // Reports from the track's owner are badged "Track official" when shown (see isOfficial).
  const name = rider?.name || st.user.email || "Rider";
  const c: TrackChange = { id: uuid(), ...input, reportedByUserId: st.user.id, reportedByName: name, createdAt: Date.now(), resolvedAt: null };
  store.upsert("trackChanges", [c]);
  return c;
}

export function setTrackChangeResolved(id: string, resolved: boolean) {
  const c = s().trackChanges[id];
  if (c) store.upsert("trackChanges", [{ ...c, resolvedAt: resolved ? Date.now() : null }]);
}

export const removeTrackChange = (id: string) => store.remove("trackChanges", [id]);

/** Can the current user edit/clear this report? Its reporter, or the track's owner. */
export function canManageChange(st: DbState, c: TrackChange) {
  return c.reportedByUserId === st.user.id || st.routes[c.routeId]?.createdByUserId === st.user.id;
}

/** Give a bike the default service schedule if it has none yet. */
export function ensureSchedule(bike: Bike) {
  const has = Object.values(s().serviceTasks).some((t) => t.bikeId === bike.id);
  if (has) return;
  store.upsert("serviceTasks", defaultSchedule(bike).map((t) => ({ id: uuid(), bikeId: bike.id, ...t })));
}

export function saveServiceTask(t: ServiceTask) { store.upsert("serviceTasks", [t]); }
export const removeServiceTask = (id: string) => store.remove("serviceTasks", [id]);

export function logServiceRecord(r: Omit<ServiceRecord, "id" | "createdAt">): ServiceRecord {
  const rec: ServiceRecord = { ...r, id: uuid(), createdAt: Date.now() };
  store.upsert("serviceRecords", [rec]);
  return rec;
}
export const removeServiceRecord = (id: string) => store.remove("serviceRecords", [id]);

/**
 * Re-time a GPS ride from its recorded trace with the current lap detection:
 * replaces its GPS gate crossings and laps, and refreshes the summary. Used when
 * a ride didn't count laps as expected (or after the detector improves).
 */
export function retimeFromGps(sessionId: string, points: GpsPoint[]): number {
  const st = s();
  const session = st.sessions[sessionId];
  const route = session?.routeId ? st.routes[session.routeId] : null;
  if (!session || !route || points.length < 2) return 0;
  const fresh = gateEvents(route, points, session.id, session.riderId);
  const freshIds = new Set(fresh.map((e) => e.id));
  const stale = Object.values(st.timingEvents).filter((e) => e.sessionId === session.id && e.source === "gps" && !freshIds.has(e.id));
  store.remove("timingEvents", stale.map((e) => e.id));
  store.upsert("timingEvents", fresh);
  const events = Object.values(s().timingEvents).filter((e) => e.sessionId === session.id);
  const laps = computeLaps(session.id, session.riderId, events, { ...session.timing, pods: [] });
  const lapIds = new Set(laps.map((l) => l.id));
  store.remove("laps", Object.values(st.laps).filter((l) => l.sessionId === session.id && !lapIds.has(l.id)).map((l) => l.id));
  store.upsert("laps", laps);
  const old = session.summary;
  const summary = summarise(laps, old?.durationMs ?? ((session.endedAt ?? Date.now()) - session.startedAt), old?.previousPbMs ?? null, {
    distanceM: old?.distanceM ?? null, topSpeedKph: old?.topSpeedKph ?? null, elevationGainM: old?.elevationGainM ?? null,
  });
  store.upsert("sessions", [{ ...session, summary }]);
  return laps.length;
}
