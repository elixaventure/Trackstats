import { useSyncExternalStore } from "react";
import { store } from "@/data/store";
import type { DbState } from "@/data/db";

/** Whole-state subscription. State is immutable, so derive with useMemo keyed on the slices you read. */
export function useDb(): DbState {
  return useSyncExternalStore(store.subscribe, store.getState);
}
