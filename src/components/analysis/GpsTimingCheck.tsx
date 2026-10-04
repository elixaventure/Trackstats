import { useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Card, SectionTitle } from "@/components/Card";
import { retimeFromGps } from "@/data/actions";
import { gateDiagnostics, prepareGates } from "@/domain/gates";
import { buildGeometry } from "@/domain/geo";
import type { GpsPoint, Route, Session } from "@/domain/types";

/**
 * Start-line check for GPS-timed rides: why laps were or weren't counted, in
 * plain English, plus re-timing from the recorded trace.
 */
export function GpsTimingCheck({ session, route, points, lapCount, canEdit }: { session: Session; route: Route; points: GpsPoint[]; lapCount: number; canEdit: boolean }) {
  const [result, setResult] = useState<string | null>(null);
  const d = useMemo(() => {
    const g = buildGeometry(route.polyline);
    return gateDiagnostics(g, prepareGates(g, route.gates), route.isLoop, points);
  }, [route, points]);

  const advice: string[] = [];
  if (d.offRouteShare > 0.5) advice.push(`Most of this ride (${Math.round(d.offRouteShare * 100)}%) was more than 30 m from the mapped track. Was it a different loop? Map that loop as its own track.`);
  else if (d.closestToStartM != null && d.closestToStartM > 25) advice.push(`You never came within 25 m of the start line (closest ${d.closestToStartM} m). Laps only count when you ride through it.`);
  if (d.longestGapS > 30) advice.push(`GPS stopped for ${d.longestGapS} s at one point. Keep the screen on: browsers pause GPS when the phone locks.`);
  if (d.medianAccuracyM != null && d.medianAccuracyM > 20) advice.push(`GPS was weak (typically ±${d.medianAccuracyM} m). Trees and buildings make it worse; open ground is best.`);
  if (d.direction === -1) advice.push("You rode it the opposite way to how it was mapped. That's fine: laps are timed either way.");

  return (
    <Card className="space-y-3">
      <SectionTitle>Start line check</SectionTitle>
      {lapCount === 0 && <p className="font-semibold text-warn">No laps were counted on this ride.</p>}
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Closest pass to the start line</dt><dd className="font-mono tnum">{d.closestToStartM != null ? `${d.closestToStartM} m` : "—"}</dd>
        <dt className="text-muted">Times through the line</dt><dd className="font-mono tnum">{d.crossingsAsMapped + d.crossingsReversed}{d.crossingsReversed ? ` (${d.crossingsReversed} reversed)` : ""}</dd>
        <dt className="text-muted">Direction</dt><dd>{d.direction === 1 ? "As mapped" : d.direction === -1 ? "Reversed" : "Unclear"}</dd>
        <dt className="text-muted">Typical GPS accuracy</dt><dd className="font-mono tnum">{d.medianAccuracyM != null ? `±${d.medianAccuracyM} m` : "—"}</dd>
        <dt className="text-muted">Longest GPS gap</dt><dd className="font-mono tnum">{d.longestGapS} s</dd>
        <dt className="text-muted">On the mapped track</dt><dd className="font-mono tnum">{Math.round((1 - d.offRouteShare) * 100)}%</dd>
      </dl>
      {advice.map((a) => <p key={a} className="text-sm">{a}</p>)}
      {canEdit && (
        <div className="space-y-2">
          <Button onClick={() => { const n = retimeFromGps(session.id, points); setResult(n ? `Re-timed: ${n} lap${n === 1 ? "" : "s"} found.` : "Still no complete laps in this ride's GPS."); }}>
            Re-time laps from GPS
          </Button>
          {result && <p className="text-sm text-faster" role="status">{result}</p>}
        </div>
      )}
    </Card>
  );
}
