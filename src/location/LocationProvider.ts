import type { GpsPoint } from "@/domain/types";

export type LocationErrorKind = "unsupported" | "denied" | "unavailable" | "timeout";

export interface LocationProvider {
  readonly kind: "web" | "simulated" | "capacitor";
  readonly label: string;
  isSupported(): boolean;
  start(onFix: (p: GpsPoint) => void, onError: (kind: LocationErrorKind, message: string) => void): Promise<void>;
  stop(): void;
}
