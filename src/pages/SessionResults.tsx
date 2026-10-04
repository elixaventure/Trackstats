import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, LinkButton } from "@/components/Button";
import { Card, SectionTitle } from "@/components/Card";
import { LapChart } from "@/components/charts/LapChart";
import { Delta } from "@/components/Delta";
import { Icon } from "@/components/Icon";
import { RouteMap } from "@/components/map/RouteMap";
import { PageHeader } from "@/components/PageHeader";
import { Stat } from "@/components/Stat";
import { EmptyState } from "@/components/States";
import { activeAssignment, deleteSession, releaseTransponder } from "@/data/actions";
import { bikeLabel, sessionLaps } from "@/data/selectors";
import { consistencyScore } from "@/domain/stats";
import { formatDateTime, formatDistance, formatDuration, formatLap } from "@/domain/time";
import { CONDITION_LABEL, RIDE_TYPE_LABEL, type TimingSource } from "@/domain/types";
import { useDb } from "@/hooks/useDb";
import { useGps } from "@/hooks/useGps";
import { VideoSync } from "@/components/video/VideoSync";
import type { GpsPoint } from "@/domain/types";
import { KIND_LABEL } from "@/import/types";

const SOURCE_NOTE: Record<TimingSource, string> = {
  transponder: "Laps timed by transponder (hardware timestamps).",
  gps: "Laps timed by GPS gate crossings — typically within ±0.5–1 s.",
  manual: "Laps marked by hand — accuracy depends on your thumb.",
};

