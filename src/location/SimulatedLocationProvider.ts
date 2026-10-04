import { buildGeometry, pointAtDistance } from "@/domain/geo";
import type { GpsPoint, LngLatAlt } from "@/domain/types";
import type { LocationErrorKind, LocationProvider } from "./LocationProvider";

/**
 * Developer GPS: rides a route polyline at a varying, realistic speed with a few
 * metres of noise. Lets GPS timing, route recording and analysis be exercised
 * at a desk. `speedFactor` compresses time for quicker testing.
 */
export class SimulatedLocationProvider implements LocationProvider {
  readonly kind = "simulated" as const;
  readonly label = "Simulated GPS";
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private line: LngLatAlt[], private speedFactor = 1, private isLoop = true) {}

  isSupported() { return this.line.length > 1; }

  async start(onFix: (p: GpsPoint) => void, onError: (k: LocationErrorKind, m: string) => void) {
    if (!this.isSupported()) { onError("unavailable", "No route to simulate."); return; }
    const g = buildGeometry(this.line);
    let d = -15; // begin just behind the start line so the first crossing registers
    let t = 0;
    this.timer = setInterval(() => {
      t += 1;
      const speed = (11 + 6 * Math.sin(t / 7) + 3 * Math.sin(t / 2.3)) * this.speedFactor;
      d += speed;
      if (d > g.length) d = this.isLoop ? d - g.length : g.length;
      const p = pointAtDistance(g, Math.max(0, d));
      const n = () => (Math.random() - 0.5) * 6;
      const [lng, lat] = g.proj.toLngLat({ x: p.xy.x + n(), y: p.xy.y + n() });
      const alt = this.line[Math.min(this.line.length - 1, Math.round((d / g.length) * (this.line.length - 1)))]?.[2] ?? null;
      onFix({ t: Date.now(), lat, lng, accuracyM: 4 + Math.random() * 4, speedMps: speed, heading: null, altitudeM: alt });
    }, 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
