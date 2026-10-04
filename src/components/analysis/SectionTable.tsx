import { Delta } from "@/components/Delta";
import type { SectionResult, Verdict } from "@/domain/routeAnalysis";
import { formatLap } from "@/domain/time";

export const VERDICT_COLOR: Record<Verdict, string> = { faster: "#3ddc84", equal: "#9fb3c8", slower: "#ff6157", unknown: "#4a524c" };
const VERDICT_TEXT: Record<Verdict, string> = { faster: "faster", equal: "about equal", slower: "slower", unknown: "not enough GPS" };

export function SectionTable({ sections, refLabel }: { sections: SectionResult[]; refLabel: string }) {
  return (
    <ol className="divide-y divide-line">
      {sections.map((s, i) => (
        <li key={`${s.name}-${i}`} className="flex min-h-16 items-center gap-3 py-2">
          <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: VERDICT_COLOR[s.verdict] }} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{s.name}</div>
            <div className="font-mono text-sm text-muted tnum">
              This ride {formatLap(s.timeMs)} · {refLabel} {formatLap(s.refMs)}
            </div>
          </div>
          <div className="text-right">
            {s.deltaMs != null ? <Delta ms={s.deltaMs} equalBandMs={s.uncertaintyMs ?? 0} className="text-lg" /> : <span className="text-sm text-muted">—</span>}
            <div className="text-xs text-muted">{VERDICT_TEXT[s.verdict]}{s.uncertaintyMs != null ? ` (±${(s.uncertaintyMs / 1000).toFixed(1)}s)` : ""}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
