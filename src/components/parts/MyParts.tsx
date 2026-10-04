import { useState } from "react";
import { Button } from "@/components/Button";
import { TextField } from "@/components/Field";
import { saveBike } from "@/data/actions";
import { isChosen, partQuery, partText, slotsFor } from "@/domain/parts";
import type { Bike, PartChoice, PartSlot } from "@/domain/types";
import { GetPartsLink } from "./GetPartsLink";

/** The brands and parts this rider uses on the bike, each with a one-tap shop search. */
export function MyParts({ bike }: { bike: Bike }) {
  const [editing, setEditing] = useState(false);
  const slots = slotsFor(bike);
  const chosen = slots.filter((s) => isChosen(bike.parts?.[s.slot])).length;

  if (editing) return <PartsEditor bike={bike} onDone={() => setEditing(false)} />;
  return (
    <div className="space-y-2">
      {!chosen && <p className="text-muted">Save the oil, filters, chain and pads you use, and re-order them in one tap. Parts you enter when logging a service are remembered here too.</p>}
      <ul className="divide-y divide-line">
        {slots.map((s) => {
          const p = bike.parts?.[s.slot];
          return (
            <li key={s.slot} className="flex min-h-12 items-center gap-3 py-1">
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted">{s.label}</span>
                <span className={`block leading-snug ${isChosen(p) ? "font-semibold" : "text-muted"}`}>{isChosen(p) ? partText(p) : "Not set"}</span>
              </span>
              <GetPartsLink compact query={partQuery(bike, s.slot)} label={`Get ${s.label.toLowerCase()}`} />
            </li>
          );
        })}
      </ul>
      <Button className="w-full" onClick={() => setEditing(true)}>{chosen ? "Edit my parts" : "Add my parts"}</Button>
    </div>
  );
}

function PartsEditor({ bike, onDone }: { bike: Bike; onDone: () => void }) {
  const [draft, setDraft] = useState<Partial<Record<PartSlot, PartChoice>>>(() => ({ ...(bike.parts ?? {}) }));
  const set = (slot: PartSlot, k: keyof PartChoice, v: string) => setDraft((d) => ({ ...d, [slot]: { brand: "", product: "", ...d[slot], [k]: v } }));
  const save = () => {
    const parts: Partial<Record<PartSlot, PartChoice>> = {};
    for (const [slot, p] of Object.entries(draft) as [PartSlot, PartChoice][]) if (isChosen(p)) parts[slot] = { brand: p.brand.trim(), product: p.product.trim() };
    saveBike({ ...bike, parts });
    onDone();
  };
  return (
    <div className="space-y-4">
      {slotsFor(bike).map((s) => (
        <fieldset key={s.slot}>
          <legend className="mb-1 font-semibold">{s.label}</legend>
          <div className="grid grid-cols-[2fr_3fr] gap-2">
            <TextField label="Brand" value={draft[s.slot]?.brand ?? ""} onChange={(e) => set(s.slot, "brand", e.target.value)} />
            <TextField label="Product / size" value={draft[s.slot]?.product ?? ""} onChange={(e) => set(s.slot, "product", e.target.value)} />
          </div>
        </fieldset>
      ))}
      <div className="flex gap-2">
        <Button variant="primary" size="lg" onClick={save}>Save parts</Button>
        <Button size="lg" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}
