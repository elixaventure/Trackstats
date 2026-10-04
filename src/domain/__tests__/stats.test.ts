import { describe, expect, it } from "vitest";
import { formatDelta, formatLap } from "../time";
import { consistencyScore, hasFiveWithin, progressSeries, routeImprovement, summarise } from "../stats";
import type { Lap, Session } from "../types";

const lap = (ms: number, i: number, valid = true): Lap => ({ id: `l${i}`, sessionId: "s", riderId: "r", lapNumber: i + 1, startedAt: i * ms, durationMs: ms, splitsMs: [], source: "transponder", valid });

describe("time formatting", () => {
  it("formats lap times and deltas", () => {
    expect(formatLap(128_420)).toBe("2:08.42");
    expect(formatLap(58_400)).toBe("58.40");
    expect(formatDelta(-3_700)).toBe("−3.70");
    expect(formatDelta(1_200)).toBe("+1.20");
  });
});

describe("summaries", () => {
  it("excludes invalid laps from fastest/average and detects a PB", () => {
    const s = summarise([lap(130_000, 0), lap(128_000, 1), lap(170_000, 2, false)], 600_000, 129_000, { distanceM: null, topSpeedKph: null, elevationGainM: null });
    expect(s.fastestLapMs).toBe(128_000);
    expect(s.averageLapMs).toBe(129_000);
    expect(s.isPb).toBe(true);
    expect(s.lapCount).toBe(3);
  });

  it("scores consistency higher for tighter laps", () => {
    const tight = [130_000, 130_400, 129_800, 130_200].map((m, i) => lap(m, i));
    const loose = [130_000, 136_000, 127_000, 133_000].map((m, i) => lap(m, i));
    expect(consistencyScore(tight)!).toBeGreaterThan(consistencyScore(loose)!);
  });

  it("finds five consecutive laps within 2 s", () => {
    expect(hasFiveWithin([130, 131, 130.5, 131.9, 130.1].map((s, i) => lap(s * 1000, i)))).toBe(true);
    expect(hasFiveWithin([130, 133, 130.5, 131.9, 130.1].map((s, i) => lap(s * 1000, i)))).toBe(false);
  });
});

describe("progression", () => {
  it("computes PB-so-far and improvement over the first session", () => {
    const mk = (best: number, at: number): Session => ({
      id: `s${at}`, riderId: "r", bikeId: null, routeId: "rt", routeConfigVersion: 1, transponderId: null, rideType: "mx_circuit",
      timing: { mode: "lap", pods: [], isLoop: true }, condition: "dry", notes: "", status: "completed", startedAt: at, endedAt: at,
      summary: { durationMs: 1, lapCount: 5, fastestLapMs: best, averageLapMs: best + 1000, consistencySdMs: 500, previousPbMs: null, isPb: false, distanceM: null, topSpeedKph: null, elevationGainM: null },
      hasGps: false,
    });
    const series = progressSeries([mk(136_840, 1), mk(135_000, 2), mk(137_000, 3), mk(128_420, 4)]);
    expect(series.map((p) => p.pbSoFar)).toEqual([136_840, 135_000, 135_000, 128_420]);
    const imp = routeImprovement(series)!;
    expect(imp.improvementMs).toBe(8_420);
    expect(imp.improvementPct).toBeCloseTo(6.15, 2);
    expect(imp.pbCount).toBe(2);
  });
});
