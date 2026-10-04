import { describe, expect, it } from "vitest";
import { generateDemo } from "@/data/seed/generate";
import { changesFor, headsUp, isCurrent, isOfficial, timeBreaks } from "../trackChanges";
import type { TrackChange } from "../types";

const NOW = Date.UTC(2026, 9, 4);
const DAY = 86400000;
const { state } = generateDemo("u", NOW);
const all = Object.values(state.trackChanges);
const bacup = Object.values(state.routes).find((r) => r.name.startsWith("Bacup"))!;
const woodland = Object.values(state.routes).find((r) => r.name.startsWith("Woodland"))!;

describe("track change reports", () => {
  it("lists a track's reports newest first", () => {
    const list = changesFor(bacup.id, all);
    expect(list.map((c) => c.title)).toEqual(["Top jump rebuilt as a step-up", "Standing water in the Quarry hairpin", "Rollers regraded"]);
  });

  it("warns about what changed since your last ride, plus open hazards, but not cleared ones", () => {
    const sinceLastWeek = headsUp(bacup.id, all, NOW - 7 * DAY, NOW).map((c) => c.title);
    expect(sinceLastWeek).toEqual(["Top jump rebuilt as a step-up"]); // water was cleared; rollers is older
    expect(headsUp(woodland.id, all, NOW - 2 * DAY, NOW).map((c) => c.kind)).toEqual(["hazard"]);
    // An open hazard is shown even if it was reported before your last ride.
    expect(headsUp(woodland.id, all, NOW, NOW)).toHaveLength(1);
  });

  it("keeps hazards current until cleared, other notes for 30 days", () => {
    const base = { severity: "info", kind: "jump", resolvedAt: null } as TrackChange;
    expect(isCurrent({ ...base, createdAt: NOW - 29 * DAY }, NOW)).toBe(true);
    expect(isCurrent({ ...base, createdAt: NOW - 31 * DAY }, NOW)).toBe(false);
    expect(isCurrent({ ...base, severity: "hazard", createdAt: NOW - 90 * DAY }, NOW)).toBe(true);
    expect(isCurrent({ ...base, severity: "hazard", createdAt: NOW - 9 * DAY, resolvedAt: NOW - 1 }, NOW)).toBe(false);
  });

  it("marks the track owner's reports as official and finds lap-time breaks", () => {
    const jump = all.find((c) => c.kind === "jump")!;
    expect(isOfficial(jump, bacup)).toBe(true);
    expect(isOfficial(all.find((c) => c.reportedByName === "Jake Hollis")!, bacup)).toBe(false);
    expect(timeBreaks(bacup.id, all).map((c) => c.id)).toEqual([jump.id]);
  });
});
