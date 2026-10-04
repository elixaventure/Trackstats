import type { PassingEvent, PodStatus, TagStatus, TimingProvider, TimingStatus, Unsubscribe } from "./TimingProvider";

export interface AutoLapOptions {
  tagCode: string;
  /** Pods in the order a rider passes them on one lap, e.g. ["POD-A"] or ["POD-A","POD-B","POD-C"]. */
  sequence: string[];
  lapMs: number;
  jitterMs: number;
}

const POD_IDS = ["POD-A", "POD-B", "POD-C", "POD-D", "POD-E"];

/**
 * Simulator used for development and demos. Fire individual crossings from the
 * developer panel, or let it auto-generate laps. Behaves like real hardware from
 * the app's point of view: async connect, status updates, passing events.
 */
export class MockTimingProvider implements TimingProvider {
  readonly kind = "mock" as const;
  private status: TimingStatus = {
    state: "disconnected",
    providerName: "Timing simulator",
    isSimulated: true,
    message: "No hardware: crossings come from the simulator panel.",
    pods: POD_IDS.map((id, i) => ({ podId: id, label: `Pod ${id.slice(4)}`, online: false, batteryPct: 96 - i * 7 })),
  };
  private passingSubs = new Set<(e: PassingEvent) => void>();
  private statusSubs = new Set<(s: TimingStatus) => void>();
  private tags = new Map<string, TagStatus & { riderId: string | null }>();
  private autoTimers = new Map<string, ReturnType<typeof setTimeout>>();

  async connect() {
    if (this.status.state === "connected") return;
    this.setStatus({ state: "connecting" });
    await new Promise((r) => setTimeout(r, 400));
    this.setStatus({ state: "connected", pods: this.status.pods.map((p) => ({ ...p, online: true })) });
  }

  async disconnect() {
    for (const t of this.autoTimers.values()) clearTimeout(t);
    this.autoTimers.clear();
    this.setStatus({ state: "disconnected", pods: this.status.pods.map((p) => ({ ...p, online: false })) });
  }

  getStatus() { return this.status; }

  subscribeToStatus(cb: (s: TimingStatus) => void): Unsubscribe {
    this.statusSubs.add(cb);
    return () => this.statusSubs.delete(cb);
  }

  subscribeToPassingEvents(cb: (e: PassingEvent) => void): Unsubscribe {
    this.passingSubs.add(cb);
    return () => this.passingSubs.delete(cb);
  }

  async assignTransponder(tagCode: string, riderId: string) {
    const t = this.tags.get(tagCode) ?? { tagCode, batteryPct: 88, lastSeenAt: null, riderId: null };
    this.tags.set(tagCode, { ...t, riderId });
  }

  async releaseTransponder(tagCode: string) {
    const t = this.tags.get(tagCode);
    if (t) this.tags.set(tagCode, { ...t, riderId: null });
  }

  getTagStatus(tagCode: string): TagStatus | null {
    const t = this.tags.get(tagCode);
    return t ? { tagCode, batteryPct: t.batteryPct, lastSeenAt: t.lastSeenAt } : null;
  }

  // ---- Simulator controls (not part of TimingProvider) ----

  fireCrossing(tagCode: string, podId: string, at = Date.now()) {
    if (this.status.state !== "connected") return false;
    const t = this.tags.get(tagCode) ?? { tagCode, batteryPct: 88, lastSeenAt: null, riderId: null };
    this.tags.set(tagCode, { ...t, lastSeenAt: at });
    const e: PassingEvent = { tagCode, podId, at, signalStrength: -40 - Math.round(Math.random() * 20) };
    this.passingSubs.forEach((cb) => cb(e));
    return true;
  }

  startAutoLaps(opts: AutoLapOptions) {
    this.stopAutoLaps(opts.tagCode);
    const per = opts.lapMs / opts.sequence.length;
    let i = 0;
    const tick = () => {
      this.fireCrossing(opts.tagCode, opts.sequence[i % opts.sequence.length]!);
      i++;
      const delay = per + (Math.random() - 0.5) * 2 * (opts.jitterMs / opts.sequence.length);
      this.autoTimers.set(opts.tagCode, setTimeout(tick, Math.max(1000, delay)));
    };
    tick();
  }

  stopAutoLaps(tagCode: string) {
    const t = this.autoTimers.get(tagCode);
    if (t) clearTimeout(t);
    this.autoTimers.delete(tagCode);
  }

  isAuto(tagCode: string) { return this.autoTimers.has(tagCode); }

  get podIds() { return POD_IDS; }

  private setStatus(patch: Partial<TimingStatus>) {
    this.status = { ...this.status, ...patch, pods: (patch.pods ?? this.status.pods) as PodStatus[] };
    this.statusSubs.forEach((cb) => cb(this.status));
  }
}
