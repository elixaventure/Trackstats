import { useMemo } from "react";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { RiderSwitcher } from "@/components/RiderSwitcher";
import { Link } from "react-router-dom";
import { activeRider, myRiders, visibleRoutes } from "@/data/selectors";
import { computeAchievements } from "@/domain/achievements";
import { entriesFromSessions } from "@/domain/leaderboard";
import { formatDate } from "@/domain/time";
import { useDb } from "@/hooks/useDb";

export default function Achievements() {
  const db = useDb();
  const rider = activeRider(db)!;
  const list = useMemo(() => {
    const mine = new Set(myRiders(db).map((r) => r.id));
    const entries = [
      ...Object.values(db.leaderboard).filter((e) => !mine.has(e.riderId)),
      ...entriesFromSessions(Object.values(db.sessions).filter((s) => mine.has(s.riderId)), Object.values(db.laps), db.riders, db.bikes),
    ];
    return computeAchievements({ riderId: rider.id, sessions: Object.values(db.sessions), laps: Object.values(db.laps), routes: visibleRoutes(db), entries });
  }, [db, rider.id]);
  const done = list.filter((a) => a.achievedAt).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Achievements" eyebrow={`${rider.name} · ${done} of ${list.length}`} />
      <RiderSwitcher />
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.map((a) => {
          const got = a.achievedAt != null;
          const body = (
            <>
              <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${got ? "bg-plate text-plate-ink" : "bg-surface-2 text-muted"}`}>
                <Icon name={got ? "award" : "record"} className="size-7" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-2xl font-extrabold uppercase leading-none">{a.title}</span>
                <span className="block text-sm text-muted">{a.description}</span>
                <span className={`mt-1 block font-mono text-xs uppercase tracking-wide ${got ? "text-plate" : "text-muted"}`}>
                  {got ? (a.sessionId ? `Earned ${formatDate(a.achievedAt!)}` : "Current standing") : "Not yet"}
                </span>
              </span>
            </>
          );
          return (
            <li key={a.key}>
              {a.sessionId ? (
                <Link to={`/sessions/${a.sessionId}`} className={`flex items-center gap-4 rounded-2xl border p-4 ${got ? "border-plate/50 bg-surface" : "border-line bg-surface opacity-70"}`}>{body}</Link>
              ) : (
                <div className={`flex items-center gap-4 rounded-2xl border p-4 ${got ? "border-plate/50 bg-surface" : "border-line bg-surface opacity-70"}`}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
