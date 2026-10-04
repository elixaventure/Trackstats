import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { SectionTable, VERDICT_COLOR } from "@/components/analysis/SectionTable";
import { useSectionAnalysis } from "@/components/analysis/useSectionAnalysis";
import { Button, LinkButton } from "@/components/Button";
import { Card, SectionTitle } from "@/components/Card";
import { Delta } from "@/components/Delta";
import { SelectField, TextField } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { RouteMap, type MapLine } from "@/components/map/RouteMap";
import { PageHeader } from "@/components/PageHeader";
import { Segmented } from "@/components/Segmented";
import { Stat } from "@/components/Stat";
import { EmptyState } from "@/components/States";
import { saveRoute } from "@/data/actions";
import { activeRider, sessionLaps } from "@/data/selectors";
import { buildGeometry, pointAtDistance } from "@/domain/geo";
import { formatDate, formatDistance, formatLap } from "@/domain/time";
import { CONDITION_LABEL, RIDE_TYPE_LABEL } from "@/domain/types";
import { useDb } from "@/hooks/useDb";
import { useGps } from "@/hooks/useGps";

type RefKind = "pb" | "previous" | "selected";

export default function RouteDetail() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const db = useDb();
  const rider = activeRider(db)!;
  const route = db.routes[id] ?? null;
  const [refKind, setRefKind] = useState<RefKind>("pb");
  const [selectedRefId, setSelectedRefId] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(route?.name ?? "");

  const rides = useMemo(() => Object.values(db.sessions)
    .filter((s) => s.routeId === id && s.riderId === rider.id && s.status === "completed" && s.routeConfigVersion === route?.configVersion && s.summary?.fastestLapMs != null)
    .sort((a, b) => b.startedAt - a.startedAt), [db.sessions, id, rider.id, route?.configVersion]);
  const curId = params.get("session") && rides.some((r) => r.id === params.get("session")) ? params.get("session")! : rides[0]?.id ?? null;
  const cur = rides.find((r) => r.id === curId) ?? null;
  const others = rides.filter((r) => r.id !== curId && r.hasGps);
  const refSession =
    refKind === "pb" ? [...others].sort((a, b) => a.summary!.fastestLapMs! - b.summary!.fastestLapMs!)[0] ?? null
    : refKind === "previous" ? others.find((r) => cur && r.startedAt < cur.startedAt) ?? null
    : others.find((r) => r.id === selectedRefId) ?? null;
  const curHoldsPb = cur && refSession && refKind === "pb" && cur.summary!.fastestLapMs! < refSession.summary!.fastestLapMs!;

  const curGps = useGps(cur?.hasGps ? cur.id : null);
  const refGps = useGps(refSession?.id ?? null);
  const curLaps = useMemo(() => (cur ? sessionLaps(db, cur.id) : []), [db, cur]);
  const refLaps = useMemo(() => (refSession ? sessionLaps(db, refSession.id) : []), [db, refSession]);
  const curData = useMemo(() => ({ laps: curLaps, points: curGps.points }), [curLaps, curGps.points]);
  const refData = useMemo(() => (refSession ? { laps: refLaps, points: refGps.points } : null), [refSession, refLaps, refGps.points]);
  const analysis = useSectionAnalysis(route, curData, refData);

  const lines = useMemo<MapLine[]>(() => {
    if (!route) return [];
    const base: MapLine = { id: "route", coords: route.polyline.map((p) => [p[0], p[1]]), color: "#8c968f", width: 7, opacity: 0.3 };
    if (!analysis.sections.length) return [{ ...base, color: "#ffd21f", opacity: 0.9, width: 4 }];
    return [base, ...analysis.sections.map((s, i) => ({ id: `s${i}`, coords: s.coords, color: VERDICT_COLOR[s.verdict], width: 6 }))];
  }, [route, analysis.sections]);
  const markers = useMemo(() => {
    if (!route || route.polyline.length < 2) return [];
    const g = buildGeometry(route.polyline);
    return [
      ...route.gates.map((gate, i) => ({ id: `g${i}`, lngLat: pointAtDistance(g, gate.distanceM).lngLat, label: gate.role, color: "#ffd21f" })),
      ...route.sectors.slice(0, -1).map((s) => ({ id: s.id, lngLat: pointAtDistance(g, s.endDistanceM).lngLat, label: s.name, color: "#f3f5ef" })),
    ];
  }, [route]);

  if (!route) return <EmptyState title="Route not found" action={<LinkButton to="/routes">All routes</LinkButton>} />;
  const mine = route.createdByUserId === db.user.id;
  const gained = analysis.sections.filter((s) => s.verdict === "faster").reduce((a, s) => a + (s.deltaMs ?? 0), 0);
  const lost = analysis.sections.filter((s) => s.verdict === "slower").reduce((a, s) => a + (s.deltaMs ?? 0), 0);
  const refLabel = refKind === "pb" ? (curHoldsPb ? "Next best" : "PB") : refKind === "previous" ? "Previous" : "Selected";

  return (
    <div className="space-y-5">
      <PageHeader back="/routes" eyebrow={`${RIDE_TYPE_LABEL[route.routeType]} · ${formatDistance(route.distanceM)}${route.elevationGainM ? ` · ↑${route.elevationGainM} m` : ""}`} title={route.name} />

      {renaming ? (
        <Card className="space-y-3">
          <TextField label="Route name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => { if (name.trim()) saveRoute({ ...route, name: name.trim() }); setRenaming(false); }}>Save</Button>
            <Button onClick={() => setRenaming(false)}>Cancel</Button>
          </div>
        </Card>
      ) : (
        <div className="-mt-2 flex flex-wrap gap-2">
          {mine && <Button onClick={() => { setName(route.name); setRenaming(true); }}><Icon name="edit" className="size-5" /> Rename</Button>}
          {mine && (
            <Button onClick={() => saveRoute({ ...route, visibility: route.visibility === "public" ? "private" : "public" })}>
              {route.visibility === "public" ? "Public · make private" : "Private · make public"}
            </Button>
          )}
          <LinkButton to={`/leaderboards?route=${route.id}`}><Icon name="trophy" className="size-5" /> Leaderboard</LinkButton>
        </div>
      )}

      <RouteMap className="h-72 md:h-[28rem]" lines={lines} markers={markers} />
      {analysis.sections.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm text-muted" aria-label="Map legend">
          {(["faster", "equal", "slower", "unknown"] as const).map((v) => (
            <span key={v} className="flex items-center gap-2"><span className="h-1.5 w-6 rounded-full" style={{ background: VERDICT_COLOR[v] }} />{v === "unknown" ? "No GPS" : v[0]!.toUpperCase() + v.slice(1)}</span>
          ))}
        </div>
      )}

      {!rides.length ? (
        <EmptyState title="No rides here yet" action={<LinkButton to="/ride" variant="primary">Ride this route</LinkButton>}>Once you've ridden it twice with GPS on, this screen shows where you gain and lose time.</EmptyState>
      ) : (
        <Card className="space-y-4">
          <SectionTitle>Where you gained and lost time</SectionTitle>
          <SelectField label="Analyse ride" value={curId ?? ""} onChange={(e) => setParams({ session: e.target.value }, { replace: true })}>
            {rides.map((r) => <option key={r.id} value={r.id}>{formatDate(r.startedAt)} · {formatLap(r.summary!.fastestLapMs)} · {CONDITION_LABEL[r.condition]}</option>)}
          </SelectField>
          <Segmented label="Compare against" columns={3} value={refKind} onChange={setRefKind}
            options={[{ value: "pb", label: "Personal best" }, { value: "previous", label: "Previous ride" }, { value: "selected", label: "Choose ride" }]} />
          {refKind === "selected" && (
            <SelectField label="Reference ride" value={selectedRefId} onChange={(e) => setSelectedRefId(e.target.value)}>
              <option value="">Choose…</option>
              {others.map((r) => <option key={r.id} value={r.id}>{formatDate(r.startedAt)} · {formatLap(r.summary!.fastestLapMs)}</option>)}
            </SelectField>
          )}
          {curHoldsPb && <p className="text-sm text-plate">This ride holds your PB, so it's compared with your next-best ride.</p>}

          {!cur?.hasGps ? <p className="text-muted">This ride has no GPS trace, so sections can't be compared.</p>
            : !refSession ? <p className="text-muted">{refKind === "previous" ? "No earlier ride with GPS to compare with." : refKind === "selected" ? "Pick a ride to compare with." : "Ride this route again to compare."}</p>
            : curGps.loading || refGps.loading ? <div className="h-40 animate-pulse rounded-xl bg-surface-2" />
            : !analysis.curLap ? <p className="text-muted">Not enough GPS coverage on this ride's laps to analyse sections.</p>
            : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Stat label="Lap compared" value={formatLap(analysis.curLap.durationMs)} sub={`vs ${formatLap(analysis.refLap?.durationMs)}`} />
                  <Stat label="Gained" value={gained ? <Delta ms={gained} unit={false} /> : "—"} />
                  <Stat label="Lost" value={lost ? <Delta ms={lost} unit={false} /> : "—"} />
                </div>
                <SectionTable sections={analysis.sections} refLabel={refLabel} />
              </>
            )}
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
            Section times come from phone GPS (±3–10 m, one fix a second), so each comes with an uncertainty and differences inside it show as “about equal”.
            Whole-lap times come from your timing source{cur?.transponderId ? " (transponder)" : ""} and aren't affected.
          </p>
        </Card>
      )}

      <Card>
        <SectionTitle>Timing set-up</SectionTitle>
        <ul className="space-y-1 text-sm">
          {route.gates.map((g, i) => <li key={i}><span className="font-semibold capitalize">{g.role.replace("_", "/")}</span> gate at {Math.round(g.distanceM)} m (±{g.halfWidthM} m wide)</li>)}
          {route.sectors.map((s) => <li key={s.id}><span className="font-semibold">{s.name}</span> ends at {s.endDistanceM} m</li>)}
        </ul>
        <p className="mt-2 text-xs text-muted">Configuration v{route.configVersion}. Laps are only compared with laps recorded on the same configuration.</p>
      </Card>
    </div>
  );
}
