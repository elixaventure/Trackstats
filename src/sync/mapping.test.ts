import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateDemo } from "@/data/seed/generate";
import type { EntityTable } from "@/data/db";
import { gpsRows, routeChildRows, TABLES, toRow } from "./mapping";

// Guards the contract between the TypeScript model and the SQL schema: every
// field the sync layer sends must exist as a column.
const sql = readFileSync(new URL("../../supabase/migrations/0001_schema.sql", import.meta.url), "utf8");

function columns(table: string): Set<string> {
  const m = sql.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!m) throw new Error(`no table ${table}`);
  return new Set(m[1]!.split("\n").map((l) => l.trim().split(/\s+/)[0]!).filter((c) => /^[a-z_]+$/.test(c) && !["primary", "unique", "check", "foreign"].includes(c)));
}

describe("sync mapping matches the SQL schema", () => {
  const { state, gps } = generateDemo("user-1", Date.UTC(2026, 9, 4));
  const pushed: EntityTable[] = ["riders", "bikes", "groups", "groupMembers", "transponders", "assignments", "routes", "sessions", "timingEvents", "laps"];
  for (const table of pushed) {
    it(`${table} → ${TABLES[table]}`, () => {
      const row = Object.values(state[table] as Record<string, object>)[0]!;
      const cols = columns(TABLES[table]);
      for (const key of Object.keys(toRow(row))) expect(cols, `${TABLES[table]}.${key}`).toContain(key);
    });
  }
  it("route children and gps points", () => {
    const route = Object.values(state.routes)[0]!;
    const { points, sectors } = routeChildRows(route);
    for (const k of Object.keys(points[0]!)) expect(columns("route_points")).toContain(k);
    for (const k of Object.keys(sectors[0]!)) expect(columns("route_sectors")).toContain(k);
    const sid = Object.keys(gps)[0]!;
    for (const k of Object.keys(gpsRows(sid, gps[sid]!)[0]!)) expect(columns("gps_points")).toContain(k);
  });
});
