import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LinkButton } from "@/components/Button";
import { Card, SectionTitle } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { RiderSwitcher } from "@/components/RiderSwitcher";
import { Segmented } from "@/components/Segmented";
import { Stat } from "@/components/Stat";
import { ServiceSummary } from "@/components/service/ServiceSummary";
import { EmptyState } from "@/components/States";
import { activeRider, riderBikes, riderSessions, visibleRoutes } from "@/data/selectors";
import { bikeStats, compareBikes, lapCounter, routesWithSeveralBikes, type BikeComparison } from "@/domain/garage";
import { formatLap, formatRelativeDays } from "@/domain/time";
import type { Bike, Route } from "@/domain/types";
import { useDb } from "@/hooks/useDb";

const bikeName = (b: Bike) => `${b.manufacturer} ${b.model}`;

export default function Garage() {
  const db = useDb();
  const rider = activeRider(db)!;
  const bikes = riderBikes(db, rider.id);
  const sessions = useMemo(() => riderSessions(db, rider.id), [db, rider.id]);
  const stats = useMemo(() => bikeStats(bikes, sessions, lapCounter(Object.values(db.laps)), db.routes), [bikes, sessions, db.laps, db.routes]);
  const shared = useMemo(() => routesWithSeveralBikes(visibleRoutes(db), sessions), [db, sessions]);

  return (
    <div className="space-y-5">
      <PageHeader title="Garage" eyebrow={rider.name} action={<LinkButton to="/profile/bikes/new"><Icon name="plus" className="size-5" /> Add bike</LinkButton>} />
      <RiderSwitcher />

      {!bikes.length ? (
        <EmptyState icon="bike" title="No bikes yet" action={<LinkButton to="/profile/bikes/new" variant="primary">Add your first bike</LinkButton>}>
          Add each bike you ride. Every session is logged against a bike, so you can see which one you're fastest on.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {stats.map((s) => (
            <Card key={s.bike.id} className="min-w-0 space-y-3">
              <div className="flex items-start gap-3">
                {s.bike.imageDataUrl
                  ? <img src={s.bike.imageDataUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
                  : <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-surface-2 text-plate"><Icon name="bike" className="size-9" /></span>}
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs uppercase tracking-[0.12em] text-muted">{[s.bike.year, s.bike.manufacturer].filter(Boolean).join(" · ")}</div>
                  <h2 className="font-display text-4xl font-black uppercase leading-none" aria-label={bikeName(s.bike)}>{s.bike.model}</h2>
                  <div className="text-sm text-muted">{[s.bike.capacity, s.bike.bikeClass].filter(Boolean).join(" · ")}{s.bike.nickname ? ` · “${s.bike.nickname}”` : ""}{rider.defaultBikeId === s.bike.id ? " · default bike" : ""}</div>
                </div>
                <Link to={`/profile/bikes/${s.bike.id}`} aria-label={`Edit ${bikeName(s.bike)}`} className="grid size-12 place-items-center rounded-xl text-muted hover:bg-surface-2"><Icon name="edit" className="size-5" /></Link>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Rides" value={s.sessions} />
                <Stat label="Laps" value={s.laps} />
                <Stat label="Ride time" value={`${(s.ridingMs / 3600000).toFixed(1)} h`} sub={s.lastRiddenAt ? formatRelativeDays(s.lastRiddenAt) : "Not ridden yet"} />
              </div>
              <ServiceSummary bikeId={s.bike.id} />
              {s.bests.length > 0 && (
                <ul className="divide-y divide-line border-t border-line pt-1">
                  {s.bests.map((b) => (
                    <li key={b.route.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="truncate text-sm">{b.route.name}</span>
                      <span className="font-mono font-bold tnum">{formatLap(b.ms)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {bikes.length > 1 && <WhichBike routes={shared} />}
      {bikes.length > 0 && (
        <p className="text-xs text-muted">Ride time counts recorded sessions on each bike. Engine hours for servicing also use your hour-meter readings: open a bike's Service page to log work and readings.</p>
      )}
    </div>
  );
}

function WhichBike({ routes }: { routes: Route[] }) {
  const db = useDb();
  const rider = activeRider(db)!;
  const [routeId, setRouteId] = useState<string | null>(null);
  const [dryOnly, setDryOnly] = useState<"dry" | "all">("dry");
  const route = routes.find((r) => r.id === routeId) ?? routes[0] ?? null;
  const comparison = useMemo(() => (route ? compareBikes(route, riderSessions(db, rider.id), riderBikes(db, rider.id), { dryOnly: dryOnly === "dry" }) : null), [route, db, rider.id, dryOnly]);

  return (
    <Card className="space-y-4">
      <SectionTitle>Which bike are you faster on?</SectionTitle>
      {!route ? (
        <p className="text-muted">Ride the same track on two different bikes and this compares them, like for like.</p>
      ) : (
        <>
          {routes.length > 1 && (
            <div role="tablist" aria-label="Route" className="flex gap-2 overflow-x-auto pb-1">
              {routes.map((r) => (
                <button key={r.id} role="tab" type="button" aria-selected={r.id === route.id} onClick={() => setRouteId(r.id)}
                  className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${r.id === route.id ? "border-plate bg-plate text-plate-ink" : "border-line text-muted"}`}>{r.name}</button>
              ))}
            </div>
          )}
          <Segmented label="Conditions" value={dryOnly} onChange={setDryOnly} options={[{ value: "dry", label: "Dry & damp only" }, { value: "all", label: "All conditions" }]} />
          {comparison && <ComparisonView route={route} c={comparison} dry={dryOnly === "dry"} />}
        </>
      )}
    </Card>
  );
}

function ComparisonView({ route, c, dry }: { route: Route; c: BikeComparison; dry: boolean }) {
  if (c.rows.length < 2) return <p className="text-muted">Only one bike has {dry ? "dry " : ""}rides on {route.name} so far.</p>;
  const [first, second] = c.rows as [typeof c.rows[0], typeof c.rows[0]];
  const n = first.usedSessions;
  return (
    <div className="space-y-4">
      <p className="text-lg leading-snug">
        On {route.name} you're <strong className="font-mono text-faster tnum">{(second.gapMs! / 1000).toFixed(1)} s</strong> a lap faster on the{" "}
        <strong>{first.bike.model}</strong> than the {second.bike.model}
        <span className="text-muted"> (average of your last {n === 1 ? "ride" : `${n} ${dry ? "dry " : ""}rides`} on each).</span>
      </p>
      <ol className="divide-y divide-line">
        {c.rows.map((r, i) => (
          <li key={r.bike.id} className="flex items-center gap-3 py-3">
            <span className={`grid size-9 shrink-0 place-items-center rounded-lg font-mono font-bold ${i === 0 ? "bg-plate text-plate-ink" : "bg-surface-2 text-muted"}`}>{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-tight">{r.bike.year ?? ""} {bikeName(r.bike)}</span>
              <span className="block text-sm text-muted">{r.sessions} ride{r.sessions === 1 ? "" : "s"} · PB {formatLap(r.pbMs)}</span>
            </span>
            <span className="text-right font-mono tnum">
              <span className="block text-lg font-bold">{formatLap(r.recentAvgMs)}</span>
              <span className={`block text-sm ${i === 0 ? "text-muted" : "text-slower"}`}>{i === 0 ? "recent avg" : `+${(r.gapMs! / 1000).toFixed(2)} s`}</span>
            </span>
          </li>
        ))}
      </ol>
      {!c.enoughData && <p className="text-sm text-warn">Early days: one bike has only a single ride here. Ride both a few more times for a result you can trust.</p>}
      {!c.sameEra && <p className="text-sm text-warn">These bikes were ridden more than a month apart. You've probably improved in between, so some of the gap may be you, not the bike.</p>}
      <p className="text-xs text-muted">Compared on recent rides rather than PBs, so the bike you've ridden lately doesn't win just because you've got faster.</p>
    </div>
  );
}
