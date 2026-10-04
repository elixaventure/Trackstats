import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

export function ListRow({ to, icon, title, sub, right }: { to: string; icon?: IconName; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <Link to={to} className="flex min-h-16 items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2 active:bg-line">
      {icon && <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-plate"><Icon name={icon} /></span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        {sub && <span className="block truncate text-sm text-muted">{sub}</span>}
      </span>
      {right}
      <Icon name="chevron" className="size-5 shrink-0 text-muted" />
    </Link>
  );
}
