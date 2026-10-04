import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, LinkButton } from "@/components/Button";
import { Card } from "@/components/Card";
import { SelectField, TextArea } from "@/components/Field";
import { PageHeader } from "@/components/PageHeader";
import { Segmented } from "@/components/Segmented";
import { ErrorNote } from "@/components/States";
import { activeAssignment, assignTransponder } from "@/data/actions";
import { activeRider, groupsForRider, myRiders, riderBikes, visibleRoutes } from "@/data/selectors";
import type { DbState } from "@/data/db";
import { podsFor } from "@/domain/laps";
import { CONDITION_LABEL, RIDE_TYPE_LABEL, TIMING_MODE_LABEL, isLoopType, type RideType, type TimingMode, type TrackCondition } from "@/domain/types";
import { useDb } from "@/hooks/useDb";
import { rideEngine } from "@/session/engine";
import { useRide } from "@/session/useRide";

/** Tags this rider may use: their own, plus shared tags of their groups that nobody else is wearing. */
function availableTags(db: DbState, riderId: string) {
  const groupIds = new Set(groupsForRider(db, riderId).map((g) => g.id));
  return Object.values(db.transponders).filter((t) => {
    if (t.status !== "active") return false;
    const mine = t.ownership === "personal" ? t.ownerRiderId === riderId : t.ownerGroupId != null && groupIds.has(t.ownerGroupId);
    const holder = activeAssignment(db, t.id);
    return mine && (!holder || holder.riderId === riderId);
  });
}

