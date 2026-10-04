import { Link } from "react-router-dom";
import { LinkButton } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { RouteSvg } from "@/components/map/RouteSvg";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/States";
import { toggleFavourite } from "@/data/actions";
import { activeRider, routePb, visibleRoutes } from "@/data/selectors";
import { formatDistance, formatLap } from "@/domain/time";
import { RIDE_TYPE_LABEL } from "@/domain/types";
import { useDb } from "@/hooks/useDb";

export default function Routes() {
  const db = useDb();
  const rider = activeRider(db)!;
  const routes = visibleRoutes(db);
  return (
    <div className="space-y-4">
      <PageHeader title="Routes" action={<LinkButton to="/routes/new" variant="primary"><Icon name="plus" /> Map new route</LinkButton>} />
      {!routes.length && <EmptyState icon="routes" title="No routes yet" action={<LinkButton to="/routes/new" variant="primary">Map a route</LinkButton>}>Record a lap of your track or loop with the phone's GPS, then time every ride on it.</EmptyState>}
      <div className="grid gap-3 md:grid-cols-2">
        {routes.map((r) => {
          const pb = routePb(db, rider.id, r);
          const sessions = Object.values(db.sessions).filter((s) => s.routeId === r.id && s.riderId === rider.id && s.status === "completed").length;
          return (
            <div key={r.id} className="relative rounded-2xl border border-line bg-surface">
              <Link to={`/routes/${r.id}`} className="flex items-center gap-4 p-4 pr-16">
                <RouteSvg lines={[{ id: r.id, coords: r.polyline.map((p) => [p[0], p[1]]), color: "#ffd21f", width: 3 }]} className="size-24 shrink-0 rounded-xl bg-surface-2" />
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold">{r.name}</div>
                  <div className="text-sm text-muted">{RIDE_TYPE_LABEL[r.routeType]} · {formatDistance(r.distanceM)}{r.elevationGainM ? ` · ↑${r.elevationGainM} m` : ""}</div>
                  <div className="mt-1 font-mono text-sm tnum">{pb ? <>PB <span className="font-bold text-plate">{formatLap(pb.ms)}</span> · {sessions} rides</> : <span className="text-muted">Not ridden yet</span>}</div>
                </div>
              </Link>
              <button type="button" onClick={() => toggleFavourite(r.id)} aria-pressed={r.favourite} aria-label={r.favourite ? `Unfavourite ${r.name}` : `Favourite ${r.name}`}
                className="absolute right-2 top-2 grid size-12 place-items-center rounded-xl text-plate hover:bg-surface-2">
                <Icon name="star" filled={r.favourite} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
