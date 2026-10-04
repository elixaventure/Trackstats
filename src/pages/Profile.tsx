import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, LinkButton } from "@/components/Button";
import { Card, SectionTitle } from "@/components/Card";
import { TextField } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { ListRow } from "@/components/ListRow";
import { PageHeader } from "@/components/PageHeader";
import { Plate } from "@/components/RiderBadge";
import { SECONDARY_NAV } from "@/components/AppShell";
import { addGroupMember, addManagedRider, setActiveRider } from "@/data/actions";
import { activeRider, myRiders, riderBikes } from "@/data/selectors";
import { useDb } from "@/hooks/useDb";

export default function Profile() {
  const db = useDb();
  const navigate = useNavigate();
  const rider = activeRider(db)!;
  const bikes = riderBikes(db, rider.id);
  const riders = myRiders(db);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const addRider = () => {
    if (!newName.trim()) return;
    const r = addManagedRider(newName.trim());
    const family = Object.values(db.groups).find((g) => g.kind === "family" && g.createdByUserId === db.user.id);
    if (family) addGroupMember(family.id, r.id);
    setActiveRider(r.id);
    navigate(`/profile/rider/${r.id}`);
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Profile" />
      <Card className="flex items-center gap-4">
        <Plate rider={rider} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-3xl font-black uppercase leading-none">{rider.name || "Unnamed rider"}</div>
          <div className="truncate text-muted">{[rider.username && `@${rider.username}`, rider.riderClass, rider.homeRegion].filter(Boolean).join(" · ")}</div>
          <div className="text-sm text-muted">{rider.visibility === "public" ? "Public profile" : "Private profile"}{rider.ageCategory ? ` · ${rider.ageCategory}` : ""}</div>
        </div>
        <LinkButton to={`/profile/rider/${rider.id}`} aria-label="Edit profile"><Icon name="edit" /></LinkButton>
      </Card>

      <Card>
        <SectionTitle action={<LinkButton to="/profile/bikes/new" className="min-h-10 px-3 text-sm"><Icon name="plus" className="size-4" /> Add bike</LinkButton>}>Bikes</SectionTitle>
        {bikes.length ? bikes.map((b) => (
          <ListRow key={b.id} to={`/profile/bikes/${b.id}`} icon="bike" title={`${b.manufacturer} ${b.model}${b.nickname ? ` · ${b.nickname}` : ""}`}
            sub={`${b.year ?? ""} ${b.capacity} · ${b.bikeClass}${rider.defaultBikeId === b.id ? " · default" : ""}`} />
        )) : <p className="text-muted">No bikes yet.</p>}
      </Card>

      <Card>
        <SectionTitle>Riders on this account</SectionTitle>
        <p className="mb-3 text-sm text-muted">Manage children or other riders from this phone. Each keeps separate stats.</p>
        <div className="space-y-1">
          {riders.map((r) => (
            <button key={r.id} type="button" onClick={() => setActiveRider(r.id)}
              className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left ${r.id === rider.id ? "bg-plate/10" : "hover:bg-surface-2"}`}>
              <Plate rider={r} size="sm" /><span className="flex-1 font-semibold">{r.name || "Unnamed rider"}</span>
              {r.id === rider.id && <span className="text-xs font-bold uppercase text-plate">Active</span>}
            </button>
          ))}
        </div>
        {adding ? (
          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1"><TextField label="Rider name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus /></div>
            <Button variant="primary" onClick={addRider}>Add</Button>
          </div>
        ) : <Button className="mt-3" onClick={() => setAdding(true)}><Icon name="plus" /> Add a rider</Button>}
      </Card>

      <Card className="p-2">
        {SECONDARY_NAV.map((n) => <ListRow key={n.to} to={n.to} icon={n.icon} title={n.label} />)}
      </Card>
    </div>
  );
}
