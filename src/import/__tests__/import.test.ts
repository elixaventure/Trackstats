import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateDemo } from "@/data/seed/generate";
import { bytesSource } from "../byteSource";
import { parseGpmf } from "../gpmf";
import { readGoPro } from "../gopro";
import { parseOne } from "../index";
import { buildImportedSession, firstLoop, gateEvents, matchRoutes } from "../toSession";

// ---- tiny binary writers for synthetic fixtures ----
const cat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const ascii = (s: string) => new TextEncoder().encode(s);
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
const u16 = (n: number) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n); return b; };
const box = (type: string, ...body: Uint8Array[]) => { const b = cat(...body); return cat(u32(8 + b.length), ascii(type), b); };
const full = (type: string, ...body: Uint8Array[]) => box(type, new Uint8Array(4), ...body);

function klv(key: string, type: string, size: number, repeat: number, data: Uint8Array): Uint8Array {
  const padded = new Uint8Array(Math.ceil(data.length / 4) * 4);
  padded.set(data);
  return cat(ascii(key), type === "\0" ? new Uint8Array([0]) : ascii(type), new Uint8Array([size]), u16(repeat), padded);
}
const nest = (key: string, ...items: Uint8Array[]) => { const b = cat(...items); return klv(key, "\0", 1, b.length, b); };
const i32s = (...v: number[]) => cat(...v.map((x) => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, x); return b; }));

describe("GoPro GPMF", () => {
  it("reads a real HERO5 telemetry payload", () => {
    const p = parseGpmf(new Uint8Array(readFileSync(new URL("./fixtures/hero5-gpmf-payload.bin", import.meta.url))))!;
    expect(p).not.toBeNull();
    expect(p.samples.length).toBeGreaterThan(10); // ~18 Hz
    expect(p.samples[0]!.lat).toBeCloseTo(33.126, 2);
    expect(p.samples[0]!.lng).toBeCloseTo(-117.327, 2);
    expect(p.utcMs).not.toBeNull();
    expect(p.fix).toBeGreaterThanOrEqual(2);
  });

  it("reads GPS9 (HERO11/13) with per-sample time", () => {
    const sample = (lat: number, secs: number) => cat(i32s(lat, -21900000, 330000, 12000, 1200, 9408, secs), u16(150), u16(3));
    const payload = nest("DEVC", klv("DVNM", "c", 6, 1, ascii("HERO13")), nest("STRM",
      klv("TYPE", "c", 9, 1, ascii("lllllllSS")),
      klv("SCAL", "l", 4, 9, i32s(10000000, 10000000, 1000, 1000, 100, 1, 1000, 100, 1)),
      klv("GPS9", "?", 32, 2, cat(sample(537068000, 36000000), sample(537068100, 36000100)))));
    const p = parseGpmf(payload)!;
    expect(p.device).toBe("HERO13");
    expect(p.samples).toHaveLength(2);
    expect(p.samples[0]!.lat).toBeCloseTo(53.7068, 4);
    expect(p.samples[0]!.lng).toBeCloseTo(-2.19, 3);
    expect(p.samples[1]!.epochMs! - p.samples[0]!.epochMs!).toBe(100);
    expect(new Date(p.samples[0]!.epochMs!).toISOString()).toBe("2025-10-04T10:00:00.000Z"); // 9408 days after 2000-01-01
    expect(p.dop).toBeCloseTo(1.5);
  });

  it("finds the telemetry track in an MP4 (index after the media) and anchors it to GPS time", async () => {
    const gps5 = (lat: number) => i32s(lat, -21900000, 330000, 12000, 1200);
    const payload = (sec: number, lats: number[]) => nest("DEVC", nest("STRM",
      klv("SCAL", "l", 4, 5, i32s(10000000, 10000000, 1000, 1000, 100)),
      klv("GPSU", "U", 16, 1, ascii(`2510041000${String(sec).padStart(2, "0")}.000`)),
      klv("GPSF", "L", 4, 1, u32(3)),
      klv("GPSP", "S", 2, 1, u16(120)),
      klv("GPS5", "l", 20, lats.length, cat(...lats.map(gps5)))));
    const p1 = payload(0, [537068000, 537068100]);
    const p2 = payload(1, [537068200, 537068300]);
    const ftyp = box("ftyp", ascii("mp41"), u32(0));
    const mdat = box("mdat", p1, p2);
    const mdatData = ftyp.length + 8;
    const stbl = box("stbl",
      full("stsd", u32(1), box("gpmd", new Uint8Array(8))),
      full("stts", u32(1), u32(2), u32(1000)),
      full("stsc", u32(1), u32(1), u32(2), u32(1)),
      full("stsz", u32(0), u32(2), u32(p1.length), u32(p2.length)),
      full("stco", u32(1), u32(mdatData)));
    const trak = box("trak", box("mdia",
      full("mdhd", u32(0), u32(0), u32(1000), u32(2000), u32(0)),
      full("hdlr", u32(0), ascii("meta"), new Uint8Array(12)),
      box("minf", stbl)));
    const moov = box("moov", full("mvhd", u32(0), u32(0), u32(1000), u32(2000), new Uint8Array(80)), trak);
    const r = await readGoPro(bytesSource(cat(ftyp, mdat, moov)), "GX010001.MP4");
    expect(r.points).toHaveLength(4);
    expect(r.points[0]!.t).toBe(Date.UTC(2025, 9, 4, 10, 0, 0));
    expect(r.points[2]!.t).toBe(Date.UTC(2025, 9, 4, 10, 0, 1));
    expect(r.points[0]!.accuracyM).toBeCloseTo(3.6); // DOP 1.2 × 3 m
    expect(r.video).toEqual({ fileName: "GX010001.MP4", startAt: Date.UTC(2025, 9, 4, 10, 0, 0), durationMs: 2000 });
  });
});

