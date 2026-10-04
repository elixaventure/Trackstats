import { useState } from "react";
import { Button } from "@/components/Button";
import { SelectField, TextArea, TextField, Toggle } from "@/components/Field";
import { Segmented } from "@/components/Segmented";
import { reportTrackChange } from "@/data/actions";
import { TRACK_CHANGE_LABEL, type Route, type TrackChange, type TrackChangeKind } from "@/domain/types";

const DEFAULT_SEVERITY: Record<TrackChangeKind, TrackChange["severity"]> = {
  jump: "caution", corner: "info", section: "caution", layout: "caution", surface: "info", hazard: "hazard", closed: "hazard", other: "info",
};

export function ReportChangeForm({ route, onDone }: { route: Route; onDone: () => void }) {
  const [kind, setKind] = useState<TrackChangeKind>("jump");
  const [severity, setSeverity] = useState<TrackChange["severity"]>("caution");
  const [sectorId, setSectorId] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [affectsTimes, setAffectsTimes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickKind = (k: TrackChangeKind) => {
    setKind(k);
    setSeverity(DEFAULT_SEVERITY[k]);
    setAffectsTimes(k === "section" || k === "layout");
  };
  const submit = () => {
    if (!title.trim()) return setError("Say what's changed in a few words.");
    reportTrackChange({ routeId: route.id, kind, title: title.trim().slice(0, 120), details: details.trim().slice(0, 1000), sectorId: sectorId || null, severity, affectsTimes });
    onDone();
  };

  return (
    <div className="space-y-4">
      <Segmented label="What changed?" columns={2} value={kind} onChange={pickKind}
        options={(Object.keys(TRACK_CHANGE_LABEL) as TrackChangeKind[]).map((k) => ({ value: k, label: TRACK_CHANGE_LABEL[k] }))} />
      {route.sectors.length > 0 && (
        <SelectField label="Where?" value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
          <option value="">Whole track / not sure</option>
          {route.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </SelectField>
      )}
      <TextField label="Headline" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
        placeholder={kind === "jump" ? "Top jump rebuilt as a step-up" : kind === "hazard" ? "Fallen tree on the descent" : "What's changed?"} />
      <TextArea label="Details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} placeholder="Which line to take, how big it is, when it changed…" />
      <Segmented label="How careful should riders be?" columns={3} value={severity} onChange={setSeverity}
        options={[{ value: "info", label: "Just so you know" }, { value: "caution", label: "Take care" }, { value: "hazard", label: "Hazard" }]} />
      <Toggle label="Affects lap times" description="New or removed section, different layout: lap times before and after aren't really comparable. Marked on progress charts." checked={affectsTimes} onChange={setAffectsTimes} />
      {error && <p role="alert" className="text-slower">{error}</p>}
      <div className="flex gap-2">
        <Button variant="primary" size="lg" onClick={submit}>Post report</Button>
        <Button size="lg" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}
