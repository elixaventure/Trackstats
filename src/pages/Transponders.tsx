import { useState } from "react";
import { Button } from "@/components/Button";
import { Card, SectionTitle } from "@/components/Card";
import { SelectField, TextField } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { Segmented } from "@/components/Segmented";
import { EmptyState } from "@/components/States";
import { activeAssignment, assignTransponder, releaseTransponder, saveTransponder } from "@/data/actions";
import { activeRider, groupRiderIds, myRiders } from "@/data/selectors";
import type { DbState } from "@/data/db";
import { formatDateTime, formatRelativeDays } from "@/domain/time";
import type { Transponder } from "@/domain/types";
import { useDb } from "@/hooks/useDb";
import { uuid } from "@/lib/id";

/** Riders this account may hand a tag to: riders it manages, plus members of groups it manages (for shared tags). */
function candidates(db: DbState, t: Transponder) {
  const ids = new Set(myRiders(db).map((r) => r.id));
  if (t.ownerGroupId) {
    const managed = Object.values(db.groupMembers).some((m) => m.groupId === t.ownerGroupId && m.role === "manager" && ids.has(m.riderId));
    if (managed) groupRiderIds(db, t.ownerGroupId).forEach((id) => ids.add(id));
  }
  return [...ids].map((id) => db.riders[id]).filter((r) => r != null);
}

export default function Transponders() {
  const db = useDb();
  const tags = Object.values(db.transponders).sort((a, b) => a.code.localeCompare(b.code));
  return (
    <div className="space-y-5">
      <PageHeader title="Transponders" eyebrow="Timing tags" />
      <p className="-mt-2 text-muted">Shared tags move between riders. Every lap stays with the rider who rode it, whoever wears the tag next.</p>
      {tags.length ? tags.map((t) => <TagCard key={t.id} tag={t} db={db} />) : <EmptyState icon="tag" title="No tags yet">Add your own transponder or a shared one for your group.</EmptyState>}
      <AddTag db={db} />
    </div>
  );
}

function TagCard({ tag, db }: { tag: Transponder; db: DbState }) {
  const holder = activeAssignment(db, tag.id);
  const holderRider = holder ? db.riders[holder.riderId] : null;
  const options = candidates(db, tag);
  const [pick, setPick] = useState("");
  const owner = tag.ownership === "personal" ? db.riders[tag.ownerRiderId ?? ""]?.name : db.groups[tag.ownerGroupId ?? ""]?.name;
  const history = Object.values(db.assignments).filter((a) => a.transponderId === tag.id).sort((a, b) => b.assignedAt - a.assignedAt).slice(0, 4);

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid h-14 min-w-14 place-items-center rounded-xl bg-plate px-2 font-mono text-lg font-bold text-plate-ink">{tag.code}</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{tag.nickname}</div>
          <div className="text-sm text-muted">{tag.ownership === "shared" ? "Shared" : "Personal"} · {owner ?? "Unknown owner"}</div>
          <div className="text-sm text-muted">
            {tag.batteryPct != null ? `Battery ${tag.batteryPct}%` : "Battery not reported"} · {tag.lastSeenAt ? `Seen ${formatRelativeDays(tag.lastSeenAt).toLowerCase()}` : "Never seen"}
            {tag.status !== "active" && <span className="ml-1 font-semibold text-slower">· {tag.status}</span>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-3">
        <Icon name="profile" className="size-5 text-muted" />
        <span className="flex-1">{holderRider ? <>Assigned to <strong>{holderRider.name}</strong></> : <span className="text-faster">Free to use</span>}</span>
        {holder && <Button variant="secondary" onClick={() => void releaseTransponder(tag.id)}>Release</Button>}
      </div>
      {tag.status === "active" && options.length > 0 && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <SelectField label={holder ? "Hand over to" : "Assign to"} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose rider</option>
              {options.filter((r) => r.id !== holder?.riderId).map((r) => <option key={r.id} value={r.id}>{r.name}{r.raceNumber ? ` #${r.raceNumber}` : ""}</option>)}
            </SelectField>
          </div>
          <Button variant="primary" disabled={!pick} onClick={() => { void assignTransponder(tag.id, pick); setPick(""); }}>Assign</Button>
        </div>
      )}
      {history.length > 0 && (
        <details>
          <summary className="min-h-10 cursor-pointer py-2 text-sm text-muted">Recent assignments</summary>
          <ul className="space-y-1 text-sm">
            {history.map((a) => (
              <li key={a.id} className="flex justify-between gap-2">
                <span>{db.riders[a.riderId]?.name ?? "Rider"}</span>
                <span className="text-muted">{formatDateTime(a.assignedAt)} → {a.releasedAt ? formatDateTime(a.releasedAt) : "now"}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex gap-2">
        {tag.status === "active"
          ? <Button variant="ghost" className="text-muted" onClick={() => saveTransponder({ ...tag, status: "lost" })}>Mark lost</Button>
          : <Button variant="ghost" onClick={() => saveTransponder({ ...tag, status: "active" })}>Mark found</Button>}
      </div>
    </Card>
  );
}

function AddTag({ db }: { db: DbState }) {
  const rider = activeRider(db)!;
  const managedGroups = Object.values(db.groups).filter((g) => Object.values(db.groupMembers).some((m) => m.groupId === g.id && m.role === "manager" && db.riders[m.riderId]?.ownerUserId === db.user.id));
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [kind, setKind] = useState<"personal" | "shared">("personal");
  const [groupId, setGroupId] = useState(managedGroups[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  if (!open) return <Button className="w-full" onClick={() => setOpen(true)}><Icon name="plus" /> Add transponder</Button>;
  const add = () => {
    const c = code.trim().toUpperCase();
    if (!c) return setError("Enter the code printed on the tag.");
    if (Object.values(db.transponders).some((t) => t.code === c)) return setError("A tag with that code already exists.");
    if (kind === "shared" && !groupId) return setError("Shared tags belong to a group. Create one on the Groups screen first.");
    saveTransponder({
      id: uuid(), code: c, nickname: nickname.trim() || `Tag ${c}`, ownership: kind, ownerRiderId: kind === "personal" ? rider.id : null,
      ownerGroupId: kind === "shared" ? groupId : null, batteryPct: null, lastSeenAt: null, status: "active",
    });
    setOpen(false); setCode(""); setNickname(""); setError(null);
  };
  return (
    <Card className="space-y-3">
      <SectionTitle>New transponder</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Tag code" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
        <TextField label="Nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </div>
      <Segmented label="Ownership" value={kind} onChange={setKind} options={[{ value: "personal", label: `Personal (${rider.name.split(" ")[0] || "me"})` }, { value: "shared", label: "Shared by a group" }]} />
      {kind === "shared" && (
        <SelectField label="Group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">Choose group</option>
          {managedGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </SelectField>
      )}
      {error && <p role="alert" className="text-slower">{error}</p>}
      <div className="flex gap-2"><Button variant="primary" onClick={add}>Add</Button><Button onClick={() => setOpen(false)}>Cancel</Button></div>
    </Card>
  );
}
