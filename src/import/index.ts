import { blobSource } from "./byteSource";
import { parseFit } from "./fit";
import { readGoPro } from "./gopro";
import { parseGpx, parseTcx } from "./gpx";
import { rateOf, type ImportedTrack, type ImportKind } from "./types";
import { unzip } from "./zip";

export const ACCEPT = ".mp4,.MP4,.gpx,.fit,.tcx,.zip";

const ext = (name: string) => name.toLowerCase().split(".").pop() ?? "";

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
  const videos = files.filter((f) => ext(f.name) === "mp4");

  if (videos.length) {
    const merged = track("gopro", [], null, []);
    for (const f of videos) {
      onProgress?.(`Reading GPS from ${f.name}…`);
      try {
        const r = await readGoPro(blobSource(f), f.name);
        merged.fileNames.push(f.name);
        merged.device ??= r.device;
        if (!r.hasGpsStream) merged.warnings.push(`${f.name}: no GPS data in this video. The HERO12 has no GPS; on other models switch GPS on in the camera settings.`);
        else if (!r.points.length) merged.warnings.push(`${f.name}: GPS never got a fix (filmed indoors, or GPS still searching).`);
        merged.points.push(...r.points);
        if (r.video && r.points.length) merged.videos.push(r.video);
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    merged.points.sort((a, b) => a.t - b.t);
    merged.videos.sort((a, b) => a.startAt - b.startAt);
    merged.rateHz = rateOf(merged.points);
    if (merged.fileNames.length) tracks.push(merged);
  }

  for (const f of files.filter((x) => ext(x.name) !== "mp4")) {
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
