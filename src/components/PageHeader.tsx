import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "./Icon";

export function PageHeader({ title, eyebrow, back, action }: { title: ReactNode; eyebrow?: ReactNode; back?: string | true; action?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="mb-5 flex items-end justify-between gap-3">
      <div className="flex min-w-0 items-end gap-2">
        {back && (
          <button type="button" aria-label="Back" onClick={() => (back === true ? navigate(-1) : navigate(back))}
            className="-ml-2 grid size-12 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink">
            <Icon name="back" className="size-7" />
          </button>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted">{eyebrow}</div>}
          <h1 className="break-words font-display text-[2rem] font-extrabold uppercase leading-[0.95] tracking-wide sm:text-4xl md:text-5xl">{title}</h1>
        </div>
      </div>
      {action}
    </header>
  );
}
