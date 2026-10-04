# TrackStats: rider progression

**See exactly how much faster you're getting.** Lap timing and progression for motocross, enduro, private tracks, practice loops and sprint stages.

It's a mobile-first React PWA (repo: `elixaventure/Trackstats`), structured so the same codebase can be wrapped with Capacitor for iOS and Android later.

> The name lives in `APP_NAME` (`src/config/env.ts`) and the web-app manifest in `vite.config.ts`.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

With no environment variables it runs in **local demo mode**:
- Rider: Joel Gaffey #777, with a brand-new 2026 Husqvarna TC 125 and a 2021 Yamaha YZ250F.
- Second managed rider: Charlie, #77.
- Three routes, and seven weeks of improving sessions with GPS traces.
- Nothing leaves the device.

Other commands:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-check (app + tests) and build to `dist/` |
| `npm run preview` | Serve the production build (service worker active) |
| `npm test` | Unit tests: lap engine, GPS gates, stats, section analysis, file importers, schema/sync contract |
| `npm run lint` | ESLint |

### Importing rides (GoPro, Garmin, Strava, Apple Watch)

**Home → Import GoPro / watch** (or `/import`). The app:
1. Reads the GPS track from the file.
2. Matches it to a saved route by where you rode.
3. Finds laps from the start/finish line crossings.
4. Shows where you gained and lost time, green and red all the way round the lap, plus a "gap around the lap" chart.

| Source | What to select | GPS detail |
| --- | --- | --- |
| GoPro HERO5–11, HERO13, MAX, Fusion | The `.MP4` files (select every chapter of a long recording). GPS must be on in the camera. | 10–18 fixes/s: separates corners |
| GoPro HERO12 | **Not supported: the HERO12 has no GPS chip.** The app says so. | — |
| Insta360 (X-series, ONE RS, Ace Pro, GO) | The `.insv`/`.mp4` files straight off the camera. **GPS exists only if the camera was paired with the Insta360 app or GPS remote while filming.** The app says so when it's missing. | Depends on the phone/remote |
| Garmin | Garmin Connect "Export Original" `.zip` (contains `.fit`), or `.fit`/`.gpx`/`.tcx` | ~1 fix/s |
| Strava | Activity → Export GPX | ~1 fix/s |
| Apple Watch | A GPX export from an app such as HealthFit or RunGap | ~1 fix/s |

How it works:
- Insta360's GPS format is undocumented. The reader follows the open-source Gyroflow `telemetry-parser`, and is tested on synthetic files only until we have a real recording. 360° `.insv` footage gives the track analysis but can't be played back in a browser. Ordinary `.mp4` playback is offered with approximate sync and ±1 s / ±0.2 s nudge buttons.
- GoPro videos are read in place on the device. Only the telemetry bytes are read; multi-GB files are never loaded into memory, and footage is never uploaded.
- GoPro video can be played back with a dot moving on the coloured map. In a later visit the rider re-selects the file, because browsers can't keep access to local files between visits.
- If no route matches, "Create a route from this ride" picks out one lap for the rider to trim and save.

How the colouring works (`lapDelta` in `src/domain/routeAnalysis.ts`):
1. The running time gap to the reference lap is sampled every 10 m and smoothed over 50 m.
2. A stretch turns green or red only when the gain or loss over 80, 160 or 240 m beats 1.5× the combined GPS uncertainty at both ends. Otherwise it stays neutral.
3. Fragments shorter than 30 m are treated as noise.

So 10–18 fixes/s GoPro data resolves individual corners, while 1 fix/s watch data only shows bigger losses over longer stretches. The UI says which applies.

### Track updates ("report a change")

Each track has **Track updates**: riders and the track itself post what's changed, for example a rebuilt jump, a new section, ruts, a hazard or a closed section. Each report has a section, a severity and an optional "affects lap times" flag.

- Start Ride shows a heads-up for anything reported since your last ride there, plus any open hazard or closure.
- The Routes list badges changed tracks.
- Reports appear as markers on the track map.
- "Affects lap times" changes are drawn on progress charts.
- Reports from the track's owner carry a **Track official** badge.
- Hazards stay up until someone marks them cleared; other reports drop off after 30 days.
- With accounts on, reports sync to every rider (`track_changes` table; RLS: anyone can read reports on routes they can see; reporters and the route owner can clear or delete).

### Servicing and service history (Garage → bike → Service)

Each bike has a **service schedule**: jobs with an interval in hours, months, or both, whichever comes first. New bikes get sensible defaults, different for 2-strokes and 4-strokes. They are only a starting point: edit them to match the owner's manual.

- **Engine hours** = the latest hour-meter reading plus ride time recorded since. With no reading, it's the hours entered when the bike was added plus recorded rides. App ride time includes time in the pits and misses rides not recorded, so log a meter reading now and then.
- **Log service**: date, hours, jobs done, who did it, cost and notes. **Hour meter** logs a reading on its own.
- The Home screen and Garage show what's due or overdue.
- **For selling** opens a printable service history (Print / Save as PDF), with costs optional. Every entry is stamped with when it was logged. Anything typed in more than 7 days after the work is marked **added later**, so buyers can see what was logged at the time and what was backfilled.
- Synced via `service_tasks` / `service_records` (RLS: owner of the bike only).

