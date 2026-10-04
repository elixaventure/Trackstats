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
    timingEvents: {}, leaderboard: {},
    settings: { simulateGps: false, simSpeed: 1, demoMode: false },
  };
}

export async function bootstrap(): Promise<void> {
  await outbox.load();
  const existing = await loadState();
  store.init(existing && existing.schemaVersion === SCHEMA_VERSION ? existing : await seedDemo());
}

/** Wipe the device and start again with fresh demo data. */
export async function resetToDemo() {
  await clearAll();
  outbox.clear();
  store.init(await seedDemo());
}

/** Replace local demo data with a real (cloud) account. */
export async function switchToAccount(userId: string, email: string | null) {
  await clearAll();
  outbox.clear();
  const s = emptyState(userId, email);
  store.init(s);
  await saveState(s);
  // The first rider profile is queued so it reaches the server on first sync.
  store.upsert("riders", Object.values(s.riders));
}
