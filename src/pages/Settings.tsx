import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, LinkButton } from "@/components/Button";
import { Card, SectionTitle } from "@/components/Card";
import { Toggle } from "@/components/Field";
import { PageHeader } from "@/components/PageHeader";
import { Segmented } from "@/components/Segmented";
import { cloudEnabled } from "@/config/env";
import { updateSettings } from "@/data/actions";
import { resetToDemo } from "@/data/bootstrap";
import { formatDateTime } from "@/domain/time";
import { useDb } from "@/hooks/useDb";
import { useSync } from "@/hooks/useSync";
import { useRide } from "@/session/useRide";
import { sync } from "@/sync/engine";
import { getSupabase } from "@/sync/supabase";

const SYNC_TEXT = { disabled: "Off", signed_out: "Signed out", offline: "Offline — will retry", idle: "Up to date", syncing: "Syncing…", error: "Error — retrying" } as const;

export default function Settings() {
  const db = useDb();
  const s = useSync();
  const ride = useRide();
  const navigate = useNavigate();
  const [confirmReset, setConfirmReset] = useState(false);
  const [storage, setStorage] = useState<{ used: number; persisted: boolean } | null>(null);

  useEffect(() => {
    void (async () => {
      const est = await navigator.storage?.estimate?.();
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      if (est) setStorage({ used: est.usage ?? 0, persisted });
    })();
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" />

      <Card className="space-y-3">
        <SectionTitle>Account & sync</SectionTitle>
        {!cloudEnabled ? (
          <p className="text-muted">Cloud sync isn't configured for this build, so everything stays on this device. Add the Supabase URL and anon key to enable accounts and sync.</p>
        ) : db.settings.demoMode ? (
          <>
            <p className="text-muted">You're exploring demo data. Sign in to start your own account; demo data on this device will be replaced.</p>
            <LinkButton to="/sign-in" variant="primary">Sign in or create account</LinkButton>
          </>
        ) : (
          <>
            <p>Signed in{db.user.email ? ` as ${db.user.email}` : ""}.</p>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted">Status</dt><dd>{SYNC_TEXT[s.state]}</dd>
              <dt className="text-muted">Waiting to upload</dt><dd>{s.pending}</dd>
              <dt className="text-muted">Last sync</dt><dd>{s.lastSyncedAt ? formatDateTime(s.lastSyncedAt) : "—"}</dd>
            </dl>
            {s.lastError && <p className="text-sm text-slower">{s.lastError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void sync.flush()}>Sync now</Button>
              <Button variant="ghost" disabled={Boolean(ride.ride) || s.pending > 0} title={s.pending > 0 ? "Wait for pending changes to upload" : undefined}
                onClick={async () => { await getSupabase()?.auth.signOut(); await resetToDemo(); navigate("/"); }}>Sign out</Button>
            </div>
          </>
        )}
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Offline storage</SectionTitle>
        <p className="text-sm text-muted">Rides record to this phone first and never need signal. Ask the browser to protect that storage from automatic clean-up:</p>
        {storage && <p className="text-sm">Using {(storage.used / 1048576).toFixed(1)} MB · {storage.persisted ? "protected" : "not protected yet"}</p>}
        {storage && !storage.persisted && <Button onClick={async () => { const ok = await navigator.storage.persist(); setStorage({ ...storage, persisted: ok }); }}>Protect ride data</Button>}
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Developer</SectionTitle>
        <Toggle label="Simulated GPS" description="Rides the selected route instead of using the phone's location. For testing indoors." checked={db.settings.simulateGps} onChange={(v) => updateSettings({ simulateGps: v })} />
        {db.settings.simulateGps && (
          <Segmented label="Simulation speed" columns={3} value={String(db.settings.simSpeed)} onChange={(v) => updateSettings({ simSpeed: Number(v) })}
            options={[{ value: "1", label: "Real time" }, { value: "3", label: "3×" }, { value: "6", label: "6×" }]} />
        )}
        <p className="text-sm text-muted">Timing hardware: only the built-in simulator is available. Its controls appear on the live ride screen when a pod timing mode is chosen.</p>
      </Card>

      {db.settings.demoMode && (
        <Card className="space-y-3">
          <SectionTitle>Demo data</SectionTitle>
          <p className="text-sm text-muted">Restore the sample rider, routes and seven weeks of sessions. Anything you've recorded on this device is deleted.</p>
          {confirmReset ? (
            <div className="flex gap-2">
              <Button variant="danger" disabled={Boolean(ride.ride)} onClick={async () => { await resetToDemo(); navigate("/"); }}>Reset everything</Button>
              <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            </div>
          ) : <Button onClick={() => setConfirmReset(true)}>Reset demo data</Button>}
        </Card>
      )}
    </div>
  );
}