### My parts, modifications and chassis number

- **My parts** (bike → Service): brand and product for oil, filters, plug, piston, chain, sprockets, pads, tyres and coolant. The list fills itself in over time: when you log a service, the parts for the ticked jobs are prefilled and any changes are remembered.
- **Get parts**: a button on due jobs and a cart on each part. It opens a shop search for that brand, plus the bike when fitment matters (filters, pads, chain). Oil and coolant are searched without the bike. TrackStats keeps no parts or fitment database; the shop's own search handles fitment.
- **Modifications**: what was fitted and when. These print on the service history for buyers.
- **Chassis number (VIN)**: optional, on the bike's edit page. It prints on the service history, and can be hidden before printing.
- **Shops and affiliate links**: switched off. By default "Get parts" opens a plain web shopping search and earns nothing. To use a partner shop, set `PARTNER_SHOP` in `src/config/shops.ts` to its search URL with your affiliate tag. Links are then marked `rel="sponsored"` and the page shows an affiliate disclosure, as UK advertising rules require.

### Trying the timing without hardware

1. Start a ride with **One pod: start/finish**.
2. On the live screen, open **Timing simulator (no hardware)**.
3. Fire crossings yourself (`001 crosses Start/Finish`), or turn on auto laps.

For GPS timing at a desk:
1. **Settings → Developer → Simulated GPS** (pick 6× to speed it up).
2. Start a ride with **GPS only** on a saved route.

Sessions recorded with either simulator are labelled as simulated and never appear on leaderboards.

## Architecture

```
src/
  domain/      Pure TypeScript: types, lap engine, GPS geometry and gates, stats,
               section analysis, leaderboards, achievements. No React, fully unit-tested.
  timing/      TimingProvider interface + MockTimingProvider (simulator).
  location/    LocationProvider interface + Web (browser GPS) and Simulated providers, GPS sampler.
  session/     RideEngine: runs a ride on-device (events → laps, GPS, gates, crash recovery).
  data/        Local-first store (IndexedDB), actions, selectors, demo-data generator.
  sync/        Outbox queue + Supabase sync engine + model↔row mapping.
  import/      GoPro (MP4 + GPMF telemetry), Insta360 (file trailer), GPX, TCX, FIT and Garmin .zip readers; route matching; lap detection.
  components/  UI building blocks, map (MapLibre, lazy), charts (Recharts), live-ride widgets.
  pages/       One file per screen.
supabase/migrations/  Postgres schema + Row Level Security.
```

### Key decisions

**Timing is hardware-agnostic.**
- The app only talks to `TimingProvider`: `connect`, `disconnect`, `getStatus`, `subscribeToPassingEvents`, `assignTransponder`, `releaseTransponder`.
- A BLE, network or OEM decoder becomes one new class in `src/timing/`.
- The ride engine and UI don't change.

**Raw events and laps are kept separately.**
- Every crossing is stored as a `timing_event`.
- Laps are derived by one algorithm, `computeLaps`, covering all four modes:
  - **Lap:** start/finish → start/finish.
  - **Start/finish:** start → finish.
  - **Sectors:** start → S1…Sn → finish.
  - **GPS:** virtual gates emit the same roles.
- Double reads are debounced. Crash or stop laps are flagged invalid and excluded from PBs and averages.
- Laps can always be recomputed from the raw events.

**Shared transponders.**
- Assignments are a history table, and only one active assignment per tag is enforced in SQL.
- Laps belong to the session, and so to the rider, never to the tag. Handing Tag 01 from Rider A to Rider B can't move A's history.
- One phone can time several riders it manages at once, each with their own tag. This covers parents timing their children.

**Offline-first.**
- During a ride, everything (events, laps, GPS every 15 s, the active-ride state) is written to IndexedDB on the phone.
- Writes are queued in a durable outbox. When signed in and online, they're pushed to Supabase as idempotent UUID upserts, with exponential backoff.
- A reload or crash mid-ride resumes the ride.
- The service worker caches the app shell, fonts and map tiles already seen.
- If the map can't load with no signal, routes are drawn offline from their own geometry.

**GPS volume is controlled.**
- At most 1 fix per second.
- Poor fixes (accuracy > 35 m) are dropped.
- When stationary, one fix per 10 s.
- That's about 3,600 points per riding hour at most.

**Honest GPS analysis.**
- Section times come from phone GPS, so every section comparison carries an uncertainty estimate (fix interval, reported accuracy, speed).
- Differences inside that band show as "about equal".
- The UI separates transponder lap times from GPS-derived figures.
- Leaderboards rank transponder and GPS-timed laps separately.
- Laps are only compared on the same route **configuration version**.

**Security.**
- RLS on every table (`0002_rls.sql`):
  - You write only riders you manage.
  - Riders are visible to their owner, to shared-group members, or to everyone if the profile is public.
  - Public routes and the leaderboard view are readable by anyone.
  - GPS traces are never public.