// ---- watch / app exports ----
const { state, gps } = generateDemo("u", Date.UTC(2026, 9, 4));
const bacup = Object.values(state.routes).find((r) => r.name.startsWith("Bacup"))!;
const alexSession = Object.values(state.sessions).filter((s) => s.routeId === bacup.id && s.riderId === state.activeRiderId).sort((a, b) => b.startedAt - a.startedAt)[0]!;
// Watches record about once a second.
const trace = gps[alexSession.id]!.filter((_, i) => i % 1 === 0);

function toGpx(points: typeof trace) {
  return `<?xml version="1.0"?><gpx version="1.1" creator="Apple Watch"><trk><trkseg>${points.map((p) =>
    `<trkpt lat="${p.lat}" lon="${p.lng}"><ele>${p.altitudeM}</ele><time>${new Date(p.t).toISOString()}</time></trkpt>`).join("")}</trkseg></trk></gpx>`;
}

function toFit(points: typeof trace): Uint8Array {
  const le32 = (n: number, signed = false) => { const b = new Uint8Array(4); const dv = new DataView(b.buffer); if (signed) dv.setInt32(0, n, true); else dv.setUint32(0, n >>> 0, true); return b; };
  const le16 = (n: number) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; };
  const def = (local: number, global: number, fields: [number, number, number][]) =>
    cat(new Uint8Array([0x40 | local, 0, 0]), le16(global), new Uint8Array([fields.length]), ...fields.map((f) => new Uint8Array(f)));
  const SEMI = 2 ** 31 / 180;
  const body = cat(
    def(0, 0, [[1, 2, 0x84]]), new Uint8Array([0]), le16(1), // file_id: manufacturer = Garmin
    def(1, 20, [[253, 4, 0x86], [0, 4, 0x85], [1, 4, 0x85], [78, 4, 0x86]]),
    ...points.map((p) => cat(new Uint8Array([1]), le32(Math.round((p.t - Date.UTC(1989, 11, 31)) / 1000)), le32(Math.round(p.lat * SEMI), true), le32(Math.round(p.lng * SEMI), true), le32(Math.round(((p.altitudeM ?? 0) + 500) * 5)))),
  );
  return cat(new Uint8Array([12, 0x20]), le16(2100), le32(body.length), ascii(".FIT"), body, new Uint8Array(2));
}

