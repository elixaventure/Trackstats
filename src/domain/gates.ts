import { gateLine, pointAtDistance, segmentIntersection, type RouteGeometry, type Xy } from "./geo";
import type { PodRole, TimingGate } from "./types";

export interface PreparedGate { role: PodRole; line: [Xy, Xy]; dir: Xy }

export function prepareGates(g: RouteGeometry, gates: TimingGate[]): PreparedGate[] {
  return gates.map((gate) => ({ role: gate.role as PodRole, line: gateLine(g, gate), dir: pointAtDistance(g, gate.distanceM).dir }));
}

/**
 * Virtual timing gates for GPS-only timing: a crossing is the GPS track between two
 * consecutive fixes intersecting the gate line while travelling in the route's
 * direction. The crossing time is interpolated between the two fixes.
 */
export function gateCrossings(gates: PreparedGate[], prev: { xy: Xy; t: number }, cur: { xy: Xy; t: number }): { role: PodRole; at: number }[] {
  const move = { x: cur.xy.x - prev.xy.x, y: cur.xy.y - prev.xy.y };
  const out: { role: PodRole; at: number }[] = [];
  for (const gate of gates) {
    const f = segmentIntersection(prev.xy, cur.xy, gate.line[0], gate.line[1]);
    if (f == null) continue;
    if (move.x * gate.dir.x + move.y * gate.dir.y <= 0) continue; // going the wrong way through the gate
    out.push({ role: gate.role, at: Math.round(prev.t + f * (cur.t - prev.t)) });
  }
  return out;
}
