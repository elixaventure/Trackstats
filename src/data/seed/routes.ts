import { cumulativeDistances, elevationGain, makeProjector } from "@/domain/geo";
import type { LngLatAlt, Route, RouteSector, TimingGate } from "@/domain/types";
import { stableUuid } from "@/lib/id";

// Demo geometry is synthetic: plausible shapes near Bacup, Lancashire, not surveyed tracks.

interface LoopSpec {
  lat: number; lng: number; rx: number; ry: number; n: number;
  wiggles: [number, number, number][]; // [harmonic, amplitude, phase]
  alt: (f: number) => number;
}

function loop(spec: LoopSpec): LngLatAlt[] {
  const proj = makeProjector(spec.lat, spec.lng);
  const pts: LngLatAlt[] = [];
  for (let i = 0; i <= spec.n; i++) {
    const f = i / spec.n;
    const th = f * Math.PI * 2;
    const r = 1 + spec.wiggles.reduce((a, [h, amp, ph]) => a + amp * Math.sin(h * th + ph), 0);
    const [lng, lat] = proj.toLngLat({ x: spec.rx * r * Math.cos(th), y: spec.ry * r * Math.sin(th) });
    pts.push([lng, lat, Math.round(spec.alt(f) * 10) / 10]);
  }
  return pts;
}

function line(lat: number, lng: number, lengthM: number, n: number, alt: (f: number) => number): LngLatAlt[] {
  const proj = makeProjector(lat, lng);
  const pts: LngLatAlt[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const x = f * lengthM * 0.55 + 60 * Math.sin(f * Math.PI * 3);
    const y = f * lengthM * 0.78 + 25 * Math.sin(f * Math.PI * 5);
    const [lo, la] = proj.toLngLat({ x, y });
    pts.push([lo, la, Math.round(alt(f) * 10) / 10]);
  }
  return pts;
}

function sectors(routeKey: string, names: string[], fractions: number[], length: number): RouteSector[] {
  return names.map((name, i) => ({ id: stableUuid(`${routeKey}:sector:${i}`), name, endDistanceM: Math.round(fractions[i]! * length) }));
}

function makeRoute(key: string, ownerId: string, base: Omit<Route, "id" | "createdByUserId" | "distanceM" | "elevationGainM" | "gates" | "sectors">, sectorNames: string[], sectorFractions: number[]): Route {
  const cum = cumulativeDistances(base.polyline);
  const length = Math.round(cum[cum.length - 1]!);
  const gates: TimingGate[] = base.isLoop
    ? [{ role: "start_finish", distanceM: 0, halfWidthM: 20 }]
    : [{ role: "start", distanceM: 0, halfWidthM: 20 }, { role: "finish", distanceM: length, halfWidthM: 20 }];
  return {
    ...base,
    id: stableUuid(`route:${key}`),
    createdByUserId: ownerId,
    distanceM: length,
    elevationGainM: elevationGain(base.polyline.map((p) => p[2])),
    gates,
    sectors: sectors(key, sectorNames, sectorFractions, length),
  };
}

export const SECTOR_PROFILES = {
  bacup: { difficulty: [0.8, 1.45, 1.2, 1.0, 0.75, 1.1], gain: [0.025, 0.02, 0.1, 0.06, 0.04, -0.012] },
  woodland: { difficulty: [1.0, 1.35, 1.1, 0.9, 1.25], gain: [0.03, 0.09, 0.05, 0.04, 0.07] },
  sprint: { difficulty: [0.9, 1.1, 1.2], gain: [0.04, 0.05, 0.06] },
} as const;

export function demoRoutes(ownerId: string, now: number) {
  const created = now - 60 * 86400000;
  const bacup = makeRoute("bacup", ownerId, {
    name: "Bacup MX Main Track", routeType: "mx_circuit", isLoop: true, visibility: "public",
    polyline: loop({
      lat: 53.7068, lng: -2.1861, rx: 190, ry: 115, n: 160,
      wiggles: [[3, 0.16, 0.4], [5, 0.07, 1.2], [7, 0.04, 2.1]],
      alt: (f) => 328 + 9 * Math.sin(f * Math.PI * 2) + 3 * Math.sin(f * Math.PI * 6),
    }),
    configVersion: 1, location: "Bacup, Lancashire", createdAt: created, favourite: true,
  }, ["Start straight", "Quarry hairpin", "Rollers", "Top jump", "Back straight", "Tyre berm → finish"], [0.12, 0.27, 0.45, 0.62, 0.82, 1]);

  const woodland = makeRoute("woodland", ownerId, {
    name: "Woodland Enduro Loop", routeType: "enduro_loop", isLoop: true, visibility: "public",
    polyline: loop({
      lat: 53.7112, lng: -2.1712, rx: 720, ry: 430, n: 360,
      wiggles: [[4, 0.12, 0.2], [9, 0.05, 1.7], [13, 0.03, 0.6]],
      alt: (f) => 300 + 38 * Math.sin(f * Math.PI * 2 + 0.5) + 9 * Math.sin(f * Math.PI * 10),
    }),
    configVersion: 1, location: "Bacup, Lancashire", createdAt: created + 86400000, favourite: false,
  }, ["Fire road", "Woodland Section", "Stream crossing", "Quarry climb", "Rooty descent"], [0.18, 0.42, 0.58, 0.8, 1]);

  const sprint = makeRoute("sprint", ownerId, {
    name: "Hill Sprint", routeType: "sprint", isLoop: false, visibility: "public",
    polyline: line(53.7021, -2.1958, 640, 60, (f) => 281 + 86 * f + 4 * Math.sin(f * Math.PI * 4)),
    configVersion: 1, location: "Bacup, Lancashire", createdAt: created + 2 * 86400000, favourite: false,
  }, ["Launch", "Hairpin → Jump", "Summit"], [0.3, 0.68, 1]);

  return { bacup, woodland, sprint };
}
