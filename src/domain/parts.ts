import type { Bike, PartChoice, PartSlot } from "./types";

export const isTwoStroke = (bike: Pick<Bike, "capacity">) => /\b2\s*-?\s*t|2-?stroke/i.test(bike.capacity);

interface SlotInfo {
  slot: PartSlot;
  label: string;
  /** What to search for when the rider hasn't picked a brand yet. */
  search: string;
  /** Whether the part depends on the bike (filters, pads) or not (oil, coolant). */
  fitment: boolean;
  only?: "2T" | "4T";
}

const SLOTS: SlotInfo[] = [
  { slot: "engineOil", label: "Engine oil", search: "engine oil", fitment: false },
  { slot: "oilFilter", label: "Oil filter", search: "oil filter", fitment: true, only: "4T" },
  { slot: "airFilter", label: "Air filter", search: "air filter", fitment: true },
  { slot: "sparkPlug", label: "Spark plug", search: "spark plug", fitment: true },
  { slot: "piston", label: "Piston kit", search: "piston kit", fitment: true },
  { slot: "chain", label: "Chain", search: "chain", fitment: true },
  { slot: "sprockets", label: "Sprockets", search: "sprocket kit", fitment: true },
  { slot: "frontPads", label: "Front brake pads", search: "front brake pads", fitment: true },
  { slot: "rearPads", label: "Rear brake pads", search: "rear brake pads", fitment: true },
  { slot: "frontTyre", label: "Front tyre", search: "front tyre", fitment: true },
  { slot: "rearTyre", label: "Rear tyre", search: "rear tyre", fitment: true },
  { slot: "coolant", label: "Coolant", search: "coolant", fitment: false },
];

/** Part slots that apply to this bike, with 2-stroke naming (gearbox oil). */
export function slotsFor(bike: Pick<Bike, "capacity">): SlotInfo[] {
  const two = isTwoStroke(bike);
  return SLOTS.filter((s) => !s.only || s.only === (two ? "2T" : "4T"))
    .map((s) => (two && s.slot === "engineOil" ? { ...s, label: "Gearbox oil", search: "gearbox oil" } : s));
}

export const slotLabel = (bike: Pick<Bike, "capacity">, slot: PartSlot) => slotsFor(bike).find((s) => s.slot === slot)?.label ?? slot;

/**
 * Which parts a service job uses, matched on its name so riders' own jobs work
 * too ("Clutch plates" uses none; "Oil & filter" uses oil and filter).
 */
export function slotsForTask(name: string, bike: Pick<Bike, "capacity">): PartSlot[] {
  const n = name.toLowerCase();
  const out: PartSlot[] = [];
  const has = (re: RegExp) => re.test(n);
  if (has(/\boil\b/) && !has(/air filter|fork|shock|suspension/)) out.push("engineOil");
  if (has(/oil (& |and )?filter|oil filter/)) out.push("oilFilter");
  if (has(/air filter/)) out.push("airFilter");
  if (has(/spark ?plug|\bplug\b/)) out.push("sparkPlug");
  if (has(/piston|top end/)) out.push("piston");
  if (has(/chain/)) out.push("chain");
  if (has(/sprocket/)) out.push("sprockets");
  if (has(/brake|pads/)) out.push("frontPads", "rearPads");
  if (has(/tyre|tire/)) out.push("frontTyre", "rearTyre");
  if (has(/coolant/)) out.push("coolant");
  const valid = new Set(slotsFor(bike).map((s) => s.slot));
  return out.filter((s) => valid.has(s));
}

export const partText = (p: PartChoice | undefined | null) => (p ? [p.brand, p.product].map((x) => x.trim()).filter(Boolean).join(" ") : "");
export const isChosen = (p: PartChoice | undefined | null): p is PartChoice => !!partText(p);

const bikeText = (bike: Pick<Bike, "year" | "manufacturer" | "model">) => [bike.year, bike.manufacturer, bike.model].filter(Boolean).join(" ");

/** Shop search text for one part: the rider's own brand if saved, else the generic part for this bike. */
export function partQuery(bike: Bike, slot: PartSlot): string {
  const info = slotsFor(bike).find((s) => s.slot === slot);
  const chosen = bike.parts?.[slot];
  if (isChosen(chosen)) {
    // "Twin Air" alone could be anything: add the part type when no product is given.
    const what = chosen.product.trim() ? partText(chosen) : `${partText(chosen)} ${info?.search ?? ""}`.trim();
    return info?.fitment ? `${what} ${bikeText(bike)}` : what;
  }
  return `${bikeText(bike)} ${info?.search ?? slot}`;
}

/** Search text for a service job, or null if the job doesn't use parts (e.g. a valve check). */
export function taskQuery(bike: Bike, taskName: string): string | null {
  const slots = slotsForTask(taskName, bike);
  if (!slots.length) return null;
  // Brake and tyre jobs cover front and rear; search the front, the rear has its own row in My parts.
  return partQuery(bike, slots[0]!);
}

/** Merge parts used in a service into the bike's saved choices (blank entries ignored). */
export function rememberParts(bike: Bike, used: Partial<Record<PartSlot, PartChoice>>): Bike["parts"] {
  const next = { ...(bike.parts ?? {}) };
  for (const [slot, p] of Object.entries(used) as [PartSlot, PartChoice][]) if (isChosen(p)) next[slot] = { brand: p.brand.trim(), product: p.product.trim() };
  return next;
}

/** VIN: upper case, letters and digits only. Most frames since 1981 use 17 characters. */
export const cleanVin = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
export const vinLooksRight = (v: string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(v);
