import { useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { Card, SectionTitle } from "@/components/Card";
import { SelectField, TextArea } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { RouteMap } from "@/components/map/RouteMap";
import { PageHeader } from "@/components/PageHeader";
import { RouteReview } from "@/components/route/RouteReview";
import { Segmented } from "@/components/Segmented";
import { ErrorNote, Loading } from "@/components/States";
import { saveGps } from "@/data/persist";
import { activeRider, myRiders, riderBikes, routePb, visibleRoutes } from "@/data/selectors";
import { store } from "@/data/store";
import { formatDateTime, formatDuration, formatLap } from "@/domain/time";
import { CONDITION_LABEL, type TrackCondition } from "@/domain/types";
import { useDb } from "@/hooks/useDb";
import { ACCEPT, importFiles } from "@/import";
import { buildImportedSession, firstLoop, matchRoutes } from "@/import/toSession";
import { KIND_LABEL, type ImportedTrack } from "@/import/types";
import { rememberVideo } from "@/lib/videoFiles";
import { outbox } from "@/sync/outbox";

export default function Import() {
  const db = useDb();
  const navigate = useNavigate();
  const inputId = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [tracks, setTracks] = useState<ImportedTrack[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = [...list];
    files.filter((f) => /\.mp4$/i.test(f.name)).forEach(rememberVideo);
    setErrors([]); setTracks([]); setChosen(null);
    setBusy("Reading files…");
    const r = await importFiles(files, setBusy);
    setBusy(null);
    setErrors(r.errors);
    const sorted = r.tracks.sort((a, b) => (b.points[0]?.t ?? 0) - (a.points[0]?.t ?? 0));
    setTracks(sorted);
    if (sorted.length === 1) setChosen(0);
  };

  const track = chosen != null ? tracks[chosen] ?? null : null;

  return (
    <div className="space-y-5">
      <PageHeader back="/" title="Import a ride" />
      {!track && (
        <>
          <Card className="space-y-3">
            <p>Already recorded your ride? Bring it in and see where you're gaining and losing time.</p>
            <ul className="space-y-1.5 text-sm text-muted">
              <li><strong className="text-ink">GoPro</strong> (HERO5–11, HERO13, MAX): select the .MP4 files. Long rides are split into chapters, so select them all. GPS must be on in the camera. The HERO12 has no GPS.</li>
              <li><strong className="text-ink">Garmin</strong>: Garmin Connect → activity → ⚙ → Export Original (.zip) or Export to GPX/TCX.</li>
              <li><strong className="text-ink">Strava</strong>: activity → ⋯ → Export GPX.</li>
              <li><strong className="text-ink">Apple Watch</strong>: export the workout as GPX with an app such as HealthFit or RunGap.</li>
            </ul>
            <p className="text-xs text-muted">Videos are read on this device. Only the GPS track is saved; the footage is never uploaded.</p>
          </Card>
          <label htmlFor={inputId} className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-plate/60 bg-plate/5 p-6 text-center">
            <Icon name="download" className="size-8 text-plate" />
            <span className="font-display text-2xl font-extrabold uppercase">Choose files</span>
            <span className="text-sm text-muted">GoPro .MP4 · .gpx · .fit · .tcx · Garmin .zip</span>
          </label>
          <input id={inputId} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => void onFiles(e.target.files)} />
        </>
      )}
      {busy && <Loading label={busy.replace(/…$/, "")} />}
      {errors.map((e) => <ErrorNote key={e} title="Couldn't read a file">{e}</ErrorNote>)}

      {!track && tracks.length > 1 && (
        <Card>
          <SectionTitle>Which ride?</SectionTitle>
          <div className="space-y-1">
            {tracks.map((t, i) => (
              <button key={i} type="button" onClick={() => setChosen(i)} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-2 text-left hover:bg-surface-2">
                <span className="min-w-0"><span className="block truncate font-semibold">{t.fileNames.join(", ")}</span>
                  <span className="text-sm text-muted">{t.points.length ? `${formatDateTime(t.points[0]!.t)} · ${formatDuration(t.points[t.points.length - 1]!.t - t.points[0]!.t)}` : "No GPS"}</span></span>
                <Icon name="chevron" className="size-5 text-muted" />
              </button>
            ))}
          </div>
        </Card>
      )}

      {track && <TrackSetup key={chosen} track={track} db={db} onBack={() => { setChosen(null); if (tracks.length <= 1) setTracks([]); }}
        onSaved={(sessionId, routeId) => navigate(routeId ? `/routes/${routeId}?session=${sessionId}` : `/sessions/${sessionId}`, { replace: true })} />}
    </div>
  );
}

