import { pointAtDistance, type RouteGeometry } from "./geo";

/** Resampling step along the track, metres. */
const STEP = 5;
/** Heading is measured across this distance either side of a point, smoothing GPS wobble. */
const HEADING_SPAN = 10;
/** A stretch turning faster than this (degrees per 20 m) is part of a corner. */
const CORNER_RATE = 25;
/** Ignore bends that turn less than this in total. */
const MIN_CORNER_TURN = 30;
/** Shorter gaps between corners are part of the same complex, not a straight. */
const MIN_STRAIGHT = 30;
const MAX_SECTIONS = 8;
const MIN_SECTION = 40;

export interface Corner {
  /** Corner number from the start of the mapped line: T1, T2… */
  number: number;
  fromM: number;
  toM: number;
  apexM: number;
  /** Total turn in degrees: positive left, negative right. */
  turnDeg: number;
}
export interface Straight { fromM: number; toM: number; lengthM: number; midM: number }
export interface TrackShape { corners: Corner[]; straights: Straight[] }

const wrap180 = (a: number) => ((a + 540) % 360) - 180;

/**
 * Find the corners and straights of a mapped track from its shape: resample the
 * line every few metres, measure how fast it turns, and call the fast-turning
 * stretches corners. Works round the join of a loop.
 */
export function analyseShape(g: RouteGeometry, loop: boolean): TrackShape {
  const L = g.length;
  if (L < 60) return { corners: [], straights: [] };
  const n = Math.max(4, Math.floor(L / STEP));
  const step = L / n;
  const at = (d: number) => pointAtDistance(g, loop ? ((d % L) + L) % L : Math.max(0, Math.min(L, d))).xy;
  const heading: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = at(i * step - HEADING_SPAN), b = at(i * step + HEADING_SPAN);
    heading.push((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
  }
  // Turn between consecutive samples, and over a 20 m window.
  const idx = (i: number) => (loop ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i)));
  const dTurn = heading.map((_, i) => (loop || i < n - 1 ? wrap180(heading[idx(i + 1)]! - heading[i]!) : 0));
  const win = Math.max(1, Math.round(20 / step));
  const rate = dTurn.map((_, i) => { let s = 0; for (let k = -Math.floor(win / 2); k < Math.ceil(win / 2); k++) s += dTurn[idx(i + k)]!; return s; });
  const turning = rate.map((r) => Math.abs(r) >= CORNER_RATE);

  // Runs of turning samples (circular for a loop).
  type Run = { from: number; to: number };
  const runs: Run[] = [];
  if (turning.every(Boolean)) runs.push({ from: 0, to: n - 1 });
  else {
    const start = loop ? turning.findIndex((t) => !t) : 0;
    let cur: Run | null = null;
    for (let k = 0; k < n; k++) {
      const i = loop ? (start + k) % n : k;
      if (turning[i]) { if (cur) cur.to = i; else cur = { from: i, to: i }; }
      else if (cur) { runs.push(cur); cur = null; }
    }
    if (cur) runs.push(cur);
  }
  const span = (r: Run) => (r.to >= r.from ? r.to - r.from : r.to + n - r.from) + 1;
  // The heading span and the 20 m window blur each corner by this much either side.
  const blur = Math.round((HEADING_SPAN + 10) / step);
  const corners: Corner[] = [];
  for (const r of runs) {
    let turn = 0, best = r.from, bestRate = 0;
    for (let k = 0; k < span(r); k++) {
      const i = (r.from + k) % n;
      turn += dTurn[i]!;
      if (Math.abs(rate[i]!) > bestRate) { bestRate = Math.abs(rate[i]!); best = i; }
    }
    if (Math.abs(turn) < MIN_CORNER_TURN) continue;
    // Trim the blur off each end, keeping at least a sample either side of the apex.
    const len = span(r);
    const cut = Math.min(blur, Math.max(0, Math.floor((len - 3) / 2)));
    const offApex = (best - r.from + n) % n;
    const fromK = Math.min(cut, Math.max(0, offApex - 1));
    const toK = Math.max(len - 1 - cut, Math.min(len - 1, offApex + 1));
    const from = (r.from + fromK) % n, to = (r.from + toK) % n;
    corners.push({ number: 0, fromM: from * step, toM: ((to + 1) % n) * step || (loop ? 0 : L), apexM: best * step, turnDeg: Math.round(turn) });
  }
  corners.sort((a, b) => a.apexM - b.apexM).forEach((c, i) => { c.number = i + 1; });

  // Straights: the gaps between corners long enough to count.
  const straights: Straight[] = [];
  const gapBetween = (from: number, to: number) => {
    const len = loop ? (((to - from) % L) + L) % L : to - from;
    if (len >= MIN_STRAIGHT) straights.push({ fromM: from, toM: to, lengthM: Math.round(len), midM: loop ? (from + len / 2) % L : from + len / 2 });
  };
  if (!corners.length) gapBetween(0, L);
  else if (loop) corners.forEach((c, i) => gapBetween(c.toM, corners[(i + 1) % corners.length]!.fromM));
  else {
    gapBetween(0, corners[0]!.fromM);
    corners.forEach((c, i) => gapBetween(c.toM, i + 1 < corners.length ? corners[i + 1]!.fromM : L));
  }
  return { corners, straights };
}

