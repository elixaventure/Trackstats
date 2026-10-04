import type { ReactNode } from "react";

type Tone = "default" | "faster" | "slower" | "plate" | "muted";
const toneClass: Record<Tone, string> = {
  default: "text-ink", faster: "text-faster", slower: "text-slower", plate: "text-plate", muted: "text-muted",
};

export function Stat({ label, value, sub, tone = "default", size = "md" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; size?: "md" | "lg" | "xl" }) {
  const sz = size === "xl" ? "text-6xl" : size === "lg" ? "text-4xl" : "text-2xl";
  return (
    <div className="min-w-0">
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`font-mono font-bold tnum leading-tight ${sz} ${toneClass[tone]} truncate`}>{value}</div>
      {sub != null && <div className="mt-0.5 text-sm text-muted">{sub}</div>}
    </div>
  );
}
