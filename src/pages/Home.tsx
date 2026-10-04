import { Link } from "react-router-dom";
import { LinkButton } from "@/components/Button";
import { Card, SectionTitle } from "@/components/Card";
import { ProgressChart } from "@/components/charts/ProgressChart";
import { Delta } from "@/components/Delta";
import { Icon } from "@/components/Icon";
import { RouteSvg } from "@/components/map/RouteSvg";
import { Plate } from "@/components/RiderBadge";
import { RiderSwitcher } from "@/components/RiderSwitcher";
import { SessionRow } from "@/components/SessionRow";
import { Stat } from "@/components/Stat";
import { EmptyState } from "@/components/States";
import { activeRider, bikeLabel } from "@/data/selectors";
import { useDb } from "@/hooks/useDb";
import { useRiderStats } from "@/hooks/useRiderStats";
import { weekStreak, type RouteImprovement } from "@/domain/stats";
import { formatDate, formatLap, formatSpan } from "@/domain/time";

export default function Home() {
  const db = useDb();
  const rider = activeRider(db);
  const stats = useRiderStats(rider?.id);
  if (!rider) return null;

  const main = stats.main;
  const latest = stats.sessions[0];
  const recentPbs = stats.sessions.filter((s) => s.summary?.isPb).slice(0, 4);
  const streak = weekStreak(stats.sessions);
  const needsProfile = !rider.name;

  return (
    <div className="space-y-5">
      <RiderSwitcher />
      <header className="flex items-center gap-4">
        <Plate rider={rider} size="lg" />
        <div className="min-w-0">
          <h1 className="break-words font-display text-4xl font-black uppercase leading-none tracking-wide">{rider.name || "New rider"}</h1>
          <p className="mt-1 truncate text-muted">
            {bikeLabel(db, rider.defaultBikeId)}{rider.raceNumber && ` · #${rider.raceNumber}`}{rider.riderClass && ` · ${rider.riderClass}`}
          </p>
        </div>
      </header>

      {needsProfile && (
        <Card className="border-plate/50">
          <p className="mb-3">Add your name, race number and bike so results and share cards are yours.</p>
          <LinkButton to={`/profile/rider/${rider.id}`} variant="secondary">Set up profile</LinkButton>
        </Card>
      )}

      <LinkButton to="/ride" variant="primary" size="xl" className="w-full">
        <Icon name="ride" className="size-8" /> Start ride
      </LinkButton>

      {main ? (
        <Card>
          <SectionTitle action={<Link to="/progress" className="text-sm font-semibold text-plate">Progress →</Link>}>Am I getting faster?</SectionTitle>
          <Verdict improvement={main.improvement} routeName={main.route.name} />
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Stat label={`PB · ${shortName(main.route.name)}`} value={formatLap(main.pbMs)} tone="plate" size="lg" />
            <Stat label="This month" value={stats.monthGainMs != null && stats.monthGainMs > 0 ? <Delta ms={-stats.monthGainMs} /> : "—"}
              sub={stats.monthGainMs != null ? (stats.monthGainMs > 0 ? "PB improvement" : "No new PB yet") : "First month riding"} />
          </div>
          <div className="mt-4"><ProgressChart points={main.series} showAverage={false} height={180} /></div>
        </Card>
      ) : (
        <EmptyState icon="progress" title="No timed laps yet" action={<LinkButton to="/ride" variant="primary">Record your first session</LinkButton>}>
          Ride a route at least twice and this card will tell you exactly how much faster you're getting.
        </EmptyState>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><Stat label="Sessions" value={stats.sessions.length} sub={streak > 1 ? `${streak}-week streak` : `${stats.thisMonthCount} this month`} /></Card>
        <Card><Stat label="Timed laps" value={stats.totalLaps} /></Card>
        <Card><Stat label="PBs this month" value={stats.pbsThisMonth} tone={stats.pbsThisMonth ? "plate" : "default"} /></Card>
        <Card><Stat label="Riding time" value={`${Math.round(stats.totalTimeMs / 3600000)} h`} /></Card>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {latest && (
          <Card>
            <SectionTitle action={<Link to="/sessions" className="text-sm font-semibold text-plate">All →</Link>}>Latest ride</SectionTitle>
            <SessionRow session={latest} route={latest.routeId ? db.routes[latest.routeId] : null} />
          </Card>
        )}
        {main && (
          <Card>
            <SectionTitle>Favourite route</SectionTitle>
            <Link to={`/routes/${main.route.id}`} className="flex items-center gap-4 rounded-xl p-1 hover:bg-surface-2">
              <RouteSvg lines={[{ id: "r", coords: main.route.polyline.map((p) => [p[0], p[1]]), color: "#ffd21f", width: 3 }]} className="size-20 shrink-0" />
              <div className="min-w-0">
                <div className="truncate font-semibold">{main.route.name}</div>
                <div className="text-sm text-muted">{main.series.length} sessions · PB {formatLap(main.pbMs)}</div>
              </div>
            </Link>
          </Card>
        )}
      </div>

      {recentPbs.length > 0 && (
        <Card>
          <SectionTitle>Recent PBs</SectionTitle>
          <div className="-mx-2">{recentPbs.map((s) => <SessionRow key={s.id} session={s} route={s.routeId ? db.routes[s.routeId] : null} />)}</div>
        </Card>
      )}
    </div>
  );
}

const shortName = (n: string) => n.split(" ").slice(0, 2).join(" ");

function Verdict({ improvement, routeName }: { improvement: RouteImprovement | null; routeName: string }) {
  if (!improvement) return <p className="text-lg">One session on {routeName} so far. Ride it again to measure progress.</p>;
  const faster = improvement.improvementMs > 0;
  return (
    <div>
      <p className={`font-display text-5xl font-black uppercase leading-none ${faster ? "text-faster" : "text-ink"}`}>{faster ? "Yes." : "Not yet."}</p>
      <p className="mt-2 text-lg leading-snug">
        {faster ? (
          <>Your {shortName(routeName)} PB is <strong className="font-mono tnum">{(improvement.improvementMs / 1000).toFixed(1)} s</strong> faster than your first session — <strong className="font-mono tnum">{improvement.improvementPct.toFixed(1)}%</strong> in {formatSpan(improvement.pbAt - improvement.firstAt)}.</>
        ) : (
          <>Your best on {routeName} is still the first session ({formatDate(improvement.firstAt)}). Keep at it.</>
        )}
      </p>
    </div>
  );
}
