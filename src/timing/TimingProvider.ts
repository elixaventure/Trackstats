/**
 * Hardware-agnostic timing interface. Application code only ever talks to this;
 * a BLE decoder, a network (Wi-Fi/LoRa) box or an OEM SDK each become one class
 * implementing it. Nothing outside src/timing knows about any wire protocol.
 */

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export interface PodStatus {
  podId: string;
  label: string;
  online: boolean;
  batteryPct: number | null;
}

export interface TimingStatus {
  state: ConnectionState;
  providerName: string;
  /** True for the simulator: the UI must say so rather than imply real hardware. */
  isSimulated: boolean;
  message: string | null;
  pods: PodStatus[];
}

/** A tag passing a timing point, exactly as reported. */
export interface PassingEvent {
  tagCode: string;
  podId: string;
  /** Hardware timestamp (epoch ms). Providers should use the decoder's clock, not arrival time. */
  at: number;
  signalStrength: number | null;
}

export interface TagStatus {
  tagCode: string;
  batteryPct: number | null;
  lastSeenAt: number | null;
}

export type Unsubscribe = () => void;

export interface TimingProvider {
  readonly kind: "mock" | "ble" | "network" | "oem";
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): TimingStatus;
  subscribeToStatus(cb: (s: TimingStatus) => void): Unsubscribe;
  subscribeToPassingEvents(cb: (e: PassingEvent) => void): Unsubscribe;
  /** Some systems map tags to riders on the decoder; others ignore this. Lap ownership is decided in-app either way. */
  assignTransponder(tagCode: string, riderId: string): Promise<void>;
  releaseTransponder(tagCode: string): Promise<void>;
  getTagStatus(tagCode: string): TagStatus | null;
}
