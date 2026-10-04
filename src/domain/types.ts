// Core data model. Mirrors supabase/migrations/0001_schema.sql (snake_case there,
// camelCase here). All ids are UUIDs; timestamps are epoch milliseconds locally
// and timestamptz in Postgres.

export type Uuid = string;
export type EpochMs = number;

export type RideType = "mx_circuit" | "enduro_loop" | "point_to_point" | "sprint" | "free_ride";
export type TrackCondition = "dry" | "damp" | "wet" | "muddy" | "mixed";
export type TimingMode = "gps" | "lap" | "start_finish" | "sectors";
export type TimingSource = "transponder" | "gps" | "manual";
export type Visibility = "public" | "private";

export interface User {
  id: Uuid;
  email: string | null;
  createdAt: EpochMs;
}

export interface RiderProfile {
  id: Uuid;
  /** The account that manages this rider (a parent can manage several children). */
  ownerUserId: Uuid;
  name: string;
  username: string;
  raceNumber: string;
  riderClass: string;
  ageCategory: string | null;
  homeRegion: string | null;
  imageDataUrl: string | null;
  visibility: Visibility;
  defaultBikeId: Uuid | null;
  createdAt: EpochMs;
}

export interface Bike {
  id: Uuid;
  riderId: Uuid;
  manufacturer: string;
  model: string;
  /** e.g. "250cc 4T" */
  capacity: string;
  /** Racing class the bike competes in, e.g. "MX2". Used for leaderboard filters. */
  bikeClass: string;
  year: number | null;
  nickname: string | null;
  imageDataUrl: string | null;
  archived: boolean;
}

export interface Group {
  id: Uuid;
  name: string;
  kind: "family" | "team" | "friends";
  createdByUserId: Uuid;
  createdAt: EpochMs;
}

export interface GroupMember {
  id: Uuid;
  groupId: Uuid;
  riderId: Uuid;
  role: "manager" | "rider";
  joinedAt: EpochMs;
}

export interface Transponder {
  id: Uuid;
  /** The code the timing hardware reports, e.g. "001". */
  code: string;
  nickname: string;
  ownership: "personal" | "shared";
  /** Owning rider for personal tags, owning group for shared tags. */
  ownerRiderId: Uuid | null;
  ownerGroupId: Uuid | null;
  batteryPct: number | null;
  lastSeenAt: EpochMs | null;
  status: "active" | "lost" | "retired";
}

/** Who is wearing a tag, and when. Lap history never depends on this table. */
export interface TransponderAssignment {
  id: Uuid;
  transponderId: Uuid;
  riderId: Uuid;
  assignedByUserId: Uuid;
  assignedAt: EpochMs;
  releasedAt: EpochMs | null;
}

/** [lng, lat, altitude metres | null] — GeoJSON order. */
export type LngLatAlt = [number, number, number | null];

export interface RouteSector {
  id: Uuid;
  name: string;
  /** Distance along the route polyline where this sector ends, metres. */
  endDistanceM: number;
}

/** Virtual timing gate used by GPS timing and by pod placement on the map. */
export interface TimingGate {
  role: "start_finish" | "start" | "finish" | "sector";
  distanceM: number;
  /** Half-width of the gate line either side of the route, metres. */
  halfWidthM: number;
}

export interface Route {
  id: Uuid;
  name: string;
  routeType: RideType;
  isLoop: boolean;
  createdByUserId: Uuid;
  visibility: Visibility;
  polyline: LngLatAlt[];
  distanceM: number;
  elevationGainM: number | null;
  gates: TimingGate[];
  sectors: RouteSector[];
  /**
   * Bumped whenever geometry, gates or sectors change. Laps are only ever compared
   * against laps recorded on the same configuration.
   */
  configVersion: number;
  location: string | null;
  createdAt: EpochMs;
  favourite: boolean;
}

export type PodRole = "start_finish" | "start" | "finish" | `sector_${number}`;

export interface TimingConfig {
  mode: TimingMode;
  /** Pod id → role. Empty for GPS mode. */
  pods: { podId: string; role: PodRole }[];
  isLoop: boolean;
}

export interface Session {
  id: Uuid;
  riderId: Uuid;
  bikeId: Uuid | null;
  routeId: Uuid | null;
  routeConfigVersion: number | null;
  transponderId: Uuid | null;
  rideType: RideType;
  timing: TimingConfig;
  condition: TrackCondition;
  notes: string;
  status: "active" | "completed" | "abandoned";
  startedAt: EpochMs;
  endedAt: EpochMs | null;
  /** Denormalised summary written when the session completes. */
  summary: SessionSummary | null;
  hasGps: boolean;
  /** Recorded with the timing or GPS simulator. Never ranked on leaderboards. */
  simulated?: boolean;
  /** Demo rows are never pushed to the cloud. */
  isDemo?: boolean;
}

export interface SessionSummary {
  durationMs: number;
  lapCount: number;
  fastestLapMs: number | null;
  averageLapMs: number | null;
  consistencySdMs: number | null;
  previousPbMs: number | null;
  isPb: boolean;
  distanceM: number | null;
  topSpeedKph: number | null;
  elevationGainM: number | null;
}

/** Raw passing / gate event exactly as received. Laps are derived from these. */
export interface TimingEvent {
  id: Uuid;
  sessionId: Uuid;
  riderId: Uuid;
  transponderId: Uuid | null;
  /** Tag code as reported by the hardware, kept for audit even if the tag is reassigned later. */
  tagCode: string | null;
  podId: string;
  role: PodRole;
  source: TimingSource;
  at: EpochMs;
  signalStrength: number | null;
}

export interface Lap {
  id: Uuid;
  sessionId: Uuid;
  riderId: Uuid;
  lapNumber: number;
  startedAt: EpochMs;
  durationMs: number;
  splitsMs: number[];
  source: TimingSource;
  /** False for laps flagged as outliers (crash, stop, missed crossing). */
  valid: boolean;
}

export interface GpsPoint {
  t: EpochMs;
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps: number | null;
  heading: number | null;
  altitudeM: number | null;
}

export interface Achievement {
  key: string;
  title: string;
  description: string;
  achievedAt: EpochMs | null;
  sessionId: Uuid | null;
}

/** Cached ranking row. Other riders' bests arrive this way rather than as full sessions. */
export interface LeaderboardEntry {
  id: Uuid;
  routeId: Uuid;
  routeConfigVersion: number;
  riderId: Uuid;
  riderName: string;
  raceNumber: string;
  riderClass: string;
  bikeLabel: string;
  condition: TrackCondition;
  source: TimingSource;
  lapMs: number;
  setAt: EpochMs;
  sessionId: Uuid | null;
}

export const RIDE_TYPE_LABEL: Record<RideType, string> = {
  mx_circuit: "MX Circuit",
  enduro_loop: "Enduro Loop",
  point_to_point: "Point-to-Point Stage",
  sprint: "Sprint",
  free_ride: "Free Ride / GPS Only",
};

export const CONDITION_LABEL: Record<TrackCondition, string> = {
  dry: "Dry",
  damp: "Damp",
  wet: "Wet",
  muddy: "Muddy",
  mixed: "Mixed",
};

export const TIMING_MODE_LABEL: Record<TimingMode, string> = {
  gps: "GPS only",
  lap: "One pod: start/finish",
  start_finish: "Two pods: start + finish",
  sectors: "Multiple pods: sectors",
};

export const isLoopType = (t: RideType) => t === "mx_circuit" || t === "enduro_loop";
