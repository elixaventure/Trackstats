import { gateLine, pointAtDistance, projectOntoRoute, segmentIntersection, type RouteGeometry, type Xy } from "./geo";
import type { GpsPoint, PodRole, TimingGate } from "./types";

export interface PreparedGate { role: PodRole; line: [Xy, Xy]; dir: Xy; centre: Xy; distanceM: number }
export interface Crossing { role: PodRole; at: number }

export function prepareGates(g: RouteGeometry, gates: TimingGate[]): PreparedGate[] {
  return gates.map((gate) => {
    const p = pointAtDistance(g, gate.distanceM);
    return { role: gate.role as PodRole, line: gateLine(g, gate), dir: p.dir, centre: p.xy, distanceM: gate.distanceM };
  });
}

/**
 * Raw gate crossings between two fixes, with the direction of travel through each
 * gate (+1 the way the route was mapped, -1 the other way).
 */
export function segmentCrossings(gates: PreparedGate[], prev: { xy: Xy; t: number }, cur: { xy: Xy; t: number }): (Crossing & { sign: 1 | -1 })[] {
  const move = { x: cur.xy.x - prev.xy.x, y: cur.xy.y - prev.xy.y };
  const out: (Crossing & { sign: 1 | -1 })[] = [];
  for (const gate of gates) {
    const f = segmentIntersection(prev.xy, cur.xy, gate.line[0], gate.line[1]);
    if (f == null) continue;
    const dot = move.x * gate.dir.x + move.y * gate.dir.y;
    if (dot === 0) continue;
    out.push({ role: gate.role, at: Math.round(prev.t + f * (cur.t - prev.t)), sign: dot > 0 ? 1 : -1 });
  }
  return out;
}

/** Ignore fixes worse than this. */
export const GATE_MAX_ACCURACY_M = 35;
/** Across a longer GPS gap we can't tell where the rider went. */
export const GATE_MAX_GAP_MS = 30000;
/** Fixes further than this from the mapped route don't count as being on it. */
const ON_ROUTE_M = 30;
/** Along-route travel needed to know which way round the rider is going. */
const DIRECTION_TRAVEL_M = 60;
/** A crossing is confirmed once the rider has carried on this far past it. */
const CONFIRM_M = 20;
/** On a loop, a lap needs at least this share of the track since the last one. */
const MIN_LAP_SHARE = 0.5;

interface Candidate { role: PodRole; at: number; sign: 1 | -1; progress: number; gateProgress: number | null }
interface Fix { t: number; progress: number; speed: number | null; acc: number }

/** Fixes this close (in time) to a crossing are used to pin down when it happened. */
const REFINE_WINDOW_MS = 4000;
/** Wait this long after a crossing for fixes beyond the line, unless the ride ends. */
const REFINE_WAIT_MS = 3000;
/** Doppler speed is much steadier than position: typically within ~0.5 m/s. */
const SPEED_SD = 0.5;

/**
 * GPS-only timing gates, fed one fix at a time (live) or a whole trace (re-timing).
 *
 * A crossing is the GPS track cutting the gate line between two fixes or, across
 * a gap in GPS, the rider's position along the route passing the gate. Riders
 * don't always go round the way the track was mapped, so the direction is learned
 * from the first stretch of riding. A crossing only counts once the rider has
 * carried on past it, and a later crossing replaces an unconfirmed one: sitting on
 * the line with GPS wobbling over it, the lap starts when they actually ride off.
 * On a loop, a new lap also needs real progress round the track since the last.
 */
export class GateDetector {
  private prev: { xy: Xy; t: number; along: number | null } | null = null;
  private dir: 1 | -1 | 0 = 0;
  private progress = 0;
  private candidates: Candidate[] = [];
  private lastProgress = new Map<PodRole, number>();
  private hist: Fix[] = [];
  private lastT = 0;

  constructor(private g: RouteGeometry, private gates: PreparedGate[], private loop: boolean, private opts: { refine: boolean } = { refine: true }) {}

  /** Which way round the rider is going: 1 as mapped, -1 reversed, 0 not known yet. */
  get direction() { return this.dir; }

  push(p: Pick<GpsPoint, "lat" | "lng" | "t" | "accuracyM"> & { speedMps?: number | null }): Crossing[] {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || p.accuracyM > GATE_MAX_ACCURACY_M) return [];
    const xy = this.g.proj.toXy(p.lat, p.lng);
    const pr = projectOntoRoute(this.g, xy);
    const along = Math.abs(pr.offsetM) <= ON_ROUTE_M ? pr.distanceM : null;
    const prev = this.prev;
    this.prev = { xy, t: p.t, along };
    this.lastT = Math.max(this.lastT, p.t);
    if (!prev || p.t - prev.t > GATE_MAX_GAP_MS || p.t <= prev.t) {
      if (along != null) this.remember(p, this.progress);
      return this.release();
    }

