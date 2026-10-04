import { fourcc, view } from "./byteSource";

/**
 * GoPro GPMF telemetry (open format: github.com/gopro/gpmf-parser).
 * Each MP4 telemetry sample holds KLV entries: 4-char key, 1-char type, 1-byte
 * struct size, 2-byte repeat count, data padded to 4 bytes. We only need the GPS
 * stream: GPS5 (HERO5–11) or GPS9 (HERO11, HERO13), plus its sticky metadata.
 */

export interface GpsSample {
  lat: number;
  lng: number;
  alt: number;
  speed2d: number;
  /** Absolute time when the camera reports it per sample (GPS9 only). */
  epochMs: number | null;
}

export interface GpsPayload {
  samples: GpsSample[];
  /** GPSU: UTC time of the payload (GPS5 cameras). */
  utcMs: number | null;
  fix: number | null;
  /** Dilution of precision (GPSP / 100). Lower is better; under 5 is good. */
  dop: number | null;
  device: string | null;
}

const SIZES: Record<string, number> = { b: 1, B: 1, c: 1, s: 2, S: 2, l: 4, L: 4, f: 4, F: 4, d: 8, j: 8, J: 8, q: 4, Q: 8, U: 16 };

function readNum(dv: DataView, at: number, t: string): number {
  switch (t) {
    case "b": return dv.getInt8(at);
    case "B": return dv.getUint8(at);
    case "s": return dv.getInt16(at);
    case "S": return dv.getUint16(at);
    case "l": return dv.getInt32(at);
    case "L": return dv.getUint32(at);
    case "f": return dv.getFloat32(at);
    case "d": return dv.getFloat64(at);
    case "j": return Number(dv.getBigInt64(at));
    case "J": return Number(dv.getBigUint64(at));
    case "q": return dv.getInt32(at) / 65536;
    default: return NaN;
  }
}

/** "yymmddhhmmss.sss" → epoch ms */
export function parseGpsu(s: string): number | null {
  const m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d{1,3}))?/);
  if (!m) return null;
  const [, yy, mo, dd, hh, mi, ss, ms] = m;
  return Date.UTC(2000 + Number(yy), Number(mo) - 1, Number(dd), Number(hh), Number(mi), Number(ss), Number((ms ?? "0").padEnd(3, "0")));
}

const GPS9_EPOCH = Date.UTC(2000, 0, 1);

interface Sticky { scal: number[]; type: string | null; utcMs: number | null; fix: number | null; dop: number | null; device: string | null }

/** Parse one telemetry sample into the GPS payload it contains (null if none). */
export function parseGpmf(bytes: Uint8Array): GpsPayload | null {
  let found: GpsPayload | null = null;
  const walk = (from: number, to: number, sticky: Sticky) => {
    const dv = view(bytes);
    let p = from;
    while (p + 8 <= to) {
      const key = fourcc(bytes, p);
      const type = String.fromCharCode(bytes[p + 4]!);
      const size = bytes[p + 5]!;
      const repeat = dv.getUint16(p + 6);
      const len = size * repeat;
      const data = p + 8;
      const next = data + Math.ceil(len / 4) * 4;
      if (next > to) break;
      if (bytes[p + 4] === 0) {
        // Nested container (DEVC, STRM): metadata applies inside it only.
        walk(data, data + len, { ...sticky, scal: [], type: null });
      } else if (key === "DVNM" && type === "c") {
        sticky.device = new TextDecoder().decode(bytes.subarray(data, data + len)).replace(/\0.*$/, "");
      } else if (key === "SCAL") {
        const n = len / (SIZES[type] ?? 4);
        sticky.scal = Array.from({ length: n }, (_, i) => readNum(dv, data + i * (SIZES[type] ?? 4), type));
      } else if (key === "TYPE") {
        sticky.type = new TextDecoder().decode(bytes.subarray(data, data + len)).replace(/\0.*$/, "");
      } else if (key === "GPSU") {
        sticky.utcMs = parseGpsu(new TextDecoder().decode(bytes.subarray(data, data + 16)));
      } else if (key === "GPSF") {
        sticky.fix = readNum(dv, data, type);
      } else if (key === "GPSP") {
        sticky.dop = readNum(dv, data, type) / 100;
      } else if (key === "GPS5" || key === "GPS9") {
        const fieldTypes = type === "?" && sticky.type ? sticky.type.split("") : Array.from({ length: size / (SIZES[type] ?? 4) }, () => type);
        const scale = (i: number) => sticky.scal[i] ?? sticky.scal[0] ?? 1;
        const samples: GpsSample[] = [];
        let dop = sticky.dop;
        let fix = sticky.fix;
        for (let r = 0; r < repeat; r++) {
          let at = data + r * size;
          const v: number[] = [];
          for (let i = 0; i < fieldTypes.length; i++) {
            const t = fieldTypes[i]!;
            v.push(readNum(dv, at, t) / scale(i));
            at += SIZES[t] ?? 4;
          }
          let epochMs: number | null = null;
          if (key === "GPS9") {
            // lat, lon, alt, 2D speed, 3D speed, days since 2000, seconds since midnight, DOP, fix
            epochMs = GPS9_EPOCH + (v[5] ?? 0) * 86400000 + Math.round((v[6] ?? 0) * 1000);
            dop = v[7] ?? dop;
            fix = v[8] ?? fix;
            if ((v[8] ?? 0) < 2) continue; // no lock for this sample
          }
          samples.push({ lat: v[0]!, lng: v[1]!, alt: v[2]!, speed2d: v[3]!, epochMs });
        }
        // Prefer GPS9 over GPS5 when a camera writes both.
        if (!found || key === "GPS9") found = { samples, utcMs: sticky.utcMs, fix, dop, device: sticky.device };
      }
      p = next;
    }
  };
  walk(0, bytes.length, { scal: [], type: null, utcMs: null, fix: null, dop: null, device: null });
  return found;
}
