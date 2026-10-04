import { useMemo } from "react";
import { lapsBySession, riderSessions, visibleRoutes } from "@/data/selectors";
import { comparableSessions, progressSeries, routeImprovement, type ProgressPoint, type RouteImprovement } from "@/domain/stats";
import type { Route, Session } from "@/domain/types";
import { useDb } from "./useDb";

export interface RouteProgress { route: Route; sessions: Session[]; series: ProgressPoint[]; improvement: RouteImprovement | null; pbMs: number }

const monthStart = (now: number) => { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };

/** Everything the dashboard/progress screens need for one rider, derived once per data change. */
export function useRiderStats(riderId: string | undefined) {
  const db = useDb();
  return useMemo(() => {
    const sessions = riderId ? riderSessions(db, riderId) : [];
    const lapMap = lapsBySession(db);
    const perRoute: RouteProgress[] = visibleRoutes(db)
      .map((route) => {
        const comp = comparableSessions(sessions, route.id, route.configVersion);
        const series = progressSeries(comp);
        return { route, sessions: comp, series, improvement: routeImprovement(series), pbMs: series.length ? Math.min(...series.map((p) => p.best)) : Infinity };
      })
      .filter((r) => r.series.length > 0)
      .sort((a, b) => Number(b.route.favourite) - Number(a.route.favourite) || b.series.length - a.series.length);

    const now = Date.now();
    const ms = monthStart(now);
    const thisMonth = sessions.filter((s) => s.startedAt >= ms);
    const pbsThisMonth = thisMonth.filter((s) => s.summary?.isPb && s.summary.previousPbMs != null).length;
    const totalLaps = sessions.reduce((a, s) => a + (lapMap.get(s.id)?.length ?? 0), 0);
    const totalTimeMs = sessions.reduce((a, s) => a + (s.summary?.durationMs ?? 0), 0);

    // "Improvement this month" on the main route: PB now vs PB at the start of the month.
    const main = perRoute[0] ?? null;
    let monthGainMs: number | null = null;
    if (main) {
      const before = main.series.filter((p) => p.at < ms);
      const pbBefore = before.length ? Math.min(...before.map((p) => p.best)) : null;
      if (pbBefore != null) monthGainMs = pbBefore - main.pbMs;
    }
    return { sessions, lapMap, perRoute, main, pbsThisMonth, totalLaps, totalTimeMs, monthGainMs, thisMonthCount: thisMonth.length };
  }, [db, riderId]);
}
