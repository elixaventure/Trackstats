import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function EmptyState({ icon = "flag", title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <Icon name={icon} className="mb-3 size-10 text-muted" />
      <h3 className="font-display text-2xl font-extrabold uppercase">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-muted">
      <span className="size-5 animate-spin rounded-full border-2 border-line border-t-plate" />
      {label}…
    </div>
  );
}

export function ErrorNote({ title = "Something went wrong", children }: { title?: string; children?: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border border-slower/40 bg-slower/10 p-4">
      <div className="font-semibold text-slower">{title}</div>
      {children && <div className="mt-1 text-sm text-ink/90">{children}</div>}
    </div>
  );
}
