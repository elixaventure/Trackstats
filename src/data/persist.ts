import { createStore, del, get, set } from "idb-keyval";
import type { GpsPoint } from "@/domain/types";
import type { DbState } from "./db";

// One IndexedDB database for the app. Separate keys keep large GPS traces out of
// the main state blob, so saving a lap doesn't rewrite megabytes.
const idb = createStore("splitline", "kv");

export const loadState = () => get<DbState>("state", idb);
export const saveState = (s: DbState) => set("state", s, idb);

export const loadGps = async (sessionId: string) => (await get<GpsPoint[]>(`gps:${sessionId}`, idb)) ?? [];
export const saveGps = (sessionId: string, pts: GpsPoint[]) => set(`gps:${sessionId}`, pts, idb);
export const deleteGps = (sessionId: string) => del(`gps:${sessionId}`, idb);

export const kvGet = <T>(key: string) => get<T>(key, idb);
export const kvSet = (key: string, v: unknown) => set(key, v, idb);
export const kvDel = (key: string) => del(key, idb);

export async function clearAll() {
  const { clear } = await import("idb-keyval");
  await clear(idb);
}
