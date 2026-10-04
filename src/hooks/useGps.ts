import { useEffect, useState } from "react";
import { loadGps, saveGps } from "@/data/persist";
import type { GpsPoint } from "@/domain/types";
import { sync } from "@/sync/engine";

/** GPS trace for a session: device first, then the cloud copy if this phone doesn't have it. */
export function useGps(sessionId: string | null | undefined) {
  const [state, setState] = useState<{ points: GpsPoint[]; loading: boolean; forId: string | null }>({ points: [], loading: true, forId: null });
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    void (async () => {
      let pts = await loadGps(sessionId);
      if (!pts.length) {
        pts = await sync.fetchGps(sessionId);
        if (pts.length) await saveGps(sessionId, pts);
      }
      if (alive) setState({ points: pts, loading: false, forId: sessionId });
    })();
    return () => { alive = false; };
  }, [sessionId]);
  if (!sessionId) return { points: [], loading: false };
  return state.forId === sessionId ? state : { points: [], loading: true };
}
