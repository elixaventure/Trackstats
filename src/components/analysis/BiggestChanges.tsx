import { Delta } from "@/components/Delta";
import type { ColourSegment } from "@/domain/routeAnalysis";
import type { Route } from "@/domain/types";

function where(route: Route, s: ColourSegment) {
  const mid = (s.fromM + s.toM) / 2;
  const sector = [...route.sectors].sort((a, b) => a.endDistanceM - b.endDistanceM).find((x) => x.endDistanceM >= mid);
  return { name: sector?.name ?? "Stretch", range: `${Math.round(s.fromM)}–${Math.round(s.toM)} m into the lap` };
}

/** The two biggest gains and losses, in words a rider can act on next lap. */
export function BiggestChanges({ route, segments }: { route: Route; segments: ColourSegment[] }) {
  const gains = segments.filter((s) => s.verdict === "faster").sort((a, b) => a.changeMs - b.changeMs).slice(0, 2);
  const losses = segments.filter((s) => s.verdict === "slower").sort((a, b) => b.changeMs - a.changeMs).slice(0, 2);
  if (!gains.length && !losses.length) return <p className="text-muted">No stretch stands out beyond GPS accuracy. The two laps were ridden very similarly.</p>;
  const row = (s: ColourSegment, i: number) => {
    const w = where(route, s);
    return (
      <li key={i} className="flex items-center justify-between gap-3 py-1.5">
        <span className="min-w-0"><span className="block truncate font-semibold">{w.name}</span><span className="block text-xs text-muted">{w.range}</span></span>
        <Delta ms={s.changeMs} className="shrink-0" />
      </li>
    );
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div><h3 className="mb-1 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-faster">Biggest gains</h3><ul>{gains.length ? gains.map(row) : <li className="text-muted">None clear</li>}</ul></div>
      <div><h3 className="mb-1 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-slower">Biggest losses</h3><ul>{losses.length ? losses.map(row) : <li className="text-muted">None clear</li>}</ul></div>
    </div>
  );
}
