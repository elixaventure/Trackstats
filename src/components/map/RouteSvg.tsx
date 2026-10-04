import { makeProjector } from "@/domain/geo";
import type { MapLine, MapMarker } from "./types";

/**
 * Lightweight, offline route drawing (no tiles, no WebGL). Used for thumbnails,
 * share cards and as the fallback when the map can't load.
 */
export function RouteSvg({ lines, markers = [], className = "", padding = 8, title }: { lines: MapLine[]; markers?: MapMarker[]; className?: string; padding?: number; title?: string }) {
  const all = lines.flatMap((l) => l.coords);
  if (all.length < 2) return <div className={`grid place-items-center text-sm text-muted ${className}`}>No GPS trace</div>;
  const ref = all[0]!;
  const proj = makeProjector(ref[1], ref[0]);
  const xy = (c: [number, number]) => proj.toXy(c[1], c[0]);
  const pts = all.map(xy);
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
  const size = 100;
  const scale = (size - padding * 2) / Math.max(w, h);
  const ox = (size - w * scale) / 2, oy = (size - h * scale) / 2;
  const tx = (c: [number, number]) => { const p = xy(c); return [ox + (p.x - minX) * scale, size - (oy + (p.y - minY) * scale)] as const; };
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label={title ?? "Route outline"} preserveAspectRatio="xMidYMid meet">
      {lines.map((l) => (
        <polyline key={l.id} points={l.coords.map((c) => tx(c).join(",")).join(" ")} fill="none" stroke={l.color}
          strokeWidth={l.width ?? 3} strokeOpacity={l.opacity ?? 1} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={l.dashed ? "4 4" : undefined} vectorEffect="non-scaling-stroke" />
      ))}
      {markers.map((m) => { const [x, y] = tx(m.lngLat); return <circle key={m.id} cx={x} cy={y} r={2.4} fill={m.color} stroke="#0b0d0c" strokeWidth={0.8} />; })}
    </svg>
  );
}
