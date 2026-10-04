import type { RiderProfile, Route, TrackChange } from "@/domain/types";
import { stableUuid } from "@/lib/id";

const DAY = 86400000;

/** Sample track reports: one from the track itself (the route owner), the rest from riders. */
export function demoTrackChanges(routes: { bacup: Route; woodland: Route }, trackUserId: string, friends: RiderProfile[], now: number): TrackChange[] {
  const sector = (r: Route, name: string) => r.sectors.find((s) => s.name === name)?.id ?? null;
  const by = (name: string) => friends.find((f) => f.name.startsWith(name))!;
  const make = (key: string, c: Omit<TrackChange, "id">): TrackChange => ({ id: stableUuid(`change:${key}`), ...c });
  return [
    make("bacup-top-jump", {
      routeId: routes.bacup.id, kind: "jump", title: "Top jump rebuilt as a step-up",
      details: "Longer run-up and a steeper face. Roll it on your first lap and build up.",
      sectorId: sector(routes.bacup, "Top jump"), severity: "caution", affectsTimes: true,
      reportedByUserId: trackUserId, reportedByName: "Bacup MX", createdAt: now - 3 * DAY, resolvedAt: null,
    }),
    make("bacup-rollers", {
      routeId: routes.bacup.id, kind: "surface", title: "Rollers regraded",
      details: "Smooth first thing; ruts get deep by mid-afternoon.",
      sectorId: sector(routes.bacup, "Rollers"), severity: "info", affectsTimes: false,
      reportedByUserId: by("Jake").ownerUserId, reportedByName: "Jake Hollis", createdAt: now - 20 * DAY, resolvedAt: null,
    }),
    make("bacup-water", {
      routeId: routes.bacup.id, kind: "hazard", title: "Standing water in the Quarry hairpin",
      details: "Deep on the inside line.",
      sectorId: sector(routes.bacup, "Quarry hairpin"), severity: "hazard", affectsTimes: false,
      reportedByUserId: by("Sam").ownerUserId, reportedByName: "Sam Pearce", createdAt: now - 10 * DAY, resolvedAt: now - 8 * DAY,
    }),
    make("woodland-tree", {
      routeId: routes.woodland.id, kind: "hazard", title: "Fallen tree on the Rooty descent",
      details: "Blocks the right-hand line about halfway down. Use the left.",
      sectorId: sector(routes.woodland, "Rooty descent"), severity: "hazard", affectsTimes: false,
      reportedByUserId: by("Dan").ownerUserId, reportedByName: "Dan Kerr", createdAt: now - 1 * DAY, resolvedAt: null,
    }),
  ];
}
