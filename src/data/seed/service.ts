import { defaultSchedule } from "@/domain/service";
import type { Bike, ServiceRecord, ServiceTask, Session } from "@/domain/types";
import { stableUuid } from "@/lib/id";

const DAY = 86400000;
const HOUR = 3600000;

/**
 * Joel's service history. The 2021 YZ250F was bought used with an hour meter, its
 * older work was typed in later (shown as "added later"), and its oil change is
 * due now. The brand-new TC 125 has had its running-in gearbox oil change.
 */
export function demoService(bikes: { yz250f: Bike; tc125: Bike }, sessions: Session[], now: number) {
  const tasks: ServiceTask[] = [];
  const records: ServiceRecord[] = [];
  const scheduleFor = (bike: Bike) => {
    const list = defaultSchedule(bike).map((t) => ({ ...t, id: stableUuid(`task:${bike.id}:${t.name}`), bikeId: bike.id }));
    tasks.push(...list);
    return (name: string) => list.find((t) => t.name.startsWith(name))!.id;
  };
  const ridden = (bike: Bike, from: number, to: number) =>
    sessions.filter((s) => s.bikeId === bike.id && s.startedAt >= from && s.startedAt < to).reduce((a, s) => a + (s.summary?.durationMs ?? 0), 0) / HOUR;
  const rec = (key: string, r: Omit<ServiceRecord, "id" | "createdAt">, loggedLater = false) =>
    records.push({ ...r, id: stableUuid(`svc:${key}`), hours: Math.round(r.hours * 10) / 10, createdAt: loggedLater ? now - 50 * DAY : r.performedAt + 2 * HOUR });

  // YZ250F: hour meter read 92.0 h when Joel started using the app.
  const yz = bikes.yz250f;
  const yzTask = scheduleFor(yz);
  const meterAt = now - 52 * DAY;
  const yzHoursAt = (t: number) => 92 + ridden(yz, meterAt, t);
  rec("yz-meter", { bikeId: yz.id, kind: "reading", performedAt: meterAt, hours: 92, taskIds: [], notes: "Hour meter reading when bought.", costPence: null, doneBy: "Me" });
  rec("yz-topend", { bikeId: yz.id, kind: "service", performedAt: now - 210 * DAY, hours: 71.5, taskIds: [yzTask("Piston"), yzTask("Valve")], notes: "New Wiseco piston and rings, valves shimmed. Receipt from previous owner.", costPence: 38500, doneBy: "MX Engines Ltd" }, true);
  rec("yz-susp", { bikeId: yz.id, kind: "service", performedAt: now - 200 * DAY, hours: 73, taskIds: [yzTask("Suspension")], notes: "Forks and shock serviced, re-valved for 75 kg rider.", costPence: 26000, doneBy: "Bacup Suspension" }, true);
  rec("yz-oil", { bikeId: yz.id, kind: "service", performedAt: now - 120 * DAY, hours: 87.8, taskIds: [yzTask("Engine oil")], notes: "Oil and filter. Previous owner's receipt.", costPence: null, doneBy: "Previous owner" }, true);
  rec("yz-coolant", { bikeId: yz.id, kind: "service", performedAt: now - 53 * DAY, hours: 92, taskIds: [yzTask("Coolant")], notes: "Fresh coolant after buying.", costPence: 1800, doneBy: "Me" });
  const chainAt = now - 30 * DAY;
  rec("yz-chain", { bikeId: yz.id, kind: "service", performedAt: chainAt, hours: yzHoursAt(chainAt), taskIds: [yzTask("Chain"), yzTask("Brake")], notes: "Chain adjusted and lubed, pads at 50%.", costPence: null, doneBy: "Me" });
  const filterAt = now - 8 * DAY;
  rec("yz-filter", { bikeId: yz.id, kind: "service", performedAt: filterAt, hours: yzHoursAt(filterAt), taskIds: [yzTask("Air filter")], notes: "", costPence: null, doneBy: "Me" });

  // TC 125: brand new, 0 h.
  const tc = bikes.tc125;
  const tcTask = scheduleFor(tc);
  const tcHoursAt = (t: number) => ridden(tc, 0, t);
  const runIn = now - 40 * DAY;
  rec("tc-runin", { bikeId: tc.id, kind: "service", performedAt: runIn, hours: Math.max(1, tcHoursAt(runIn)), taskIds: [tcTask("Gearbox oil")], notes: "Running-in gearbox oil change.", costPence: 1500, doneBy: "Me" });
  const tcFilter = now - 9 * DAY;
  rec("tc-filter", { bikeId: tc.id, kind: "service", performedAt: tcFilter, hours: tcHoursAt(tcFilter), taskIds: [tcTask("Air filter"), tcTask("Chain")], notes: "", costPence: null, doneBy: "Me" });

  return { tasks, records };
}
