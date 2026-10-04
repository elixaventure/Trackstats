import { useState } from "react";
import { Button } from "@/components/Button";
import { Card, SectionTitle } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { changesFor, isCurrent } from "@/domain/trackChanges";
import type { Route } from "@/domain/types";
import { useDb } from "@/hooks/useDb";
import { ReportChangeForm } from "./ReportChangeForm";
import { TrackChangeItem } from "./TrackChangeItem";

/** "Track updates" on a route: open reports, a way to post one, and older/cleared history. */
export function TrackChanges({ route }: { route: Route }) {
  const db = useDb();
  const [reporting, setReporting] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const all = changesFor(route.id, Object.values(db.trackChanges));
  const current = all.filter((c) => isCurrent(c));
  const older = all.filter((c) => !isCurrent(c));

  return (
    <Card className="space-y-3">
      <div id="changes" className="scroll-mt-20" />
      <SectionTitle action={!reporting && <Button className="min-h-11 text-sm" onClick={() => setReporting(true)}><Icon name="megaphone" className="size-5" /> Report a change</Button>}>
        Track updates
      </SectionTitle>
      {reporting ? (
        <ReportChangeForm route={route} onDone={() => setReporting(false)} />
      ) : current.length ? (
        <ul className="space-y-2">{current.map((c) => <TrackChangeItem key={c.id} c={c} db={db} />)}</ul>
      ) : (
        <p className="text-muted">Nothing reported recently. If a jump's been rebuilt or something's blocking a line, let other riders know.</p>
      )}
      {!reporting && older.length > 0 && (
        <>
          <button type="button" onClick={() => setShowOld(!showOld)} aria-expanded={showOld} className="min-h-11 text-sm text-muted">
            {showOld ? "Hide" : "Show"} older and cleared reports ({older.length})
          </button>
          {showOld && <ul className="space-y-2">{older.map((c) => <TrackChangeItem key={c.id} c={c} db={db} />)}</ul>}
        </>
      )}
      {db.settings.demoMode && <p className="text-xs text-muted">Demo mode: reports stay on this phone. With accounts switched on they reach every rider of this track.</p>}
    </Card>
  );
}