- The client only ever holds the public anon key.

## Accounts and cloud sync (beta setup)

Without Supabase the app runs in demo mode: sample data, stored only on that phone. With it, testers sign up, and their rides, bikes and service history back up to the cloud and appear on any phone they sign in on.

One-time setup, about 10 minutes:

1. **Create a project** at supabase.com (the free tier is fine for a beta). Pick a region near the riders, e.g. London (eu-west-2).
2. **Create the database.** Open the SQL Editor and run `supabase/migrations/0001_schema.sql`, then `0002_rls.sql`. Paste each file's whole contents and press Run.
3. **Auth settings.** Open Authentication → URL Configuration:
   - Site URL: `https://elixaventure.github.io/Trackstats/`
   - Redirect URLs: add `https://elixaventure.github.io/Trackstats/**`

   Email confirmation is on by default; leave it on. Supabase's built-in email sender is rate-limited to a few emails an hour. For more than a handful of testers, add your own SMTP under Authentication → Emails, or turn confirmation off for the beta.
4. **Connect the app.** In Project Settings → API, copy the Project URL and the `anon` `public` key. In GitHub, open the repo's Settings → Secrets and variables → Actions → **Variables** tab, and add:
   - `SUPABASE_URL` = the Project URL
   - `SUPABASE_ANON_KEY` = the anon public key

   Then re-run the "Publish to GitHub Pages" workflow, or push any change. The live app now has **Sign in / Create account** under Profile → Settings.

| Value | Where it goes | Secret? |
| --- | --- | --- |
| Project URL | GitHub variable `SUPABASE_URL`, or `VITE_SUPABASE_URL` in `.env.local` | No (public) |
| anon public key | GitHub variable `SUPABASE_ANON_KEY`, or `VITE_SUPABASE_ANON_KEY` in `.env.local` | No (public; RLS protects data) |
| `VITE_MAP_STYLE_URL` | Optional MapLibre style. Defaults to OpenFreeMap's public instance (free, no key, nothing to sign up for) | No |

**Never** put the `service_role` key in a `VITE_` variable or a GitHub variable: it would ship to every phone. Server-side jobs (billing webhooks, leaderboard materialisation, achievement notifications) belong in Supabase Edge Functions, where the service role key lives as a function secret.

### How it was tested

- `npm test` includes `src/sync/rls.test.ts`, which runs the migrations on real Postgres (PGlite) and checks Row Level Security. It uses upserts, exactly as the app saves.
- `npm run e2e` builds the app against `e2e/fake-supabase.mjs`, a local stand-in for a Supabase project: real Postgres with these migrations and RLS, behind the parts of the REST and auth APIs the app uses. It then drives Chromium through a beta tester's journey:
  - sign up with email confirmation, then set up a profile and a bike (hours, VIN);
  - log a service with parts, and add a modification;
  - map a track by GPS (the browser's location is moved around an oval), then ride three GPS-timed laps;
  - log something offline and check it syncs once back online;
  - reopen the app;
  - sign in on a second phone and get everything back, including lap analysis;
  - create a second account, which sees the public track but none of the first rider's private data.

  Screenshots go to `e2e/out/`. CI runs it on every push (the "End-to-end" workflow).
- The stand-in is not Supabase itself. Once the real project exists, do one sign-up on a phone to confirm the email link and the first sync.

## Deploying

### GitHub Pages (free)
`.github/workflows/pages.yml` lints, tests and builds the app on every push to `main`, then publishes it to **https://elixaventure.github.io/Trackstats/**.

One-time setup: **Settings → Pages → Source: GitHub Actions**, then **Actions → Publish to GitHub Pages → Run workflow** (or push any change). Until Pages is switched on, the deploy job fails with GitHub's "Pages not enabled" error.

The build sets `BASE_PATH=/<repo>/` so links, the service worker and the installed-app settings work in that sub-folder. `404.html` is a copy of the app, so deep links work.

### Netlify / Cloudflare Pages
`netlify.toml` builds with `npm run build` and publishes `dist`. On Cloudflare Pages use build command `npm run build`, output `dist`, and env var `NODE_VERSION=22`. `public/_redirects` handles client-side routes on both.

## Moving to native (Capacitor)

The seams are already in place:
- Add `CapacitorLocationProvider` (background geolocation) in `src/location/`.
- Add a `BLETimingProvider` in `src/timing/`.
- Pick them in `location/index.ts` and `timing/index.ts`.

Nothing else depends on the browser APIs directly.

## Known limitations

- **No real timing hardware yet.** Only the simulator exists. The interface is ready for the first real decoder.
- **Browser GPS stops when the screen locks.** The live screen holds a wake lock. Reliable background GPS needs the Capacitor build.
- **Cloud sync is untested against a live Supabase project.** It's implemented (push via the outbox; pull on sign-in; GPS fetched on demand), but has only been exercised against the local schema.
- **Missing features:**
  - Invites for riders on other accounts.
  - Photo upload to Storage (photos are device-only for now).
  - Server-side achievements.
- **Demo data is synthetic.** Route shapes near Bacup are generated, not surveyed.
