import type { ReactNode } from "react";
import { dueText, type TaskStatus } from "@/domain/service";

const TONE = { due: "bg-slower", soon: "bg-warn", ok: "bg-faster", never: "bg-line" } as const;
const TEXT = { due: "text-slower", soon: "text-warn", ok: "text-muted", never: "text-muted" } as const;

/** One schedule line: name, how far through its interval, and when it's due. */
export function DueBar({ s, action }: { s: TaskStatus; action?: ReactNode }) {
  const pct = Math.min(100, Math.round((s.fraction ?? 0) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{s.task.name}</span>
        <span className={`shrink-0 text-right text-sm ${TEXT[s.state]}`}>{s.state === "due" ? "Due now" : s.state === "soon" ? "Due soon" : ""}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${s.task.name}: ${dueText(s)}`}>
        <div className={`h-full rounded-full ${TONE[s.state]}`} style={{ width: `${s.state === "never" ? 0 : Math.max(3, pct)}%` }} />
      </div>
      <div className="mt-0.5 text-xs text-muted">
        {[s.task.intervalHours ? `every ${s.task.intervalHours} h` : null, s.task.intervalDays ? `every ${Math.round(s.task.intervalDays / 30)} months` : null].filter(Boolean).join(" or ")}
        {" · "}{dueText(s)}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
