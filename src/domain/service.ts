import type { Bike, ServiceRecord, ServiceTask, Session } from "./types";

const HOUR = 3600000;
const DAY = 86400000;
/** Entries logged more than this long after the work are shown as "added later". */
export const BACKFILL_MS = 7 * DAY;

type TaskTemplate = Omit<ServiceTask, "id" | "bikeId">;

/**
 * Starting schedule for a new bike. Typical intervals for motocross bikes ridden
 * hard; every bike and rider differs, so they're editable and the UI says to
 * check the owner's manual.
 */
export function defaultSchedule(bike: Pick<Bike, "capacity">): TaskTemplate[] {
  const twoStroke = /\b2\s*-?\s*t|2-?stroke/i.test(bike.capacity);
  const common: [string, number | null, number | null][] = [
    ["Air filter clean & oil", 3, null],
    ["Chain & sprockets check / adjust", 10, null],
    ["Brake pads & fluid check", 15, null],
    ["Suspension service (forks & shock)", 50, 365],
    ["Coolant", null, 365],
  ];
  const engine: [string, number | null, number | null][] = twoStroke
    ? [["Gearbox oil", 10, null], ["Spark plug", 20, null], ["Top end (piston & rings)", 40, null]]
    : [["Engine oil & filter", 10, null], ["Valve clearance check", 30, null], ["Piston & rings", 100, null]];
  return [...engine, ...common].map(([name, intervalHours, intervalDays], i) => ({ name, intervalHours, intervalDays, sortOrder: i }));
}

export interface BikeHours {
  total: number;
  /** Hours recorded by the app (session time on this bike, pit time included). */
  recorded: number;
  /** Most recent hour-meter reading used as the baseline, if any. */
  meter: ServiceRecord | null;
}

/**
 * Engine hours now: the latest hour-meter reading (or the hours the bike had when
 * added) plus recorded riding time since. A meter reading always wins, because
 * rides the app didn't record would otherwise be missing.
 */
export function bikeHours(bike: Bike, sessions: Session[], records: ServiceRecord[]): BikeHours {
  const mine = sessions.filter((s) => s.bikeId === bike.id && s.status === "completed");
  const rideHours = (since: number) => mine.filter((s) => s.startedAt >= since).reduce((a, s) => a + (s.summary?.durationMs ?? 0), 0) / HOUR;
  const meter = records.filter((r) => r.bikeId === bike.id && r.kind === "reading").sort((a, b) => b.performedAt - a.performedAt)[0] ?? null;
  const recorded = rideHours(0);
  const total = meter ? meter.hours + rideHours(meter.performedAt) : (bike.startHours ?? 0) + recorded;
  return { total: Math.round(total * 10) / 10, recorded: Math.round(recorded * 10) / 10, meter };
}

export type DueState = "ok" | "soon" | "due" | "never";

export interface TaskStatus {
  task: ServiceTask;
  lastDone: ServiceRecord | null;
  hoursSince: number | null;
  daysSince: number | null;
  /** 0 = just done, 1 = due now (the larger of the hours and the calendar fraction). */
  fraction: number | null;
  state: DueState;
}

export function taskStatus(task: ServiceTask, records: ServiceRecord[], hoursNow: number, now = Date.now()): TaskStatus {
  const lastDone = records
    .filter((r) => r.bikeId === task.bikeId && r.kind === "service" && r.taskIds.includes(task.id))
    .sort((a, b) => b.performedAt - a.performedAt)[0] ?? null;
  if (!lastDone) return { task, lastDone: null, hoursSince: null, daysSince: null, fraction: null, state: "never" };
  const hoursSince = Math.max(0, Math.round((hoursNow - lastDone.hours) * 10) / 10);
  const daysSince = Math.floor((now - lastDone.performedAt) / DAY);
  const fractions = [
    task.intervalHours ? hoursSince / task.intervalHours : 0,
    task.intervalDays ? daysSince / task.intervalDays : 0,
  ];
  const fraction = Math.max(...fractions);
  return { task, lastDone, hoursSince, daysSince, fraction, state: fraction >= 1 ? "due" : fraction >= 0.8 ? "soon" : "ok" };
}

/** All of a bike's tasks, most urgent first. */
export function scheduleStatus(tasks: ServiceTask[], records: ServiceRecord[], hoursNow: number, now = Date.now()): TaskStatus[] {
  const rank: Record<DueState, number> = { due: 0, soon: 1, never: 2, ok: 3 };
  return tasks
    .map((t) => taskStatus(t, records, hoursNow, now))
    .sort((a, b) => rank[a.state] - rank[b.state] || (b.fraction ?? 0) - (a.fraction ?? 0) || a.task.sortOrder - b.task.sortOrder);
}

export const isBackfilled = (r: ServiceRecord) => r.createdAt - r.performedAt > BACKFILL_MS;

/** "In 2.4 h" / "1.6 h overdue" / "in 3 months". */
export function dueText(s: TaskStatus): string {
  if (s.state === "never") return "No record yet";
  const parts: string[] = [];
  if (s.task.intervalHours && s.hoursSince != null) {
    const left = Math.round((s.task.intervalHours - s.hoursSince) * 10) / 10;
    parts.push(left >= 0 ? `due in ${left} h` : `${-left} h overdue`);
  }
  if (s.task.intervalDays && s.daysSince != null) {
    const left = s.task.intervalDays - s.daysSince;
    parts.push(left >= 0 ? `due in ${left >= 60 ? `${Math.round(left / 30)} months` : `${left} days`}` : `${-left} days overdue`);
  }
  return parts.join(" or ");
}