async function zipOf(name: string, data: Uint8Array): Promise<Uint8Array> {
  const comp = new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
  const le = (n: number, bytes: number) => { const b = new Uint8Array(bytes); const dv = new DataView(b.buffer); if (bytes === 2) dv.setUint16(0, n, true); else dv.setUint32(0, n, true); return b; };
  const nm = ascii(name);
  const local = cat(le(0x04034b50, 4), le(20, 2), le(0, 2), le(8, 2), le(0, 4), le(0, 4), le(comp.length, 4), le(data.length, 4), le(nm.length, 2), le(0, 2), nm, comp);
  const central = cat(le(0x02014b50, 4), le(20, 2), le(20, 2), le(0, 2), le(8, 2), le(0, 4), le(0, 4), le(comp.length, 4), le(data.length, 4), le(nm.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(0, 4), nm);
  const eocd = cat(le(0x06054b50, 4), le(0, 2), le(0, 2), le(1, 2), le(1, 2), le(central.length, 4), le(local.length, 4), le(0, 2));
  return cat(local, central, eocd);
}

describe("watch and app exports", () => {
  it("GPX (Strava / Apple Watch) → matched to the right route with correct laps", async () => {
    const [track] = await parseOne("Morning_Ride.gpx", ascii(toGpx(trace)));
    expect(track!.device).toBe("Apple Watch");
    expect(track!.points).toHaveLength(trace.length);
    const routes = Object.values(state.routes);
    const matches = matchRoutes(routes, track!.points);
    expect(matches[0]!.route.id).toBe(bacup.id);
    const plan = buildImportedSession({ track: track!, route: bacup, riderId: "r1", bikeId: null, condition: "dry", notes: "", previousPbMs: null });
    const original = Object.values(state.laps).filter((l) => l.sessionId === alexSession.id).sort((a, b) => a.lapNumber - b.lapNumber);
    // The demo trace starts just after the line and stops just before it, so the first
    // and last boundaries aren't in the file. Every boundary in between must be found.
    const boundaries = original.slice(0, -1).map((l) => l.startedAt + l.durationMs);
    const crossings = gateEvents(bacup, track!.points, "s", "r").map((e) => e.at);
    expect(crossings).toHaveLength(boundaries.length);
    crossings.forEach((c, i) => expect(Math.abs(c - boundaries[i]!)).toBeLessThan(800)); // 1 Hz GPS gate timing
    expect(plan.laps).toHaveLength(boundaries.length - 1);
    expect(plan.session.importInfo?.kind).toBe("gpx");
  });

  it("does not match a trace ridden somewhere else", () => {
    const elsewhere = trace.map((p) => ({ ...p, lat: p.lat + 0.5 }));
    expect(matchRoutes(Object.values(state.routes), elsewhere)).toHaveLength(0);
  });

  it("finds one lap to make a new route from", () => {
    const loop = firstLoop(trace);
    expect(loop.length).toBeGreaterThan(20);
    expect(loop.length).toBeLessThan(trace.length / 2);
  });

  it("Garmin FIT, and FIT inside a Garmin Connect zip", async () => {
    const fit = toFit(trace.slice(0, 200));
    const [t] = await parseOne("activity.fit", fit);
    expect(t!.device).toBe("Garmin");
    expect(t!.points).toHaveLength(200);
    expect(t!.points[0]!.lat).toBeCloseTo(trace[0]!.lat, 5);
    expect(t!.points[0]!.altitudeM).toBeCloseTo(trace[0]!.altitudeM!, 0);
    const zipped = await parseOne("12345.zip", await zipOf("12345_ACTIVITY.fit", fit));
    expect(zipped[0]!.points).toHaveLength(200);
    expect(zipped[0]!.fileNames[0]).toContain("12345_ACTIVITY.fit");
  });

  it("TCX", async () => {
    const xml = `<TrainingCenterDatabase><Activities><Activity><Lap><Track>${trace.slice(0, 3).map((p) =>
      `<Trackpoint><Time>${new Date(p.t).toISOString()}</Time><Position><LatitudeDegrees>${p.lat}</LatitudeDegrees><LongitudeDegrees>${p.lng}</LongitudeDegrees></Position><AltitudeMeters>300</AltitudeMeters></Trackpoint>`).join("")}</Track></Lap><Creator><Name>Forerunner 965</Name></Creator></Activity></Activities></TrainingCenterDatabase>`;
    const [t] = await parseOne("ride.tcx", ascii(xml));
    expect(t!.points).toHaveLength(3);
    expect(t!.device).toBe("Forerunner 965");
  });
});
