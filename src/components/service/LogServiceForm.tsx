import { useState } from "react";
import { Button } from "@/components/Button";
import { TextArea, TextField } from "@/components/Field";
import { logServiceRecord, saveBike } from "@/data/actions";
import { isChosen, rememberParts, slotLabel, slotsForTask } from "@/domain/parts";
import type { Bike, PartChoice, PartSlot, ServiceTask } from "@/domain/types";

const today = () => new Date().toISOString().slice(0, 10);

/** Log jobs done (service) or just an hour-meter reading. */
export function LogServiceForm({ bike, tasks, hoursNow, kind, onDone }: { bike: Bike; tasks: ServiceTask[]; hoursNow: number; kind: "service" | "reading"; onDone: () => void }) {
  const bikeId = bike.id;
  const [date, setDate] = useState(today());
  const [hours, setHours] = useState(String(hoursNow));
  const [done, setDone] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [cost, setCost] = useState("");
  const [doneBy, setDoneBy] = useState("Me");
  const [error, setError] = useState<string | null>(null);
  // Parts used, prefilled from the bike's saved choices; edits are remembered for next time.
  const [parts, setParts] = useState<Partial<Record<PartSlot, PartChoice>>>(() => ({ ...(bike.parts ?? {}) }));
  const usedSlots = [...new Set(tasks.filter((t) => done.has(t.id)).flatMap((t) => slotsForTask(t.name, bike)))];
  const setPart = (slot: PartSlot, k: keyof PartChoice, v: string) => setParts((p) => ({ ...p, [slot]: { brand: "", product: "", ...p[slot], [k]: v } }));

  const toggle = (id: string) => setDone((d) => { const n = new Set(d); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const save = () => {
    const h = Number(hours);
    if (!Number.isFinite(h) || h < 0) return setError("Enter the bike's hours as a number, e.g. 98.5.");
    if (kind === "service" && !done.size && !notes.trim()) return setError("Tick at least one job, or describe what was done.");
    const at = new Date(`${date}T12:00:00`).getTime();
    if (!Number.isFinite(at) || at > Date.now() + 86400000) return setError("Pick a date that isn't in the future.");
    const pence = cost.trim() ? Math.round(Number(cost.replace(/[£,]/g, "")) * 100) : null;
    if (pence != null && (!Number.isFinite(pence) || pence < 0)) return setError("Cost should be a number of pounds, e.g. 42.50.");
    const used: Partial<Record<PartSlot, PartChoice>> = {};
    if (kind === "service") for (const slot of usedSlots) { const p = parts[slot]; if (isChosen(p)) used[slot] = { brand: p.brand.trim(), product: p.product.trim() }; }
    logServiceRecord({ bikeId, kind, performedAt: at, hours: Math.round(h * 10) / 10, taskIds: kind === "service" ? [...done] : [], notes: notes.trim(), costPence: pence, doneBy: doneBy.trim() || "Me", partsUsed: Object.keys(used).length ? used : null });
    if (Object.keys(used).length) saveBike({ ...bike, parts: rememberParts(bike, used) });
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
      {kind === "service" && usedSlots.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="mb-1 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-muted">Parts used (optional)</legend>
          {usedSlots.map((slot) => (
            <div key={slot}>
              <div className="mb-1 text-sm font-semibold">{slotLabel(bike, slot)}</div>
              <div className="grid grid-cols-[2fr_3fr] gap-2">
                <TextField label="Brand" value={parts[slot]?.brand ?? ""} onChange={(e) => setPart(slot, "brand", e.target.value)} />
                <TextField label="Product / size" value={parts[slot]?.product ?? ""} onChange={(e) => setPart(slot, "product", e.target.value)} />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted">Saved to My parts, so it's filled in next time.</p>
        </fieldset>
      )}
      {kind === "service" && (
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Done by" value={doneBy} onChange={(e) => setDoneBy(e.target.value)} placeholder="Me, or the shop" />
          <TextField label="Cost £ (optional)" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
      )}
      <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={kind === "service" ? "What you found, settings, part numbers…" : "Optional"} />
      <p className="text-xs text-muted">Each entry is stamped with when you logged it. Anything logged more than a week after the date is marked “added later” in the service history.</p>
      {error && <p role="alert" className="text-slower">{error}</p>}
      <div className="flex gap-2">
        <Button variant="primary" size="lg" onClick={save}>{kind === "service" ? "Save service" : "Save reading"}</Button>
        <Button size="lg" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}
