import { useState } from "react";
import { Button } from "@/components/Button";
import { TextField } from "@/components/Field";
import { saveBike } from "@/data/actions";
import { formatDate } from "@/domain/time";
import type { Bike } from "@/domain/types";
import { uuid } from "@/lib/id";

const today = () => new Date().toISOString().slice(0, 10);
export const sortedMods = (bike: Bike) => [...(bike.mods ?? [])].sort((a, b) => b.fittedOn - a.fittedOn);

/** Modifications on the bike, newest first. Editable on screen; read-only in the printed history. */
export function ModsList({ bike, editable = false, fullDates = false }: { bike: Bike; editable?: boolean; fullDates?: boolean }) {
  const [adding, setAdding] = useState(false);
  const mods = sortedMods(bike);
  const date = (ms: number) => (fullDates ? formatDate(ms, 0) : formatDate(ms));
  return (
    <div className="space-y-3">
      {!mods.length && <p className="text-muted">{editable ? "Exhaust, suspension re-valve, big bore, handguards… anything changed from standard. Buyers always ask." : "None listed."}</p>}
      {mods.length > 0 && (
        <ul className="divide-y divide-line">
          {mods.map((m) => (
            <li key={m.id} className="flex items-start gap-3 py-2 break-inside-avoid">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug">{m.name}</span>
                <span className="block text-sm text-muted">Fitted {date(m.fittedOn)}{m.notes ? ` · ${m.notes}` : ""}</span>
              </span>
              {editable && <Button variant="ghost" className="min-h-11 px-2 text-sm text-muted print:hidden" onClick={() => saveBike({ ...bike, mods: (bike.mods ?? []).filter((x) => x.id !== m.id) })}>Remove</Button>}
            </li>
          ))}
        </ul>
      )}
      {editable && (adding ? <AddMod bike={bike} onDone={() => setAdding(false)} /> : <Button className="w-full" onClick={() => setAdding(true)}>Add a modification</Button>)}
    </div>
  );
}

function AddMod({ bike, onDone }: { bike: Bike; onDone: () => void }) {
  const [name, setName] = useState("");
  const [on, setOn] = useState(today());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    if (!name.trim()) return setError("Say what was fitted, e.g. FMF Factory 4.1 exhaust.");
    const at = new Date(`${on}T12:00:00`).getTime();
    if (!Number.isFinite(at) || at > Date.now() + 86400000) return setError("Pick a date that isn't in the future.");
    saveBike({ ...bike, mods: [...(bike.mods ?? []), { id: uuid(), name: name.trim(), fittedOn: at, notes: notes.trim() }] });
    onDone();
  };
  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <TextField label="What was fitted" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FMF Factory 4.1 exhaust" />
      <div className="grid grid-cols-[10rem_1fr] gap-2">
        <TextField label="When" type="date" value={on} max={today()} onChange={(e) => setOn(e.target.value)} />
        <TextField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Who fitted it, settings…" />
      </div>
      {error && <p role="alert" className="text-slower">{error}</p>}
      <div className="flex gap-2">
        <Button variant="primary" onClick={save}>Save</Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}
