import { useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Card, SectionTitle } from "@/components/Card";
import { TextField, Toggle } from "@/components/Field";
import { RouteMap } from "@/components/map/RouteMap";
import { Segmented } from "@/components/Segmented";
import { saveRoute } from "@/data/actions";
import { store } from "@/data/store";
import { buildGeometry, elevationGain, haversineM, pointAtDistance, rotateLoop, simplify, subLine } from "@/domain/geo";
import { formatDistance } from "@/domain/time";
import { RIDE_TYPE_LABEL, isLoopType, type LngLatAlt, type RideType, type Route, type TimingGate } from "@/domain/types";
import { uuid } from "@/lib/id";

interface DraftSector { id: string; name: string; atM: number }

/** Name the recorded line, set start/finish and optional sectors, then save it as a route. */
export function RouteReview({ raw, onDiscard, onSaved }: { raw: LngLatAlt[]; onDiscard: () => void; onSaved: (id: string) => void }) {
  const simplified = useMemo(() => simplify(raw, 2), [raw]);
  const g = useMemo(() => buildGeometry(simplified), [simplified]);
  const gap = useMemo(() => {
    const a = simplified[0], b = simplified[simplified.length - 1];
    return a && b ? haversineM(a[1], a[0], b[1], b[0]) : Infinity;
  }, [simplified]);

  const [name, setName] = useState("");
  const [type, setType] = useState<RideType>(gap < 40 ? "mx_circuit" : "point_to_point");
  const [startM, setStartM] = useState(0);
  const [finishM, setFinishM] = useState(g.length);
  const [sectors, setSectors] = useState<DraftSector[]>([]);
  const [sectorAt, setSectorAt] = useState(Math.round(g.length / 2));
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loop = isLoopType(type);

  // Distances measured on the final route (after moving the start line).
  const rel = (atM: number) => (loop ? (atM - startM + g.length) % g.length : atM - startM);
  const finalLine = useMemo(() => (loop ? rotateLoop(g, startM) : subLine(g, startM, Math.max(startM + 20, finishM))), [g, loop, startM, finishM]);
  const finalLength = loop ? g.length : Math.max(20, finishM - startM);

  const markers = [
    { id: "start", lngLat: pointAtDistance(g, startM).lngLat, label: "Start", color: "#3ddc84" },
    ...(loop ? [] : [{ id: "finish", lngLat: pointAtDistance(g, finishM).lngLat, label: "Finish", color: "#ff6157" }]),
    ...sectors.map((s) => ({ id: s.id, lngLat: pointAtDistance(g, s.atM).lngLat, label: s.name, color: "#f3f5ef" })),
  ];

  const save = () => {
    if (!name.trim()) return setError("Give the route a name.");
    const valid = sectors.map((s) => ({ ...s, rel: rel(s.atM) })).filter((s) => s.rel > 10 && s.rel < finalLength - 10).sort((a, b) => a.rel - b.rel);
    const gates: TimingGate[] = loop
      ? [{ role: "start_finish", distanceM: 0, halfWidthM: 20 }]
      : [{ role: "start", distanceM: 0, halfWidthM: 20 }, { role: "finish", distanceM: Math.round(finalLength), halfWidthM: 20 }];
    const routeSectors = valid.length
      ? [...valid.map((s) => ({ id: s.id, name: s.name, endDistanceM: Math.round(s.rel) })), { id: uuid(), name: "To finish", endDistanceM: Math.round(finalLength) }]
      : [];
    const r: Route = {
      id: uuid(), name: name.trim(), routeType: type, isLoop: loop, createdByUserId: store.getState().user.id,
      visibility: isPublic ? "public" : "private", polyline: loop ? [...finalLine, finalLine[0]!] : finalLine,
      distanceM: Math.round(finalLength), elevationGainM: elevationGain(finalLine.map((p) => p[2])), gates, sectors: routeSectors,
      configVersion: 1, location: null, createdAt: Date.now(), favourite: false,
    };
    saveRoute(r);
    onSaved(r.id);
  };

  return (
    <div className="space-y-5">
      <RouteMap className="h-72" lines={[
        { id: "raw", coords: simplified.map((p) => [p[0], p[1]]), color: "#8c968f", width: 6, opacity: 0.3 },
        { id: "final", coords: finalLine.map((p) => [p[0], p[1]]), color: "#ffd21f", width: 4 },
      ]} markers={markers} />
      <p className="text-sm text-muted">Recorded {formatDistance(g.length)}{gap < 40 ? " · ends near where it started (looks like a loop)" : ` · ends ${Math.round(gap)} m from the start`}.</p>

      <TextField label="Route name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Woodland Enduro Loop" />
      <Segmented label="Route type" value={type} onChange={setType}
        options={(["mx_circuit", "enduro_loop", "point_to_point", "sprint"] as RideType[]).map((t) => ({ value: t, label: RIDE_TYPE_LABEL[t] }))} />
      {loop && gap >= 40 && <p className="text-sm text-warn">This recording doesn't return to its start ({Math.round(gap)} m apart). The loop will be closed with a straight line.</p>}

      <Card className="space-y-4">
        <SectionTitle>{loop ? "Start/finish line" : "Start and finish"}</SectionTitle>
        <Slider label={loop ? "Start/finish position" : "Start"} value={startM} max={loop ? g.length : finishM - 20} onChange={setStartM} />
        {!loop && <Slider label="Finish" value={finishM} min={startM + 20} max={g.length} onChange={setFinishM} />}
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Sectors (optional)</SectionTitle>
        <p className="text-sm text-muted">Split the route into named sections, e.g. “Woodland Section”, for sector times and section analysis.</p>
        <Slider label="Sector split at" value={sectorAt} max={g.length} onChange={setSectorAt} />
        <Button onClick={() => setSectors([...sectors, { id: uuid(), name: `Sector ${sectors.length + 1}`, atM: sectorAt }])}>Add split here</Button>
        {sectors.map((s, i) => (
          <div key={s.id} className="flex items-end gap-2">
            <div className="flex-1"><TextField label={`Section ending at ${Math.round(rel(s.atM))} m`} value={s.name} onChange={(e) => setSectors(sectors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></div>
            <Button variant="ghost" aria-label={`Remove ${s.name}`} onClick={() => setSectors(sectors.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        ))}
      </Card>

      <Toggle label="Public route" description="Others can ride it and appear on its leaderboard. Your own laps stay private unless your profile is public." checked={isPublic} onChange={setIsPublic} />
      {error && <p role="alert" className="text-slower">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="primary" size="lg" className="flex-1" onClick={save}>Save route</Button>
        <Button variant="danger" size="lg" onClick={onDiscard}>Discard recording</Button>
      </div>
    </div>
  );
}

function Slider({ label, value, min = 0, max, onChange }: { label: string; value: number; min?: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between font-mono text-xs uppercase tracking-[0.12em] text-muted"><span>{label}</span><span className="text-ink">{Math.round(value)} m</span></span>
      <input type="range" min={Math.round(min)} max={Math.round(max)} value={Math.round(value)} onChange={(e) => onChange(Number(e.target.value))}
        className="h-12 w-full accent-[#ffd21f]" />
    </label>
  );
}
