import { uuid } from "@/lib/id";
import type { Bike, Group, GroupMember, RiderProfile, Route, Transponder } from "@/domain/types";
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
