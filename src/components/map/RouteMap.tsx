import { lazy, Suspense } from "react";
import type { MapLine, MapMarker } from "./types";

// MapLibre is ~800 KB; load it only on screens that show a map.
const MapLibreMap = lazy(() => import("./MapLibreMap"));

export function RouteMap(props: { lines: MapLine[]; markers?: MapMarker[]; className?: string; follow?: boolean }) {
  return (
    <Suspense fallback={<div className={`animate-pulse rounded-2xl bg-surface-2 ${props.className ?? ""}`} />}>
      <MapLibreMap {...props} />
    </Suspense>
  );
}
export type { MapLine, MapMarker } from "./types";
