import { describe, expect, it } from "vitest";
import { detectCrossings, gateDiagnostics, prepareGates } from "../gates";
import { buildGeometry } from "../geo";
import type { LngLatAlt } from "../types";
import type { GpsPoint } from "../types";

// A ~620 m oval, mapped anticlockwise, start/finish on the east side.
const C = { lat: 53.405, lng: -2.17 };
const RX = 120, RY = 70;
const M_LAT = 111320, M_LNG = 111320 * Math.cos((C.lat * Math.PI) / 180);
const PER = 2 * Math.PI * Math.sqrt((RX * RX + RY * RY) / 2);
const at = (d: number, offsetM = 0) => {
  const a = (d / PER) * 2 * Math.PI;
  const k = 1 + offsetM / Math.hypot(RX * Math.cos(a), RY * Math.sin(a));
  return { lat: C.lat + (RY * Math.sin(a) * k) / M_LAT, lng: C.lng + (RX * Math.cos(a) * k) / M_LNG };
};
const line: LngLatAlt[] = Array.from({ length: 61 }, (_, i) => { const p = at((i / 60) * PER); return [p.lng, p.lat, null]; });
const g = buildGeometry(line);
const gates = prepareGates(g, [{ role: "start_finish", distanceM: 0, halfWidthM: 20 }]);

/** Ride from `from` to `to` metres along the oval (negative speed = the other way round), a fix a second. */
function ride(from: number, to: number, speed: number, t0 = 0, noiseM = 0): GpsPoint[] {
  const pts: GpsPoint[] = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 2; };
  for (let d = from, t = t0; speed > 0 ? d <= to : d >= to; d += speed, t += 1000) {
    const p = at(((d % PER) + PER) % PER);
    pts.push({ t, lat: p.lat + (rnd() * noiseM) / M_LAT, lng: p.lng + (rnd() * noiseM) / M_LNG, accuracyM: 5, speedMps: Math.abs(speed), heading: null, altitudeM: null });
  }
  return pts;
}
const lapsFrom = (c: { at: number }[]) => c.slice(1).map((x, i) => (x.at - c[i]!.at) / 1000);

describe("GPS lap detection", () => {
  it("times laps riding the way the track was mapped", () => {
    const c = detectCrossings(g, gates, true, ride(-30, 3 * PER + 20, 8, 0, 3));
    expect(c).toHaveLength(4);
    for (const lap of lapsFrom(c)) expect(lap).toBeCloseTo(PER / 8, -0.5);
  });

  it("times laps riding the loop the other way round", () => {
    const c = detectCrossings(g, gates, true, ride(30, -(3 * PER + 20), -8, 0, 3));
    expect(c).toHaveLength(4);
    for (const lap of lapsFrom(c)) expect(lap).toBeCloseTo(PER / 8, -0.5);
  });

  it("counts the first lap from a standing start on the line", () => {
    const standing = Array.from({ length: 10 }, (_, i) => ({ ...ride(0, 0, 1, i * 1000, 3)[0]!, t: i * 1000 }));
    const c = detectCrossings(g, gates, true, [...standing, ...ride(1, 2 * PER + 20, 8, 10000, 2)]);
    expect(c).toHaveLength(3); // riding off the line, then two laps
    expect(c[0]!.at).toBeGreaterThanOrEqual(9000); // the lap starts when they ride off, not while waiting
    for (const lap of lapsFrom(c)) expect(lap).toBeCloseTo(PER / 8, -0.5);
  });

  it("ignores GPS wobble back and forth over the line while stopped", () => {
    const wobble: GpsPoint[] = [];
    for (let i = 0; i < 30; i++) { const p = at(((i % 2 ? 4 : -4) + PER) % PER); wobble.push({ t: i * 1000, ...p, accuracyM: 8, speedMps: 0, heading: null, altitudeM: null }); }
    const c = detectCrossings(g, gates, true, [...ride(PER - 100, PER - 5, 8, -20000), ...wobble, ...ride(5, PER + 20, 8, 31000)]);
    expect(lapsFrom(c).filter((l) => l < 20)).toHaveLength(0);
  });

  it("still counts a crossing across a short GPS dropout", () => {
    const pts = ride(-30, PER + 120, 8, 0).filter((p) => !(p.t > 70000 && p.t < 90000)); // 20 s gap spanning the finish
    expect(detectCrossings(g, gates, true, pts)).toHaveLength(2);
  });

  it("explains a ride that never reached the line", () => {
    const d = gateDiagnostics(g, gates, true, ride(100, PER - 100, 8, 0));
    expect(d.crossingsAsMapped + d.crossingsReversed).toBe(0);
    expect(d.closestToStartM!).toBeGreaterThan(60);
    expect(d.direction).toBe(1);
  });
});
