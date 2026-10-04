import { formatDelta } from "@/domain/time";

/** Time delta where negative = faster (green, ↓) and positive = slower (red, ↑). */
export function Delta({ ms, className = "", unit = true, equalBandMs = 0 }: { ms: number | null | undefined; className?: string; unit?: boolean; equalBandMs?: number }) {
  if (ms == null) return <span className={`text-muted ${className}`}>—</span>;
  const equal = Math.abs(ms) <= equalBandMs;
  const tone = equal ? "text-equal" : ms < 0 ? "text-faster" : "text-slower";
  const arrow = equal ? "≈" : ms < 0 ? "↓" : "↑";
  return (
    <span className={`font-mono tnum font-semibold ${tone} ${className}`}>
      <span aria-hidden="true">{arrow} </span>
      {formatDelta(ms)}
      {unit && <span className="text-[0.8em]"> s</span>}
      <span className="sr-only">{equal ? " (about equal)" : ms < 0 ? " faster" : " slower"}</span>
    </span>
  );
}
