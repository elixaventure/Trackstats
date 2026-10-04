import { useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { RiderSwitcher } from "@/components/RiderSwitcher";
import { SessionRow } from "@/components/SessionRow";
import { EmptyState } from "@/components/States";
import { LinkButton } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { SelectField } from "@/components/Field";
import { activeRider, riderSessions } from "@/data/selectors";
import { useDb } from "@/hooks/useDb";

export default function Sessions() {
  const db = useDb();
  const rider = activeRider(db)!;
  const [routeId, setRouteId] = useState("all");
  const sessions = useMemo(() => riderSessions(db, rider.id).filter((s) => routeId === "all" || s.routeId === routeId), [db, rider.id, routeId]);
  const routeIds = [...new Set(riderSessions(db, rider.id).map((s) => s.routeId).filter(Boolean))] as string[];

  return (
    <div className="space-y-4">
      <PageHeader title="Sessions" eyebrow={rider.name} action={<LinkButton to="/import"><Icon name="download" className="size-5" /> Import</LinkButton>} />
      <RiderSwitcher />
      {routeIds.length > 1 && (
        <SelectField label="Route" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
          <option value="all">All routes</option>
          {routeIds.map((id) => <option key={id} value={id}>{db.routes[id]?.name ?? "Deleted route"}</option>)}
        </SelectField>
      )}
      {sessions.length ? (
        <Card className="p-2"><div>{sessions.map((s) => <SessionRow key={s.id} session={s} route={s.routeId ? db.routes[s.routeId] : null} />)}</div></Card>
      ) : (
        <EmptyState title="No sessions yet" action={<LinkButton to="/ride" variant="primary">Start a ride</LinkButton>} />
      )}
    </div>
  );
}
