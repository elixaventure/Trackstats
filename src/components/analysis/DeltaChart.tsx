import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chart, tooltipStyle } from "@/components/charts/theme";
import type { DeltaPoint } from "@/domain/routeAnalysis";
import type { RouteSector } from "@/domain/types";
import { formatDelta } from "@/domain/time";

/**
 * Running gap to the reference lap around the track. Below zero = ahead.
 * Where the line falls you're gaining; where it rises you're losing.
 */
export function DeltaChart({ points, sectors, refLabel }: { points: DeltaPoint[]; sectors: RouteSector[]; refLabel: string }) {
  if (points.length < 3) return null;
  const data = points.map((p) => ({ d: p.d, s: p.deltaMs / 1000 }));
  const max = Math.max(0.5, ...data.map((x) => Math.abs(x.s)));
  return (
    <div>
      <div className="mb-1 flex justify-between font-mono text-xs text-muted"><span>↑ behind {refLabel}</span><span>Gap around the lap</span></div>
      <div className="h-48" role="img" aria-label={`Running time gap to ${refLabel} around the lap`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="deltaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chart.slower} stopOpacity={0.35} />
                <stop offset="50%" stopColor={chart.slower} stopOpacity={0.02} />
                <stop offset="50%" stopColor={chart.faster} stopOpacity={0.02} />
                <stop offset="100%" stopColor={chart.faster} stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis dataKey="d" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => `${Math.round(v)}m`} stroke={chart.axis} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={30} />
            <YAxis domain={[-max, max]} tickFormatter={(v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1))} stroke={chart.axis} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={40} />
            <Tooltip {...tooltipStyle} labelFormatter={(v) => `${Math.round(Number(v))} m into the lap`}
              formatter={(v) => [`${formatDelta(Number(v) * 1000)} s`, Number(v) <= 0 ? "Ahead" : "Behind"]} />
            {sectors.slice(0, -1).map((s) => <ReferenceLine key={s.id} x={s.endDistanceM} stroke={chart.grid} strokeDasharray="3 3" />)}
            <ReferenceLine y={0} stroke={chart.axis} />
            <Area isAnimationActive={false} type="monotone" dataKey="s" baseValue={0} stroke={chart.pb} strokeWidth={2} fill="url(#deltaFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 font-mono text-xs text-muted">↓ ahead of {refLabel}</div>
    </div>
  );
}
