import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, LinkButton } from "@/components/Button";
import { TextField } from "@/components/Field";
import { ImagePicker } from "@/components/ImagePicker";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/States";
import { saveBike, saveRider } from "@/data/actions";
import { activeRider } from "@/data/selectors";
import { cleanVin, vinLooksRight } from "@/domain/parts";
import type { Bike } from "@/domain/types";
import { useDb } from "@/hooks/useDb";
import { uuid } from "@/lib/id";

export default function BikeEdit() {
  const { id = "" } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const rider = activeRider(db)!;
  const existing = id === "new" ? null : db.bikes[id];
  const [b, setB] = useState<Bike>(() => existing ?? {
    id: uuid(), riderId: rider.id, manufacturer: "", model: "", capacity: "", bikeClass: "", year: null, nickname: null, imageDataUrl: null, archived: false, startHours: null, vin: null,
  });
  const [startHours, setStartHours] = useState(existing?.startHours != null ? String(existing.startHours) : "");
  const [error, setError] = useState<string | null>(null);
  if (id !== "new" && !existing) return <EmptyState title="Bike not found" action={<LinkButton to="/profile">Profile</LinkButton>} />;
  const set = <K extends keyof Bike>(k: K, v: Bike[K]) => setB({ ...b, [k]: v });
  const owner = db.riders[b.riderId];

  const save = () => {
    if (!b.manufacturer.trim() || !b.model.trim()) return setError("Manufacturer and model are required.");
    const hrs = startHours.trim() ? Number(startHours) : null;
    if (hrs != null && !(hrs >= 0 && hrs < 10000)) return setError("Hours on the bike should be a number, e.g. 42.5.");
    saveBike({ ...b, manufacturer: b.manufacturer.trim(), model: b.model.trim(), startHours: hrs });
    navigate("/profile");
  };

  return (
    <div className="space-y-4">
      <PageHeader back="/profile" title={existing ? "Edit bike" : "Add bike"} eyebrow={owner?.name} />
      <ImagePicker label="Photo" value={b.imageDataUrl} onChange={(v) => set("imageDataUrl", v)} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Manufacturer" value={b.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} placeholder="Honda" />
        <TextField label="Model" value={b.model} onChange={(e) => set("model", e.target.value)} placeholder="CRF250R" />
        <TextField label="Capacity" value={b.capacity} onChange={(e) => set("capacity", e.target.value)} placeholder="250cc 4T" />
        <TextField label="Class" value={b.bikeClass} onChange={(e) => set("bikeClass", e.target.value)} placeholder="MX2" />
        <TextField label="Year" inputMode="numeric" value={b.year ?? ""} onChange={(e) => set("year", e.target.value ? Number(e.target.value.replace(/\D/g, "").slice(0, 4)) : null)} />
        <TextField label="Nickname" value={b.nickname ?? ""} onChange={(e) => set("nickname", e.target.value || null)} />
      </div>
      <TextField label="Hours on the bike now" inputMode="decimal" value={startHours} onChange={(e) => setStartHours(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0 for a new bike" />
      <p className="-mt-2 text-sm text-muted">From the hour meter, if it has one. Rides recorded in TrackStats are added on top for the service schedule.</p>
      <TextField label="Chassis number (VIN), optional" value={b.vin ?? ""} onChange={(e) => set("vin", cleanVin(e.target.value) || null)} autoCapitalize="characters" spellCheck={false} />
      <p className="-mt-2 text-sm text-muted">
        {b.vin && !vinLooksRight(b.vin) ? "Most frames since 1981 have 17 characters (no I, O or Q): double-check it. " : "Stamped on the steering head. "}
        It goes on your service history so a buyer knows the history belongs to this frame.
      </p>
      {error && <p role="alert" className="text-slower">{error}</p>}
      <Button variant="primary" size="lg" className="w-full" onClick={save}>Save bike</Button>
      {existing && owner && (
        <div className="flex flex-wrap gap-2">
          {owner.defaultBikeId !== b.id && <Button onClick={() => { saveRider({ ...owner, defaultBikeId: b.id }); navigate("/profile"); }}>Make default</Button>}
          <Button variant="danger" onClick={() => { saveBike({ ...b, archived: true }); navigate("/profile"); }}>Archive bike</Button>
        </div>
      )}
      {existing && <p className="text-sm text-muted">Archiving hides the bike from new rides. Past sessions keep it.</p>}
    </div>
  );
}
