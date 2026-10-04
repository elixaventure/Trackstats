import type { LngLatAlt } from "@/domain/types";
import type { LocationProvider } from "./LocationProvider";
import { SimulatedLocationProvider } from "./SimulatedLocationProvider";
import { WebLocationProvider } from "./WebLocationProvider";

export function createLocationProvider(opts: { simulate: boolean; simulateLine?: LngLatAlt[]; speedFactor?: number; isLoop?: boolean }): LocationProvider {
  if (opts.simulate && opts.simulateLine && opts.simulateLine.length > 1) {
    return new SimulatedLocationProvider(opts.simulateLine, opts.speedFactor ?? 1, opts.isLoop ?? true);
  }
  return new WebLocationProvider();
}
export type { LocationProvider } from "./LocationProvider";
