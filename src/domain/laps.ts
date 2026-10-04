import { stableUuid } from "@/lib/id";
import type { Lap, PodRole, TimingConfig, TimingEvent } from "./types";

/** Ignore a second read at the same pod within this window (tags often double-read). */
export const DEBOUNCE_MS = 5000;

const opensLap = (r: PodRole) => r === "start_finish" || r === "start";
const closesLap = (r: PodRole) => r === "start_finish" || r === "finish";
const sectorIndex = (r: PodRole) => (r.startsWith("sector_") ? Number(r.slice(7)) : null);

export function dedupeEvents(events: TimingEvent[]): TimingEvent[] {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const lastAt = new Map<string, number>();
  const out: TimingEvent[] = [];
  for (const e of sorted) {
    const key = `${e.riderId}|${e.podId}`;
    const prev = lastAt.get(key);
    if (prev != null && e.at - prev < DEBOUNCE_MS) continue;
    lastAt.set(key, e.at);
    out.push(e);
  }
  return out;
}

/**
 * Turn raw crossings into laps. One algorithm serves every timing mode, because
 * the mode only decides which pod plays which role:
 *   LAP mode          SF → SF → SF          (each SF closes one lap and opens the next)
 *   START/FINISH      START → FINISH        (finish without a start is ignored)
 *   SECTORS           START/SF → S1 → S2 → FINISH/SF
 *   GPS               virtual gates emit the same roles
 */
export function computeLaps(sessionId: string, riderId: string, events: TimingEvent[], config: TimingConfig): Lap[] {
  const sectorCount = config.pods.filter((p) => p.role.startsWith("sector_")).length;
  const laps: Lap[] = [];
  let open: TimingEvent | null = null;
  let marks: { idx: number; at: number }[] = [];

  for (const e of dedupeEvents(events.filter((x) => x.riderId === riderId))) {
    if (closesLap(e.role) && open) {
      const duration = e.at - open.at;
      const points = [open.at, ...marks.map((m) => m.at), e.at];
      // Only keep splits when every sector was seen in order; a missed pod makes them meaningless.
      const complete = marks.length === sectorCount && marks.every((m, i) => m.idx === i + 1);
      const splits = sectorCount > 0 && complete ? points.slice(1).map((t, i) => t - points[i]!) : [];
      laps.push({
        id: stableUuid(`${sessionId}:lap:${laps.length + 1}`),
        sessionId,
        riderId,
        lapNumber: laps.length + 1,
        startedAt: open.at,
        durationMs: duration,
        splitsMs: splits,
        source: e.source === open.source ? e.source : "manual",
        valid: true,
      });
      open = null;
      marks = [];
    }
    if (opensLap(e.role)) {
      open = e;
      marks = [];
    } else {
      const idx = sectorIndex(e.role);
      if (idx != null && open) marks.push({ idx, at: e.at });
    }
  }
  return flagOutliers(laps);
}

/**
 * Mark laps that are clearly not representative (crash, pit stop, missed crossing).
 * They stay visible but don't count towards PBs, averages or consistency.
 */
export function flagOutliers(laps: Lap[]): Lap[] {
  if (laps.length < 3) return laps.map((l) => ({ ...l, valid: l.durationMs > 3000 }));
  const sorted = laps.map((l) => l.durationMs).sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)]!;
  return laps.map((l) => ({ ...l, valid: l.durationMs <= med * 1.3 && l.durationMs >= med * 0.6 }));
}

/** Time since the currently-open lap started, or null if no lap is running. */
export function openLapStart(events: TimingEvent[], riderId: string): number | null {
  let open: number | null = null;
  for (const e of dedupeEvents(events.filter((x) => x.riderId === riderId))) {
    if (closesLap(e.role)) open = null;
    if (opensLap(e.role)) open = e.at;
  }
  return open;
}

/** Map pods to roles for a timing set-up. Pod ids match the mock/hardware pod ids. */
export function podsFor(mode: TimingConfig["mode"], isLoop: boolean, sectorCount: number): TimingConfig["pods"] {
  if (mode === "gps") return [];
  if (mode === "lap") return [{ podId: "POD-A", role: "start_finish" }];
  if (mode === "start_finish") return [{ podId: "POD-A", role: "start" }, { podId: "POD-B", role: "finish" }];
  const letters = "ABCDEFGH";
  const pods: TimingConfig["pods"] = [{ podId: "POD-A", role: isLoop ? "start_finish" : "start" }];
  for (let i = 1; i <= sectorCount; i++) pods.push({ podId: `POD-${letters[i]}`, role: `sector_${i}` });
  if (!isLoop) pods.push({ podId: `POD-${letters[sectorCount + 1]}`, role: "finish" });
  return pods;
}

export function roleLabel(role: PodRole): string {
  if (role === "start_finish") return "Start/Finish";
  if (role === "start") return "Start";
  if (role === "finish") return "Finish";
  return `Sector ${role.slice(7)}`;
}