function TrackSetup({ track, db, onBack, onSaved }: { track: ImportedTrack; db: ReturnType<typeof useDb>; onBack: () => void; onSaved: (sessionId: string, routeId: string | null) => void }) {
  const routes = visibleRoutes(db);
  const matches = useMemo(() => matchRoutes(routes, track.points), [routes, track.points]);
  const [routeId, setRouteId] = useState<string>(matches[0]?.route.id ?? "");
  const [makingRoute, setMakingRoute] = useState(false);
  const rider = activeRider(db)!;
  const [riderId, setRiderId] = useState(rider.id);
  const bikes = riderBikes(db, riderId);
  const [bikeId, setBikeId] = useState(db.riders[riderId]?.defaultBikeId ?? bikes[0]?.id ?? "");
  const [condition, setCondition] = useState<TrackCondition>("dry");
  const [notes, setNotes] = useState("");
  const route = db.routes[routeId] ?? null;

  const plan = useMemo(() => {
    if (!track.points.length) return null;
    const pb = route ? routePb(db, riderId, route, track.points[0]!.t)?.ms ?? null : null;
    return buildImportedSession({ track, route, riderId, bikeId: bikeId || null, condition, notes, previousPbMs: pb });
  }, [track, route, db, riderId, bikeId, condition, notes]);

  if (!track.points.length) {
    return (
      <Card className="space-y-3">
        {track.warnings.map((w) => <p key={w} className="text-warn">{w}</p>)}
        <Button onClick={onBack}>Choose other files</Button>
      </Card>
    );
  }

  if (makingRoute) {
    return (
      <div className="space-y-3">
        <p className="text-muted">We've picked out what looks like one lap. Check the start/finish line, name it, and save. Your import continues afterwards.</p>
        <RouteReview raw={firstLoop(track.points)} onDiscard={() => setMakingRoute(false)} onSaved={(id) => { setRouteId(id); setMakingRoute(false); }} />
      </div>
    );
  }

  const first = track.points[0]!, last = track.points[track.points.length - 1]!;
  const s = plan!.session.summary!;
  const exists = Boolean(db.sessions[plan!.session.id]);

  const save = async () => {
    const p = plan!;
    store.upsert("sessions", [p.session]);
    store.upsert("timingEvents", p.events);
    store.upsert("laps", p.laps);
    await saveGps(p.session.id, p.points);
    if (!store.getState().settings.demoMode) outbox.enqueue([{ table: "gps_points", kind: "upsert", key: p.session.id }]);
    await store.flush();
    onSaved(p.session.id, route?.id ?? null);
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-2">
        <SectionTitle>{KIND_LABEL[track.kind]}</SectionTitle>
        <p className="font-semibold">{formatDateTime(first.t)} · {formatDuration(last.t - first.t)}</p>
        <p className="text-sm text-muted">{track.device ?? "Unknown device"} · {track.points.length.toLocaleString()} GPS points · {track.rateHz >= 5 ? `${Math.round(track.rateHz)} per second (corner-level detail)` : "about 1 per second (bigger differences only)"}</p>
        <p className="truncate text-xs text-muted">{track.fileNames.join(", ")}</p>
        {track.warnings.map((w) => <p key={w} className="text-sm text-warn">{w}</p>)}
      </Card>

      <RouteMap className="h-64" lines={[
        ...(route ? [{ id: "route", coords: route.polyline.map((p) => [p[0], p[1]] as [number, number]), color: "#8c968f", width: 7, opacity: 0.35 }] : []),
        { id: "trace", coords: track.points.map((p) => [p.lng, p.lat] as [number, number]), color: "#ffd21f", width: 2, opacity: 0.8 },
      ]} />

      <Card className="space-y-3">
        <SelectField label="Route" value={routeId} onChange={(e) => setRouteId(e.target.value)}
          hint={matches.length ? `Matched by where you rode (${Math.round((matches.find((m) => m.route.id === routeId)?.fraction ?? 0) * 100)}% of the ride is on this route).` : "This ride doesn't match any saved route."}>
          <option value="">No route (free ride, no laps)</option>
          {(matches.length ? matches.map((m) => m.route) : routes).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </SelectField>
        {!matches.length && <Button onClick={() => setMakingRoute(true)}><Icon name="plus" /> Create a route from this ride</Button>}
        {route && (
          <p className={plan!.laps.length ? "" : "text-warn"}>
            {plan!.laps.length
              ? <>Found <strong>{plan!.laps.length} laps</strong> · fastest <strong className="font-mono text-plate">{formatLap(s.fastestLapMs)}</strong>{s.isPb && s.previousPbMs != null ? " · new PB" : ""}</>
              : "No full laps found: the ride never crossed the start/finish line twice."}
          </p>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Rider" value={riderId} onChange={(e) => { setRiderId(e.target.value); setBikeId(db.riders[e.target.value]?.defaultBikeId ?? ""); }}>
          {myRiders(db).map((r) => <option key={r.id} value={r.id}>{r.name || "Unnamed rider"}</option>)}
        </SelectField>
        <SelectField label="Bike" value={bikeId} onChange={(e) => setBikeId(e.target.value)}>
          <option value="">No bike</option>
          {bikes.map((b) => <option key={b.id} value={b.id}>{b.manufacturer} {b.model}</option>)}
        </SelectField>
      </div>
      <Segmented label="Track conditions" columns={5} value={condition} onChange={setCondition}
        options={(Object.keys(CONDITION_LABEL) as TrackCondition[]).map((c) => ({ value: c, label: CONDITION_LABEL[c] }))} />
      <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {exists && <p className="text-sm text-warn">This ride has already been imported. Saving again updates it.</p>}
      <Button variant="primary" size="xl" className="w-full" onClick={() => void save()}>{route && plan!.laps.length ? "Save & see where I gained time" : "Save ride"}</Button>
      <Button variant="ghost" className="w-full text-muted" onClick={onBack}>Choose other files</Button>
    </div>
  );
}
