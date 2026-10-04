import { useEffect, useRef, useState } from "react";
import { Toggle } from "@/components/Field";
import { LinkButton } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { RouteMap } from "@/components/map/RouteMap";
import { PageHeader } from "@/components/PageHeader";
import { RouteReview } from "@/components/route/RouteReview";
import { Stat } from "@/components/Stat";
import { StatusChip } from "@/components/StatusChip";
import { ErrorNote } from "@/components/States";
import { kvDel, kvGet, kvSet } from "@/data/persist";
import { gpsToLine, lapClosed, polylineLength } from "@/domain/geo";
import { formatClock, formatDistance } from "@/domain/time";
import type { GpsPoint } from "@/domain/types";
import { useDb } from "@/hooks/useDb";
import { useNow } from "@/hooks/useNow";
import { useWakeLock } from "@/hooks/useWakeLock";
import { createLocationProvider, type LocationProvider } from "@/location";
import { GpsSampler } from "@/location/sampler";

type Phase = "ready" | "recording" | "review" | "saved";
const DRAFT_KEY = "route-recording";

export default function RecordRoute() {
  const db = useDb();
  const [phase, setPhase] = useState<Phase>("ready");
  const [points, setPoints] = useState<GpsPoint[]>([]);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  /** Stop by itself when the rider gets back to where they started (one lap). */
  const [autoStop, setAutoStop] = useState(true);
  const [closedAuto, setClosedAuto] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
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
      (kind, msg) => {
        setError(msg);
        // Blocked or unsupported won't fix itself: stop "recording" nothing and let them retry.
        if (kind === "denied" || kind === "unsupported") { provider.current?.stop(); provider.current = null; setPhase("ready"); }
      },
    );
  };

  const stop = (auto = false) => {
    setClosedAuto(auto);
    provider.current?.stop();
    provider.current = null;
    void kvSet(DRAFT_KEY, points);
    if (points.length < 10) { setError("Too few GPS points to make a route. Record for longer, outdoors with a clear view of the sky."); setPhase("ready"); return; }
    setPhase("review");
  };

  // One lap done? Finish without the rider touching the phone.
  useEffect(() => {
    if (phase !== "recording" || !autoStop || !lapClosed(points)) return;
    navigator.vibrate?.([200, 100, 200]);
    stop(true);
  }, [points]); // eslint-disable-line react-hooks/exhaustive-deps

  const discard = () => { void kvDel(DRAFT_KEY); setPoints([]); setPhase("ready"); };
  const line = gpsToLine(points);
  const coords = line.map((p) => [p[0], p[1]] as [number, number]);

  if (phase === "review") {
    return (
      <div className="space-y-5">
        <PageHeader back="/routes" title="Save track" />
        {closedAuto && <p className="rounded-xl border border-faster/40 bg-faster/10 p-3 text-faster">Lap complete: you got back to the start, so recording stopped by itself.</p>}
        <RouteReview raw={line} onDiscard={discard} onSaved={(id) => { void kvDel(DRAFT_KEY); setSavedId(id); setPhase("saved"); }} />
      </div>
    );
  }

  if (phase === "saved" && savedId) {
    const r = db.routes[savedId];
    return (
      <div className="space-y-5">
        <PageHeader back="/routes" title="Track saved" />
        <Card className="space-y-2">
          <p className="font-display text-3xl font-black uppercase leading-none">{r?.name}</p>
          <p className="text-muted">{r ? formatDistance(r.distanceM) : ""} · the start/finish line is where you started recording.</p>
        </Card>
        <LinkButton to={`/ride?route=${savedId}`} variant="primary" size="xl" className="w-full"><Icon name="ride" className="size-8" /> Ride this track now</LinkButton>
        <LinkButton to={`/routes/${savedId}`} size="lg" className="w-full">View track</LinkButton>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader back="/routes" title="Map a track" />
      {phase === "ready" && (
        <Card className="space-y-3">
          <p>Ride one lap with your phone on you. Where you press <strong>Record</strong> becomes the start/finish line; for a stage, stop at the finish.</p>
          <p className="text-sm">Start on a straight if you can, not in a corner: you're faster there and everyone crosses the line the same way, so lap times are more accurate.</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Wait for the GPS chip to show ±10 m or better before you set off.</li>
            <li>Keep the screen on (don't press the lock button): browsers pause GPS when the phone locks. A zipped chest or jacket pocket is fine.</li>
            <li>Phone GPS is accurate to a few metres; that's fine for routes and section analysis.</li>
            {db.settings.simulateGps && <li className="text-warn">Simulated GPS is on (Settings), so this records a simulated lap.</li>}
          </ul>
        </Card>
      )}
      {error && <ErrorNote title="GPS problem">{error.replace(/\.?$/, ".")}</ErrorNote>}
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
          {autoStop && <p className="text-sm text-muted">Recording stops by itself when you get back to where you started.</p>}
        </>
      )}
      {phase === "ready" && (
        <Toggle label="Stop when I'm back at the start" description="For a loop: recording ends by itself after one lap. Turn off for a point-to-point stage." checked={autoStop} onChange={setAutoStop} />
      )}
      {phase === "ready" ? (
        <Button variant="primary" size="xl" className="w-full" onClick={() => void start()}>Record</Button>
      ) : (
        <Button variant="danger" size="xl" className="w-full" onClick={() => stop()}>Stop recording</Button>
      )}
    </div>
  );
}
