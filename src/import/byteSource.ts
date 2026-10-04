/**
 * Random-access reader over a file. GoPro videos run to several GB, so the
 * importer reads only the bytes it needs (box headers, the index and the small
 * telemetry samples) instead of loading the file into memory.
 */
export interface ByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    read: async (offset, length) => new Uint8Array(await blob.slice(offset, Math.min(blob.size, offset + length)).arrayBuffer()),
  };
}

export function bytesSource(bytes: Uint8Array): ByteSource {
  return { size: bytes.length, read: async (o, l) => bytes.subarray(o, Math.min(bytes.length, o + l)) };
}

export const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
export const fourcc = (b: Uint8Array, at: number) => String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);