export default function SessionResults() {
  const { id = "" } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const session = db.sessions[id];
  const laps = useMemo(() => (session ? sessionLaps(db, session.id) : []), [db, session]);
  const gps = useGps(session?.hasGps ? session.id : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [riderAt, setRiderAt] = useState<GpsPoint | null>(null);
  const onPosition = useCallback((p: GpsPoint | null) => setRiderAt(p), []);
  const routePoly = session?.routeId ? db.routes[session.routeId]?.polyline : undefined;
  const mapLines = useMemo(() => [
    ...(routePoly ? [{ id: "route", coords: routePoly.map((p) => [p[0], p[1]] as [number, number]), color: "#8c968f", width: 6, opacity: 0.35 }] : []),
    { id: "trace", coords: gps.points.map((p) => [p.lng, p.lat] as [number, number]), color: "#ffd21f", width: 2.5, opacity: 0.85 },
  ], [routePoly, gps.points]);
  const mapMarkers = useMemo(() => (riderAt ? [{ id: "rider", lngLat: [riderAt.lng, riderAt.lat] as [number, number], label: "You", color: "#ffffff" }] : []), [riderAt]);

  if (!session) return <EmptyState title="Session not found" action={<LinkButton to="/sessions">All sessions</LinkButton>} />;
  const s = session.summary;
  const route = session.routeId ? db.routes[session.routeId] : null;
  const rider = db.riders[session.riderId];
  const tag = session.transponderId ? db.transponders[session.transponderId] : null;
  const stillHolding = tag && activeAssignment(db, tag.id)?.riderId === session.riderId;
  const gain = s?.isPb && s.previousPbMs != null && s.fastestLapMs != null ? s.fastestLapMs - s.previousPbMs : null;
  const source = laps[0]?.source;
  const score = consistencyScore(laps);
  const best = s?.fastestLapMs ?? null;

  return (
    <div className="space-y-5">
      <PageHeader back="/sessions" eyebrow={`${formatDateTime(session.startedAt)} · ${CONDITION_LABEL[session.condition]}`}
        title={route?.name ?? RIDE_TYPE_LABEL[session.rideType]} />
      <p className="-mt-3 text-muted">{rider?.name} · {bikeLabel(db, session.bikeId)}{tag ? ` · Tag ${tag.code}` : ""}</p>

      {session.simulated && (
        <p className="rounded-xl border border-dashed border-warn/50 p-3 text-sm text-warn">Recorded with the simulator. It's kept off leaderboards; delete it if you don't want it in your progress.</p>
      )}

      {s?.isPb && best != null && (
        <Card className="border-plate bg-plate/10">
          <div className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-plate">{gain != null ? "New personal best" : "First timed session here"}</div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="font-mono text-6xl font-bold tnum">{formatLap(best)}</div>
              {gain != null && <Delta ms={gain} className="text-2xl" />}
              {gain != null && s.previousPbMs && <span className="ml-2 text-muted">{((-gain / s.previousPbMs) * 100).toFixed(1)}% faster</span>}
            </div>
            <LinkButton to={`/sessions/${session.id}/share`} variant="primary" size="lg"><Icon name="share" /> Share</LinkButton>
          </div>
        </Card>
      )}

      {stillHolding && tag.ownership === "shared" && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p>{rider?.name.split(" ")[0]} still has <strong>{tag.nickname}</strong>. Release it so someone else can ride with it.</p>
          <Button variant="primary" onClick={() => void releaseTransponder(tag.id)}>Release {tag.code}</Button>
        </Card>
      )}

      {s ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card><Stat label="Fastest lap" value={formatLap(s.fastestLapMs)} tone={s.isPb ? "plate" : "default"} /></Card>
          <Card><Stat label="Average lap" value={formatLap(s.averageLapMs)} /></Card>
          <Card><Stat label="Laps" value={s.lapCount} sub={laps.some((l) => !l.valid) ? `${laps.filter((l) => !l.valid).length} excluded` : undefined} /></Card>
          <Card><Stat label="Duration" value={formatDuration(s.durationMs)} /></Card>
          <Card><Stat label="Consistency" value={s.consistencySdMs != null ? `±${(s.consistencySdMs / 1000).toFixed(2)}s` : "—"} sub={score != null ? `Score ${score}/100` : "Needs 2+ laps"} /></Card>
          <Card><Stat label="Previous PB" value={formatLap(s.previousPbMs)} sub={gain != null ? <Delta ms={gain} /> : s.previousPbMs != null && best != null ? <>Off by <Delta ms={best - s.previousPbMs} /></> : undefined} /></Card>
          <Card><Stat label="Distance" value={formatDistance(s.distanceM)} /></Card>
          <Card><Stat label="Top speed" value={s.topSpeedKph != null ? `${s.topSpeedKph} km/h` : "—"} sub={s.elevationGainM != null ? `${s.elevationGainM} m climbed` : undefined} /></Card>
        </div>
      ) : <p className="text-muted">This session hasn't finished.</p>}

      <Card>
        <SectionTitle>Laps</SectionTitle>
        <LapChart laps={laps} pbMs={s?.previousPbMs ?? null} />
        {source && <p className="mt-2 text-sm text-muted">{SOURCE_NOTE[source]} Excluded laps (crashes, stops) don't count towards PBs or averages.</p>}
        <ol className="mt-3 divide-y divide-line">
          {laps.map((l) => (
            <li key={l.id} className="flex min-h-12 items-center gap-3 py-1 font-mono tnum">
              <span className="w-10 text-muted">L{l.lapNumber}</span>
              <span className={`text-lg font-bold ${l.durationMs === best ? "text-plate" : l.valid ? "" : "text-muted line-through"}`}>{formatLap(l.durationMs)}</span>
              {best != null && l.valid && l.durationMs !== best && <span className="text-sm text-muted">+{((l.durationMs - best) / 1000).toFixed(2)}</span>}
              {!l.valid && <span className="text-xs uppercase text-muted">excluded</span>}
              {l.splitsMs.length > 0 && <span className="ml-auto hidden text-sm text-muted sm:inline">{l.splitsMs.map((x) => formatLap(x)).join(" · ")}</span>}
            </li>
          ))}
        </ol>
      </Card>

      {session.hasGps && (
        <Card>
          <SectionTitle action={route && <Link to={`/routes/${route.id}?session=${session.id}`} className="text-sm font-semibold text-plate">Section analysis →</Link>}>GPS trace</SectionTitle>
          {gps.loading ? <div className="h-72 animate-pulse rounded-2xl bg-surface-2" /> : gps.points.length > 1 ? (
            <RouteMap className="h-72 md:h-96" lines={mapLines} markers={mapMarkers} />
          ) : <p className="text-muted">No usable GPS points were recorded.</p>}
          {route && <p className="mt-2 text-sm text-muted">Compare where you gained and lost time against your PB or previous ride in section analysis.</p>}
          {session.importInfo && (
            <p className="mt-2 text-sm text-muted">Imported from {KIND_LABEL[session.importInfo.kind]}{session.importInfo.device ? ` (${session.importInfo.device})` : ""} · {session.importInfo.rateHz} GPS fixes/second · {session.importInfo.fileNames.join(", ")}</p>
          )}
          {session.importInfo?.videos.length ? <div className="mt-4"><VideoSync videos={session.importInfo.videos} points={gps.points} onPosition={onPosition} /></div> : null}
        </Card>
      )}

      {session.notes && <Card><SectionTitle>Notes</SectionTitle><p className="whitespace-pre-wrap">{session.notes}</p></Card>}

      <div className="flex flex-wrap gap-3">
        {best != null && <LinkButton to={`/sessions/${session.id}/share`}><Icon name="share" /> Share card</LinkButton>}
        {confirmDelete ? (
          <>
            <Button variant="danger" onClick={() => { void deleteSession(session.id).then(() => navigate("/sessions", { replace: true })); }}>Delete permanently</Button>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </>
        ) : <Button variant="ghost" className="text-muted" onClick={() => setConfirmDelete(true)}><Icon name="trash" /> Delete session</Button>}
      </div>
    </div>
  );
}
