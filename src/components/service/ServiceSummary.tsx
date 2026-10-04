import { Link } from "react-router-dom";
import { dueText } from "@/domain/service";
import { useBikeService } from "@/hooks/useBikeService";

/** Garage card footer: engine hours and the most urgent job. */
export function ServiceSummary({ bikeId }: { bikeId: string }) {
  const data = useBikeService(bikeId);
  if (!data) return null;
  const top = data.status.find((s) => s.state === "due" || s.state === "soon");
  const never = data.status.filter((s) => s.state === "never").length;
  return (
    <Link to={`/garage/${bikeId}`} className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2 hover:bg-line">
      <span className="min-w-0">
        <span className="block font-mono text-xs uppercase tracking-[0.12em] text-muted">Service · {data.hours.total} h</span>
        {top
          ? <span className={`block font-semibold leading-snug ${top.state === "due" ? "text-slower" : "text-warn"}`}>{top.task.name}: {dueText(top)}</span>
          : <span className="block font-semibold text-faster">{never ? `Nothing due · ${never} job${never === 1 ? "" : "s"} not logged yet` : "All up to date"}</span>}
      </span>
      <span className="shrink-0 text-sm font-semibold text-plate">Service →</span>
    </Link>
  );
}
