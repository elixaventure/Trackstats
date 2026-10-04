import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { canManageChange, removeTrackChange, setTrackChangeResolved } from "@/data/actions";
import type { DbState } from "@/data/db";
import { formatRelativeDays } from "@/domain/time";
import { isOfficial } from "@/domain/trackChanges";
import { TRACK_CHANGE_LABEL, type TrackChange } from "@/domain/types";

export const SEVERITY_STYLE: Record<TrackChange["severity"], { ring: string; text: string; label: string }> = {
  info: { ring: "border-line", text: "text-equal", label: "Info" },
  caution: { ring: "border-warn/60", text: "text-warn", label: "Take care" },
  hazard: { ring: "border-slower/60", text: "text-slower", label: "Hazard" },
};

export function TrackChangeItem({ c, db, compact = false }: { c: TrackChange; db: DbState; compact?: boolean }) {
  const route = db.routes[c.routeId];
  const sector = route?.sectors.find((s) => s.id === c.sectorId);
  const style = SEVERITY_STYLE[c.severity];
  const official = route ? isOfficial(c, route) : false;
  const manage = canManageChange(db, c);
  const cleared = c.resolvedAt != null;
  return (
    <li className={`rounded-xl border p-3 ${cleared ? "border-line opacity-60" : style.ring}`}>
      <div className="flex items-start gap-3">
        <Icon name={c.severity === "info" ? "megaphone" : "alert"} className={`mt-0.5 size-6 shrink-0 ${cleared ? "text-muted" : style.text}`} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-snug">{c.title}</div>
          <div className="mt-0.5 font-mono text-xs uppercase tracking-wide text-muted">
            {[cleared ? "Cleared" : style.label, TRACK_CHANGE_LABEL[c.kind]].filter((x, i, a) => a.indexOf(x) === i).join(" · ")}{sector ? ` · ${sector.name}` : ""}{c.affectsTimes ? " · affects lap times" : ""}
          </div>
          {!compact && c.details && <p className="mt-1 text-sm">{c.details}</p>}
          <div className="mt-1 text-xs text-muted">
            {official && <span className="mr-1 rounded bg-plate px-1.5 py-0.5 font-bold text-plate-ink">Track official</span>}
            {c.reportedByName} · {formatRelativeDays(c.createdAt).toLowerCase()}{cleared ? ` · cleared ${formatRelativeDays(c.resolvedAt!).toLowerCase()}` : ""}
          </div>
        </div>
      </div>
      {!compact && manage && (
        <div className="mt-1 flex flex-wrap gap-x-1 pl-9">
          <Button variant="ghost" className="min-h-11 px-2 text-sm text-plate" onClick={() => setTrackChangeResolved(c.id, !cleared)}>{cleared ? "Reopen" : c.severity === "hazard" || c.kind === "closed" ? "Mark cleared" : "No longer relevant"}</Button>
          <Button variant="ghost" className="min-h-11 px-2 text-sm text-muted" onClick={() => removeTrackChange(c.id)}>Delete</Button>
        </div>
      )}
    </li>
  );
}
