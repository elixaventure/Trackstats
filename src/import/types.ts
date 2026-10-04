import type { GpsPoint } from "@/domain/types";

export type ImportKind = "gopro" | "insta360" | "gpx" | "fit" | "tcx";

export interface ImportedVideo {
  fileName: string;
  /** Epoch ms of the video's first frame, derived from GPS time. */
  startAt: number;
  durationMs: number;
  /** True when the start time is estimated rather than read from the camera clock. */
  approxSync?: boolean;
}

/** A GPS trace read from a file, before it becomes a session. */
export interface ImportedTrack {
  kind: ImportKind;
  fileNames: string[];
  device: string | null;
  points: GpsPoint[];
  /** Typical fixes per second, used to describe accuracy honestly. */
  rateHz: number;
  videos: ImportedVideo[];
  warnings: string[];
}

export const KIND_LABEL: Record<ImportKind, string> = {
  gopro: "GoPro video",
  insta360: "Insta360 video",
  gpx: "GPX (Strava, Apple Watch, Garmin…)",
  fit: "Garmin FIT",
  tcx: "Garmin TCX",
};

export function rateOf(points: GpsPoint[]): number {
  if (points.length < 2) return 0;
  const span = (points[points.length - 1]!.t - points[0]!.t) / 1000;
  return span > 0 ? Math.round(((points.length - 1) / span) * 10) / 10 : 0;
}
