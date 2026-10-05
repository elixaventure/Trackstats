import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

// Row Level Security, run on real Postgres. The app saves with upserts
// (INSERT ... ON CONFLICT DO UPDATE), which also check SELECT policies against the
// new row; plain inserts would hide that, so these tests use upserts throughout.
const migrations = ["0001_schema.sql", "0002_rls.sql", "0003_promo_codes.sql"].map((f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), "utf8"));
const A = "00000000-0000-4000-a000-00000000000a";
const B = "00000000-0000-4000-a000-00000000000b";
const C = "00000000-0000-4000-a000-00000000000c";
const riderA = "10000000-0000-4000-a000-000000000001";
const bikeA = "40000000-0000-4000-a000-000000000001";
let db: PGlite;

async function as(uid: string | null, sql: string): Promise<{ rows: unknown[]; error?: string }> {
  try {
    const out = await db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
      await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
      return tx.query(sql);
    });
    return { rows: out.rows };
  } catch (e) {
    return { rows: [], error: (e as Error).message };
  }
}
const upsertRider = (uid: string, id: string, owner: string, name: string) =>
  as(uid, `insert into rider_profiles (id, owner_user_id, name, visibility) values ('${id}', '${owner}', '${name}', 'private')
           on conflict (id) do update set name = excluded.name`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon; create role authenticated; grant usage on schema public, auth to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;`);
  for (const m of migrations) await db.exec(m);
  await db.exec(`insert into auth.users values ('${A}'), ('${B}'), ('${C}')`);
}, 30000);

describe("row level security (upserts, as the app sends them)", () => {
  it("lets a new user save and re-save their own profile", async () => {
    expect((await upsertRider(A, riderA, A, "Joel")).error).toBeUndefined();
    expect((await upsertRider(A, riderA, A, "Joel Gaffey")).error).toBeUndefined();
    expect((await as(A, "select name from rider_profiles")).rows).toEqual([{ name: "Joel Gaffey" }]);
  });

  it("keeps a private profile from other users and the public", async () => {
    expect((await as(B, "select * from rider_profiles")).rows).toHaveLength(0);
    expect((await as(null, "select * from rider_profiles")).rows).toHaveLength(0);
    expect((await upsertRider(B, riderA, A, "hacked")).error).toMatch(/row-level security/);
    expect((await as(A, "select name from rider_profiles")).rows).toEqual([{ name: "Joel Gaffey" }]);
  });

  it("saves bikes, parts and service history for the owner only", async () => {
    const bike = `insert into bikes (id, rider_id, manufacturer, model, parts) values ('${bikeA}', '${riderA}', 'Yamaha', 'YZ250F', '{"chain":{"brand":"DID","product":"520"}}')
                  on conflict (id) do update set parts = excluded.parts`;
    expect((await as(A, bike)).error).toBeUndefined();
    expect((await as(A, bike)).error).toBeUndefined();
    const rec = (uid: string) => as(uid, `insert into service_records (id, bike_id, kind, performed_at, hours) values (gen_random_uuid(), '${bikeA}', 'service', now(), 92)`);
    expect((await rec(A)).error).toBeUndefined();
    expect((await rec(B)).error).toMatch(/row-level security/);
    expect((await as(B, "select * from service_records")).rows).toHaveLength(0);
  });

  it("lets a user create a group and a transponder with upserts", async () => {
    const g = "50000000-0000-4000-a000-000000000001";
    const sql = `insert into groups (id, name, kind, created_by_user_id) values ('${g}', 'Bacup crew', 'friends', '${A}') on conflict (id) do update set name = excluded.name`;
    expect((await as(A, sql)).error).toBeUndefined();
    const tag = `insert into transponders (id, code, nickname, ownership, owner_rider_id) values (gen_random_uuid(), 'TAG-1', 'Tag', 'personal', '${riderA}') on conflict (id) do nothing`;
    expect((await as(A, tag)).error).toBeUndefined();
  });
});

describe("promo codes", () => {
  const redeem = (uid: string | null, code: string) => as(uid, `select * from redeem_promo('${code}')`);
  beforeAll(async () => {
    await db.exec(`insert into promo_codes (code, campaign, pro_months) values
      ('BACUP-AAAA-1111', 'bacup-launch', 12), ('BACUP-BBBB-2222', 'bacup-launch', 12), ('BACUP-CCCC-3333', 'bacup-launch', 12)`);
  });

  it("gives a rider 12 months of Pro, once", async () => {
    const r = await redeem(A, " bacup-aaaa-1111 "); // case and spaces don't matter
    expect(r.error).toBeUndefined();
    const until = new Date((r.rows[0] as { pro_until: string }).pro_until).getTime();
    expect(until).toBeGreaterThan(Date.now() + 360 * 86400000);
    expect((await as(A, "select plan, source from subscriptions")).rows).toEqual([{ plan: "pro", source: "promo:bacup-launch" }]);
    expect((await redeem(A, "BACUP-AAAA-1111")).error).toMatch(/already claimed this code/);
  });

  it("can't be used by anyone else once it's gone", async () => {
    expect((await redeem(B, "BACUP-AAAA-1111")).error).toMatch(/already been used/);
    expect((await redeem(B, "BACUP-NOPE-0000")).error).toMatch(/isn't valid/);
  });

  it("allows one code per rider per offer", async () => {
    expect((await redeem(A, "BACUP-BBBB-2222")).error).toMatch(/already claimed a code from this offer/);
    // ...and that failed attempt didn't use the code up.
    expect((await redeem(B, "BACUP-BBBB-2222")).error).toBeUndefined();
  });

  it("keeps unused codes secret and blocks anonymous or direct changes", async () => {
    expect((await as(C, "select code from promo_codes")).rows).toHaveLength(0);
    expect((await as(A, "select code from promo_codes")).rows).toEqual([{ code: "BACUP-AAAA-1111" }]);
    expect((await as(C, "update promo_codes set redeemed_by = null")).error ?? "no rows changed").toBeTruthy();
    expect((await as(A, "select redeemed_by from promo_codes where code = 'BACUP-AAAA-1111'")).rows).toEqual([{ redeemed_by: A }]);
    expect((await redeem(null, "BACUP-CCCC-3333")).error).toMatch(/permission denied|Sign in/);
    expect((await as(C, "insert into subscriptions (user_id, plan) values ('" + C + "', 'pro')")).error).toMatch(/row-level security/);
  });

  it("reports how many are left without revealing them", async () => {
    expect((await as(null, "select promo_remaining('bacup-launch') n")).rows).toEqual([{ n: 1 }]);
  });
});
