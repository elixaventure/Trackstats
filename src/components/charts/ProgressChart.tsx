import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProgressPoint } from "@/domain/stats";
import { formatDate, formatLap } from "@/domain/time";
import { chart, tooltipStyle } from "./theme";

/**
 * Lap time over sessions. Y axis is inverted so "up" means faster, which is how
 * riders read improvement.
 */
export function ProgressChart({ points, showAverage = true, height = 240 }: { points: ProgressPoint[]; showAverage?: boolean; height?: number }) {
  if (points.length < 2) return <p className="py-8 text-center text-muted">Ride this route twice to see a progression line.</p>;
  const data = points.map((p) => ({ at: p.at, best: p.best / 1000, pb: p.pbSoFar / 1000, avg: p.average != null ? p.average / 1000 : null }));
  const vals = data.flatMap((d) => [d.best, d.pb, ...(showAverage && d.avg != null ? [d.avg] : [])]);
  const pad = (Math.max(...vals) - Math.min(...vals)) * 0.1 || 1;
  return (
    <div style={{ height }} role="img" aria-label="Lap time progression chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={chart.grid} vertical={false} />
          <XAxis dataKey="at" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => formatDate(v)}
            stroke={chart.axis} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis reversed domain={[Math.min(...vals) - pad, Math.max(...vals) + pad]} tickFormatter={(v: number) => formatLap(v * 1000).replace(/\.\d+$/, "")}
            stroke={chart.axis} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
          <Tooltip {...tooltipStyle} labelFormatter={(v) => formatDate(Number(v))}
            formatter={(v, name) => [formatLap(Number(v) * 1000), name]} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: chart.axis }} />
          {showAverage && <Line isAnimationActive={false} name="Average lap" dataKey="avg" stroke={chart.context} strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls />}
          <Line isAnimationActive={false} name="Session best" dataKey="best" stroke={chart.context} strokeWidth={0} dot={{ r: 4, fill: chart.context, stroke: chart.surface, strokeWidth: 2 }} activeDot={{ r: 6 }} />
          <Line isAnimationActive={false} name="Personal best" dataKey="pb" type="stepAfter" stroke={chart.pb} strokeWidth={2.5} dot={false} activeDot={{ r: 6, fill: chart.pb, stroke: chart.surface, strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