    // Progress along the route since the last fix (unwrapped round a loop).
    let d: number | null = null;
    if (prev.along != null && along != null) {
      let x = along - prev.along;
      if (this.loop) {
        const L = this.g.length;
        if (x > L / 2) x -= L;
        if (x < -L / 2) x += L;
      }
      // Reject jumps between parts of the route that pass close to each other.
      if (Math.abs(x) <= Math.max(40, 30 * ((p.t - prev.t) / 1000)) && Math.abs(x) < this.g.length / 2) d = x;
    }
    const before = this.progress;
    if (d != null) {
      this.progress += d;
      this.remember(p, this.progress);
      if (this.dir === 0 && Math.abs(this.progress) >= DIRECTION_TRAVEL_M) this.dir = this.progress > 0 ? 1 : -1;
    }

    const hits = segmentCrossings(this.gates, prev, { xy, t: p.t });
    // Across a gap the straight line between fixes can miss the gate; use progress along the route instead.
    if (d != null && prev.along != null) {
      for (const gate of this.gates) {
        if (hits.some((h) => h.role === gate.role)) continue;
        const f = passFraction(prev.along, d, gate.distanceM, this.loop ? this.g.length : null);
        if (f != null) hits.push({ role: gate.role, at: Math.round(prev.t + f * (p.t - prev.t)), sign: d > 0 ? 1 : -1 });
      }
    }
    for (const h of hits) {
      if (this.dir !== 0 && h.sign !== this.dir) continue;
      // Where the gate sits on the progress scale, for refining the crossing time.
      let gateProgress: number | null = null;
      const gate = this.gates.find((x) => x.role === h.role);
      if (gate && prev.along != null && d != null) {
        let rel = gate.distanceM - prev.along;
        if (this.loop) { const L = this.g.length; rel = ((rel % L) + L) % L; if (rel > L / 2) rel -= L; }
        gateProgress = before + rel;
      }
      // Latest crossing wins until it's confirmed (wobbling over the line while stopped).
      this.candidates = this.candidates.filter((c) => !(c.role === h.role && c.sign === h.sign));
      this.candidates.push({ ...h, progress: this.progress, gateProgress });
    }
    return this.release();
  }

  /** End of the ride: count crossings still waiting for the rider to carry on past them. */
  finish(): Crossing[] {
    return this.release(true);
  }

  private release(final = false): Crossing[] {
    if (this.dir === 0) return [];
    const out: Crossing[] = [];
    const keep: Candidate[] = [];
    for (const c of this.candidates.sort((a, b) => a.at - b.at)) {
      if (c.sign !== this.dir) continue;
      const waiting = (this.progress - c.progress) * this.dir < CONFIRM_M || (this.opts.refine && this.lastT - c.at < REFINE_WAIT_MS);
      if (!final && waiting) { keep.push(c); continue; }
      const last = this.lastProgress.get(c.role);
      const needed = this.loop && c.role === "start_finish" ? this.g.length * MIN_LAP_SHARE : CONFIRM_M;
      if (last != null && Math.abs(c.progress - last) < needed) continue;
      this.lastProgress.set(c.role, c.progress);
      out.push({ role: c.role, at: (this.opts.refine && this.refine(c)) || c.at });
    }
    this.candidates = keep;
    this.hist = this.hist.filter((h) => this.lastT - h.t < 15000);
    return out;
  }

  private remember(p: { t: number; speedMps?: number | null; accuracyM: number }, progress: number) {
    const speed = p.speedMps != null && Number.isFinite(p.speedMps) && p.speedMps >= 0 ? p.speedMps : null;
    this.hist.push({ t: p.t, progress, speed, acc: p.accuracyM });
  }

  /**
   * Speed-assisted crossing time. Rather than a straight line between the two
   * fixes either side of the gate, fit the rider's progress along the track over
   * the few seconds around it, using every position (weighted by its accuracy)
   * and the phone's Doppler speed, which is far steadier than position. Speeding
   * up or braking through the line is captured, and position wobble averages out.
   */
  private refine(c: Candidate): number | null {
    if (c.gateProgress == null) return null;
    const near = this.hist.filter((h) => Math.abs(h.t - c.at) <= REFINE_WINDOW_MS && h.acc <= 25);
    const before = near.filter((h) => h.t < c.at).length, after = near.filter((h) => h.t >= c.at).length;
    if (before < 1 || after < 1 || near.length < 3) return null;
    const useSpeed = near.filter((h) => h.speed != null).length >= 2;
    const k = useSpeed ? 3 : 2; // quadratic with speeds, straight line without
    const A = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    const B = new Array<number>(k).fill(0);
    const add = (row: number[], y: number, w: number) => {
      for (let i = 0; i < k; i++) { B[i]! += w * row[i]! * y; for (let j = 0; j < k; j++) A[i]![j]! += w * row[i]! * row[j]!; }
    };
    for (const h of near) {
      const tau = (h.t - c.at) / 1000;
      const y = (h.progress - c.gateProgress) * this.dir;
      add([1, tau, tau * tau].slice(0, k), y, 1 / Math.max(3, h.acc) ** 2);
      if (useSpeed && h.speed != null) add([0, 1, 2 * tau], h.speed, 1 / SPEED_SD ** 2);
    }
    const coef = solve(A, B);
    if (!coef) return null;
    const [a, b, q = 0] = coef as [number, number, number?];
    if (!(b > 0.3)) return null; // not clearly moving forward through the line
    let tau: number;
    if (Math.abs(q) < 1e-6) tau = -a / b;
    else {
      const disc = b * b - 4 * q * a;
      if (disc < 0) return null;
      const r = [(-b + Math.sqrt(disc)) / (2 * q), (-b - Math.sqrt(disc)) / (2 * q)];
      tau = Math.abs(r[0]!) < Math.abs(r[1]!) ? r[0]! : r[1]!;
    }
    if (!Number.isFinite(tau) || Math.abs(tau) > 2) return null; // implausible: keep the simple estimate
    return Math.round(c.at + tau * 1000);
  }
}