const along = (from: number, to: number, L: number, loop: boolean) => (loop ? (((to - from) % L) + L) % L : to - from);

/** Is this point inside a corner (or within a few metres of one)? */
export function cornerAt(shape: TrackShape, m: number, L: number, loop: boolean, marginM = 8): Corner | null {
  return shape.corners.find((c) => {
    const len = along(c.fromM, c.toM, L, loop);
    const into = along(c.fromM, m, L, loop);
    return into <= len + marginM || along(m, c.fromM, L, loop) <= marginM;
  }) ?? null;
}

/** Best place for a loop's start/finish line: the middle of the longest straight. */
export function suggestStart(shape: TrackShape): number | null {
  const s = [...shape.straights].sort((a, b) => b.lengthM - a.lengthM)[0];
  return s ? Math.round(s.midM) : null;
}

/** Corners numbered T1, T2… from the start line rather than from where mapping began. */
export function numberFrom(shape: TrackShape, startM: number, L: number, loop: boolean): TrackShape {
  const corners = [...shape.corners].map((c) => ({ ...c })).sort((a, b) => along(startM, a.apexM, L, loop) - along(startM, b.apexM, L, loop));
  corners.forEach((c, i) => { c.number = i + 1; });
  return { ...shape, corners };
}

export interface AutoSection { atM: number; name: string }

const describe = (c: Corner) => `${Math.abs(c.turnDeg) >= 135 ? "hairpin" : Math.abs(c.turnDeg) >= 70 ? "corner" : "bend"} ${c.turnDeg > 0 ? "left" : "right"}`;

/**
 * Split the track into sections at the middle of each straight, so each section
 * holds one corner or a run of corners, named T1, T2–T3, … Positions are along
 * the mapped line; the split at the start line itself is left out.
 */
export function autoSections(raw: TrackShape, startM: number, L: number, loop: boolean): AutoSection[] {
  const shape = numberFrom(raw, startM, L, loop);
  const rel = (m: number) => along(startM, m, L, loop);
  let cuts = shape.straights.map((s) => s.midM).filter((m) => rel(m) >= MIN_SECTION && rel(m) <= (loop ? L : L - startM) - MIN_SECTION);
  // Too many: keep the splits on the longest straights.
  if (cuts.length > MAX_SECTIONS - 1) {
    const keep = new Set([...shape.straights].sort((a, b) => b.lengthM - a.lengthM).map((s) => s.midM).filter((m) => cuts.includes(m)).slice(0, MAX_SECTIONS - 1));
    cuts = cuts.filter((m) => keep.has(m));
  }
  cuts.sort((a, b) => rel(a) - rel(b));
  // Drop splits that would leave a very short section.
  const kept: number[] = [];
  for (const m of cuts) if (rel(m) - (kept.length ? rel(kept[kept.length - 1]!) : 0) >= MIN_SECTION) kept.push(m);
  const bounds = [0, ...kept.map(rel), loop ? L : L - startM];
  return kept.map((m, i) => {
    const inSection = shape.corners.filter((c) => { const r = rel(c.apexM); return r >= bounds[i]! && r < bounds[i + 1]!; });
    const name = !inSection.length ? "Straight"
      : inSection.length === 1 ? `T${inSection[0]!.number} ${describe(inSection[0]!)}`
      : `T${inSection[0]!.number}–T${inSection[inSection.length - 1]!.number}`;
    return { atM: Math.round(m), name };
  });
}

/** Name of the last section (from the final split to the finish). */
export function finalSectionName(raw: TrackShape, sections: AutoSection[], startM: number, L: number, loop: boolean): string {
  const shape = numberFrom(raw, startM, L, loop);
  const rel = (m: number) => along(startM, m, L, loop);
  const from = sections.length ? rel(sections[sections.length - 1]!.atM) : 0;
  const cs = shape.corners.filter((c) => rel(c.apexM) >= from);
  return !cs.length ? "To finish" : cs.length === 1 ? `T${cs[0]!.number} ${describe(cs[0]!)}` : `T${cs[0]!.number}–T${cs[cs.length - 1]!.number}`;
}
