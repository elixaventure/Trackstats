import { formatDate } from "@/domain/time";
import { partText, slotLabel } from "@/domain/parts";
import { isBackfilled } from "@/domain/service";
import type { Bike, PartChoice, PartSlot, ServiceRecord, ServiceTask } from "@/domain/types";

export const money = (p: number) => `£${(p / 100).toFixed(2)}`;

/** Service history, newest first. Used on screen and in the printable report. */
export function ServiceHistoryList({ bike, records, tasks, showCost = true, fullDates = false, onDelete }: { bike: Pick<Bike, "capacity">; records: ServiceRecord[]; tasks: ServiceTask[]; showCost?: boolean; fullDates?: boolean; onDelete?: (id: string) => void }) {
  // The printed report always shows the year: a buyer may read it long after.
  const date = (ms: number) => (fullDates ? formatDate(ms, 0) : formatDate(ms));
  const name = (id: string) => tasks.find((t) => t.id === id)?.name ?? "Removed job";
  if (!records.length) return <p className="text-muted">Nothing logged yet.</p>;
  return (
    <ol className="divide-y divide-line">
      {records.map((r) => (
        <li key={r.id} className="py-3 break-inside-avoid">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-semibold">{r.kind === "reading" ? "Hour meter reading" : r.taskIds.length ? r.taskIds.map(name).join(", ") : "Service"}</span>
            <span className="font-mono text-sm tnum">{date(r.performedAt)} · {r.hours} h</span>
          </div>
          <div className="text-sm text-muted">
            {r.kind === "service" && r.doneBy}{showCost && r.costPence != null ? ` · ${money(r.costPence)}` : ""}
            {isBackfilled(r) && <span className="ml-1 rounded border border-line px-1 text-xs">added later ({date(r.createdAt)})</span>}
          </div>
          {r.partsUsed && Object.keys(r.partsUsed).length > 0 && (
            <p className="mt-1 text-sm"><span className="text-muted">Parts: </span>{(Object.entries(r.partsUsed) as [PartSlot, PartChoice][]).map(([slot, p]) => `${partText(p)} (${slotLabel(bike, slot).toLowerCase()})`).join(" · ")}</p>
          )}
          {r.notes && <p className="mt-1 text-sm">{r.notes}</p>}
          {onDelete && <button type="button" className="mt-1 min-h-11 text-sm text-muted print:hidden" onClick={() => onDelete(r.id)}>Delete entry</button>}
        </li>
      ))}
    </ol>
  );
}
