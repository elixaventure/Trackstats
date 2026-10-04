import type { DbState, EntityTable } from "./db";
import { saveState } from "./persist";
import { outbox } from "@/sync/outbox";

type Listener = () => void;

/**
 * Local-first store. The phone's IndexedDB copy is the source of truth during a
 * ride; changes are queued in the outbox and pushed to Supabase when possible.
 */
class Store {
  private state: DbState | null = null;
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  init(s: DbState) {
    this.state = s;
    this.emit();
  }

  get ready() { return this.state != null; }

  getState = (): DbState => {
    if (!this.state) throw new Error("Store not initialised");
    return this.state;
  };

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  };

  update(fn: (s: DbState) => DbState) {
    this.state = fn(this.getState());
    this.emit();
    this.scheduleSave();
  }

  /** Insert or replace rows and queue them for sync. */
  upsert<T extends EntityTable>(table: T, rows: DbState[T][string][]) {
    if (!rows.length) return;
    this.update((s) => {
      const next = { ...s[table] } as Record<string, unknown>;
      for (const r of rows) next[(r as { id: string }).id] = r;
      return { ...s, [table]: next };
    });
    if (!this.getState().settings.demoMode) outbox.enqueue(rows.map((r) => ({ table, kind: "upsert" as const, key: (r as { id: string }).id })));
  }

  remove(table: EntityTable, ids: string[]) {
    if (!ids.length) return;
    this.update((s) => {
      const next = { ...s[table] } as Record<string, unknown>;
      for (const id of ids) delete next[id];
      return { ...s, [table]: next };
    });
    if (!this.getState().settings.demoMode) outbox.enqueue(ids.map((key) => ({ table, kind: "delete" as const, key })));
  }

  /** Persist immediately (used at critical moments such as finishing a ride). */
  async flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.state) await saveState(this.state);
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), 250);
  }

  private emit() { this.listeners.forEach((l) => l()); }
}

export const store = new Store();
