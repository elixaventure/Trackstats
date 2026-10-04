import { store } from "@/data/store";
import { loadGps } from "@/data/persist";
import type { DbState, EntityTable } from "@/data/db";
import type { GpsPoint, Route } from "@/domain/types";
import { outbox, type OutboxOp } from "./outbox";
import { PUSH_ORDER, TABLES, fromRow, gpsRows, routeChildRows, rowFor, toRow } from "./mapping";
import { getSupabase } from "./supabase";

export type SyncState = "disabled" | "signed_out" | "offline" | "idle" | "syncing" | "error";
type Listener = (s: { state: SyncState; pending: number; lastError: string | null; lastSyncedAt: number | null }) => void;

const GPS_BATCH = 500;

/**
 * Pushes the outbox to Supabase. Safe to call any time: it no-ops when offline,
 * signed out or in demo mode. Every write is an idempotent upsert keyed by UUID,
 * so a retry after a dropped connection can never duplicate data.
 */
class SyncEngine {
  private state: SyncState = "disabled";
  private lastError: string | null = null;
  private lastSyncedAt: number | null = null;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();

  start() {
    outbox.setEnqueueHook(() => this.schedule(1500));
    outbox.subscribe(() => this.emit());
    window.addEventListener("online", () => this.schedule(500));
    window.addEventListener("offline", () => this.set("offline"));
    setInterval(() => this.schedule(0), 60000);
    this.schedule(0);
  }

  subscribe(l: Listener) { this.listeners.add(l); l(this.snapshot()); return () => { this.listeners.delete(l); }; }

  schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), ms);
  }

  async flush() {
    if (this.running) return;
    const sb = getSupabase();
    if (!sb || !store.ready || store.getState().settings.demoMode) return this.set("disabled");
    if (!navigator.onLine) return this.set("offline");
    const { data } = await sb.auth.getSession();
    if (!data.session) return this.set("signed_out");
    const ops = outbox.peek();
    if (!ops.length) return this.set("idle");

    this.running = true;
    this.set("syncing");
    try {
      const s = store.getState();
      for (const table of PUSH_ORDER) {
        const mine = ops.filter((o) => o.table === table);
        if (mine.length) await this.pushTable(s, table, mine);
      }
      const gpsOps = ops.filter((o) => o.table === "gps_points");
      for (const op of gpsOps) await this.pushGps(op);
      this.lastError = null;
      this.lastSyncedAt = Date.now();
      this.set(outbox.count ? "syncing" : "idle");
      if (outbox.count) this.schedule(1000);
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.set("error");
      const attempts = Math.max(...ops.map((o) => o.attempts), 0);
      this.schedule(Math.min(300000, 5000 * 2 ** attempts)); // exponential backoff, max 5 min
    } finally {
      this.running = false;
    }
  }

  private async pushTable(s: DbState, table: EntityTable, ops: OutboxOp[]) {
    const sb = getSupabase()!;
    const name = TABLES[table];
    const deletes = ops.filter((o) => o.kind === "delete");
    const upserts = ops.filter((o) => o.kind === "upsert");
    const rows = upserts.map((o) => rowFor(s, table, o.key)).filter((r): r is object => r != null);
    if (rows.length) {
      const { error } = await sb.from(name).upsert(rows.map(toRow));
      if (error) { outbox.markFailed(upserts); throw new Error(`${name}: ${error.message}`); }
      if (table === "routes") for (const r of rows as Route[]) await this.pushRouteChildren(r);
    }
    if (deletes.length) {
      const { error } = await sb.from(name).delete().in("id", deletes.map((d) => d.key));
      if (error) { outbox.markFailed(deletes); throw new Error(`${name}: ${error.message}`); }
    }
    outbox.remove(ops);
  }

  private async pushRouteChildren(r: Route) {
    const sb = getSupabase()!;
    const { points, sectors } = routeChildRows(r);
    // Geometry is replaced wholesale; configVersion already records that it changed.
    await sb.from("route_points").delete().eq("route_id", r.id);
    await sb.from("route_sectors").delete().eq("route_id", r.id);
    for (let i = 0; i < points.length; i += GPS_BATCH) {
      const { error } = await sb.from("route_points").insert(points.slice(i, i + GPS_BATCH));
      if (error) throw new Error(`route_points: ${error.message}`);
    }
    if (sectors.length) {
      const { error } = await sb.from("route_sectors").insert(sectors);
      if (error) throw new Error(`route_sectors: ${error.message}`);
    }
  }

  private async pushGps(op: OutboxOp) {
    const sb = getSupabase()!;
    const rows = gpsRows(op.key, await loadGps(op.key));
    for (let i = 0; i < rows.length; i += GPS_BATCH) {
      const { error } = await sb.from("gps_points").upsert(rows.slice(i, i + GPS_BATCH), { onConflict: "session_id,t" });
      if (error) { outbox.markFailed([op]); throw new Error(`gps_points: ${error.message}`); }
    }
    outbox.remove([op]);
  }

  /** Pull everything this account can see (RLS decides) into the local store. */
  async pullAll() {
    const sb = getSupabase();
    if (!sb) return;
    const next: Partial<DbState> = {};
    for (const table of [...PUSH_ORDER, "leaderboard"] as EntityTable[]) {
      const { data, error } = await sb.from(TABLES[table]).select("*").limit(5000);
      if (error) throw new Error(`${TABLES[table]}: ${error.message}`);
      const map: Record<string, unknown> = {};
      for (const row of data ?? []) {
        const obj = fromRow<{ id: string }>(row);
        map[obj.id] = obj;
      }
      (next as Record<string, unknown>)[table] = map;
    }
    // Rebuild route geometry from child tables.
    const routes = (next.routes ?? {}) as Record<string, Route>;
    for (const r of Object.values(routes)) {
      const [{ data: pts }, { data: secs }] = await Promise.all([
        sb.from("route_points").select("lng,lat,altitude_m").eq("route_id", r.id).order("seq"),
        sb.from("route_sectors").select("id,name,end_distance_m").eq("route_id", r.id).order("seq"),
      ]);
      r.polyline = (pts ?? []).map((p) => [p.lng as number, p.lat as number, (p.altitude_m as number | null) ?? null]);
      r.sectors = (secs ?? []).map((x) => ({ id: x.id as string, name: x.name as string, endDistanceM: x.end_distance_m as number }));
      r.favourite = false;
    }
    store.update((s) => ({ ...s, ...next }));
  }

  /** GPS traces aren't pulled in bulk; fetch one on demand (e.g. for route analysis on a new phone). */
  async fetchGps(sessionId: string): Promise<GpsPoint[]> {
    const sb = getSupabase();
    if (!sb || !navigator.onLine) return [];
    const { data, error } = await sb.from("gps_points").select("*").eq("session_id", sessionId).order("t").limit(20000);
    if (error || !data) return [];
    return data.map((r) => ({
      t: Date.parse(r.t as string), lat: r.lat as number, lng: r.lng as number, accuracyM: r.accuracy_m as number,
      speedMps: r.speed_mps as number | null, heading: r.heading as number | null, altitudeM: r.altitude_m as number | null,
    }));
  }

  private set(s: SyncState) { this.state = s; this.emit(); }
  private snapshot() { return { state: this.state, pending: outbox.count, lastError: this.lastError, lastSyncedAt: this.lastSyncedAt }; }
  private emit() { const snap = this.snapshot(); this.listeners.forEach((l) => l(snap)); }
}

export const sync = new SyncEngine();
