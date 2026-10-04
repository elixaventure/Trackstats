import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, LinkButton } from "@/components/Button";
import { TextField, Toggle } from "@/components/Field";
import { ImagePicker } from "@/components/ImagePicker";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/States";
import { saveRider } from "@/data/actions";
import type { RiderProfile } from "@/domain/types";
import { useDb } from "@/hooks/useDb";

export default function RiderEdit() {
  const { id = "" } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const original = db.riders[id];
  const [r, setR] = useState<RiderProfile | undefined>(original);
  const [error, setError] = useState<string | null>(null);
  if (!r || !original || original.ownerUserId !== db.user.id) return <EmptyState title="Rider not found" action={<LinkButton to="/profile">Profile</LinkButton>} />;
  const set = <K extends keyof RiderProfile>(k: K, v: RiderProfile[K]) => setR({ ...r, [k]: v });

  const save = () => {
    if (!r.name.trim()) return setError("Name is required.");
    if (r.username && !/^[a-z0-9_.]{3,30}$/.test(r.username)) return setError("Username: 3–30 lowercase letters, numbers, dots or underscores.");
    saveRider({ ...r, name: r.name.trim(), raceNumber: r.raceNumber.trim() });
    navigate("/profile");
  };

  return (
    <div className="space-y-4">
      <PageHeader back="/profile" title="Edit rider" />
      <ImagePicker label="Profile photo" value={r.imageDataUrl} onChange={(v) => set("imageDataUrl", v)} />
      <TextField label="Rider name" value={r.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" />
      <TextField label="Username" value={r.username} onChange={(e) => set("username", e.target.value.toLowerCase())} autoCapitalize="none" />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Race number" inputMode="numeric" value={r.raceNumber} onChange={(e) => set("raceNumber", e.target.value.slice(0, 4))} />
        <TextField label="Class" value={r.riderClass} onChange={(e) => set("riderClass", e.target.value)} placeholder="MX2 Clubman" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Age category (optional)" value={r.ageCategory ?? ""} onChange={(e) => set("ageCategory", e.target.value || null)} />
        <TextField label="Home region" value={r.homeRegion ?? ""} onChange={(e) => set("homeRegion", e.target.value || null)} />
      </div>
      <Toggle label="Public profile" description="Show this rider on public route leaderboards." checked={r.visibility === "public"} onChange={(v) => set("visibility", v ? "public" : "private")} />
      {error && <p role="alert" className="text-slower">{error}</p>}
      <Button variant="primary" size="lg" className="w-full" onClick={save}>Save</Button>
    </div>
  );
}
