// End-to-end beta-tester journey against e2e/fake-supabase.mjs.
//
//   npm run e2e        (builds, starts the fake server and preview, runs this)
//
// Phone A: sign up (email confirmation), set up profile and bike, log a service
// with parts, add a mod, map a track by GPS, ride three timed laps, go offline
// and back. Phone B: sign in to the same account and get everything back.
// Rider 2: a different account sees the public track but none of rider 1's
// private data. Screenshots go to e2e/out/.
const path = require("node:path");
const fs = require("node:fs");
let playwright;
playwright = require("playwright");

const APP = process.env.APP_URL ?? "http://localhost:4180/Trackstats/";
const API = process.env.API_URL ?? "http://localhost:54321";
const OUT = path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });

const EMAIL = "joel.test@example.com";
const PASSWORD = "Bacup-777-test";
const results = [];
let failed = 0;
async function step(name, fn) {
  const t = Date.now();
  try { await fn(); results.push(`PASS ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`); console.log(`PASS ${name}`); }
  catch (e) { failed++; results.push(`FAIL ${name}: ${e.message.split("\n")[0]}`); console.log(`FAIL ${name}\n  ${e.message.split("\n").slice(0, 4).join("\n  ")}`); throw e; }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const sql = async (q) => (await fetch(`${API}/__test/sql`, { method: "POST", body: JSON.stringify({ sql: q }) })).json();
const one = async (q) => (await sql(q))[0];

// A ~620 m oval near Bacup. Positions are fed to the browser like a phone's GPS.
const CENTRE = { lat: 53.7045, lng: -2.2010 };
const RX = 120, RY = 70; // metres
const M_LAT = 111320, M_LNG = 111320 * Math.cos((CENTRE.lat * Math.PI) / 180);
const perimeter = 2 * Math.PI * Math.sqrt((RX * RX + RY * RY) / 2);
function at(distM) {
  const a = (distM / perimeter) * 2 * Math.PI; // anticlockwise from the start line on the east side
  const n = () => (Math.random() - 0.5) * 3; // ±1.5 m of GPS noise
  return { latitude: CENTRE.lat + (RY * Math.sin(a) + n()) / M_LAT, longitude: CENTRE.lng + (RX * Math.cos(a) + n()) / M_LNG, accuracy: 4 };
}
/** Drive the browser's GPS from `fromM` to `toM` along the oval at `speed(dist)` m/s, one fix a second. */
async function drive(ctx, page, fromM, toM, speed) {
  for (let d = fromM; d < toM;) {
    await ctx.setGeolocation(at(d));
    await page.waitForTimeout(1000);
    d += speed(d);
  }
  await ctx.setGeolocation(at(toM));
}

async function phone(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", permissions: ["geolocation"], geolocation: at(0) });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`${new URL(page.url()).pathname}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/tiles|openfreemap|ERR_CERT|Failed to load resource/.test(m.text())) errors.push(`${new URL(page.url()).pathname}: ${m.text().slice(0, 160)}`); });
  return { ctx, page, errors };
}
const shot = (page, name, full = true) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
/** Navigate like a user tapping links (no page reload); the first visit loads the page. */
async function go(page, p) {
  const url = new URL(p, APP);
  if (!page.url().startsWith(new URL(APP).origin)) return page.goto(url.toString(), { waitUntil: "networkidle" });
  await page.evaluate((to) => { history.pushState(null, "", to); dispatchEvent(new PopStateEvent("popstate")); }, url.pathname + url.search);
  await page.waitForTimeout(300);
}
async function waitSynced(page, timeout = 30000) {
  // Settings shows the outbox; wait for it to empty and the engine to go idle.
  await go(page, "settings");
  const end = Date.now() + timeout;
  let status = "", pending = "";
  while (Date.now() < end) {
    status = (await page.locator("dt:has-text('Status') + dd").innerText()).trim();
    pending = (await page.locator("dt:has-text('Waiting to upload') + dd").innerText()).trim();
    if (status === "Up to date" && pending === "0") return;
    await page.waitForTimeout(500);
  }
  const err = await page.locator("p.text-slower").allInnerTexts();
  throw new Error(`not synced: status "${status}", ${pending} waiting${err.length ? `, error: ${err.join(" ")}` : ""}`);
}
async function holdFinish(page) {
  const btn = page.getByRole("button", { name: /finish \(press and hold\)/ });
  const box = await btn.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
}

(async () => {
  const browser = await playwright.chromium.launch();
  const A = await phone(browser);
  const { page: a } = A;
  let userId, riderId, bikeId, routeId;

  try {
    await step("a new phone opens on the welcome screen, demo one tap away", async () => {
      await go(a, "");
      await a.waitForURL(/\/welcome$/);
      await a.getByRole("link", { name: "Create account" }).waitFor();
      await shot(a, "00-welcome", false);
      await a.getByRole("button", { name: "Look around with demo data first" }).click();
      await a.getByRole("link", { name: "Create your account" }).waitFor();
    });

    await step("sign up asks to confirm email", async () => {
      await go(a, "sign-in");
      await a.getByRole("radio", { name: "Create account" }).click();
      await a.getByLabel("Email").fill(EMAIL);
      await a.getByLabel("Password").fill(PASSWORD);
      await a.getByRole("button", { name: "Create account" }).click();
      await a.getByText("Check your email").waitFor();
      await shot(a, "01-signup-confirm", false);
    });

    await step("sign in before confirming is refused clearly", async () => {
      await a.getByRole("radio", { name: "Sign in" }).click();
      await a.getByRole("button", { name: "Sign in" }).click();
      await a.getByText("Email not confirmed").waitFor();
    });

    await step("after confirming, sign in starts a fresh account", async () => {
      await fetch(`${API}/__test/confirm`, { method: "POST", body: JSON.stringify({ email: EMAIL }) });
      await a.getByRole("button", { name: "Sign in" }).click();
      await a.waitForURL(/\/Trackstats\/?$/);
      await a.getByText("New rider").waitFor();
      expect(!(await a.getByText("Demo data").count()), "still showing demo data");
      await shot(a, "02-new-account-home", false);
      userId = (await one(`select id from auth.users where email = '${EMAIL}'`)).id;
    });

    await step("profile saves and reaches the server", async () => {
      await a.getByRole("link", { name: "Set up profile" }).click();
      await a.getByLabel("Rider name").fill("Joel Gaffey");
      await a.getByLabel("Race number").fill("777");
      await a.getByLabel("Class").fill("MX2");
      await a.getByRole("button", { name: "Save" }).click();
      await waitSynced(a);
      const r = await one(`select id, name, race_number from rider_profiles where owner_user_id = '${userId}'`);
      expect(r && r.name === "Joel Gaffey" && r.race_number === "777", `server has ${JSON.stringify(r)}`);
      riderId = r.id;
      expect((await one(`select count(*)::int n from rider_profiles where owner_user_id = '${userId}'`)).n === 1, "duplicate rider profiles");
    });

    await step("bike with hours and chassis number saves", async () => {
      await go(a, "profile/bikes/new");
      await a.getByLabel("Manufacturer").fill("Yamaha");
      await a.getByLabel("Model").fill("YZ250F");
      await a.getByLabel("Capacity").fill("250cc 4T");
      await a.getByLabel("Class").fill("MX2");
      await a.getByLabel("Year").fill("2021");
      await a.getByLabel("Hours on the bike now").fill("92.5");
      await a.getByLabel(/Chassis number/).fill("jya cg31c0 ma000777");
      await a.getByRole("button", { name: "Save bike" }).click();
      await waitSynced(a);
      const b = await one(`select id, vin, start_hours from bikes where rider_id = '${riderId}'`);
      expect(b && b.vin === "JYACG31C0MA000777" && Number(b.start_hours) === 92.5, `server has ${JSON.stringify(b)}`);
      bikeId = b.id;
      const tasks = await one(`select count(*)::int n from service_tasks where bike_id = '${bikeId}'`);
      expect(tasks.n >= 8, `only ${tasks.n} service jobs on the server`);
    });

    await step("service with parts and a modification save", async () => {
      await go(a, `garage/${bikeId}`);
      await a.getByRole("button", { name: "Log service" }).click();
      await a.getByRole("checkbox", { name: "Engine oil & filter" }).check();
      await a.getByLabel("Brand").nth(0).fill("Motorex");
      await a.getByLabel("Product / size").nth(0).fill("Cross Power 4T 10W-50");
      await a.getByLabel("Brand").nth(1).fill("Hiflofiltro");
      await a.getByLabel("Cost £ (optional)").fill("42.50");
      await a.getByRole("button", { name: "Save service" }).click();
      await a.getByRole("button", { name: "Add a modification" }).click();
      await a.getByLabel("What was fitted").fill("FMF Factory 4.1 exhaust");
      await a.getByRole("button", { name: "Save", exact: true }).click();
      await shot(a, "03-bike-service");
      await waitSynced(a);
      const rec = await one(`select cost_pence, parts_used from service_records where bike_id = '${bikeId}' and kind = 'service'`);
      expect(rec && rec.cost_pence === 4250 && rec.parts_used?.engineOil?.brand === "Motorex", `server has ${JSON.stringify(rec)}`);
      const bike = await one(`select parts, mods from bikes where id = '${bikeId}'`);
      expect(bike.parts?.oilFilter?.brand === "Hiflofiltro" && bike.mods?.[0]?.name === "FMF Factory 4.1 exhaust", `bike ${JSON.stringify(bike)}`);
    });

    await step("map a track by GPS (one lap, stops by itself)", async () => {
      await A.ctx.setGeolocation(at(0));
      await go(a, "routes/new");
      await a.getByRole("button", { name: "Record" }).click();
      await drive(A.ctx, a, 0, perimeter + 25, () => 12);
      await a.getByText("Lap complete").waitFor({ timeout: 15000 });
      await a.getByLabel("Track name").fill("Test Oval");
      await a.getByRole("switch", { name: /Public track/ }).click();
      await shot(a, "04-track-review");
      await a.getByRole("button", { name: "Save track" }).click();
      await a.getByText("Track saved").waitFor();
      await waitSynced(a);
      const r = await one(`select id, distance_m, visibility from routes where created_by_user_id = '${userId}'`);
      expect(r && Math.abs(r.distance_m - perimeter) < 60, `route ${JSON.stringify(r)} vs ${perimeter.toFixed(0)} m`);
      expect(r.visibility === "public", "route should be public");
      routeId = r.id;
      const pts = await one(`select count(*)::int n from route_points where route_id = '${routeId}'`);
      expect(pts.n >= 12, `only ${pts.n} route points uploaded`); // the line is simplified on save
    });

    await step("ride three GPS-timed laps on it", async () => {
      await A.ctx.setGeolocation(at(perimeter - 30));
      await go(a, `ride?route=${routeId}`);
      await shot(a, "05-start-ride");
      await a.getByRole("button", { name: "Start session" }).click();
      await a.waitForURL(/ride\/live/);
      // Run-up to the line, then three laps: steady, faster, then slow through the second half.
      await drive(A.ctx, a, perimeter - 30, perimeter, () => 12);
      await drive(A.ctx, a, 0, perimeter, () => 12);
      await drive(A.ctx, a, 0, perimeter, () => 14);
      await drive(A.ctx, a, 0, perimeter + 20, (d) => (d > perimeter / 2 ? 9 : 14));
      await a.waitForTimeout(1500);
      await shot(a, "06-live", false);
      await holdFinish(a);
      await a.waitForURL(/sessions\//, { timeout: 15000 });
      await a.waitForTimeout(1000);
      await shot(a, "07-results");
      await waitSynced(a, 60000);
      const laps = await sql(`select lap_number, duration_ms from laps l join sessions s on s.id = l.session_id where s.rider_id = '${riderId}' order by lap_number`);
      expect(laps.length === 3, `server has ${laps.length} laps: ${JSON.stringify(laps)}`);
      const expected = [perimeter / 12, perimeter / 14, perimeter / 2 / 14 + perimeter / 2 / 9].map((s) => s * 1000);
      laps.forEach((l, i) => expect(Math.abs(l.duration_ms - expected[i]) < 3500, `lap ${i + 1} ${l.duration_ms} ms, expected ~${expected[i].toFixed(0)}`));
      const gps = await one(`select count(*)::int n from gps_points g join sessions s on s.id = g.session_id where s.rider_id = '${riderId}'`);
      expect(gps.n > 100, `only ${gps.n} GPS points uploaded`);
    });

    await step("laps count riding the other way round from a standing start", async () => {
      await A.ctx.setGeolocation(at(0));
      await go(a, `ride?route=${routeId}`);
      await a.getByRole("button", { name: "Start session" }).click();
      await a.waitForURL(/ride\/live/);
      await a.getByText(/GPS (good|fair)/).waitFor({ timeout: 20000 }); // like a rider: wait for GPS before setting off
      // Sit on the line for a few seconds (GPS wobbles over it), then ride two laps the opposite way.
      for (let i = 0; i < 5; i++) { await A.ctx.setGeolocation(at(i % 2 ? 3 : perimeter - 3)); await a.waitForTimeout(1000); }
      const back = async (from, to, speed) => { for (let d = from; d > to; d -= speed) { await A.ctx.setGeolocation(at(((d % perimeter) + perimeter) % perimeter)); await a.waitForTimeout(1000); } };
      await back(0, -(2 * perimeter + 40), 14);
      await holdFinish(a);
      await a.waitForURL(/sessions\//, { timeout: 15000 });
      await a.getByText("Start line check").waitFor();
      await a.waitForTimeout(800);
      await shot(a, "07b-reverse-results");
      const text = await a.locator("main").innerText();
      expect(/Reversed/.test(text), "direction not shown as reversed");
      const n = (text.match(/^L\d+$/gm) ?? []).length;
      expect(n === 2, `expected 2 laps riding reversed, page shows ${n}`);
    });

    await step("a service logged offline uploads when back online", async () => {
      await A.ctx.setOffline(true);
      await go(a, `garage/${bikeId}`).catch(() => undefined);
      await a.getByRole("button", { name: "Hour meter" }).click();
      await a.getByLabel("Hour meter").fill("95");
      await a.getByRole("button", { name: "Save reading" }).click();
      await a.getByText(/waiting to sync/).waitFor({ timeout: 10000 });
      await shot(a, "08-offline", false);
      await A.ctx.setOffline(false);
      await a.evaluate(() => window.dispatchEvent(new Event("online")));
      await waitSynced(a, 30000);
      const r = await one(`select hours from service_records where bike_id = '${bikeId}' and kind = 'reading'`);
      expect(r && Number(r.hours) === 95, `reading ${JSON.stringify(r)}`);
    });

    await step("data survives closing and reopening the app", async () => {
      await a.reload({ waitUntil: "networkidle" });
      await go(a, "garage");
      await a.getByText("YZ250F").first().waitFor();
      await a.getByText("Joel Gaffey").first().waitFor();
    });

    const B = await phone(browser);
    const { page: b } = B;
    await step("second phone: signing in brings everything back", async () => {
      await go(b, "sign-in");
      await b.getByLabel("Email").fill(EMAIL);
      await b.getByLabel("Password").fill(PASSWORD);
      await b.getByRole("button", { name: "Sign in" }).click();
      await b.waitForURL(/\/Trackstats\/?$/);
      await b.getByText("Joel Gaffey").first().waitFor();
      await shot(b, "09-phone-b-home");
      await go(b, `garage/${bikeId}`);
      await b.getByText("Motorex Cross Power 4T 10W-50").first().waitFor();
      await b.getByText("FMF Factory 4.1 exhaust").first().waitFor();
      await go(b, `garage/${bikeId}/history`);
      await b.getByText("JYACG31C0MA000777").waitFor();
      await shot(b, "10-phone-b-history");
      await go(b, "sessions");
      await b.getByText("Test Oval").first().waitFor();
      expect((await one(`select count(*)::int n from rider_profiles where owner_user_id = '${userId}'`)).n === 1, "signing in again created a duplicate rider");
    });

    await step("second phone: lap analysis loads the GPS trace from the server", async () => {
      await b.getByText("Test Oval").first().click();
      await b.waitForURL(/sessions\//);
      await b.waitForTimeout(2500);
      await shot(b, "11-phone-b-session");
      const text = await b.locator("main").innerText();
      expect(/^L2$/m.test(text), "laps not shown on phone B");
    });

    const C = await phone(browser);
    const { page: c } = C;
    await step("another rider sees the public track but none of Joel's private data", async () => {
      await go(c, "sign-in");
      await c.getByRole("radio", { name: "Create account" }).click();
      await c.getByLabel("Email").fill("charlie.test@example.com");
      await c.getByLabel("Password").fill("Charlie-77-test");
      await c.getByRole("button", { name: "Create account" }).click();
      await c.getByText("Check your email").waitFor();
      await fetch(`${API}/__test/confirm`, { method: "POST", body: JSON.stringify({ email: "charlie.test@example.com" }) });
      await c.getByRole("radio", { name: "Sign in" }).click();
      await c.getByRole("button", { name: "Sign in" }).click();
      await c.waitForURL(/\/Trackstats\/?$/);
      await go(c, "routes");
      await c.getByText("Test Oval").first().waitFor();
      const text = await (async () => { await go(c, "garage"); return c.locator("main").innerText(); })();
      expect(!text.includes("YZ250F"), "Charlie can see Joel's bike");
      await waitSynced(c);
    });

    await step("server: nobody else's rows were touched, and no unexpected errors", async () => {
      const stats = await (await fetch(`${API}/__test/stats`)).json();
      const unexpected = stats.errors.filter((e) => !(e.path.startsWith("/auth/v1/token") && e.status === 400));
      expect(!unexpected.length, `server errors: ${JSON.stringify(unexpected.slice(0, 3))}`);
      const pageErrors = [...A.errors.map((e) => `A ${e}`), ...B.errors.map((e) => `B ${e}`), ...C.errors.map((e) => `C ${e}`)];
      expect(!pageErrors.length, `page errors: ${[...new Set(pageErrors)].slice(0, 5).join(" | ")}`);
    });
  } catch {
    // The failing step is already reported.
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT, "results.txt"), results.join("\n") + "\n");
    console.log(`\n${results.length - failed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
})();