/** Solve a small linear system (Gaussian elimination); null if singular. */
function solve(A: number[][], B: number[]): number[] | null {
  const n = B.length;
  const M = A.map((row, i) => [...row, B[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    if (Math.abs(M[piv]![col]!) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / M[col]![col]!;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** Fraction of a move from `from` by `d` metres along the route at which it passes `gateM`, or null. */
function passFraction(from: number, d: number, gateM: number, loopLength: number | null): number | null {
  if (d === 0) return null;
  let rel = d > 0 ? gateM - from : from - gateM;
  if (loopLength != null) rel = ((rel % loopLength) + loopLength) % loopLength;
  const span = Math.abs(d);
  return rel > 0 && rel <= span ? rel / span : null;
}

/** All crossings in a recorded trace (for re-timing a saved ride). */
export function detectCrossings(g: RouteGeometry, gates: PreparedGate[], loop: boolean, points: GpsPoint[]): Crossing[] {
  const det = new GateDetector(g, gates, loop);
  return [...[...points].sort((a, b) => a.t - b.t).flatMap((p) => det.push(p)), ...det.finish()];
}

export interface GateDiagnostics {
  /** Closest the trace came to the start (or start/finish) line's centre, metres. */
  closestToStartM: number | null;
  /** Times the trace cut the start/finish line, each way. */
  crossingsAsMapped: number;
  crossingsReversed: number;
  direction: 1 | -1 | 0;
  /** Longest gap between GPS fixes, seconds. */
  longestGapS: number;
  medianAccuracyM: number | null;
  /** Share of fixes more than 30 m from the mapped route. */
  offRouteShare: number;
  fixes: number;
}

/** Why a GPS-timed ride did (or didn't) get laps: shown on the results page. */
export function gateDiagnostics(g: RouteGeometry, gates: PreparedGate[], loop: boolean, points: GpsPoint[]): GateDiagnostics {
  const pts = [...points].sort((a, b) => a.t - b.t);
  const start = gates.find((x) => x.role === "start_finish" || x.role === "start");
  let closest: number | null = null, asMapped = 0, reversed = 0, gap = 0, off = 0;
  let prev: { xy: Xy; t: number } | null = null;
  const det = new GateDetector(g, gates, loop);
  for (const p of pts) {
    det.push(p);
    const xy = g.proj.toXy(p.lat, p.lng);
    if (start) {
      const d = Math.hypot(xy.x - start.centre.x, xy.y - start.centre.y);
      if (closest == null || d < closest) closest = d;
    }
    if (Math.abs(projectOntoRoute(g, xy).offsetM) > 30) off++;
    if (prev) {
      gap = Math.max(gap, p.t - prev.t);
      if (start) for (const c of segmentCrossings([start], prev, { xy, t: p.t })) { if (c.sign > 0) asMapped++; else reversed++; }
    }
    prev = { xy, t: p.t };
  }
  const acc = pts.map((p) => p.accuracyM).sort((a, b) => a - b);
  return {
    closestToStartM: closest == null ? null : Math.round(closest),
    crossingsAsMapped: asMapped,
    crossingsReversed: reversed,
    direction: det.direction,
    longestGapS: Math.round(gap / 1000),
    medianAccuracyM: acc.length ? Math.round(acc[Math.floor(acc.length / 2)]!) : null,
    offRouteShare: pts.length ? off / pts.length : 0,
    fixes: pts.length,
  };
}

/** Crossings in the mapped direction only, between two fixes. */
export function gateCrossings(gates: PreparedGate[], prev: { xy: Xy; t: number }, cur: { xy: Xy; t: number }): Crossing[] {
  return segmentCrossings(gates, prev, cur).filter((c) => c.sign > 0).map(({ role, at }) => ({ role, at }));
}
