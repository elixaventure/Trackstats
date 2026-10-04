import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LinkButton } from "@/components/Button";
import { Card, SectionTitle } from "@/components/Card";
import { MonthlyChart } from "@/components/charts/MonthlyChart";
import { ProgressChart } from "@/components/charts/ProgressChart";
import { Delta } from "@/components/Delta";
import { PageHeader } from "@/components/PageHeader";
import { RiderSwitcher } from "@/components/RiderSwitcher";
import { Segmented } from "@/components/Segmented";
import { Stat } from "@/components/Stat";
import { EmptyState } from "@/components/States";
import { activeRider, bikeLabel } from "@/data/selectors";
import { conditionSplit, mean, routeImprovement, sessionsPerMonth } from "@/domain/stats";
import { formatLap, formatSpan } from "@/domain/time";
import { useDb } from "@/hooks/useDb";
import { useRiderStats } from "@/hooks/useRiderStats";

type Window = "5" | "10" | "20" | "all";

export default function Progress() {
  const db = useDb();
  const rider = activeRider(db)!;
  const stats = useRiderStats(rider.id);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [win, setWin] = useState<Window>("10");
  const selected = stats.perRoute.find((r) => r.route.id === routeId) ?? stats.main;

  const windowed = useMemo(() => (selected ? (win === "all" ? selected.series : selected.series.slice(-Number(win))) : []), [selected, win]);
  const monthly = useMemo(() => sessionsPerMonth(stats.sessions).slice(-6), [stats.sessions]);

  if (!selected) {
    return (
      <div className="space-y-4">
        <PageHeader title="Progress" eyebrow={rider.name} />
        <RiderSwitcher />
        <EmptyState icon="progress" title="Nothing to compare yet" action={<LinkButton to="/ride" variant="primary">Start a ride</LinkButton>}>
          Progress compares laps on the same route and set-up. Two sessions on one route gives you your first trend line.
        </EmptyState>
      </div>
    );
  }

  const imp = selected.improvement;
  const split = conditionSplit(selected.series);
  const firstSd = windowed[0]?.consistencySd ?? null;
  const lastSd = windowed[windowed.length - 1]?.consistencySd ?? null;
  const windowAvg = mean(windowed.map((p) => p.average ?? p.best));
  const bikes = [...new Set(selected.series.map((p) => p.bikeId))].map((bikeId) => {
    const pts = selected.series.filter((p) => p.bikeId === bikeId);
    return { bikeId, sessions: pts.length, best: Math.min(...pts.map((p) => p.best)), imp: routeImprovement(pts) };
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Progress" eyebrow={rider.name} />
      <RiderSwitcher />

      <Card className="space-y-2 border-plate/40">
        {imp && imp.improvementMs > 0 ? (
          <>
            <Insight>Your {selected.route.name} PB has improved by <B>{(imp.improvementMs / 1000).toFixed(1)} seconds</B> in {formatSpan(imp.pbAt - imp.firstAt)}.</Insight>
            <Insight>You are <B>{imp.improvementPct.toFixed(1)}% faster</B> than your first recorded session there.</Insight>
          </>
        ) : <Insight>Ride {selected.route.name} again to measure improvement against your first session.</Insight>}
        <Insight>You have set <B>{stats.pbsThisMonth} personal best{stats.pbsThisMonth === 1 ? "" : "s"}</B> this month.</Insight>
      </Card>

      <div role="tablist" aria-label="Route" className="flex gap-2 overflow-x-auto pb-1">
        {stats.perRoute.map((r) => (
          <button key={r.route.id} role="tab" type="button" aria-selected={r.route.id === selected.route.id} onClick={() => setRouteId(r.route.id)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${r.route.id === selected.route.id ? "border-plate bg-plate text-plate-ink" : "border-line text-muted"}`}>
            {r.route.name}
          </button>
        ))}
      </div>

      <Card>
        <SectionTitle action={<Link to={`/routes/${selected.route.id}`} className="text-sm font-semibold text-plate">Section analysis →</Link>}>Lap time · {selected.route.name}</SectionTitle>
        <Segmented label="Show" columns={4} value={win} onChange={setWin}
          options={[{ value: "5", label: "Last 5" }, { value: "10", label: "Last 10" }, { value: "20", label: "Last 20" }, { value: "all", label: "All" }]} />
        <div className="mt-4"><ProgressChart points={windowed} /></div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="PB" value={formatLap(selected.pbMs)} tone="plate" />
          <Stat label="First session" value={formatLap(imp?.firstBestMs ?? selected.series[0]?.best)} />
          <Stat label="Avg lap (window)" value={formatLap(windowAvg)} />
          <Stat label="Consistency" value={lastSd != null ? `±${(lastSd / 1000).toFixed(1)}s` : "—"}
            sub={firstSd != null && lastSd != null && windowed.length > 1 ? <>from ±{(firstSd / 1000).toFixed(1)}s</> : undefined} />
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <SectionTitle>Dry vs wet</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Stat label={`Dry/damp · ${split.dry.sessions}`} value={formatLap(split.dry.best)} sub={split.dry.avgBest ? `avg best ${formatLap(split.dry.avgBest)}` : "No sessions"} />
            <Stat label={`Wet/mud · ${split.wet.sessions}`} value={formatLap(split.wet.best)} sub={split.wet.avgBest ? `avg best ${formatLap(split.wet.avgBest)}` : "No sessions"} />
          </div>
          {split.dry.best != null && split.wet.best != null && (
            <p className="mt-3 text-sm text-muted">Wet laps are <span className="font-mono text-ink">{((split.wet.best - split.dry.best) / 1000).toFixed(1)} s</span> slower at best. They're kept out of each other's way so a muddy day never looks like going backwards.</p>
          )}
        </Card>
        <Card>
          <SectionTitle>By bike · {selected.route.name}</SectionTitle>
          <ul className="space-y-3">
            {bikes.map((b) => (
              <li key={b.bikeId ?? "none"} className="flex items-center justify-between gap-3">
                <span><span className="font-semibold">{bikeLabel(db, b.bikeId)}</span><span className="block text-sm text-muted">{b.sessions} sessions</span></span>
                <span className="text-right font-mono tnum"><span className="block text-lg font-bold">{formatLap(b.best)}</span>{b.imp && b.imp.improvementMs > 0 && <Delta ms={-b.imp.improvementMs} className="text-sm" />}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <SectionTitle>Every route</SectionTitle>
        <ul className="divide-y divide-line">
          {stats.perRoute.map((r) => (
            <li key={r.route.id}>
              <Link to={`/routes/${r.route.id}`} className="flex min-h-16 items-center justify-between gap-3 py-2">
                <span className="min-w-0"><span className="block truncate font-semibold">{r.route.name}</span><span className="text-sm text-muted">{r.series.length} sessions · PB {formatLap(r.pbMs)}</span></span>
                <span className="text-right">
                  {r.improvement && r.improvement.improvementMs > 0 ? (
                    <><Delta ms={-r.improvement.improvementMs} className="block" /><span className="text-sm text-muted">{r.improvement.improvementPct.toFixed(1)}% faster</span></>
                  ) : <span className="text-sm text-muted">—</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionTitle>Riding volume</SectionTitle>
        <div className="mb-3 grid grid-cols-2 gap-4">
          <Stat label="Total riding" value={`${(stats.totalTimeMs / 3600000).toFixed(1)} h`} />
          <Stat label="Sessions" value={stats.sessions.length} />
        </div>
        <MonthlyChart data={monthly} />
      </Card>
    </div>
  );
}

const Insight = ({ children }: { children: ReactNode }) => <p className="text-lg leading-snug">{children}</p>;
const B = ({ children }: { children: ReactNode }) => <strong className="font-mono text-plate tnum">{children}</strong>;
