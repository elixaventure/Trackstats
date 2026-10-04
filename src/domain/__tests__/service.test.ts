import { describe, expect, it } from "vitest";
import { generateDemo } from "@/data/seed/generate";
import { bikeHours, defaultSchedule, dueText, isBackfilled, scheduleStatus, taskStatus } from "../service";
import type { Bike, ServiceRecord, ServiceTask, Session } from "../types";

const NOW = Date.UTC(2026, 9, 4);
const DAY = 86400000;
const { state } = generateDemo("u", NOW);
const bikes = Object.values(state.bikes);
const yz = bikes.find((b) => b.model === "YZ250F")!;
const tc = bikes.find((b) => b.model === "TC 125")!;
const sessions = Object.values(state.sessions);
const records = Object.values(state.serviceRecords);
const tasks = Object.values(state.serviceTasks);

describe("default schedules", () => {
  it("gives two-strokes gearbox oil and a top end, four-strokes engine oil and valves", () => {
    expect(defaultSchedule({ capacity: "125cc 2T" }).map((t) => t.name)).toEqual(expect.arrayContaining(["Gearbox oil", "Top end (piston & rings)"]));
    expect(defaultSchedule({ capacity: "250cc 4T" }).map((t) => t.name)).toEqual(expect.arrayContaining(["Engine oil & filter", "Valve clearance check"]));
    expect(defaultSchedule({ capacity: "250cc 4T" }).map((t) => t.name)).not.toContain("Gearbox oil");
  });
});

describe("engine hours", () => {
  it("uses the hour meter reading plus riding recorded since, over the app's own total", () => {
    const h = bikeHours(yz, sessions, records);
    expect(h.meter?.hours).toBe(92);
    expect(h.total).toBeGreaterThan(92);
    expect(h.total).toBeLessThan(92 + h.recorded + 0.1);
  });

  it("counts a new bike from zero", () => {
    const h = bikeHours(tc, sessions, records);
    expect(h.meter).toBeNull();
    expect(h.total).toBe(h.recorded);
    expect(h.total).toBeGreaterThan(0);
  });

  it("adds hours already on the bike when there's no meter reading", () => {
    const bike = { id: "b", startHours: 40 } as Bike;
    const s = [{ bikeId: "b", status: "completed", startedAt: 0, summary: { durationMs: 1.5 * 3600000 } }] as Session[];
    expect(bikeHours(bike, s, []).total).toBe(41.5);
  });
});

describe("what's due", () => {
  it("shows the YZ250F oil change due, with the valve check logged at the top end", () => {
    const hours = bikeHours(yz, sessions, records).total;
    const status = scheduleStatus(tasks.filter((t) => t.bikeId === yz.id), records, hours, NOW);
    expect(status[0]!.task.name).toBe("Engine oil & filter");
    expect(status[0]!.state).toBe("due");
    expect(dueText(status[0]!)).toMatch(/h overdue/);
    expect(status.find((s) => s.task.name.startsWith("Valve"))!.state).not.toBe("never"); // logged with the top end
    expect(status.find((s) => s.task.name.startsWith("Coolant"))!.state).toBe("ok");
  });

  it("goes due on whichever comes first, hours or months", () => {
    const task = { id: "t", bikeId: "b", name: "Suspension", intervalHours: 50, intervalDays: 365, sortOrder: 0 } as ServiceTask;
    const done = (daysAgo: number, hours: number) => [{ bikeId: "b", kind: "service", taskIds: ["t"], performedAt: NOW - daysAgo * DAY, hours } as ServiceRecord];
    expect(taskStatus(task, done(30, 10), 25, NOW).state).toBe("ok");
    expect(taskStatus(task, done(30, 10), 52, NOW).state).toBe("soon"); // 42/50 h
    expect(taskStatus(task, done(400, 10), 12, NOW).state).toBe("due"); // over a year
    expect(taskStatus(task, [], 12, NOW).state).toBe("never");
  });
});

describe("service history honesty", () => {
  it("flags work typed in long after it was done", () => {
    const flagged = records.filter(isBackfilled).map((r) => r.doneBy).sort();
    expect(flagged).toEqual(["Bacup Suspension", "MX Engines Ltd", "Previous owner"]);
  });
});
