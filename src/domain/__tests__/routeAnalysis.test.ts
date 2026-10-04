import { describe, expect, it } from "vitest";
import { generateDemo } from "@/data/seed/generate";
import { compareLaps, lapHasGps } from "../routeAnalysis";
import { buildGeometry, gateLine, segmentIntersection, simplify } from "../geo";

// The demo generator is deterministic, so it doubles as a realistic fixture.
const demo = generateDemo("user-1", Date.UTC(2026, 9, 4, 12));
const s = demo.state;
const bacup = Object.values(s.routes).find((r) => r.name.startsWith("Bacup"))!;

describe("demo data", () => {
  it("tells the improvement story on the main track", () => {
    const alex = Object.values(s.riders).find((r) => r.name === "Alex Turner")!;
    const sessions = Object.values(s.sessions).filter((x) => x.riderId === alex.id && x.routeId === bacup.id).sort((a, b) => a.startedAt - b.startedAt);
    expect(sessions[0]!.summary!.fastestLapMs).toBe(136_840);
    expect(sessions[sessions.length - 1]!.summary!.fastestLapMs).toBe(128_420);
    expect(sessions[sessions.length - 1]!.summary!.isPb).toBe(true);
  });
});

describe("section analysis", () => {
  it("finds gains in sections the rider improved and treats sub-noise deltas as equal", () => {
    const alex = Object.values(s.riders).find((r) => r.name === "Alex Turner")!;
    const sessions = Object.values(s.sessions).filter((x) => x.riderId === alex.id && x.routeId === bacup.id).sort((a, b) => a.startedAt - b.startedAt);
    const bestLap = (sid: string) => Object.values(s.laps).filter((l) => l.sessionId === sid && l.valid).sort((a, b) => a.durationMs - b.durationMs)[0]!;
    const first = sessions[0]!, last = sessions[sessions.length - 1]!;
    const cur = { points: demo.gps[last.id]!, lap: bestLap(last.id) };
    const ref = { points: demo.gps[first.id]!, lap: bestLap(first.id) };
    expect(lapHasGps(cur.points, cur.lap)).toBe(true);
    const res = compareLaps(bacup, cur, ref);
    expect(res).toHaveLength(bacup.sectors.length);
    const rollers = res.find((r) => r.name === "Rollers")!;
    expect(rollers.verdict).toBe("faster");
    // Sum of section times should be close to the actual lap time (within GPS tolerance).
    const sum = res.reduce((a, r) => a + (r.timeMs ?? 0), 0);
    expect(Math.abs(sum - cur.lap.durationMs)).toBeLessThan(1500);
    for (const r of res) if (r.verdict === "equal") expect(Math.abs(r.deltaMs!)).toBeLessThanOrEqual(r.uncertaintyMs!);
  });
});

describe("geometry", () => {
  it("detects a crossing of the start gate", () => {
    const g = buildGeometry(bacup.polyline);
    const [a, b] = gateLine(g, bacup.gates[0]!);
    const before = g.xy[g.xy.length - 3]!;
    const after = g.xy[2]!;
    expect(segmentIntersection(before, after, a, b)).not.toBeNull();
  });

  it("simplifies a dense line without losing its ends", () => {
    const out = simplify(bacup.polyline, 3);
    expect(out.length).toBeLessThan(bacup.polyline.length);
    expect(out[0]).toEqual(bacup.polyline[0]);
    expect(out[out.length - 1]).toEqual(bacup.polyline[bacup.polyline.length - 1]);
  });
});
