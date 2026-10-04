import { describe, expect, it } from "vitest";
import { generateDemo } from "@/data/seed/generate";
import { buildGeometry, pointAtDistance } from "../geo";
import { gateCrossings, prepareGates } from "../gates";

const { state } = generateDemo("u", Date.UTC(2026, 9, 4));
const loop = Object.values(state.routes).find((r) => r.isLoop)!;
const stage = Object.values(state.routes).find((r) => !r.isLoop)!;

describe("GPS gates", () => {
  it("fires a start/finish crossing when riding forwards over the line, at the interpolated time", () => {
    const g = buildGeometry(loop.polyline);
    const gates = prepareGates(g, loop.gates);
    const before = { xy: pointAtDistance(g, g.length - 10).xy, t: 1000 };
    const after = { xy: pointAtDistance(g, 10).xy, t: 2000 };
    const hits = gateCrossings(gates, before, after);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.role).toBe("start_finish");
    expect(hits[0]!.at).toBeGreaterThan(1300);
    expect(hits[0]!.at).toBeLessThan(1700);
  });

  it("ignores riding backwards through the gate", () => {
    const g = buildGeometry(loop.polyline);
    const gates = prepareGates(g, loop.gates);
    expect(gateCrossings(gates, { xy: pointAtDistance(g, 10).xy, t: 0 }, { xy: pointAtDistance(g, g.length - 10).xy, t: 1000 })).toHaveLength(0);
  });

  it("detects start and finish on a point-to-point stage", () => {
    const g = buildGeometry(stage.polyline);
    const gates = prepareGates(g, stage.gates);
    const start = { xy: pointAtDistance(g, 0).xy, t: 0 };
    const startHits = gateCrossings(gates, { xy: { x: start.xy.x - (pointAtDistance(g, 5).xy.x - start.xy.x), y: start.xy.y - (pointAtDistance(g, 5).xy.y - start.xy.y) }, t: 0 }, { xy: pointAtDistance(g, 5).xy, t: 500 });
    expect(startHits.map((h) => h.role)).toEqual(["start"]);
    const end = pointAtDistance(g, g.length);
    const finishHits = gateCrossings(gates, { xy: pointAtDistance(g, g.length - 6).xy, t: 0 }, { xy: { x: end.xy.x + end.dir.x * 6, y: end.xy.y + end.dir.y * 6 }, t: 1000 });
    expect(finishHits.map((h) => h.role)).toEqual(["finish"]);
  });
});
