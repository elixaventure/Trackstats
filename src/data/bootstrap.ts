import { uuid } from "@/lib/id";
import type { RiderProfile } from "@/domain/types";
import { SCHEMA_VERSION, type DbState } from "./db";
import { clearAll, loadState, saveGps, saveState } from "./persist";
import { store } from "./store";
import { outbox } from "@/sync/outbox";

export async function seedDemo(): Promise<DbState> {
  const { generateDemo } = await import("./seed/generate");
  const { state, gps } = generateDemo(uuid());
  await Promise.all(Object.entries(gps).map(([id, pts]) => saveGps(id, pts)));
  await saveState(state);
  return state;
}

/** A blank account for a signed-in cloud user, with one rider profile to fill in. */
export function emptyState(userId: string, email: string | null): DbState {
  const now = Date.now();
  const rider: RiderProfile = {
    id: uuid(), ownerUserId: userId, name: "", username: "", raceNumber: "", riderClass: "", ageCategory: null,
    homeRegion: null, imageDataUrl: null, visibility: "private", defaultBikeId: null, createdAt: now,
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    user: { id: userId, email, createdAt: now },
    activeRiderId: rider.id,
    riders: { [rider.id]: rider },
    bikes: {}, groups: {}, groupMembers: {}, transponders: {}, assignments: {}, routes: {}, sessions: {}, laps: {},
    timingEvents: {}, leaderboard: {}, trackChanges: {}, serviceTasks: {}, serviceRecords: {},
    settings: { simulateGps: false, simSpeed: 1, demoMode: false },
  };
}

export async function bootstrap(): Promise<void> {
  await outbox.load();
  const existing = await loadState();
  const { DEMO_VERSION } = await import("./seed/generate");
  const usable = existing && existing.schemaVersion === SCHEMA_VERSION;
  // Devices still on sample data get the latest sample data; real accounts are never touched.
  const staleDemo = usable && existing.settings.demoMode && existing.settings.demoVersion !== DEMO_VERSION;
  // Older saved data may predate newer tables.
  if (usable && !staleDemo) { store.init({ ...existing, trackChanges: existing.trackChanges ?? {}, serviceTasks: existing.serviceTasks ?? {}, serviceRecords: existing.serviceRecords ?? {} }); return; }
  if (staleDemo) await clearAll();
  store.init(await seedDemo());
}

/** Wipe the device and start again with fresh demo data. */
export async function resetToDemo() {
  await clearAll();
  outbox.clear();
  store.init(await seedDemo());
}

/**
 * Replace local demo data with a real (cloud) account. Loads what the account
 * already has (signing in on a second phone); only a brand-new account gets a
 * blank rider profile, so signing in again never creates a duplicate rider.
 */
export async function switchToAccount(userId: string, email: string | null) {
  await clearAll();
  outbox.clear();
  const s = emptyState(userId, email);
  const blank = Object.values(s.riders)[0]!;
  store.init({ ...s, riders: {} });
  await saveState(store.getState());
  const { sync } = await import("@/sync/engine");
  await sync.pullAll().catch(() => undefined); // offline: start with a blank rider
  const mine = Object.values(store.getState().riders).filter((r) => r.ownerUserId === userId).sort((a, b) => a.createdAt - b.createdAt);
  if (mine.length) store.update((st) => ({ ...st, activeRiderId: mine[0]!.id }));
  else store.upsert("riders", [blank]); // queued so it reaches the server on the next sync
  await store.flush();
}

/**
 * Someone who confirms their email lands back in the app already signed in
 * (the session arrives in the link). Move them off the demo data automatically.
 */
export async function adoptExistingSession() {
  const { getSupabase } = await import("@/sync/supabase");
  const sb = getSupabase();
  if (!sb || !store.getState().settings.demoMode) return false;
  const { data } = await sb.auth.getSession();
  if (!data.session) return false;
  await switchToAccount(data.session.user.id, data.session.user.email ?? null);
  return true;
}
