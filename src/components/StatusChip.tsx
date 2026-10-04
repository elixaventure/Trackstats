import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type ChipTone = "ok" | "warn" | "bad" | "idle";
const tones: Record<ChipTone, string> = {
  ok: "border-faster/40 text-faster",
  warn: "border-warn/40 text-warn",
  bad: "border-slower/50 text-slower",
  idle: "border-line text-muted",
};

/** Status always carries an icon and words, never colour alone. */
export function StatusChip({ icon, tone, children }: { icon: IconName; tone: ChipTone; children: ReactNode }) {
  return (
    <span className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-surface px-3 font-mono text-xs font-semibold ${tones[tone]}`}>
      <Icon name={icon} className="size-4" />{children}
    </span>
  );
}
