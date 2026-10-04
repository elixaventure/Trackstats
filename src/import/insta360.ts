import type { GpsPoint } from "@/domain/types";
import type { ByteSource } from "./byteSource";

/**
 * Insta360 GPS. Insta360 cameras have no GPS receiver: GPS is recorded only when
 * the camera is paired with the phone app or the GPS remote while filming.
 * It's stored in a trailer at the end of the .insv/.mp4 file. The layout is not
 * officially documented; this follows the open-source Gyroflow telemetry-parser
 * (github.com/AdrianEddy/telemetry-parser, MIT/Apache-2.0):
 *
 *   …records… | padding(32) extraSize(u32) version(u32) "8db42d694ccc418790edff439fe026bf"
 *   each record = data[size] format(u8) id(u8) size(u32), read backwards from the end.
 *   GPS (id 7): 53-byte entries: unix secs(u64) ms(u16) fix('A'/'V') lat(f64) N/S lon(f64) E/W
 *               speed m/s(f64) track(f64) altitude(f64). Little-endian.
 */

const MAGIC = "8db42d694ccc418790edff439fe026bf";
const HEADER = 32 + 4 + 4 + 32;
const REC_METADATA = 1;
const REC_GPS = 7;
const ENTRY = 53;

export async function isInsta360(src: ByteSource): Promise<boolean> {
  if (src.size < HEADER) return false;
  return new TextDecoder().decode(await src.read(src.size - 32, 32)) === MAGIC;
}

export interface Insta360Result { points: GpsPoint[]; creationTimeMs: number | null; hasGps: boolean }

export async function readInsta360(src: ByteSource): Promise<Insta360Result> {
  const head = await src.read(src.size - HEADER, HEADER);
  const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const extraSize = hv.getUint32(32, true);
  const result: Insta360Result = { points: [], creationTimeMs: null, hasGps: false };

  let back = HEADER + 6; // distance from end of file to the current record's 6-byte header
  for (let guard = 0; back < extraSize && back <= src.size && guard < 200; guard++) {
    const h = await src.read(src.size - back, 6);
    const dv = new DataView(h.buffer, h.byteOffset, 6);
    const id = h[1]!;
    const size = dv.getUint32(2, true);
    if (size <= 0 || size > extraSize || back + size > src.size) break;
    if (id === REC_GPS || id === REC_METADATA) {
      const data = await src.read(src.size - back - size, size);
      if (id === REC_GPS) { result.hasGps = true; result.points.push(...parseGpsRecord(data)); }
      else result.creationTimeMs = protobufVarint(data, 7);
    }
    back += size + 6;
  }
  result.points.sort((a, b) => a.t - b.t);
  return result;
}

export function parseGpsRecord(data: Uint8Array): GpsPoint[] {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out: GpsPoint[] = [];
  for (let p = 0; p + ENTRY <= data.length; p += ENTRY) {
    const secs = Number(dv.getBigUint64(p, true));
    const ms = dv.getUint16(p + 8, true);
    const fix = String.fromCharCode(data[p + 10]!);
    let lat = dv.getFloat64(p + 11, true);
    const ns = String.fromCharCode(data[p + 19]!);
    let lng = dv.getFloat64(p + 20, true);
    const ew = String.fromCharCode(data[p + 28]!);
    const speed = dv.getFloat64(p + 29, true);
    const track = dv.getFloat64(p + 37, true);
    const alt = dv.getFloat64(p + 45, true);
    if (fix !== "A" || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
    if (ns === "S") lat = -Math.abs(lat);
    if (ew === "W") lng = -Math.abs(lng);
    out.push({
      t: secs * 1000 + ms, lat, lng,
      // No accuracy is recorded; phone/remote GPS is typically ~5 m.
      accuracyM: 5,
      speedMps: Number.isFinite(speed) ? speed : null,
      heading: Number.isFinite(track) ? track : null,
      altitudeM: Number.isFinite(alt) ? alt : null,
    });
  }
  return out;
}

/** Read one varint field from a protobuf message (enough for the creation time). */
export function protobufVarint(buf: Uint8Array, field: number): number | null {
  let p = 0;
  const varint = () => {
    let v = 0n, shift = 0n;
    for (;;) {
      if (p >= buf.length) return null;
      const b = buf[p++]!;
      v |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) return v;
      shift += 7n;
      if (shift > 63n) return null;
    }
  };
  while (p < buf.length) {
    const key = varint();
    if (key == null) return null;
    const f = Number(key >> 3n), wire = Number(key & 7n);
    if (wire === 0) { const v = varint(); if (v == null) return null; if (f === field) return Number(v); }
    else if (wire === 1) p += 8;
    else if (wire === 2) { const len = varint(); if (len == null) return null; p += Number(len); }
    else if (wire === 5) p += 4;
    else return null;
  }
  return null;
}
