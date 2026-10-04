import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chart, tooltipStyle } from "./theme";

export function MonthlyChart({ data }: { data: { label: string; sessions: number; hours: number }[] }) {
  if (!data.length) return <p className="py-8 text-center text-muted">No sessions yet.</p>;
  return (
    <div className="h-44" role="img" aria-label="Sessions per month chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={chart.grid} vertical={false} />
          <XAxis dataKey="label" stroke={chart.axis} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} stroke={chart.axis} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={28} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "#ffffff10" }} formatter={(v, _n, item) => [`${v} sessions · ${(item.payload as { hours: number }).hours} h`, "Riding"]} />
          <Bar isAnimationActive={false} dataKey="sessions" fill={chart.pb} radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