export default function StartRide() {
  const db = useDb();
  const ride = useRide();
  const navigate = useNavigate();
  const rider = activeRider(db)!;
  const [rideType, setRideType] = useState<RideType>("mx_circuit");
  const loop = isLoopType(rideType);
  const routes = useMemo(() => visibleRoutes(db).filter((r) => (rideType === "free_ride" ? false : r.isLoop === loop)), [db, rideType, loop]);
  const [routeId, setRouteId] = useState<string>(() => routes[0]?.id ?? "");
  const route = routes.find((r) => r.id === routeId) ?? null;
  const [mode, setMode] = useState<TimingMode>("lap");
  const [sectors, setSectors] = useState(2);
  const bikes = riderBikes(db, rider.id);
  const [bikeId, setBikeId] = useState(rider.defaultBikeId ?? bikes[0]?.id ?? "");
  const tags = availableTags(db, rider.id);
  const [tagId, setTagId] = useState(() => tags.find((t) => activeAssignment(db, t.id)?.riderId === rider.id)?.id ?? tags[0]?.id ?? "");
  const [condition, setCondition] = useState<TrackCondition>("dry");
  const [notes, setNotes] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({}); // riderId → tagId
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (ride.ride) {
    return (
      <div>
        <PageHeader title="Ride" />
        <Card><p className="mb-4">A ride is already running.</p><LinkButton to="/ride/live" variant="primary" size="lg">Return to live ride</LinkButton></Card>
      </div>
    );
  }

  const effectiveMode: TimingMode = rideType === "free_ride" ? "gps" : mode;
  const modeOptions = (["gps", "lap", "start_finish", "sectors"] as TimingMode[]).map((m) => {
    const invalid = rideType === "free_ride" ? m !== "gps" : loop ? m === "start_finish" : m === "lap";
    return { value: m, label: TIMING_MODE_LABEL[m], disabled: invalid, hint: invalid ? (loop ? "Loops use one start/finish pod" : "Stages need separate start and finish") : undefined };
  });
  const usesPods = effectiveMode !== "gps";
  const otherRiders = myRiders(db).filter((r) => r.id !== rider.id);

  const pickType = (t: RideType) => {
    setRideType(t);
    const l = isLoopType(t);
    setMode(t === "free_ride" ? "gps" : l ? "lap" : "start_finish");
    setRouteId(visibleRoutes(db).find((r) => r.isLoop === l)?.id ?? "");
  };

  const start = async () => {
    setError(null);
    if (usesPods && !tagId) return setError("Pick a transponder, or switch to GPS-only timing.");
    if (effectiveMode === "gps" && !route && rideType !== "free_ride" && !loop) return setError("GPS timing on a stage needs a saved route with a start and finish.");
    setBusy(true);
    try {
      const participants = [{ riderId: rider.id, bikeId: bikeId || null, transponderId: usesPods ? tagId : null }];
      if (usesPods) for (const [rid, tid] of Object.entries(extra)) if (tid) participants.push({ riderId: rid, bikeId: db.riders[rid]?.defaultBikeId ?? null, transponderId: tid });
      for (const p of participants) if (p.transponderId && activeAssignment(db, p.transponderId)?.riderId !== p.riderId) await assignTransponder(p.transponderId, p.riderId);
      await rideEngine.start({
        rideType, routeId: rideType === "free_ride" ? null : route?.id ?? null, condition, notes, participants,
        timing: { mode: effectiveMode, pods: podsFor(effectiveMode, loop, sectors), isLoop: loop },
      });
      navigate("/ride/live");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Start ride" eyebrow={rider.name} />
      <Segmented label="Ride type" columns={2} value={rideType} onChange={pickType}
        options={(Object.keys(RIDE_TYPE_LABEL) as RideType[]).map((t) => ({ value: t, label: RIDE_TYPE_LABEL[t] }))} />

      {rideType !== "free_ride" && (
        <SelectField label="Route" value={routeId} onChange={(e) => setRouteId(e.target.value)}
          hint={!routes.length ? "No saved routes of this kind yet. You can still time laps with pods or manual marks." : effectiveMode === "gps" ? "GPS timing uses this route's start/finish gate." : undefined}>
          <option value="">No route (unsaved)</option>
          {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </SelectField>
      )}

      {rideType !== "free_ride" && <Segmented label="Timing" value={mode} onChange={setMode} options={modeOptions} />}
      {effectiveMode === "sectors" && (
        <Segmented label="Sector pods" columns={3} value={String(sectors)} onChange={(v) => setSectors(Number(v))}
          options={["1", "2", "3"].map((n) => ({ value: n, label: `${n} sector${n === "1" ? "" : "s"}` }))} />
      )}
      {effectiveMode === "gps" && !route && rideType !== "free_ride" && loop && (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">No route selected: tap <strong className="text-ink">Mark lap</strong> as you cross your line, or pick a route for automatic GPS laps.</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Bike" value={bikeId} onChange={(e) => setBikeId(e.target.value)}>
          <option value="">No bike</option>
          {bikes.map((b) => <option key={b.id} value={b.id}>{b.manufacturer} {b.model}{b.nickname ? ` (${b.nickname})` : ""}</option>)}
        </SelectField>
        {usesPods && (
          <SelectField label="Transponder" value={tagId} onChange={(e) => setTagId(e.target.value)}
            hint={!tags.length ? "No free tags. Add or release one on the Transponders screen." : undefined}>
            <option value="">Choose a tag</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.nickname} · {t.code}{t.ownership === "shared" ? " (shared)" : ""}</option>)}
          </SelectField>
        )}
      </div>

      {usesPods && otherRiders.length > 0 && (
        <Card>
          <h2 className="mb-1 font-semibold">Also time riders you manage</h2>
          <p className="mb-3 text-sm text-muted">Each rider needs their own tag. Laps are saved to their own profile.</p>
          <div className="space-y-3">
            {otherRiders.map((r) => (
              <SelectField key={r.id} label={r.name || "Unnamed rider"} value={extra[r.id] ?? ""} onChange={(e) => setExtra({ ...extra, [r.id]: e.target.value })}>
                <option value="">Not riding</option>
                {availableTags(db, r.id).filter((t) => t.id !== tagId && !Object.entries(extra).some(([k, v]) => k !== r.id && v === t.id))
                  .map((t) => <option key={t.id} value={t.id}>{t.nickname} · {t.code}</option>)}
              </SelectField>
            ))}
          </div>
        </Card>
      )}

      <Segmented label="Track conditions" columns={5} value={condition} onChange={setCondition}
        options={(Object.keys(CONDITION_LABEL) as TrackCondition[]).map((c) => ({ value: c, label: CONDITION_LABEL[c] }))} />
      <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tyre pressures, setup changes, goals…" />

      {error && <ErrorNote title="Can't start yet">{error}</ErrorNote>}
      <Button variant="primary" size="xl" className="w-full" onClick={start} disabled={busy}>{busy ? "Starting…" : "Start session"}</Button>
    </div>
  );
}
