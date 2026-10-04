import type { GpsPoint } from "@/domain/types";
import type { ByteSource } from "./byteSource";
import { parseGpmf, type GpsPayload } from "./gpmf";
import { readMp4 } from "./mp4";
import type { ImportedVideo } from "./types";

/** Keep at most this many fixes per second (GoPro writes 10–18 Hz). */
const MAX_HZ = 10;

/** Rough metres of error per unit of DOP for a consumer GPS receiver. An estimate, labelled as such in the UI. */
const METRES_PER_DOP = 3;

export interface GoProResult { points: GpsPoint[]; video: ImportedVideo | null; device: string | null; payloadsWithoutFix: number; hasGpsStream: boolean }

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };

export async function readGoPro(src: ByteSource, fileName: string): Promise<GoProResult> {
  const mp4 = await readMp4(src);
  const payloads: { p: GpsPayload; timeS: number; durationS: number }[] = [];
  for (const s of mp4.gpmd) {
    const p = parseGpmf(await src.read(s.offset, s.size));
    if (p) payloads.push({ p, timeS: s.timeS, durationS: s.durationS });
  }
  const device = payloads.find((x) => x.p.device)?.p.device ?? null;
  const locked = payloads.filter((x) => (x.p.fix ?? 3) >= 2 && x.p.samples.length > 0);
  const result: GoProResult = { points: [], video: null, device, payloadsWithoutFix: payloads.length - locked.length, hasGpsStream: payloads.length > 0 };
  if (!locked.length) return result;

  // Anchor the video timeline to GPS time. GPS9 timestamps every sample; GPS5 has
  // one UTC stamp per ~1 s payload. The median offset ignores occasional jitter.
  const offsets = locked.flatMap(({ p, timeS, durationS }) =>
    p.samples[0]!.epochMs != null
      ? p.samples.map((s, i) => s.epochMs! - (timeS + (i / p.samples.length) * durationS) * 1000)
      : p.utcMs != null ? [p.utcMs - timeS * 1000] : []);
  if (!offsets.length) return result;
  const videoStart = Math.round(median(offsets));

  let lastT = -Infinity;
  for (const { p, timeS, durationS } of locked) {
    const acc = Math.max(2, (p.dop ?? 2) * METRES_PER_DOP);
    p.samples.forEach((s, i) => {
      const t = Math.round(videoStart + (timeS + (i / p.samples.length) * durationS) * 1000);
      if (t - lastT < 1000 / MAX_HZ - 1) return;
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng) || (s.lat === 0 && s.lng === 0)) return;
      result.points.push({ t, lat: s.lat, lng: s.lng, accuracyM: Math.round(acc * 10) / 10, speedMps: s.speed2d, heading: null, altitudeM: s.alt });
      lastT = t;
    });
  }
  result.video = { fileName, startAt: videoStart, durationMs: Math.round(mp4.durationS * 1000) };
  return result;
}
