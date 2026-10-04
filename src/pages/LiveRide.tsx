import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { Delta } from "@/components/Delta";
import { HoldButton } from "@/components/live/HoldButton";
import { SimulatorPanel } from "@/components/live/SimulatorPanel";
import { StatusChip, type ChipTone } from "@/components/StatusChip";
import { formatClock, formatLap } from "@/domain/time";
import { validLaps } from "@/domain/stats";
import { useBattery } from "@/hooks/useBattery";
import { useDb } from "@/hooks/useDb";
import { useNow } from "@/hooks/useNow";
import { useOnline } from "@/hooks/useOnline";
import { useWakeLock } from "@/hooks/useWakeLock";
import { rideEngine, type GpsState } from "@/session/engine";
import { useRide } from "@/session/useRide";

const GPS_LABEL: Record<GpsState, [string, ChipTone]> = {
  off: ["GPS off", "idle"], searching: ["GPS searching", "warn"], good: ["GPS good", "ok"], fair: ["GPS fair", "warn"],
  poor: ["GPS poor", "bad"], denied: ["GPS blocked", "bad"], error: ["GPS error", "bad"],
};

export default function LiveRide() {
  const snap = useRide();
  const db = useDb();
  const now = useNow(100);
  const online = useOnline();
  const battery = useBattery();
  const wake = useWakeLock(Boolean(snap.ride));
  const navigate = useNavigate();
  const [who, setWho] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [finishing, setFinishing] = useState(false);

  if (!snap.ride) return finishing ? null : <Navigate to="/ride" replace />;
  const ride = snap.ride;
  const participant = ride.participants[Math.min(who, ride.participants.length - 1)]!;
  const rider = db.riders[participant.riderId];
  const live = rideEngine.liveFor(participant.riderId);
  const laps = live.laps;
  const valid = validLaps(laps);
  const last = laps[laps.length - 1] ?? null;
  const best = valid.length ? Math.min(...valid.map((l) => l.durationMs)) : null;
  const pb = live.pbMs;
  const route = ride.setup.routeId ? db.routes[ride.setup.routeId] : null;
  const isGps = ride.setup.timing.mode === "gps";
  const timing = snap.timing;
  const tag = participant.transponderId ? db.transponders[participant.transponderId] : null;
  const [gpsText, gpsTone] = GPS_LABEL[snap.gps.state];
  const newPb = best != null && (pb == null || best < pb);

  const finish = async () => {
    setFinishing(true);
    const id = await rideEngine.finish();
    navigate(`/sessions/${id}`, { replace: true });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg px-4 pb-6 safe-top">
      <div className="flex flex-wrap items-center gap-2 py-3">
        <StatusChip icon="gps" tone={gpsTone}>{gpsText}{snap.gps.accuracyM != null && snap.gps.state !== "searching" ? ` ±${snap.gps.accuracyM}m` : ""}</StatusChip>
        {timing && (
          <StatusChip icon="tag" tone={timing.state === "connected" ? "ok" : timing.state === "connecting" ? "warn" : "bad"}>
            {timing.isSimulated ? "Simulator" : timing.providerName} {timing.state === "connected" ? "linked" : timing.state}
            {tag ? ` · ${tag.code}` : ""}{tag?.batteryPct != null ? ` ${tag.batteryPct}%` : ""}
          </StatusChip>
        )}
        {battery && <StatusChip icon="battery" tone={battery.pct < 20 && !battery.charging ? "bad" : "idle"}>Phone {battery.pct}%</StatusChip>}
        {!online && <StatusChip icon="offline" tone="warn">Offline · saving locally</StatusChip>}
        {!wake && "wakeLock" in navigator && <StatusChip icon="bolt" tone="warn">Keep screen on</StatusChip>}
      </div>
      {snap.gps.message && <p className="mb-2 rounded-xl bg-slower/10 p-3 text-sm text-slower">{snap.gps.message.replace(/\.?$/, ".")} {isGps ? "GPS timing can't run without location." : "Pod timing still works."}</p>}

      {ride.participants.length > 1 && (
        <div role="tablist" className="mb-2 flex gap-2">
          {ride.participants.map((p, i) => (
            <button key={p.riderId} role="tab" aria-selected={i === who} type="button" onClick={() => setWho(i)}
              className={`min-h-12 flex-1 rounded-xl border font-semibold ${i === who ? "border-plate bg-plate text-plate-ink" : "border-line"}`}>
              {db.riders[p.riderId]?.name.split(" ")[0]} #{db.riders[p.riderId]?.raceNumber}
            </button>
          ))}
        </div>
      )}

      <div className="font-mono text-sm uppercase tracking-[0.14em] text-muted">
        {rider?.name} · {route?.name ?? "Free ride"} · {formatClock(now - ride.startedAt)} total
      </div>

      <section aria-live="polite" className="mt-2 flex-1">
        <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted">{live.openSince ? `Lap ${laps.length + 1}` : laps.length ? "Waiting for next crossing" : "Cross the start line"}</div>
        <div className="font-mono text-[clamp(4.5rem,22vw,9rem)] font-bold leading-none tnum">
          {live.openSince ? formatClock(now - live.openSince) : "—:——"}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Last lap</div>
            <div className="font-mono text-5xl font-bold tnum">{formatLap(last?.durationMs)}</div>
            <div className="min-h-8">
              {last && pb != null && <><Delta ms={last.durationMs - pb} className="text-2xl" /><span className="ml-1 text-sm text-muted">vs PB</span></>}
            </div>
          </div>
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted">{newPb && pb != null ? "New PB!" : "Best today"}</div>
            <div className={`font-mono text-5xl font-bold tnum ${newPb && pb != null ? "text-plate" : ""}`}>{formatLap(best)}</div>
            <div className="text-sm text-muted">PB {formatLap(pb)}</div>
          </div>
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Previous</div>
            <div className="font-mono text-3xl font-bold tnum text-muted">{formatLap(laps[laps.length - 2]?.durationMs)}</div>
          </div>
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Laps</div>
            <div className="font-mono text-3xl font-bold tnum">{laps.length}</div>
          </div>
        </div>
        {isGps && <p className="mt-4 text-sm text-muted">GPS-timed laps are typically within ±0.5–1 s. Use a transponder for exact times.</p>}
      </section>

      <div className="mt-6 space-y-3">
        {isGps && !route && <Button size="xl" className="w-full" onClick={() => rideEngine.markLap()}>Mark lap</Button>}
        <HoldButton label="finish" onConfirm={finish} className="w-full" />
        <SimulatorPanel timing={ride.setup.timing}
          tags={ride.participants.filter((p) => p.tagCode).map((p) => ({ code: p.tagCode!, label: db.riders[p.riderId]?.name ?? "" }))} />
        {confirmDiscard ? (
          <div className="flex gap-2">
            <Button variant="danger" className="flex-1" onClick={() => { void rideEngine.discard().then(() => navigate("/ride", { replace: true })); }}>Delete this ride</Button>
            <Button className="flex-1" onClick={() => setConfirmDiscard(false)}>Keep riding</Button>
          </div>
        ) : (
          <Button variant="ghost" className="w-full text-muted" onClick={() => setConfirmDiscard(true)}>Discard ride…</Button>
        )}
        <Button variant="ghost" className="w-full text-muted" onClick={() => navigate("/")}>Minimise (ride keeps recording)</Button>
      </div>
    </div>
  );
}
