# Splitline: rider progression (working name)

**See exactly how much faster you're getting.** Lap timing and progression for motocross, enduro, private tracks, practice loops and sprint stages.

It's a mobile-first React PWA, structured so the same codebase can be wrapped with Capacitor for iOS and Android later.

> "Splitline" is a placeholder name. Search for `APP_NAME` (`src/config/env.ts`) and the manifest in `vite.config.ts` to change it.

## Run it

```bash
cd rider-app
npm install
npm run dev        # http://localhost:5173
```

With no environment variables it runs in **local demo mode**:
- Rider: Alex Turner #221 on a Honda CRF250R.
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
| Garmin | Garmin Connect "Export Original" `.zip` (contains `.fit`), or `.fit`/`.gpx`/`.tcx` | ~1 fix/s |
| Strava | Activity → Export GPX | ~1 fix/s |
| Apple Watch | A GPX export from an app such as HealthFit or RunGap | ~1 fix/s |

How it works:
- GoPro videos are read in place on the device. Only the telemetry bytes are read; multi-GB files are never loaded into memory, and footage is never uploaded.
- GoPro video can be played back with a dot moving on the coloured map. In a later visit the rider re-selects the file, because browsers can't keep access to local files between visits.
- If no route matches, "Create a route from this ride" picks out one lap for the rider to trim and save.

How the colouring works (`lapDelta` in `src/domain/routeAnalysis.ts`):
1. The running time gap to the reference lap is sampled every 10 m and smoothed over 50 m.
2. A stretch turns green or red only when the gain or loss over 80, 160 or 240 m beats 1.5× the combined GPS uncertainty at both ends. Otherwise it stays neutral.
3. Fragments shorter than 30 m are treated as noise.

So 10–18 fixes/s GoPro data resolves individual corners, while 1 fix/s watch data only shows bigger losses over longer stretches. The UI says which applies.

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
  import/      GoPro (MP4 + GPMF telemetry), GPX, TCX, FIT and Garmin .zip readers; route matching; lap detection.
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

## Supabase setup (when you're ready for accounts)

1. Create a Supabase project.
2. In the SQL editor, run `supabase/migrations/0001_schema.sql`, then `0002_rls.sql`. Both were validated against a real Postgres engine (PGlite) with RLS checks. They haven't yet been run against a live Supabase project.
3. Copy `.env.example` to `.env.local` and fill in:

| Variable | Where | Secret? |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Project Settings → API → Project URL | No (public) |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API → anon public key | No (public; RLS protects data) |
| `VITE_MAP_STYLE_URL` | Optional MapLibre style URL. Defaults to OpenFreeMap (free, no key) | No |

**Never** put the `service_role` key in a `VITE_` variable: it would ship to every phone. Server-side jobs (billing webhooks, leaderboard materialisation, achievement notifications) belong in Supabase Edge Functions, where the service role key lives as a function secret.

## Deploying

Create a **separate** Netlify site from this repo with **Base directory = `rider-app`**. `rider-app/netlify.toml` builds it, and `public/_redirects` handles client-side routes. The repo-root site (the Bacup MX website) is unaffected.

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
