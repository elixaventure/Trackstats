import type {
  Bike, Group, GroupMember, Lap, LeaderboardEntry, TrackChange, ServiceTask, ServiceRecord, RiderProfile, Route, Session, TimingEvent, Transponder,
  TransponderAssignment, User,
} from "@/domain/types";

export interface Settings {
  /** Drive GPS from the selected route instead of the phone (developer option). */
  simulateGps: boolean;
  simSpeed: number;
  /** Local demo data; never synced. */
  demoMode: boolean;
  /** Which version of the demo data this device holds (bumped when the sample data changes). */
  demoVersion?: number;
}

/** Everything except GPS traces, which live in their own IndexedDB keys per session. */
export interface DbState {
  schemaVersion: number;
  user: User;
  activeRiderId: string;
  riders: Record<string, RiderProfile>;
  bikes: Record<string, Bike>;
  groups: Record<string, Group>;
  groupMembers: Record<string, GroupMember>;
  transponders: Record<string, Transponder>;
  assignments: Record<string, TransponderAssignment>;
  routes: Record<string, Route>;
  sessions: Record<string, Session>;
  laps: Record<string, Lap>;
  timingEvents: Record<string, TimingEvent>;
  /** Cached rankings from other riders (server-computed when online). */
  leaderboard: Record<string, LeaderboardEntry>;
  trackChanges: Record<string, TrackChange>;
  serviceTasks: Record<string, ServiceTask>;
  serviceRecords: Record<string, ServiceRecord>;
  settings: Settings;
}

export type EntityTable = Exclude<keyof DbState, "schemaVersion" | "user" | "activeRiderId" | "settings">;

export const SCHEMA_VERSION = 1;
