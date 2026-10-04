import { useSyncExternalStore } from "react";
import { rideEngine } from "./engine";

export function useRide() {
  return useSyncExternalStore(rideEngine.subscribe, rideEngine.getSnapshot);
}
