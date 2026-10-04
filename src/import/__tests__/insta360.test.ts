import { describe, expect, it } from "vitest";
import { bytesSource } from "../byteSource";
import { importFiles } from "../index";
import { isInsta360, parseGpsRecord, protobufVarint, readInsta360 } from "../insta360";

// Builds a file shaped like an Insta360 recording: media bytes, then trailer records,
// then the 72-byte header ending in the magic string.
function gpsEntry(t: number, lat: number, lng: number, fix = "A") {
  const b = new Uint8Array(53);
  const dv = new DataView(b.buffer);
  dv.setBigUint64(0, BigInt(Math.floor(t / 1000)), true);
  dv.setUint16(8, t % 1000, true);
  b[10] = fix.charCodeAt(0);
  dv.setFloat64(11, Math.abs(lat), true); b[19] = (lat < 0 ? "S" : "N").charCodeAt(0);
  dv.setFloat64(20, Math.abs(lng), true); b[28] = (lng < 0 ? "W" : "E").charCodeAt(0);
  dv.setFloat64(29, 12.5, true); dv.setFloat64(37, 90, true); dv.setFloat64(45, 330, true);
  return b;
}
const varint = (n: number) => { const out: number[] = []; let v = BigInt(n); do { let byte = Number(v & 0x7fn); v >>= 7n; if (v) byte |= 0x80; out.push(byte); } while (v); return new Uint8Array(out); };
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
function record(id: number, data: Uint8Array) {
  const h = new Uint8Array(6);
  h[0] = 0; h[1] = id; new DataView(h.buffer).setUint32(2, data.length, true);
  return cat(data, h);
}
function insta(records: Uint8Array[]) {
  const body = cat(...records);
  const header = new Uint8Array(72);
  new DataView(header.buffer).setUint32(32, body.length + 72, true);
  new DataView(header.buffer).setUint32(36, 3, true);
  header.set(new TextEncoder().encode("8db42d694ccc418790edff439fe026bf"), 40);
  return cat(new Uint8Array(1000), body, header);
}

const T0 = Date.UTC(2026, 9, 4, 10, 0, 0);

describe("Insta360", () => {
  it("reads GPS from the trailer, west longitude negative, skipping fixes without lock", async () => {
    const gps = cat(gpsEntry(T0, 53.7068, -2.19), gpsEntry(T0 + 500, 53.70681, -2.19001), gpsEntry(T0 + 1000, 0, 0, "V"));
    const meta = cat(varint(7 << 3), varint(T0 - 2000), varint(10 << 3), varint(60));
    const src = bytesSource(insta([record(1, meta), record(7, gps)]));
    expect(await isInsta360(src)).toBe(true);
    const r = await readInsta360(src);
    expect(r.hasGps).toBe(true);
    expect(r.points).toHaveLength(2);
    expect(r.points[0]!.t).toBe(T0);
    expect(r.points[1]!.t).toBe(T0 + 500);
    expect(r.points[0]!.lat).toBeCloseTo(53.7068, 6);
    expect(r.points[0]!.lng).toBeCloseTo(-2.19, 6);
    expect(r.points[0]!.speedMps).toBe(12.5);
    expect(r.creationTimeMs).toBe(T0 - 2000);
  });

  it("reports a recording with no GPS (camera not paired with the app/remote)", async () => {
    const r = await readInsta360(bytesSource(insta([record(1, cat(varint(7 << 3), varint(T0)))])));
    expect(r.hasGps).toBe(false);
    expect(r.points).toHaveLength(0);
  });

  it("is not fooled by other video files", async () => {
    expect(await isInsta360(bytesSource(new Uint8Array(500)))).toBe(false);
  });

  it("parses protobuf varints and southern hemisphere fixes", () => {
    expect(protobufVarint(cat(varint((3 << 3) | 2), varint(2), new Uint8Array(2), varint(7 << 3), varint(1234567890123)), 7)).toBe(1234567890123);
    expect(parseGpsRecord(gpsEntry(T0, -33.9, 151.2))[0]!.lat).toBeCloseTo(-33.9);
  });

  it("imports both lens files of one X-series recording as a single, de-duplicated track", async () => {
    const gps = cat(gpsEntry(T0, 53.7068, -2.19), gpsEntry(T0 + 1000, 53.7069, -2.1901));
    const bytes = insta([record(7, gps)]);
    const { tracks, errors } = await importFiles([
      new File([bytes as BlobPart], "VID_20261004_100000_00_001.insv"),
      new File([bytes as BlobPart], "VID_20261004_100000_10_001.insv"),
    ]);
    expect(errors).toEqual([]);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.kind).toBe("insta360");
    expect(tracks[0]!.points).toHaveLength(2);
    expect(tracks[0]!.videos).toHaveLength(0); // 360° .insv can't be played in a browser
  });

  it("explains a missing GPS track instead of failing silently", async () => {
    const { tracks } = await importFiles([new File([insta([record(1, cat(varint(7 << 3), varint(T0)))]) as BlobPart], "VID_001.insv")]);
    expect(tracks[0]!.points).toHaveLength(0);
    expect(tracks[0]!.warnings[0]).toMatch(/paired with the Insta360 app or GPS remote/);
  });
});
