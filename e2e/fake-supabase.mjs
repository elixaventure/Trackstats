// A local stand-in for a Supabase project, for end-to-end tests.
//
// Real Postgres (PGlite) running the app's migrations with Row Level Security
// enforced exactly as on Supabase, behind a small subset of the PostgREST and
// GoTrue (auth) HTTP APIs: the parts supabase-js uses in this app. Email
// confirmation is on by default, like a new Supabase project.
//
//   node e2e/fake-supabase.mjs [--port 54321] [--autoconfirm]
//
// Test helpers (not part of Supabase):
//   POST /__test/confirm {email}   confirm a sign-up, like clicking the email link
//   POST /__test/sql {sql}         run SQL as the database owner, returns rows
import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const args = process.argv.slice(2);
const PORT = Number(args[args.indexOf("--port") + 1]) || 54321;
const AUTOCONFIRM = args.includes("--autoconfirm");
const MIGRATIONS = new URL("../supabase/migrations/", import.meta.url);

const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text unique);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`);
for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(fs.readFileSync(new URL(f, MIGRATIONS), "utf8"));
}

// Table/view columns and primary keys, for validating requests like PostgREST's schema cache.
const columns = new Map();
for (const r of (await db.query(`select table_name, column_name from information_schema.columns where table_schema = 'public'`)).rows) {
  if (!columns.has(r.table_name)) columns.set(r.table_name, new Set());
  columns.get(r.table_name).add(r.column_name);
}
const primaryKeys = new Map();
for (const r of (await db.query(`
  select tc.table_name, string_agg(kcu.column_name, ',' order by kcu.ordinal_position) cols
  from information_schema.table_constraints tc join information_schema.key_column_usage kcu using (constraint_schema, constraint_name)
  where tc.table_schema = 'public' and tc.constraint_type = 'PRIMARY KEY' group by tc.table_name`)).rows) primaryKeys.set(r.table_name, r.cols.split(","));

// ---- Auth (GoTrue subset) ---------------------------------------------------
const users = new Map(); // email -> { id, email, password, confirmedAt, createdAt }
const refreshTokens = new Map(); // token -> email
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600, session_id: crypto.randomUUID() })}.test`;
  const refresh_token = crypto.randomBytes(16).toString("hex");
  refreshTokens.set(refresh_token, u.email);
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token, user: publicUser(u) };
}
const publicUser = (u) => ({
  id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: u.confirmedAt, confirmed_at: u.confirmedAt,
  created_at: u.createdAt, updated_at: u.createdAt, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [],
});
const authError = (status, error_code, msg) => ({ status, body: { code: status, error_code, msg } });

function uidFrom(req) {
  const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  try {
    const p = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
    if (p.sub && p.exp > Date.now() / 1000) return p.sub;
  } catch { /* the anon key, or garbage: treated as anonymous */ }
  return null;
}

