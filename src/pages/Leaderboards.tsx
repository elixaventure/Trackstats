import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/Card";
import { SelectField } from "@/components/Field";
import { PageHeader } from "@/components/PageHeader";
import { Segmented } from "@/components/Segmented";
import { EmptyState } from "@/components/States";
import { groupRiderIds, groupsForRider, myRiders, visibleRoutes } from "@/data/selectors";
import { buildLeaderboard, entriesFromSessions, type ConditionFilter, type LeaderboardFilter, type Period } from "@/domain/leaderboard";
import { formatLap } from "@/domain/time";
import { CONDITION_LABEL, type TrackCondition } from "@/domain/types";
import { useDb } from "@/hooks/useDb";

export default function Leaderboards() {
  const db = useDb();
  const [params, setParams] = useSearchParams();
  const routes = visibleRoutes(db);
  const routeId = params.get("route") ?? routes.find((r) => r.favourite)?.id ?? routes[0]?.id ?? "";
  const route = db.routes[routeId];
  const me = myRiders(db);
  const myIds = new Set(me.map((r) => r.id));

  const entries = useMemo(() => [
    ...Object.values(db.leaderboard).filter((e) => !myIds.has(e.riderId)),
    ...entriesFromSessions(Object.values(db.sessions).filter((s) => myIds.has(s.riderId)), Object.values(db.laps), db.riders, db.bikes),
  ], [db]); // eslint-disable-line react-hooks/exhaustive-deps

  const sources = new Set(entries.filter((e) => e.routeId === routeId).map((e) => e.source));
  const [sourcePick, setSource] = useState<LeaderboardFilter["source"] | null>(null);
  const source = sourcePick && sources.has(sourcePick) ? sourcePick : sources.has("transponder") ? "transponder" : "gps";
  const [riderClass, setClass] = useState("all");
  const [condition, setCondition] = useState<ConditionFilter>("all");
  const [period, setPeriod] = useState<Period>("all");
  const [scope, setScope] = useState("everyone");
  const groups = groupsForRider(db, db.activeRiderId);
  const classes = [...new Set(entries.filter((e) => e.routeId === routeId).map((e) => e.riderClass))].sort();

  const rows = route ? buildLeaderboard(route, entries, {
    routeId, source, riderClass, condition, period, riderIds: scope === "everyone" ? null : groupRiderIds(db, scope),
  }) : [];

  if (!route) return <div><PageHeader title="Leaderboards" /><EmptyState title="No routes yet" /></div>;

  return (
    <div className="space-y-4">
      <PageHeader title="Leaderboards" eyebrow="Personal bests, ranked" />
      <SelectField label="Route" value={routeId} onChange={(e) => setParams({ route: e.target.value }, { replace: true })}>
        {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </SelectField>
      <Segmented label="Timing" value={source} onChange={setSource} options={[
        { value: "transponder", label: "Transponder", disabled: !sources.has("transponder"), hint: "No transponder laps here" },
        { value: "gps", label: "GPS timed", disabled: !sources.has("gps"), hint: "No GPS laps here" },
      ]} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SelectField label="Class" value={riderClass} onChange={(e) => setClass(e.target.value)}>
          <option value="all">All classes</option>
          {classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectField>
        <SelectField label="Conditions" value={condition} onChange={(e) => setCondition(e.target.value as ConditionFilter)}>
          <option value="all">Any</option>
          {(Object.keys(CONDITION_LABEL) as TrackCondition[]).map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
        </SelectField>
        <SelectField label="Period" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          <option value="all">All time</option><option value="year">Last 12 months</option><option value="30d">Last 30 days</option><option value="7d">Last 7 days</option>
        </SelectField>
        <SelectField label="Who" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="everyone">Everyone</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </SelectField>
      </div>
      <p className="text-sm text-muted">Only laps on this route's current layout (v{route.configVersion}) count. Transponder and GPS-timed laps are ranked separately because GPS timing is far less precise.</p>

      {rows.length ? (
        <Card className="p-2">
          <ol>
            {rows.map((r) => {
              const mine = myIds.has(r.riderId);
              return (
                <li key={r.riderId} className={`flex min-h-14 items-center gap-3 rounded-xl px-2 ${mine ? "bg-plate/10 ring-1 ring-plate/50" : ""}`}>
                  <span className={`w-8 text-right font-mono font-bold tnum ${r.rank <= 3 ? "text-plate" : "text-muted"}`}>{r.rank}</span>
                  <span className="grid h-8 min-w-10 place-items-center rounded-md bg-surface-2 px-1 font-display font-black">{r.raceNumber}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.riderName}{mine && <span className="ml-2 text-xs uppercase text-plate">You</span>}</span>
                    <span className="block truncate text-xs text-muted">{r.riderClass} · {CONDITION_LABEL[r.condition]}</span>
                  </span>
                  <span className="text-right font-mono tnum">
                    <span className="block font-bold">{formatLap(r.lapMs)}</span>
                    {r.rank > 1 && <span className="block text-xs text-muted">+{(r.gapMs / 1000).toFixed(2)}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      ) : <EmptyState icon="trophy" title="No times match">Try widening the filters.</EmptyState>}
      {db.settings.demoMode && <p className="text-xs text-muted">Demo mode: other riders on this board are sample data.</p>}
    </div>
  );
}
