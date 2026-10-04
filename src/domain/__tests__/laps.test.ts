import { describe, expect, it } from "vitest";
import { computeLaps, podsFor } from "../laps";
import type { PodRole, TimingConfig, TimingEvent } from "../types";

let n = 0;
const ev = (at: number, role: PodRole, podId = "POD-A", riderId = "r1"): TimingEvent => ({
  id: `e${n++}`, sessionId: "s1", riderId, transponderId: null, tagCode: "001", podId, role, source: "transponder", at, signalStrength: null,
});
const lapCfg: TimingConfig = { mode: "lap", pods: podsFor("lap", true, 0), isLoop: true };

describe("computeLaps", () => {
  it("lap mode: each start/finish crossing closes a lap and opens the next", () => {
    const laps = computeLaps("s1", "r1", [ev(0, "start_finish"), ev(120_000, "start_finish"), ev(238_500, "start_finish")], lapCfg);
    expect(laps.map((l) => l.durationMs)).toEqual([120_000, 118_500]);
    expect(laps.map((l) => l.lapNumber)).toEqual([1, 2]);
  });

  it("ignores double reads within the debounce window", () => {
    const laps = computeLaps("s1", "r1", [ev(0, "start_finish"), ev(800, "start_finish"), ev(120_000, "start_finish")], lapCfg);
    expect(laps).toHaveLength(1);
    expect(laps[0]!.durationMs).toBe(120_000);
  });

  it("start/finish mode ignores a finish with no start and restarts on a second start", () => {
    const cfg: TimingConfig = { mode: "start_finish", pods: podsFor("start_finish", false, 0), isLoop: false };
    const laps = computeLaps("s1", "r1", [
      ev(0, "finish", "POD-B"), ev(10_000, "start"), ev(30_000, "start"), ev(90_000, "finish", "POD-B"),
    ], cfg);
    expect(laps.map((l) => l.durationMs)).toEqual([60_000]);
  });

  it("sector mode records splits only when every sector was seen", () => {
    const cfg: TimingConfig = { mode: "sectors", pods: podsFor("sectors", false, 2), isLoop: false };
    expect(cfg.pods.map((p) => p.role)).toEqual(["start", "sector_1", "sector_2", "finish"]);
    const laps = computeLaps("s1", "r1", [
      ev(0, "start"), ev(20_000, "sector_1", "POD-B"), ev(45_000, "sector_2", "POD-C"), ev(60_000, "finish", "POD-D"),
      ev(100_000, "start"), ev(125_000, "sector_2", "POD-C"), ev(160_000, "finish", "POD-D"),
    ], cfg);
    expect(laps[0]!.splitsMs).toEqual([20_000, 25_000, 15_000]);
    expect(laps[1]!.durationMs).toBe(60_000);
    expect(laps[1]!.splitsMs).toEqual([]);
  });

  it("keeps riders separate when two tags share the same pods", () => {
    const events = [ev(0, "start_finish"), ev(5_000, "start_finish", "POD-A", "r2"), ev(100_000, "start_finish"), ev(130_000, "start_finish", "POD-A", "r2")];
    expect(computeLaps("s1", "r1", events, lapCfg).map((l) => l.durationMs)).toEqual([100_000]);
    expect(computeLaps("s1", "r2", events, lapCfg).map((l) => l.durationMs)).toEqual([125_000]);
  });

  it("flags crash laps as invalid so they don't count", () => {
    const t = [0, 120_000, 241_000, 400_000, 520_000];
    const laps = computeLaps("s1", "r1", t.map((x) => ev(x, "start_finish")), lapCfg);
    expect(laps.map((l) => l.valid)).toEqual([true, true, false, true]);
  });

  it("produces stable lap ids so recomputation updates rather than duplicates", () => {
    const a = computeLaps("s1", "r1", [ev(0, "start_finish"), ev(100_000, "start_finish")], lapCfg);
    const b = computeLaps("s1", "r1", [ev(0, "start_finish"), ev(100_000, "start_finish"), ev(200_000, "start_finish")], lapCfg);
    expect(b[0]!.id).toBe(a[0]!.id);
  });
});
