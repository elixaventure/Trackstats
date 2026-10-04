import { Link } from "react-router-dom";
import type { Route, Session } from "@/domain/types";
import { CONDITION_LABEL, RIDE_TYPE_LABEL } from "@/domain/types";
import { formatLap, formatRelativeDays } from "@/domain/time";
import { Delta } from "./Delta";

export function SessionRow({ session, route }: { session: Session; route?: Route | null }) {
  const s = session.summary;
  const gain = s?.isPb && s.previousPbMs != null && s.fastestLapMs != null ? s.fastestLapMs - s.previousPbMs : null;
  return (
    <Link to={`/sessions/${session.id}`} className="flex min-h-16 items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2 active:bg-line">
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{route?.name ?? RIDE_TYPE_LABEL[session.rideType]}</div>
        <div className="truncate text-sm text-muted">
          {formatRelativeDays(session.startedAt)} · {CONDITION_LABEL[session.condition]} · {s?.lapCount ?? 0} laps
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-lg font-bold tnum">{formatLap(s?.fastestLapMs)}</div>
        {s?.isPb ? (
          <div className="text-xs font-bold uppercase tracking-wide text-plate">{gain != null ? <>PB <Delta ms={gain} unit={false} /></> : "First time"}</div>
        ) : null}
      </div>
    </Link>
  );
}
