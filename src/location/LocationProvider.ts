import type { GpsPoint } from "@/domain/types";

export type LocationErrorKind = "unsupported" | "denied" | "unavailable" | "timeout";

export interface LocationProvider {
  readonly kind: "web" | "simulated" | "capacitor";
  readonly label: string;
  isSupported(): boolean;
  start(onFix: (p: GpsPoint) => void, onError: (kind: LocationErrorKind, message: string) => void): Promise<void>;
  stop(): void;
}

/** Plain-English fix for a location error, shown wherever GPS is used. */
export function locationErrorText(kind: LocationErrorKind): string {
  switch (kind) {
    case "denied":
      return "Location is blocked for this app. Tap the icon left of the web address → Permissions → Location → Allow. If that's not there: phone Settings → Apps → your browser → Permissions → Location → Allow while using. Also check the phone's Location is switched on";
    case "unsupported":
      return "This browser can't share your location. Try Chrome or Safari";
    case "timeout":
      return "No GPS fix yet. Make sure the phone's Location is on and you're outdoors with a clear view of the sky";
    default:
      return "Location isn't available right now. Check the phone's Location is on, then try again";
  }
}
