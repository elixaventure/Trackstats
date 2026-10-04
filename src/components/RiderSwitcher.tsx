import { setActiveRider } from "@/data/actions";
import { myRiders } from "@/data/selectors";
import { useDb } from "@/hooks/useDb";

/** Parents/managers flip between the riders they manage; each keeps separate stats. */
export function RiderSwitcher() {
  const db = useDb();
  const riders = myRiders(db);
  if (riders.length < 2) return null;
  return (
    <div role="tablist" aria-label="Rider" className="flex gap-2 overflow-x-auto pb-1">
      {riders.map((r) => (
        <button key={r.id} role="tab" aria-selected={r.id === db.activeRiderId} type="button" onClick={() => setActiveRider(r.id)}
          className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${r.id === db.activeRiderId ? "border-plate bg-plate text-plate-ink" : "border-line text-muted"}`}>
          {r.name || "Unnamed rider"}{r.raceNumber ? ` #${r.raceNumber}` : ""}
        </button>
      ))}
    </div>
  );
}
