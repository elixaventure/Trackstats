import { useEffect, useState } from "react";
import { sync, type SyncState } from "@/sync/engine";

export function useSync() {
  const [s, set] = useState<{ state: SyncState; pending: number; lastError: string | null; lastSyncedAt: number | null }>({
    state: "disabled", pending: 0, lastError: null, lastSyncedAt: null,
  });
  useEffect(() => sync.subscribe(set), []);
  return s;
}
