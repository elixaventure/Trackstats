import { describe, expect, it } from "vitest";
import { GateDetector, prepareGates } from "../gates";
import { buildGeometry } from "../geo";
import type { GpsPoint, LngLatAlt } from "../types";

// Same ~620 m oval as the detector tests.
const C = { lat: 53.405, lng: -2.17 };
const RX = 120, RY = 70;
const M_LAT = 111320, M_LNG = 111320 * Math.cos((C.lat * Math.PI) / 180);
const PER = 2 * Math.PI * Math.sqrt((RX * RX + RY * RY) / 2);
const pos = (d: number) => { const a = (d / PER) * 2 * Math.PI; return { x: RX * Math.cos(a), y: RY * Math.sin(a) }; };
const line: LngLatAlt[] = Array.from({ length: 241 }, (_, i) => { const p = pos((i / 240) * PER); return [C.lng + p.x / M_LNG, C.lat + p.y / M_LAT, null]; });
const g = buildGeometry(line);
const gates = prepareGates(g, [{ role: "start_finish", distanceM: 0, halfWidthM: 20 }]);

function makeRng(seed: number) {
  let s = seed;
  const u = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return { u, n: () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u()) };
}

/**
 * Ride `laps` laps with speed varying round the lap (hard acceleration out of the
 * line or braking into it), 1 Hz fixes at a random phase, GPS position error made
 * of a slowly drifting bias plus per-fix wobble, and noisy Doppler speed.
 * Returns the fixes and the true lap times.
 */
function session(seed: number, opts: { mean: number; swing: number; wobbleM: number }) {
  const rng = makeRng(seed);
  const phase = rng.u() * 2 * Math.PI;
  const speed = (s: number) => opts.mean + opts.swing * Math.sin((2 * Math.PI * s) / PER + phase);
  const pts: GpsPoint[] = [];
  const crossings: number[] = [];
  let s = -40, t = 0, nextFix = rng.u() * 1000, bx = 0, by = 0;
  while (crossings.length < 5 || t < crossings[4]! + 3000) {
    const dt = 10; // ms
    const before = s;
    s += speed(s) * (dt / 1000);
    t += dt;
    if (Math.floor(before / PER) !== Math.floor(s / PER) && s > 0) crossings.push(t - dt * ((s % PER) / (s - before)));
    if (t >= nextFix) {
      nextFix += 1000;
      bx = 0.9 * bx + 0.45 * rng.n(); by = 0.9 * by + 0.45 * rng.n(); // ~1 m drifting bias
      const p = pos(((s % PER) + PER) % PER);
      const x = p.x + bx + opts.wobbleM * rng.n(), y = p.y + by + opts.wobbleM * rng.n();
      pts.push({ t, lat: C.lat + y / M_LAT, lng: C.lng + x / M_LNG, accuracyM: 5, speedMps: Math.max(0, speed(s) + 0.3 * rng.n()), heading: null, altitudeM: null });
    }
  }
  const truth = crossings.slice(1).map((c, i) => c - crossings[i]!);
  return { pts, truth };
}

function lapErrors(refine: boolean, opts: { mean: number; swing: number; wobbleM: number }) {
  const errs: number[] = [];
  for (let seed = 1; seed <= 60; seed++) {
    const { pts, truth } = session(seed * 7919, opts);
    const det = new GateDetector(g, gates, true, { refine });
    const c = [...pts.flatMap((p) => det.push(p)), ...det.finish()].map((x) => x.at);
    const laps = c.slice(1).map((x, i) => x - c[i]!);
    if (laps.length !== truth.length) throw new Error(`seed ${seed}: ${laps.length} laps, expected ${truth.length}`);
    laps.forEach((l, i) => errs.push((l - truth[i]!) / 1000));
  }
  const rms = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / errs.length);
  return { rms, worst: Math.max(...errs.map(Math.abs)) };
}

describe("speed-assisted crossing times", () => {
  const cases = [
    { name: "MX bike, hard acceleration and braking near the line", mean: 15, swing: 7, wobbleM: 2.5 },
    { name: "steady scooter", mean: 6, swing: 1, wobbleM: 2.5 },
  ];
  for (const k of cases) {
    it(`are more accurate than straight-line interpolation: ${k.name}`, () => {
      const plain = lapErrors(false, k);
      const assisted = lapErrors(true, k);
      console.log(`${k.name}: lap-time RMS ${plain.rms.toFixed(3)} s → ${assisted.rms.toFixed(3)} s; worst ${plain.worst.toFixed(2)} s → ${assisted.worst.toFixed(2)} s`);
      expect(assisted.rms).toBeLessThan(plain.rms * 0.85);
    });
  }
});
