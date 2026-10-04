import type { GpsPoint } from "@/domain/types";

/**
 * Minimal Garmin FIT reader: just the 'record' messages (GPS samples).
 * Format: 12/14-byte header, then definition and data messages; compressed
 * timestamp headers are supported. Developer fields are skipped.
 */

const FIT_EPOCH = Date.UTC(1989, 11, 31);
const SEMI = 180 / 2 ** 31;
const MANUFACTURERS: Record<number, string> = { 1: "Garmin", 23: "Suunto", 32: "Wahoo", 255: "Development", 294: "Coros", 260: "Zwift", 265: "Strava" };

interface FieldDef { num: number; size: number; base: number }
interface Def { little: boolean; global: number; fields: FieldDef[]; devBytes: number }

function readField(dv: DataView, at: number, f: FieldDef, little: boolean): number | null {
  const t = f.base & 0x1f;
  let v: number;
  switch (t) {
    case 0: case 2: case 10: case 13: v = dv.getUint8(at); if (t !== 10 && v === 0xff) return null; break; // enum, uint8, uint8z, byte
    case 1: v = dv.getInt8(at); if (v === 0x7f) return null; break;
    case 3: if (f.size < 2) return null; v = dv.getInt16(at, little); if (v === 0x7fff) return null; break;
    case 4: case 11: if (f.size < 2) return null; v = dv.getUint16(at, little); if (v === 0xffff || (t === 11 && v === 0)) return null; break;
    case 5: if (f.size < 4) return null; v = dv.getInt32(at, little); if (v === 0x7fffffff) return null; break;
    case 6: case 12: if (f.size < 4) return null; v = dv.getUint32(at, little); if (v === 0xffffffff || (t === 12 && v === 0)) return null; break;
    case 8: if (f.size < 4) return null; v = dv.getFloat32(at, little); break;
    default: return null;
  }
  return v;
}

export function parseFit(buf: Uint8Array): { points: GpsPoint[]; device: string | null } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const headerSize = buf[0]!;
  if (buf.length < 12 || String.fromCharCode(buf[8]!, buf[9]!, buf[10]!, buf[11]!) !== ".FIT") throw new Error("Not a FIT file.");
  const end = Math.min(buf.length, headerSize + dv.getUint32(4, true));
  const defs = new Map<number, Def>();
  const points: GpsPoint[] = [];
  let device: string | null = null;
  let lastTs = 0;
  let p = headerSize;

  while (p < end) {
    const h = buf[p++]!;
    if (h & 0x80) {
      // Compressed timestamp header: 5-bit offset from the last full timestamp.
      const local = (h >> 5) & 0x03;
      const offset = h & 0x1f;
      lastTs = ((lastTs & ~0x1f) + offset + (offset < (lastTs & 0x1f) ? 0x20 : 0)) >>> 0;
      p = readData(local, lastTs);
      continue;
    }
    const local = h & 0x0f;
    if (h & 0x40) {
      const little = buf[p + 1] === 0;
      const global = little ? dv.getUint16(p + 2, true) : dv.getUint16(p + 2, false);
      const n = buf[p + 4]!;
      const fields: FieldDef[] = [];
      for (let i = 0; i < n; i++) fields.push({ num: buf[p + 5 + i * 3]!, size: buf[p + 6 + i * 3]!, base: buf[p + 7 + i * 3]! });
      p += 5 + n * 3;
      let devBytes = 0;
      if (h & 0x20) {
        const nd = buf[p++]!;
        for (let i = 0; i < nd; i++) devBytes += buf[p + 1 + i * 3]!;
        p += nd * 3;
      }
      defs.set(local, { little, global, fields, devBytes });
    } else {
      p = readData(local, null);
    }
  }

  function readData(local: number, compressedTs: number | null): number {
    const def = defs.get(local);
    if (!def) throw new Error("Corrupt FIT file (data before definition).");
    let at = p;
    const vals = new Map<number, number | null>();
    for (const f of def.fields) { vals.set(f.num, readField(dv, at, f, def.little)); at += f.size; }
    at += def.devBytes;
    if (def.global === 0 && device == null) {
      const m = vals.get(1);
      device = m != null ? MANUFACTURERS[m] ?? `Manufacturer ${m}` : null;
    }
    const ts = vals.get(253);
    if (ts != null) lastTs = ts;
    if (def.global === 20) {
      const lat = vals.get(0), lng = vals.get(1);
      const t = ts ?? compressedTs;
      if (lat != null && lng != null && t != null) {
        const altRaw = vals.get(78) ?? vals.get(2);
        const speedRaw = vals.get(73) ?? vals.get(6);
        points.push({
          t: FIT_EPOCH + t * 1000, lat: lat * SEMI, lng: lng * SEMI, accuracyM: 5,
          speedMps: speedRaw != null ? speedRaw / 1000 : null, heading: null,
          altitudeM: altRaw != null ? altRaw / 5 - 500 : null,
        });
      }
    }
    return at;
  }

  return { points, device };
}
