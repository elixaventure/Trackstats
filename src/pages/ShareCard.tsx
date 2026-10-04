import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, LinkButton } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorNote, Loading } from "@/components/States";
import { APP_NAME } from "@/config/env";
import { formatDate, formatLap } from "@/domain/time";
import { useDb } from "@/hooks/useDb";
import { renderShareCard, type ShareCardData } from "@/lib/shareCard";

export default function ShareCard() {
  const { id = "" } = useParams();
  const db = useDb();
  const session = db.sessions[id];
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const data = useMemo<ShareCardData | null>(() => {
    const s = session?.summary;
    if (!session || !s || s.fastestLapMs == null) return null;
    const route = session.routeId ? db.routes[session.routeId] : null;
    const bike = session.bikeId ? db.bikes[session.bikeId] : null;
    const rider = db.riders[session.riderId];
    const gain = s.isPb && s.previousPbMs != null ? s.previousPbMs - s.fastestLapMs : null;
    return {
      headline: s.isPb && gain != null ? "New personal best" : "Session best",
      time: formatLap(s.fastestLapMs),
      delta: gain != null && gain > 0 ? `↓ ${(gain / 1000).toFixed(1)} SEC` : null,
      route: route?.name ?? "Free ride",
      bike: bike ? `${bike.manufacturer} ${bike.model}` : "",
      number: rider?.raceNumber || "—",
      rider: rider?.name ?? "",
      date: formatDate(session.startedAt),
      outline: route?.polyline ?? [],
      appName: APP_NAME,
    };
  }, [session, db]);

  useEffect(() => {
    if (!data) return;
    let alive = true;
    renderShareCard(data).then((b) => alive && setBlob(b)).catch((e: unknown) => alive && setError(String(e)));
    return () => { alive = false; };
  }, [data]);

  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  if (!data) return <EmptyState title="Nothing to share" action={<LinkButton to="/sessions">Sessions</LinkButton>}>This session has no timed laps.</EmptyState>;
  const file = blob ? new File([blob], `${data.route.replace(/\W+/g, "-").toLowerCase()}-${data.time.replace(/[:.]/g, "")}.png`, { type: "image/png" }) : null;
  const canShare = Boolean(file && navigator.canShare?.({ files: [file] }));

  return (
    <div className="space-y-5">
      <PageHeader back={`/sessions/${id}`} title="Share" />
      {error && <ErrorNote>{error}</ErrorNote>}
      {url ? <img src={url} alt={`${data.headline}: ${data.time} at ${data.route}`} className="mx-auto w-full max-w-md rounded-2xl border border-line" /> : <Loading label="Drawing card" />}
      <div className="mx-auto flex max-w-md flex-col gap-3">
        {canShare && file && (
          <Button variant="primary" size="lg" onClick={() => void navigator.share({ files: [file], title: data.headline, text: `${data.time} at ${data.route}` }).catch(() => undefined)}>
            <Icon name="share" /> Share image
          </Button>
        )}
        {url && file && <a href={url} download={file.name} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 text-lg font-semibold"><Icon name="download" /> Save image</a>}
      </div>
    </div>
  );
}
