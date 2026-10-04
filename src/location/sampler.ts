import { haversineM } from "@/domain/geo";
import type { GpsPoint } from "@/domain/types";

/**
 * Keeps GPS volume under control: at most 1 fix/second, drop poor fixes, and when
 * stationary only keep one fix every 10 s. An hour of riding ≈ 3,600 points max.
 */
export class GpsSampler {
  private last: GpsPoint | null = null;
  constructor(private maxAccuracyM = 35, private minIntervalMs = 1000, private idleIntervalMs = 10000, private minMoveM = 2) {}

  accept(p: GpsPoint): boolean {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || p.accuracyM > this.maxAccuracyM) return false;
    const prev = this.last;
    if (prev) {
      const dt = p.t - prev.t;
      if (dt < this.minIntervalMs) return false;
      const moved = haversineM(prev.lat, prev.lng, p.lat, p.lng);
      if (moved < this.minMoveM && dt < this.idleIntervalMs) return false;
    }
    this.last = p;
    return true;
  }

  reset() { this.last = null; }
}
