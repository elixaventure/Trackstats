import type { GpsPoint } from "@/domain/types";

// Regex-based readers (no DOM needed, so they also run in tests and workers).
// GPX and TCX are simple, flat formats; we only read what we use.

const num = (s: string | undefined) => (s == null ? null : Number.isFinite(Number(s)) ? Number(s) : null);
const tag = (body: string, name: string) => body.match(new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`))?.[1]?.trim();

/** GPX 1.0/1.1 track points (Strava, Apple Watch exports, Garmin, most apps). */
export function parseGpx(xml: string): { points: GpsPoint[]; device: string | null } {
  const points: GpsPoint[] = [];
  const re = /<(?:\w+:)?trkpt\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?trkpt>/g;
  for (const m of xml.matchAll(re)) {
    const attrs = m[1]!;
    const lat = num(attrs.match(/lat="([^"]+)"/)?.[1]);
    const lng = num(attrs.match(/lon="([^"]+)"/)?.[1]);
    const t = Date.parse(tag(m[2]!, "time") ?? "");
    if (lat == null || lng == null || !Number.isFinite(t)) continue;
    points.push({
      t, lat, lng,
      // GPX rarely carries accuracy. 1 Hz watch GPS is typically ~5 m.
      accuracyM: num(tag(m[2]!, "hdop")) != null ? Math.max(3, num(tag(m[2]!, "hdop"))! * 3) : 5,
      speedMps: num(tag(m[2]!, "speed")),
      heading: num(tag(m[2]!, "course")),
      altitudeM: num(tag(m[2]!, "ele")),
    });
  }
  const creator = xml.match(/<gpx\b[^>]*creator="([^"]+)"/)?.[1] ?? null;
  return { points: points.sort((a, b) => a.t - b.t), device: creator };
}

/** Garmin Training Center XML. */
export function parseTcx(xml: string): { points: GpsPoint[]; device: string | null } {
  const points: GpsPoint[] = [];
  for (const m of xml.matchAll(/<(?:\w+:)?Trackpoint>([\s\S]*?)<\/(?:\w+:)?Trackpoint>/g)) {
    const b = m[1]!;
    const lat = num(tag(b, "LatitudeDegrees"));
    const lng = num(tag(b, "LongitudeDegrees"));
    const t = Date.parse(tag(b, "Time") ?? "");
    if (lat == null || lng == null || !Number.isFinite(t)) continue;
    points.push({ t, lat, lng, accuracyM: 5, speedMps: num(tag(b, "Speed")), heading: null, altitudeM: num(tag(b, "AltitudeMeters")) });
  }
  const device = xml.match(/<Creator[\s\S]*?<(?:\w+:)?Name>([^<]+)<\/(?:\w+:)?Name>/)?.[1]?.trim() ?? null;
  return { points: points.sort((a, b) => a.t - b.t), device };
}
