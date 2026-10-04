/** 128420 → "2:08.42" ; 58420 → "58.42" */
export function formatLap(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const neg = ms < 0;
  const total = Math.round(Math.abs(ms) / 10);
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000);
  const body = m > 0 ? `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}` : `${s}.${String(cs).padStart(2, "0")}`;
  return neg ? `-${body}` : body;
}

/** Signed delta in seconds: -3.7 → "−3.70", 1.2 → "+1.20". Negative is faster. */
export function formatDelta(ms: number | null | undefined, digits = 2): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const s = Math.abs(ms) / 1000;
  const sign = ms < 0 ? "−" : ms > 0 ? "+" : "±";
  return `${sign}${s.toFixed(digits)}`;
}

/** Running clock: 754000 → "12:34", 3754000 → "1:02:34" */
export function formatClock(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const dateFmtYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export function formatDate(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  return d.getFullYear() === new Date(now).getFullYear() ? dateFmt.format(d) : dateFmtYear.format(d);
}

export function formatDateTime(ms: number): string {
  return `${formatDate(ms)}, ${timeFmt.format(new Date(ms))}`;
}

export function formatRelativeDays(ms: number, now = Date.now()): string {
  const days = Math.floor((startOfDay(now) - startOfDay(ms)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(ms, now);
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "6 weeks", "12 days" */
export function formatSpan(ms: number): string {
  const days = Math.round(ms / 86400000);
  if (days >= 14) return `${Math.round(days / 7)} weeks`;
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function formatDistance(m: number | null | undefined): string {
  if (m == null) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}
