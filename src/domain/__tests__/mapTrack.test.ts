import { describe, expect, it } from "vitest";
import { generateDemo } from "@/data/seed/generate";
import { lapClosed } from "../geo";

const { state, gps } = generateDemo("u", Date.UTC(2026, 9, 4));
const bacup = Object.values(state.routes).find((r) => r.name.startsWith("Bacup"))!;
const session = Object.values(state.sessions).find((s) => s.routeId === bacup.id)!;
const lap = Object.values(state.laps).find((l) => l.sessionId === session.id && l.lapNumber === 2)!;
const trace = gps[session.id]!.filter((p) => p.t >= lap.startedAt && p.t <= lap.startedAt + lap.durationMs);

describe("mapping a track by riding it", () => {
  it("doesn't finish while you're still out on the lap", () => {
    expect(lapClosed(trace.slice(0, Math.floor(trace.length * 0.8)))).toBe(false);
  });

  it("finishes when you get back to the start", () => {
    expect(lapClosed(trace)).toBe(true);
  });

  it("catches the start even when fast riding puts fixes either side of it", () => {
    // Every 6th fix ≈ 60–70 m apart: no single fix lands within 25 m of the start.
    const sparse = trace.filter((_, i) => i % 6 === 0);
    const closing = [...sparse, { ...trace[4]!, t: sparse[sparse.length - 1]!.t + 6000 }];
    expect(lapClosed(closing)).toBe(true);
  });

  it("doesn't finish just because you're waiting at the start", () => {
    const parked = Array.from({ length: 30 }, (_, i) => ({ ...trace[0]!, t: trace[0]!.t + i * 1000 }));
    expect(lapClosed(parked)).toBe(false);
  });

  it("ignores a wild GPS fix near the start", () => {
    const halfway = trace.slice(0, Math.floor(trace.length / 2));
    const jump = { ...trace[0]!, t: halfway[halfway.length - 1]!.t + 1000, accuracyM: 80 };
    expect(lapClosed([...halfway, jump])).toBe(false);
  });
});
