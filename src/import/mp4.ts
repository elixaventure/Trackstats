import { fourcc, view, type ByteSource } from "./byteSource";

/** One GPMF telemetry sample inside the MP4, with its position on the video timeline. */
export interface MetaSample { offset: number; size: number; timeS: number; durationS: number }

export interface Mp4Info {
  durationS: number;
  /** GoPro telemetry ('gpmd') samples; empty if the file has no GPMF track. */
  gpmd: MetaSample[];
}

interface Box { type: string; start: number; headerSize: number; size: number }

function readBoxes(buf: Uint8Array, from: number, to: number): Box[] {
  const dv = view(buf);
  const out: Box[] = [];
  let p = from;
  while (p + 8 <= to) {
    let size = dv.getUint32(p);
    const type = fourcc(buf, p + 4);
    let headerSize = 8;
    if (size === 1) { size = Number(dv.getBigUint64(p + 8)); headerSize = 16; }
    else if (size === 0) size = to - p;
    if (size < headerSize) break;
    out.push({ type, start: p, headerSize, size });
    p += size;
  }
  return out;
}

const child = (buf: Uint8Array, box: Box, type: string) => readBoxes(buf, box.start + box.headerSize, box.start + box.size).find((b) => b.type === type);
const path = (buf: Uint8Array, box: Box | undefined, ...types: string[]) => types.reduce<Box | undefined>((b, t) => (b ? child(buf, b, t) : undefined), box);

/** Find the 'moov' index box without reading the media data, wherever it sits in the file. */
async function readMoov(src: ByteSource): Promise<Uint8Array> {
  let p = 0;
  while (p + 8 <= src.size) {
    const h = await src.read(p, 16);
    const dv = view(h);
    let size = dv.getUint32(0);
    const type = fourcc(h, 4);
    if (size === 1) size = Number(dv.getBigUint64(8));
    else if (size === 0) size = src.size - p;
    if (size < 8) break;
    if (type === "moov") return src.read(p, size);
    p += size;
  }
  throw new Error("Not a readable MP4 video (no index found).");
}

export async function readMp4(src: ByteSource): Promise<Mp4Info> {
  const buf = await readMoov(src);
  const dv = view(buf);
  const moov: Box = { type: "moov", start: 0, headerSize: 8, size: buf.length };
  const mvhd = child(buf, moov, "mvhd");
  let durationS = 0;
  if (mvhd) {
    const v = buf[mvhd.start + 8]!;
    const base = mvhd.start + 8 + 4 + (v === 1 ? 16 : 8);
    const timescale = dv.getUint32(base);
    const dur = v === 1 ? Number(dv.getBigUint64(base + 4)) : dv.getUint32(base + 4);
    durationS = dur / timescale;
  }

  for (const trak of readBoxes(buf, 8, buf.length).filter((b) => b.type === "trak")) {
    const stbl = path(buf, trak, "mdia", "minf", "stbl");
    const stsd = stbl && child(buf, stbl, "stsd");
    if (!stbl || !stsd || fourcc(buf, stsd.start + stsd.headerSize + 8 + 4) !== "gpmd") continue;
    const mdhd = path(buf, trak, "mdia", "mdhd")!;
    const mv = buf[mdhd.start + 8]!;
    const timescale = dv.getUint32(mdhd.start + 8 + 4 + (mv === 1 ? 16 : 8));
    return { durationS, gpmd: sampleTable(buf, stbl, timescale) };
  }
  return { durationS, gpmd: [] };
}

function sampleTable(buf: Uint8Array, stbl: Box, timescale: number): MetaSample[] {
  const dv = view(buf);
  const body = (t: string) => { const b = child(buf, stbl, t); return b ? b.start + b.headerSize + 4 : null; }; // skip version/flags

  // Sizes
  const stsz = body("stsz")!;
  const fixed = dv.getUint32(stsz);
  const count = dv.getUint32(stsz + 4);
  const sizes = Array.from({ length: count }, (_, i) => (fixed || dv.getUint32(stsz + 8 + i * 4)));

  // Chunk offsets
  let chunkOffsets: number[] = [];
  const stco = body("stco");
  const co64 = body("co64");
  if (stco != null) chunkOffsets = Array.from({ length: dv.getUint32(stco) }, (_, i) => dv.getUint32(stco + 4 + i * 4));
  else if (co64 != null) chunkOffsets = Array.from({ length: dv.getUint32(co64) }, (_, i) => Number(dv.getBigUint64(co64 + 4 + i * 8)));

  // Samples per chunk
  const stsc = body("stsc")!;
  const runs = Array.from({ length: dv.getUint32(stsc) }, (_, i) => ({ first: dv.getUint32(stsc + 4 + i * 12), per: dv.getUint32(stsc + 8 + i * 12) }));
  const offsets: number[] = [];
  let s = 0;
  for (let c = 0; c < chunkOffsets.length && s < count; c++) {
    const run = [...runs].reverse().find((r) => r.first <= c + 1)!;
    let off = chunkOffsets[c]!;
    for (let k = 0; k < run.per && s < count; k++) { offsets.push(off); off += sizes[s]!; s++; }
  }

  // Timing
  const stts = body("stts")!;
  const durations: number[] = [];
  for (let i = 0, n = dv.getUint32(stts); i < n; i++) {
    const c = dv.getUint32(stts + 4 + i * 8), d = dv.getUint32(stts + 8 + i * 8);
    for (let k = 0; k < c; k++) durations.push(d / timescale);
  }
  let t = 0;
  return sizes.map((size, i) => {
    const d = durations[i] ?? durations[durations.length - 1] ?? 1;
    const sample = { offset: offsets[i]!, size, timeS: t, durationS: d };
    t += d;
    return sample;
  });
}
