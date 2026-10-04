import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Lap } from "@/domain/types";
import { formatLap } from "@/domain/time";
import { chart, tooltipStyle } from "./theme";

/** Lap-by-lap bars measured as seconds off the session's fastest lap (shorter = closer to best). */
export function LapChart({ laps, pbMs }: { laps: Lap[]; pbMs: number | null }) {
  const valid = laps.filter((l) => l.valid);
  if (!valid.length) return <p className="py-8 text-center text-muted">No valid laps recorded.</p>;
  const best = Math.min(...valid.map((l) => l.durationMs));
  const data = laps.map((l) => ({ lap: l.lapNumber, gap: (l.durationMs - best) / 1000, time: l.durationMs, valid: l.valid }));
  const capped = data.map((d) => ({ ...d, bar: Math.min(d.gap, Math.max(6, (Math.max(...data.filter((x) => x.valid).map((x) => x.gap)) || 1) * 1.2)) }));
  return (
    <div className="h-52" role="img" aria-label="Lap times chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={capped} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <XAxis dataKey="lap" stroke={chart.axis} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis stroke={chart.axis} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={36} allowDecimals={false} tickFormatter={(v: number) => `+${v}`} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "#ffffff10" }} labelFormatter={(v) => `Lap ${v}`}
            formatter={(_v, _n, item) => {
              const p = item.payload as { time: number; gap: number; valid: boolean };
              return [`${formatLap(p.time)} (+${p.gap.toFixed(2)} s)${p.valid ? "" : " · excluded"}`, "Lap time"];
            }} />
          {pbMs != null && pbMs > best && <ReferenceLine y={(pbMs - best) / 1000} stroke={chart.pb} strokeDasharray="4 4" label={{ value: "Previous PB", fill: chart.pb, fontSize: 11, position: "insideTopRight" }} />}
          <Bar isAnimationActive={false} dataKey="bar" radius={[4, 4, 0, 0]} minPointSize={3}>
            {capped.map((d) => <Cell key={d.lap} fill={!d.valid ? "#3a403c" : d.gap === 0 ? chart.pb : chart.context} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
