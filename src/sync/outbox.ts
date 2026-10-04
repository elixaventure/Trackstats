import { kvGet, kvSet } from "@/data/persist";

export interface OutboxOp {
  /** Table name in the local store, or "gps_points" for a session's GPS trace. */
  table: string;
  kind: "upsert" | "delete";
  /** Row id (or session id for gps_points). The row itself is read at send time, so only the latest version is sent. */
  key: string;
  queuedAt: number;
  attempts: number;
}

type Listener = (count: number) => void;

/**
 * Durable queue of pending cloud writes. Survives reloads and app kills, so a ride
 * recorded with no signal syncs whenever connectivity returns.
 */
class Outbox {
  private ops: OutboxOp[] = [];
  private loaded = false;
  private listeners = new Set<Listener>();
  private onEnqueue: (() => void) | null = null;

  async load() {
    this.ops = (await kvGet<OutboxOp[]>("outbox")) ?? [];
    this.loaded = true;
    this.emit();
  }

  setEnqueueHook(fn: () => void) { this.onEnqueue = fn; }

  enqueue(items: Omit<OutboxOp, "queuedAt" | "attempts">[]) {
    const now = Date.now();
    for (const it of items) {
      // Collapse repeat writes of the same row: only the latest matters.
      this.ops = this.ops.filter((o) => !(o.table === it.table && o.key === it.key));
      this.ops.push({ ...it, queuedAt: now, attempts: 0 });
    }
    void this.persist();
    this.emit();
    this.onEnqueue?.();
  }

  peek() { return [...this.ops]; }

  remove(done: OutboxOp[]) {
    const ids = new Set(done.map((o) => `${o.table}|${o.key}|${o.queuedAt}`));
    this.ops = this.ops.filter((o) => !ids.has(`${o.table}|${o.key}|${o.queuedAt}`));
    void this.persist();
    this.emit();
  }

  markFailed(failed: OutboxOp[]) {
    const ids = new Set(failed.map((o) => `${o.table}|${o.key}`));
    this.ops = this.ops.map((o) => (ids.has(`${o.table}|${o.key}`) ? { ...o, attempts: o.attempts + 1 } : o));
    void this.persist();
  }

  clear() { this.ops = []; void this.persist(); this.emit(); }

  get count() { return this.ops.length; }

  subscribe(l: Listener) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }

  private async persist() { if (this.loaded) await kvSet("outbox", this.ops); }
  private emit() { this.listeners.forEach((l) => l(this.ops.length)); }
}

export const outbox = new Outbox();
