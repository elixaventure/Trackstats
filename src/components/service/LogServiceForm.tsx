import { useState } from "react";
import { Button } from "@/components/Button";
import { TextArea, TextField } from "@/components/Field";
import { logServiceRecord } from "@/data/actions";
import type { ServiceTask } from "@/domain/types";

const today = () => new Date().toISOString().slice(0, 10);

/** Log jobs done (service) or just an hour-meter reading. */
export function LogServiceForm({ bikeId, tasks, hoursNow, kind, onDone }: { bikeId: string; tasks: ServiceTask[]; hoursNow: number; kind: "service" | "reading"; onDone: () => void }) {
  const [date, setDate] = useState(today());
  const [hours, setHours] = useState(String(hoursNow));
  const [done, setDone] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [cost, setCost] = useState("");
  const [doneBy, setDoneBy] = useState("Me");
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setDone((d) => { const n = new Set(d); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const save = () => {
    const h = Number(hours);
    if (!Number.isFinite(h) || h < 0) return setError("Enter the bike's hours as a number, e.g. 98.5.");
    if (kind === "service" && !done.size && !notes.trim()) return setError("Tick at least one job, or describe what was done.");
    const at = new Date(`${date}T12:00:00`).getTime();
    if (!Number.isFinite(at) || at > Date.now() + 86400000) return setError("Pick a date that isn't in the future.");
    const pence = cost.trim() ? Math.round(Number(cost.replace(/[£,]/g, "")) * 100) : null;
    if (pence != null && (!Number.isFinite(pence) || pence < 0)) return setError("Cost should be a number of pounds, e.g. 42.50.");
    logServiceRecord({ bikeId, kind, performedAt: at, hours: Math.round(h * 10) / 10, taskIds: kind === "service" ? [...done] : [], notes: notes.trim(), costPence: pence, doneBy: doneBy.trim() || "Me" });
    onDone();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        <TextField label={kind === "reading" ? "Hour meter" : "Hours on the bike"} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
      </div>
      {kind === "service" && (
        <fieldset>
          <legend className="mb-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-muted">Jobs done</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {tasks.map((t) => (
              <label key={t.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 ${done.has(t.id) ? "border-plate bg-plate/10" : "border-line bg-surface-2"}`}>
                <input type="checkbox" className="size-5 accent-[#ffd21f]" checked={done.has(t.id)} onChange={() => toggle(t.id)} />
                <span className="text-[15px] font-semibold">{t.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {kind === "service" && (
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Done by" value={doneBy} onChange={(e) => setDoneBy(e.target.value)} placeholder="Me, or the shop" />
          <TextField label="Cost £ (optional)" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
      )}
      <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={kind === "service" ? "Oil brand, part numbers, what you found…" : "Optional"} />
      <p className="text-xs text-muted">Each entry is stamped with when you logged it. Anything logged more than a week after the date is marked “added later” in the service history.</p>
      {error && <p role="alert" className="text-slower">{error}</p>}
      <div className="flex gap-2">
        <Button variant="primary" size="lg" onClick={save}>{kind === "service" ? "Save service" : "Save reading"}</Button>
        <Button size="lg" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}
