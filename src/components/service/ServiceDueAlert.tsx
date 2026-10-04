import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { riderBikes } from "@/data/selectors";
import { bikeHours, dueText, scheduleStatus } from "@/domain/service";
import type { DbState } from "@/data/db";

/** Home screen: anything due now on the rider's bikes. */
export function ServiceDueAlert({ db, riderId }: { db: DbState; riderId: string }) {
  const records = Object.values(db.serviceRecords);
  const tasks = Object.values(db.serviceTasks);
  const due = riderBikes(db, riderId).flatMap((bike) => {
    const hours = bikeHours(bike, Object.values(db.sessions), records).total;
    return scheduleStatus(tasks.filter((t) => t.bikeId === bike.id), records, hours).filter((s) => s.state === "due").map((s) => ({ bike, s }));
  });
  if (!due.length) return null;
  return (
    <section aria-label="Service due" className="rounded-2xl border border-slower/50 bg-slower/5 p-3">
      <h2 className="mb-1 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-slower"><Icon name="alert" className="size-4" /> Service due</h2>
      <ul>
        {due.slice(0, 3).map(({ bike, s }) => (
          <li key={s.task.id}>
            <Link to={`/garage/${bike.id}`} className="flex min-h-11 items-center justify-between gap-3">
              <span className="min-w-0 truncate"><strong>{bike.model}</strong>: {s.task.name}</span>
              <span className="shrink-0 text-sm text-slower">{dueText(s)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