async function handleAuth(req, path, query, body) {
  if (path === "/signup" && req.method === "POST") {
    const email = String(body.email ?? "").toLowerCase();
    if (!email.includes("@")) return authError(400, "validation_failed", "Unable to validate email address: invalid format");
    if (String(body.password ?? "").length < 6) return authError(422, "weak_password", "Password should be at least 6 characters.");
    if (users.has(email)) return authError(422, "user_already_exists", "User already registered");
    const u = { id: crypto.randomUUID(), email, password: body.password, confirmedAt: AUTOCONFIRM ? new Date().toISOString() : null, createdAt: new Date().toISOString() };
    users.set(email, u);
    await db.query("insert into auth.users (id, email) values ($1, $2)", [u.id, email]);
    return { status: 200, body: AUTOCONFIRM ? session(u) : publicUser(u) };
  }
  if (path === "/token" && req.method === "POST") {
    if (query.get("grant_type") === "password") {
      const u = users.get(String(body.email ?? "").toLowerCase());
      if (!u || u.password !== body.password) return { status: 400, body: { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" } };
      if (!u.confirmedAt) return { status: 400, body: { code: 400, error_code: "email_not_confirmed", msg: "Email not confirmed" } };
      return { status: 200, body: session(u) };
    }
    if (query.get("grant_type") === "refresh_token") {
      const email = refreshTokens.get(body.refresh_token);
      if (!email) return { status: 400, body: { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" } };
      refreshTokens.delete(body.refresh_token);
      return { status: 200, body: session(users.get(email)) };
    }
  }
  if (path === "/user" && req.method === "GET") {
    const id = uidFrom(req);
    const u = [...users.values()].find((x) => x.id === id);
    return u ? { status: 200, body: publicUser(u) } : authError(401, "bad_jwt", "invalid JWT");
  }
  if (path === "/logout") return { status: 204, body: null };
  if (path === "/settings") return { status: 200, body: { external: { email: true }, mailer_autoconfirm: AUTOCONFIRM } };
  return authError(404, "not_found", `fake auth: ${req.method} ${path} not implemented`);
}

// ---- REST (PostgREST subset) -------------------------------------------------
const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw restError(400, "PGRST100", `bad identifier ${s}`); return `"${s}"`; };
function restError(status, code, message) { const e = new Error(message); e.status = status; e.code = code; return e; }
const unquote = (v) => v.replace(/^"(.*)"$/, "$1");

/** One PostgREST filter "col=op.value" as SQL, pushing values into params. */
function filterSql(col, expr, params) {
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const val = expr.slice(dot + 1);
  const c = ident(col);
  const p = (v) => { params.push(v); return `$${params.length}`; };
  switch (op) {
    case "eq": return `${c} = ${p(val)}`;
    case "neq": return `${c} <> ${p(val)}`;
    case "gt": return `${c} > ${p(val)}`;
    case "gte": return `${c} >= ${p(val)}`;
    case "lt": return `${c} < ${p(val)}`;
    case "lte": return `${c} <= ${p(val)}`;
    case "is": return `${c} is ${({ null: "null", true: "true", false: "false" })[val] ?? (() => { throw restError(400, "PGRST100", `bad is.${val}`); })()}`;
    case "in": {
      const items = val.replace(/^\((.*)\)$/, "$1").split(",").filter(Boolean).map(unquote);
      return items.length ? `${c} in (${items.map(p).join(", ")})` : "false";
    }
    default: throw restError(400, "PGRST100", `fake PostgREST: operator ${op} not implemented`);
  }
}

function whereSql(query, params) {
  const parts = [];
  for (const [k, v] of query) {
    if (["select", "order", "limit", "offset", "columns", "on_conflict"].includes(k)) continue;
    if (k === "or") {
      const inner = v.replace(/^\((.*)\)$/, "$1").split(",").map((cond) => {
        const i = cond.indexOf(".");
        return filterSql(cond.slice(0, i), cond.slice(i + 1), params);
      });
      parts.push(`(${inner.join(" or ")})`);
    } else parts.push(filterSql(k, v, params));
  }
  return parts.length ? ` where ${parts.join(" and ")}` : "";
}

async function handleRest(tx, req, table, query, body) {
  if (!columns.has(table)) throw restError(404, "PGRST205", `Could not find the table 'public.${table}' in the schema cache`);
  const cols = columns.get(table);
  const prefer = String(req.headers.prefer ?? "");
  const t = ident(table);

  if (req.method === "GET" || req.method === "HEAD") {
    const params = [];
    const sel = query.get("select") ?? "*";
    const list = sel === "*" ? "*" : sel.split(",").map((c) => ident(c.trim())).join(", ");
    let sql = `select ${list} from ${t}${whereSql(query, params)}`;
    if (query.get("order")) sql += ` order by ${query.get("order").split(",").map((o) => { const [c, dir, nulls] = o.split("."); return `${ident(c)} ${dir === "desc" ? "desc" : "asc"}${nulls === "nullsfirst" ? " nulls first" : nulls === "nullslast" ? " nulls last" : ""}`; }).join(", ")}`;
    if (query.get("limit")) sql += ` limit ${Number(query.get("limit"))}`;
    if (query.get("offset")) sql += ` offset ${Number(query.get("offset"))}`;
    const r = await tx.query(`select coalesce(json_agg(_row), '[]'::json) as j from (${sql}) _row`, params);
    return { status: 200, body: r.rows[0].j };
  }

  if (req.method === "POST") {
    const rows = Array.isArray(body) ? body : [body];
    // Like PostgREST: the column list is ?columns= (supabase-js sends every key used), and
    // a row missing one of those keys gets NULL, not the column default.
    const colList = query.get("columns") ? query.get("columns").split(",").map(unquote) : [...new Set(rows.flatMap((r) => Object.keys(r)))];
    for (const c of colList) if (!cols.has(c)) throw restError(400, "PGRST204", `Could not find the '${c}' column of '${table}' in the schema cache`);
    if (!colList.length) return { status: 201, body: null };
    const cl = colList.map(ident).join(", ");
    let sql = `insert into ${t} (${cl}) select ${cl} from json_populate_recordset(null::${t}, $1::json)`;
    if (prefer.includes("resolution=merge-duplicates") || prefer.includes("resolution=ignore-duplicates")) {
      const target = (query.get("on_conflict")?.split(",") ?? primaryKeys.get(table) ?? ["id"]).map(ident).join(", ");
      const updates = colList.filter((c) => !target.includes(`"${c}"`)).map((c) => `${ident(c)} = excluded.${ident(c)}`);
      sql += prefer.includes("ignore-duplicates") || !updates.length ? ` on conflict (${target}) do nothing` : ` on conflict (${target}) do update set ${updates.join(", ")}`;
    }
    if (prefer.includes("return=representation")) {
      const r = await tx.query(`with ins as (${sql} returning *) select coalesce(json_agg(ins), '[]'::json) as j from ins`, [JSON.stringify(rows)]);
      return { status: 201, body: r.rows[0].j };
    }
    await tx.query(sql, [JSON.stringify(rows)]);
    return { status: 201, body: null };
  }

  if (req.method === "DELETE") {
    const params = [];
    const where = whereSql(query, params);
    if (!where) throw restError(400, "21000", "DELETE requires a WHERE clause");
    await tx.query(`delete from ${t}${where}`, params);
    return { status: 204, body: null };
  }

  if (req.method === "PATCH") {
    const params = [JSON.stringify(body)];
    const keys = Object.keys(body);
    for (const c of keys) if (!cols.has(c)) throw restError(400, "PGRST204", `Could not find the '${c}' column of '${table}' in the schema cache`);
    const set = keys.map((c) => `${ident(c)} = r.${ident(c)}`).join(", ");
    await tx.query(`update ${t} set ${set} from json_populate_record(null::${t}, $1::json) r${whereSql(query, params)}`, params);
    return { status: 204, body: null };
  }
  throw restError(405, "PGRST117", `method ${req.method} not supported`);
}

// PGlite is one connection: run requests one at a time, each in its own transaction
// with the caller's role and user id, so RLS applies exactly as on Supabase.
let queue = Promise.resolve();
const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => undefined); return run; };

const stats = { requests: 0, errors: [] };

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS,HEAD");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, X-Supabase-Api-Version");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* form bodies are not used */ }
  const send = ({ status, body: out }) => {
    res.writeHead(status, out == null ? {} : { "Content-Type": "application/json" });
    res.end(out == null ? undefined : JSON.stringify(out));
  };
  stats.requests++;
  try {
    if (url.pathname.startsWith("/auth/v1")) return send(await serial(() => handleAuth(req, url.pathname.slice(8), url.searchParams, body)));
    if (url.pathname.startsWith("/rest/v1/")) {
      const uid = uidFrom(req);
      const out = await serial(() => db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
        await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
        return handleRest(tx, req, url.pathname.slice(9), url.searchParams, body);
      }));
      return send(out);
    }
    if (url.pathname === "/__test/confirm") {
      const u = users.get(String(body.email).toLowerCase());
      if (!u) return send({ status: 404, body: { message: "no such user" } });
      u.confirmedAt = new Date().toISOString();
      return send({ status: 200, body: { ok: true } });
    }
    if (url.pathname === "/__test/sql") {
      return send({ status: 200, body: await serial(async () => {
        try { const r = await db.exec(body.sql); return r.at(-1)?.rows ?? []; }
        catch (e) { await db.exec("rollback; reset role;").catch(() => undefined); throw e; }
      }) });
    }
    if (url.pathname === "/__test/stats") return send({ status: 200, body: stats });
    send({ status: 404, body: { message: `not found: ${url.pathname}` } });
  } catch (e) {
    const status = e.status ?? (e.code === "42501" ? 403 : e.code === "23505" ? 409 : 400);
    stats.errors.push({ path: url.pathname + url.search, status, code: e.code, message: e.message });
    send({ status, body: { code: e.code ?? null, message: e.message, details: e.detail ?? null, hint: e.hint ?? null } });
  }
});
server.listen(PORT, () => console.log(`fake supabase on http://localhost:${PORT}${AUTOCONFIRM ? " (autoconfirm)" : ""}`));
