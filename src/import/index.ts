import { blobSource, type ByteSource } from "./byteSource";
import { isInsta360, readInsta360 } from "./insta360";
import { readMp4 } from "./mp4";
import { parseFit } from "./fit";
import { readGoPro } from "./gopro";
import { parseGpx, parseTcx } from "./gpx";
import { rateOf, type ImportedTrack, type ImportKind } from "./types";
import { unzip } from "./zip";

export const ACCEPT = ".mp4,.MP4,.insv,.INSV,.gpx,.fit,.tcx,.zip";

const ext = (name: string) => name.toLowerCase().split(".").pop() ?? "";
const isVideo = (name: string) => ext(name) === "mp4" || ext(name) === "insv";

function finish(t: ImportedTrack) {
  t.points.sort((a, b) => a.t - b.t);
  t.videos.sort((a, b) => a.startAt - b.startAt);
  t.rateHz = rateOf(t.points);
}

/**
 * One Insta360 file. The camera clock isn't tied to GPS like GoPro's, so the video
 * start is taken from the file's creation time when it looks sane, else from the
 * first GPS fix, and flagged as approximate. 360° .insv footage can't be played in
 * a browser, so only ordinary .mp4 files are offered for playback.
 */
async function readInsta360File(src: ByteSource, name: string): Promise<{ points: ImportedTrack["points"]; videos: ImportedTrack["videos"]; warnings: string[] }> {
  const r = await readInsta360(src);
  if (!r.hasGps || !r.points.length) {
    return { points: [], videos: [], warnings: [`${name}: no GPS in this file. Insta360 cameras only record GPS when paired with the Insta360 app or GPS remote while filming.`] };
  }
  const videos: ImportedTrack["videos"] = [];
  if (ext(name) === "mp4") {
    const mp4 = await readMp4(src).catch(() => null);
    const first = r.points[0]!.t;
    const ct = r.creationTimeMs == null ? null : r.creationTimeMs < 1e11 ? r.creationTimeMs * 1000 : r.creationTimeMs;
    const plausible = ct != null && Math.abs(ct - first) < 6 * 3600000;
    videos.push({ fileName: name, startAt: plausible ? ct! : first, durationMs: Math.round((mp4?.durationS ?? 0) * 1000), approxSync: true });
  }
  return { points: r.points, videos, warnings: [] };
}

function track(kind: ImportKind, fileNames: string[], device: string | null, points: ImportedTrack["points"], warnings: string[] = []): ImportedTrack {
  return { kind, fileNames, device, points, rateHz: rateOf(points), videos: [], warnings };
}

/**
 * Turn the files a rider picked into GPS tracks. All selected GoPro videos are
 * treated as chapters of one recording (GoPro splits long videos into ~4 GB files)
 * and merged in time order; every other file becomes its own track.
 */
export async function importFiles(files: File[], onProgress?: (msg: string) => void): Promise<{ tracks: ImportedTrack[]; errors: string[] }> {
  const tracks: ImportedTrack[] = [];
  const errors: string[] = [];
  const videoFiles = files.filter((f) => isVideo(f.name));
  // Sort videos by brand first: Insta360 files carry a recognisable trailer.
  const gopro: File[] = [], insta: File[] = [];
  for (const f of videoFiles) (ext(f.name) === "insv" || (await isInsta360(blobSource(f))) ? insta : gopro).push(f);

  if (gopro.length) {
    const merged = track("gopro", [], null, []);
    for (const f of gopro) {
      onProgress?.(`Reading GPS from ${f.name}…`);
      try {
        const r = await readGoPro(blobSource(f), f.name);
        merged.fileNames.push(f.name);
        merged.device ??= r.device;
        if (!r.hasGpsStream) merged.warnings.push(`${f.name}: no GPS data in this video. The GoPro HERO12 has no GPS; on other models switch GPS on in the camera settings.`);
        else if (!r.points.length) merged.warnings.push(`${f.name}: GPS never got a fix (filmed indoors, or GPS still searching).`);
        merged.points.push(...r.points);
        if (r.video && r.points.length) merged.videos.push(r.video);
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    finish(merged);
    if (merged.fileNames.length) tracks.push(merged);
  }

  if (insta.length) {
    const merged = track("insta360", [], "Insta360", []);
    for (const f of insta) {
      onProgress?.(`Reading GPS from ${f.name}…`);
      try {
        const t = await readInsta360File(blobSource(f), f.name);
        merged.fileNames.push(f.name);
        merged.warnings.push(...t.warnings);
        merged.points.push(...t.points);
        merged.videos.push(...t.videos);
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // X-series cameras write each recording as two files (one per lens) with the same GPS.
    const seen = new Set<number>();
    merged.points = merged.points.filter((p) => (seen.has(p.t) ? false : (seen.add(p.t), true)));
    finish(merged);
    if (merged.fileNames.length) tracks.push(merged);
  }

  for (const f of files.filter((x) => !isVideo(x.name))) {
    onProgress?.(`Reading ${f.name}…`);
    try {
      tracks.push(...(await parseOne(f.name, new Uint8Array(await f.arrayBuffer()))));
    } catch (e) {
      errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { tracks: tracks.filter((t) => t.points.length > 0 || t.warnings.length > 0), errors };
}

export async function parseOne(name: string, data: Uint8Array): Promise<ImportedTrack[]> {
  const text = () => new TextDecoder().decode(data);
  switch (ext(name)) {
    case "gpx": { const r = parseGpx(text()); return [track("gpx", [name], r.device, r.points)]; }
    case "tcx": { const r = parseTcx(text()); return [track("tcx", [name], r.device, r.points)]; }
    case "fit": { const r = parseFit(data); return [track("fit", [name], r.device, r.points)]; }
    case "zip": {
      const inner = await unzip(data, (n) => /\.(fit|gpx|tcx)$/i.test(n) && !n.startsWith("__MACOSX"));
      if (!inner.length) throw new Error("No .fit, .gpx or .tcx files inside this zip.");
      const nested = await Promise.all(inner.map((f) => parseOne(f.name.split("/").pop()!, f.data)));
      return nested.flat().map((t) => ({ ...t, fileNames: [`${name} → ${t.fileNames[0]}`] }));
    }
    default:
      throw new Error("Unsupported file type. Use GoPro .MP4, .gpx, .fit, .tcx or a Garmin .zip.");
  }
}
