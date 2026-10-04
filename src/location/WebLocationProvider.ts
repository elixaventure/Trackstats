import type { LocationErrorKind, LocationProvider } from "./LocationProvider";
import type { GpsPoint } from "@/domain/types";

/**
 * Browser Geolocation. Note: browsers pause GPS when the screen locks, so the live
 * ride screen holds a wake lock. A CapacitorLocationProvider (background location)
 * replaces this in the native apps.
 */
export class WebLocationProvider implements LocationProvider {
  readonly kind = "web" as const;
  readonly label = "Phone GPS";
  private watchId: number | null = null;

  isSupported() { return typeof navigator !== "undefined" && "geolocation" in navigator; }

  async start(onFix: (p: GpsPoint) => void, onError: (k: LocationErrorKind, m: string) => void) {
    if (!this.isSupported()) { onError("unsupported", "This device has no location support."); return; }
    this.stop();
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => onFix({
        t: pos.timestamp || Date.now(),
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy,
        speedMps: pos.coords.speed,
        heading: pos.coords.heading,
        altitudeM: pos.coords.altitude,
      }),
      (err) => {
        const kind: LocationErrorKind = err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable";
        onError(kind, err.message || "Location unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }

  stop() {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}
