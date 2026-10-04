import { describe, expect, it } from "vitest";
import { analyseShape, autoSections, cornerAt, finalSectionName, suggestStart } from "../corners";
import { buildGeometry } from "../geo";
import type { LngLatAlt } from "../types";

const C = { lat: 53.405, lng: -2.17 };
const M_LAT = 111320, M_LNG = 111320 * Math.cos((C.lat * Math.PI) / 180);
/** Polyline from x/y metres, densified every 2 m with a little GPS-like wobble. */
function track(xy: [number, number][], closed = true, noise = 0.8): LngLatAlt[] {
  const pts = closed ? [...xy, xy[0]!] : xy;
  const out: LngLatAlt[] = [];
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 2 * noise; };
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]!, [bx, by] = pts[i]!;
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 2));
    for (let k = 0; k < n; k++) { const t = k / n; out.push([C.lng + (ax + (bx - ax) * t + rnd()) / M_LNG, C.lat + (ay + (by - ay) * t + rnd()) / M_LAT, null]); }
  }
  if (closed) out.push(out[0]!);
  return out;
}

describe("corners and straights", () => {
  it("finds the four corners and straights of a block, all turning the same way", () => {
    // 150 m x 80 m block walked anticlockwise from the middle of the bottom side.
    const g = buildGeometry(track([[0, 0], [75, 0], [75, 80], [-75, 80], [-75, 0]]));
    const shape = analyseShape(g, true);
    expect(shape.corners).toHaveLength(4);
    for (const c of shape.corners) expect(c.turnDeg).toBeGreaterThan(70); // all left, roughly 90°
    expect(shape.straights).toHaveLength(4);
    expect(Math.max(...shape.straights.map((s) => s.lengthM))).toBeGreaterThan(110);
  });

  it("handles an L-shaped block with one corner turning the other way", () => {
    const g = buildGeometry(track([[0, 0], [100, 0], [100, 60], [50, 60], [50, 120], [0, 120]]));
    const shape = analyseShape(g, true);
    expect(shape.corners).toHaveLength(6);
    expect(shape.corners.filter((c) => c.turnDeg < 0)).toHaveLength(1);
    expect(shape.straights).toHaveLength(6); // even the 50 m sides
    for (const st of shape.straights) expect(st.lengthM).toBeGreaterThanOrEqual(35);
  });

  it("calls a hairpin a hairpin", () => {
    const hair: [number, number][] = [[0, 0], [150, 0]];
    for (let a = -80; a <= 80; a += 20) hair.push([150 + 12 * Math.cos((a * Math.PI) / 180), 12 + 12 * Math.sin((a * Math.PI) / 180)]);
    hair.push([0, 24]);
    const g = buildGeometry(track(hair, false));
    const shape = analyseShape(g, false);
    expect(shape.corners).toHaveLength(1);
    expect(Math.abs(shape.corners[0]!.turnDeg)).toBeGreaterThan(150);
    const secs = autoSections(shape, 0, g.length, false);
    expect(secs.map((s) => s.name).join(" ") + finalSectionName(shape, secs, 0, g.length, false)).toMatch(/hairpin left/);
  });

  it("suggests the middle of the longest straight for the start line, and spots a start in a corner", () => {
    const g = buildGeometry(track([[75, 40], [75, 80], [-75, 80], [-75, 0], [75, 0]])); // mapping started mid right side
    const shape = analyseShape(g, true);
    const s = suggestStart(shape)!;
    expect(cornerAt(shape, s, g.length, true)).toBeNull();
    const p = g.proj.toXy(...([g.line[0]![1], g.line[0]![0]] as [number, number]));
    expect(p).toBeTruthy();
    // 40 m along from the start is the top-right corner.
    expect(cornerAt(shape, 40, g.length, true)).not.toBeNull();
  });

  it("marks one section per corner on a block, numbered from the start line", () => {
    const g = buildGeometry(track([[0, 0], [75, 0], [75, 80], [-75, 80], [-75, 0]]));
    const shape = analyseShape(g, true);
    const secs = autoSections(shape, 0, g.length, true);
    const names = [...secs.map((s) => s.name), finalSectionName(shape, secs, 0, g.length, true)];
    expect(names).toEqual(["T1 corner left", "T2 corner left", "T3 corner left", "T4 corner left"]);
  });

  it("finds no corners on a straight sprint", () => {
    const g = buildGeometry(track([[0, 0], [400, 0]], false));
    expect(analyseShape(g, false).corners).toHaveLength(0);
  });
});
