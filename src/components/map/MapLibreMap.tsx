import { useEffect, useRef, useState } from "react";
import { Map as MlMapCtor, NavigationControl, setWorkerUrl, type GeoJSONSource, type Map as MlMap } from "maplibre-gl";
// MapLibre 6 runs its tile worker from a separate ES module; let Vite bundle it and hand over the URL.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { FeatureCollection } from "geojson";
import { env } from "@/config/env";
import { bounds } from "@/domain/geo";
import { RouteSvg } from "./RouteSvg";
import type { MapLine, MapMarker } from "./types";

setWorkerUrl(workerUrl);

function linesToGeoJson(lines: MapLine[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: lines.filter((l) => l.coords.length > 1).map((l) => ({
      type: "Feature",
      properties: { color: l.color, width: l.width ?? 4, opacity: l.opacity ?? 1, dashed: l.dashed ? 1 : 0 },
      geometry: { type: "LineString", coordinates: l.coords },
    })),
  };
}

function markersToGeoJson(markers: MapMarker[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: markers.map((m) => ({ type: "Feature", properties: { color: m.color, label: m.label }, geometry: { type: "Point", coordinates: m.lngLat } })),
  };
}

export default function MapLibreMap({ lines, markers = [], className = "", follow = false }: { lines: MapLine[]; markers?: MapMarker[]; className?: string; follow?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const fitted = useRef(false);

  useEffect(() => {
    if (!el.current) return;
    let m: MlMap;
    try {
      m = new MlMapCtor({ container: el.current, style: env.mapStyleUrl, attributionControl: { compact: true }, center: [-2.19, 53.705], zoom: 13 });
    } catch {
      setFailed(true); // no WebGL
      return;
    }
    map.current = m;
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("lines", { type: "geojson", data: linesToGeoJson([]) });
      m.addSource("markers", { type: "geojson", data: markersToGeoJson([]) });
      m.addLayer({ id: "lines-casing", type: "line", source: "lines", layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#000", "line-width": ["+", ["get", "width"], 3], "line-opacity": ["*", 0.5, ["get", "opacity"]] } });
      m.addLayer({ id: "lines", type: "line", source: "lines", layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": ["get", "opacity"] } });
      m.addLayer({ id: "markers", type: "circle", source: "markers",
        paint: { "circle-radius": 8, "circle-color": ["get", "color"], "circle-stroke-color": "#0b0d0c", "circle-stroke-width": 3 } });
      setLoaded(true);
    });
    // No signal at the track and no cached style: fall back to the offline outline drawing.
    let loadedOk = false;
    m.on("load", () => { loadedOk = true; });
    m.on("error", () => { if (!loadedOk) setFailed(true); });
    const timeout = setTimeout(() => { if (!loadedOk) setFailed(true); }, 8000);
    return () => { clearTimeout(timeout); m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    (m.getSource("lines") as GeoJSONSource).setData(linesToGeoJson(lines));
    (m.getSource("markers") as GeoJSONSource).setData(markersToGeoJson(markers));
    const coords = lines.flatMap((l) => l.coords);
    if (follow && coords.length) {
      m.easeTo({ center: coords[coords.length - 1], zoom: Math.max(m.getZoom(), 16), duration: 500 });
    } else if (!fitted.current && coords.length > 1) {
      const b = bounds(coords);
      if (b) m.fitBounds(b, { padding: 40, animate: false, maxZoom: 17 });
      fitted.current = true;
    }
  }, [lines, markers, loaded, follow]);

  if (failed) return <RouteSvg lines={lines} markers={markers} className={`rounded-2xl bg-surface-2 p-2 ${className}`} title="Route outline (map unavailable offline)" />;
  return <div ref={el} className={`overflow-hidden rounded-2xl bg-surface-2 ${className}`} role="region" aria-label="Route map" />;
}
