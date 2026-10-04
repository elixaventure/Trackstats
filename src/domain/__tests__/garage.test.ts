import { describe, expect, it } from "vitest";
import { generateDemo } from "@/data/seed/generate";
import { bikeStats, compareBikes, lapCounter, routesWithSeveralBikes } from "../garage";
import type { Bike, Route, Session } from "../types";

const { state } = generateDemo("u", Date.UTC(2026, 9, 4));
const joel = Object.values(state.riders).find((r) => r.name === "Joel Gaffey")!;
const bikes = Object.values(state.bikes).filter((b) => b.riderId === joel.id);
const sessions = Object.values(state.sessions).filter((s) => s.riderId === joel.id);
const bacup = Object.values(state.routes).find((r) => r.name.startsWith("Bacup"))!;

describe("garage (demo data)", () => {
  it("has Joel's two bikes with ride counts, laps and hours", () => {
    expect(joel.raceNumber).toBe("777");
    expect(bikes.map((b) => `${b.year} ${b.manufacturer} ${b.model}`).sort()).toEqual(["2021 Husqvarna TC 125", "2021 Yamaha YZ250F"]);
    const stats = bikeStats(bikes, sessions, lapCounter(Object.values(state.laps)), state.routes);
    expect(stats.reduce((a, s) => a + s.sessions, 0)).toBe(sessions.length);
    for (const s of stats) {
      expect(s.sessions).toBeGreaterThan(0);
      expect(s.laps).toBeGreaterThan(0);
      expect(s.ridingMs).toBeGreaterThan(0);
      expect(s.bests.some((b) => b.route.id === bacup.id)).toBe(true);
    }
  });

  it("finds the routes ridden on more than one bike", () => {
    expect(routesWithSeveralBikes(Object.values(state.routes), sessions).map((r) => r.id)).toContain(bacup.id);
  });

  it("says which bike is faster at Bacup in the dry", () => {
    const c = compareBikes(bacup, sessions, bikes, { dryOnly: true });
    expect(c.enoughData).toBe(true);
    expect(c.sameEra).toBe(true);
    expect(c.rows[0]!.bike.model).toBe("YZ250F");
    expect(c.rows[0]!.gapMs).toBe(0);
    expect(c.rows[1]!.gapMs!).toBeGreaterThan(0);
    // Same number of rides used for each bike.
    expect(c.rows[0]!.usedSessions).toBe(c.rows[1]!.usedSessions);
  });
});

describe("compareBikes fairness", () => {
  const route = { id: "r", configVersion: 1 } as Route;
  const bike = (id: string) => ({ id, manufacturer: "X", model: id }) as Bike;
  const ride = (bikeId: string, daysAgo: number, ms: number, condition: Session["condition"] = "dry") => ({
    id: `${bikeId}${daysAgo}`, bikeId, routeId: "r", routeConfigVersion: 1, status: "completed", condition,
    startedAt: Date.UTC(2026, 9, 4) - daysAgo * 86400000, summary: { fastestLapMs: ms },
  }) as Session;

  it("flags bikes ridden months apart (rider progress, not the bike, may explain the gap)", () => {
    const c = compareBikes(route, [ride("old", 200, 130000), ride("old", 190, 131000), ride("new", 10, 127000), ride("new", 5, 126000)], [bike("old"), bike("new")], { dryOnly: true });
    expect(c.sameEra).toBe(false);
    expect(c.rows[0]!.bike.id).toBe("new");
  });

  it("ignores wet rides when comparing dry pace, and other layouts entirely", () => {
    const wetSlow = ride("a", 3, 150000, "wet");
    const otherLayout = { ...ride("a", 2, 100000), routeConfigVersion: 2 };
    const c = compareBikes(route, [ride("a", 4, 130000), wetSlow, otherLayout, ride("b", 4, 131000)], [bike("a"), bike("b")], { dryOnly: true });
    expect(c.rows.find((r) => r.bike.id === "a")!.recentAvgMs).toBe(130000);
    expect(c.enoughData).toBe(false); // only one dry ride each
  });
});
