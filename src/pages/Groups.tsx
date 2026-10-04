import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/Button";
import { Card, SectionTitle } from "@/components/Card";
import { SelectField, TextField } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { Plate } from "@/components/RiderBadge";
import { Segmented } from "@/components/Segmented";
import { EmptyState } from "@/components/States";
import { addGroupMember, createGroup, removeGroupMember } from "@/data/actions";
import { activeRider, myRiders } from "@/data/selectors";
import type { DbState } from "@/data/db";
import type { Group } from "@/domain/types";
import { useDb } from "@/hooks/useDb";

export default function Groups() {
  const db = useDb();
  const mine = new Set(myRiders(db).map((r) => r.id));
  const groups = Object.values(db.groups).filter((g) => Object.values(db.groupMembers).some((m) => m.groupId === g.id && mine.has(m.riderId)));
  return (
    <div className="space-y-5">
      <PageHeader title="Groups" eyebrow="Family · team · friends" />
      <p className="-mt-2 text-muted">One account can run sessions and hand out tags for the whole group. Every rider keeps their own stats.</p>
      {groups.length ? groups.map((g) => <GroupCard key={g.id} group={g} db={db} />) : <EmptyState icon="users" title="No groups yet" />}
      <NewGroup db={db} />
    </div>
  );
}

function GroupCard({ group, db }: { group: Group; db: DbState }) {
  const members = Object.values(db.groupMembers).filter((m) => m.groupId === group.id);
  const myIds = new Set(myRiders(db).map((r) => r.id));
  const iManage = members.some((m) => m.role === "manager" && myIds.has(m.riderId));
  const addable = myRiders(db).filter((r) => !members.some((m) => m.riderId === r.id));
  const [pick, setPick] = useState("");
  const tags = Object.values(db.transponders).filter((t) => t.ownerGroupId === group.id);
  return (
    <Card className="space-y-3">
      <SectionTitle action={<Link to="/leaderboards" className="text-sm font-semibold text-plate">Group board →</Link>}>{group.kind}</SectionTitle>
      <h2 className="-mt-2 font-display text-3xl font-black uppercase">{group.name}</h2>
      <ul className="space-y-1">
        {members.map((m) => {
          const r = db.riders[m.riderId];
          if (!r) return null;
          return (
            <li key={m.id} className="flex min-h-14 items-center gap-3">
              <Plate rider={r} size="sm" />
              <span className="flex-1"><span className="font-semibold">{r.name}</span><span className="block text-xs uppercase tracking-wide text-muted">{m.role}{myIds.has(r.id) ? " · on this account" : ""}</span></span>
              {iManage && m.role !== "manager" && <Button variant="ghost" className="text-muted" aria-label={`Remove ${r.name}`} onClick={() => removeGroupMember(m.id)}><Icon name="x" className="size-5" /></Button>}
            </li>
          );
        })}
      </ul>
      {tags.length > 0 && <p className="text-sm text-muted">Shared tags: {tags.map((t) => t.code).join(", ")} · <Link to="/transponders" className="text-plate">manage</Link></p>}
      {iManage && addable.length > 0 && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <SelectField label="Add a rider you manage" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose rider</option>
              {addable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </SelectField>
          </div>
          <Button variant="primary" disabled={!pick} onClick={() => { addGroupMember(group.id, pick); setPick(""); }}>Add</Button>
        </div>
      )}
      <p className="text-xs text-muted">Riders with their own accounts join by invite once cloud accounts are switched on; invitations aren't built yet.</p>
    </Card>
  );
}

function NewGroup({ db }: { db: DbState }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Group["kind"]>("friends");
  const rider = activeRider(db)!;
  if (!open) return <Button className="w-full" onClick={() => setOpen(true)}><Icon name="plus" /> New group</Button>;
  return (
    <Card className="space-y-3">
      <TextField label="Group name" value={name} onChange={(e) => setName(e.target.value)} />
      <Segmented label="Kind" columns={3} value={kind} onChange={setKind} options={[{ value: "family", label: "Family" }, { value: "team", label: "Team" }, { value: "friends", label: "Friends" }]} />
      <p className="text-sm text-muted">{rider.name || "The active rider"} will manage it.</p>
      <div className="flex gap-2">
        <Button variant="primary" disabled={!name.trim()} onClick={() => { createGroup(name.trim(), kind, rider.id); setOpen(false); setName(""); }}>Create</Button>
        <Button onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </Card>
  );
}
