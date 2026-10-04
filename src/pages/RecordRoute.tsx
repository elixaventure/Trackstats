import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { RouteMap } from "@/components/map/RouteMap";
import { PageHeader } from "@/components/PageHeader";
import { RouteReview } from "@/components/route/RouteReview";
import { Stat } from "@/components/Stat";
import { StatusChip } from "@/components/StatusChip";
import { ErrorNote } from "@/components/States";
import { kvDel, kvGet, kvSet } from "@/data/persist";
import { gpsToLine, polylineLength } from "@/domain/geo";
import { formatClock, formatDistance } from "@/domain/time";
import type { GpsPoint } from "@/domain/types";
import { useDb } from "@/hooks/useDb";
import { useNow } from "@/hooks/useNow";
import { useWakeLock } from "@/hooks/useWakeLock";
import { createLocationProvider, type LocationProvider } from "@/location";
import { GpsSampler } from "@/location/sampler";

type Phase = "ready" | "recording" | "review";
const DRAFT_KEY = "route-recording";

export default function RecordRoute() {
  const db = useDb();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("ready");
  const [points, setPoints] = useState<GpsPoint[]>([]);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const provider = useRef<LocationProvider | null>(null);
  const now = useNow(1000);
  useWakeLock(phase === "recording");

  // Recover a recording interrupted by a reload.
  useEffect(() => {
    void kvGet<GpsPoint[]>(DRAFT_KEY).then((pts) => { if (pts && pts.length > 5) { setPoints(pts); setPhase("review"); } });
    return () => provider.current?.stop();
  }, []);

  const start = async () => {
    setError(null);
    setPoints([]);
    const sampler = new GpsSampler(30, 1000, 10000, 3);
    const simLine = Object.values(db.routes)[0]?.polyline;
    provider.current = createLocationProvider({ simulate: db.settings.simulateGps, simulateLine: simLine, speedFactor: db.settings.simSpeed });
    setStartedAt(Date.now());
    setPhase("recording");
    await provider.current.start(
      (p) => {
        setAccuracy(Math.round(p.accuracyM));
        if (!sampler.accept(p)) return;
        setPoints((prev) => {
          const next = [...prev, p];
          if (next.length % 10 === 0) void kvSet(DRAFT_KEY, next);
          return next;
        });
      },
      (_k, msg) => { setError(msg); },
    );
  };

  const stop = () => {
    provider.current?.stop();
    provider.current = null;
    void kvSet(DRAFT_KEY, points);
    if (points.length < 10) { setError("Too few GPS points to make a route. Record for longer, outdoors with a clear view of the sky."); setPhase("ready"); return; }
    setPhase("review");
  };

  const discard = () => { void kvDel(DRAFT_KEY); setPoints([]); setPhase("ready"); };
  const line = gpsToLine(points);
  const coords = line.map((p) => [p[0], p[1]] as [number, number]);

  if (phase === "review") {
    return (
      <div className="space-y-5">
        <PageHeader back="/routes" title="Save route" />
        <RouteReview raw={line} onDiscard={discard} onSaved={(id) => { void kvDel(DRAFT_KEY); navigate(`/routes/${id}`, { replace: true }); }} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader back="/routes" title="Map new route" />
      {phase === "ready" && (
        <Card className="space-y-3">
          <p>Ride or walk the route once with this phone. Start where you want the start line, and for a loop, finish back at the same spot.</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Keep the screen on: browsers pause GPS when the phone locks.</li>
            <li>Phone GPS is accurate to a few metres; that's fine for routes and section analysis.</li>
            {db.settings.simulateGps && <li className="text-warn">Simulated GPS is on (Settings), so this records a simulated lap.</li>}
          </ul>
        </Card>
      )}
      {error && <ErrorNote title="GPS problem">{error}</ErrorNote>}
      {phase === "recording" && (
        <>
          <div className="flex gap-2">
            <StatusChip icon="gps" tone={accuracy == null ? "warn" : accuracy <= 10 ? "ok" : accuracy <= 25 ? "warn" : "bad"}>
              {accuracy == null ? "Waiting for GPS" : `±${accuracy} m`}
            </StatusChip>
            <StatusChip icon="record" tone="bad">Recording</StatusChip>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Card><Stat label="Time" value={formatClock(now - startedAt)} /></Card>
            <Card><Stat label="Distance" value={formatDistance(polylineLength(line))} /></Card>
            <Card><Stat label="Points" value={points.length} /></Card>
          </div>
          <RouteMap className="h-72" lines={[{ id: "rec", coords, color: "#ffd21f", width: 4 }]} follow />
        </>
      )}
      {phase === "ready" ? (
        <Button variant="primary" size="xl" className="w-full" onClick={() => void start()}>Record</Button>
      ) : (
        <Button variant="danger" size="xl" className="w-full" onClick={stop}>Stop recording</Button>
      )}
    </div>
  );
}
