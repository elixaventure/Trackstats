import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatClock } from "@/domain/time";
import type { GpsPoint, ImportInfo } from "@/domain/types";
import { recallVideo, rememberVideo } from "@/lib/videoFiles";

/** Nearest GPS fix to a time (points sorted by t). */
function fixAt(points: GpsPoint[], t: number): GpsPoint | null {
  let lo = 0, hi = points.length - 1;
  if (hi < 0) return null;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (points[mid]!.t < t) lo = mid + 1; else hi = mid; }
  const a = points[Math.max(0, lo - 1)]!, b = points[lo]!;
  return Math.abs(a.t - t) < Math.abs(b.t - t) ? a : b;
}

/**
 * Plays the GoPro footage locally (nothing is uploaded) and reports where the
 * rider was at each moment, so the map can show a moving dot on the coloured track.
 */
export function VideoSync({ videos, points, onPosition }: { videos: ImportInfo["videos"]; points: GpsPoint[]; onPosition: (p: GpsPoint | null) => void }) {
  const [index, setIndex] = useState(0);
  const [file, setFile] = useState<File | null>(() => recallVideo(videos[0]?.fileName ?? ""));
  const [mismatch, setMismatch] = useState<string | null>(null);
  const [now, setNow] = useState<{ speed: number | null; at: number } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const inputId = useId();
  const meta = videos[index]!;
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  useEffect(() => {
    const v = video.current;
    if (!v || !url) return;
    let raf = 0;
    let last = 0;
    const tick = () => {
      const ts = performance.now();
      if (ts - last > 200) {
        last = ts;
        const p = fixAt(points, meta.startAt + v.currentTime * 1000);
        onPosition(p);
        setNow(p ? { speed: p.speedMps, at: v.currentTime } : null);
      }
      if (!v.paused) raf = requestAnimationFrame(tick);
    };
    const start = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); };
    v.addEventListener("play", start);
    v.addEventListener("seeked", tick);
    v.addEventListener("loadeddata", tick);
    return () => { cancelAnimationFrame(raf); v.removeEventListener("play", start); v.removeEventListener("seeked", tick); v.removeEventListener("loadeddata", tick); };
  }, [url, points, meta.startAt, onPosition]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    rememberVideo(f);
    setMismatch(f.name === meta.fileName ? null : `That's ${f.name}; this ride was recorded on ${meta.fileName}. It will play, but the dot may not line up.`);
    setFile(f);
  };
  const choose = (i: number) => { setIndex(i); setFile(recallVideo(videos[i]!.fileName)); setMismatch(null); };

  return (
    <div className="space-y-3">
      {videos.length > 1 && (
        <div role="tablist" aria-label="Video chapter" className="flex gap-2 overflow-x-auto">
          {videos.map((v, i) => (
            <button key={v.fileName} role="tab" type="button" aria-selected={i === index} onClick={() => choose(i)}
              className={`min-h-11 shrink-0 rounded-full border px-4 font-mono text-sm ${i === index ? "border-plate bg-plate text-plate-ink" : "border-line text-muted"}`}>{v.fileName}</button>
          ))}
        </div>
      )}
      {url ? (
        <>
          <video ref={video} src={url} controls playsInline className="w-full rounded-2xl bg-black" />
          {now && <p className="font-mono text-sm text-muted">{formatClock(now.at * 1000)} · {now.speed != null ? `${Math.round(now.speed * 3.6)} km/h` : "—"}</p>}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-line p-4">
          <p className="mb-3 text-sm text-muted">Select <span className="font-mono text-ink">{meta.fileName}</span> from your phone or computer to watch it with the map. It stays on this device.</p>
          <label htmlFor={inputId} className="inline-flex min-h-12 cursor-pointer items-center rounded-xl bg-plate px-4 font-semibold text-plate-ink">Choose video</label>
          <input id={inputId} type="file" accept="video/mp4,.mp4,.MP4" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </div>
      )}
      {mismatch && <p className="text-sm text-warn">{mismatch}</p>}
    </div>
  );
}
