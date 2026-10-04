import { Link } from "react-router-dom";
import type { DbState } from "@/data/db";
import { headsUp } from "@/domain/trackChanges";
import { TrackChangeItem } from "./TrackChangeItem";

/** Shown before a ride: what's changed on this track since the rider last rode it. */
export function HeadsUp({ db, routeId, riderId }: { db: DbState; routeId: string; riderId: string }) {
  const last = Object.values(db.sessions).filter((s) => s.routeId === routeId && s.riderId === riderId && s.status === "completed").reduce<number | null>((a, s) => Math.max(a ?? 0, s.startedAt), null);
  const items = headsUp(routeId, Object.values(db.trackChanges), last);
  if (!items.length) return null;
  return (
    <section aria-label="Track changes" className="space-y-2 rounded-2xl border border-warn/50 bg-warn/5 p-3">
      <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-warn">
        {last ? "Changed since your last ride here" : "Recent changes on this track"}
      </h2>
      <ul className="space-y-2">{items.map((c) => <TrackChangeItem key={c.id} c={c} db={db} compact />)}</ul>
      <Link to={`/routes/${routeId}#changes`} className="inline-flex min-h-11 items-center text-sm font-semibold text-plate">All reports for this track →</Link>
    </section>
  );
}
