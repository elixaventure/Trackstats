#!/usr/bin/env bash
# Builds the app against the local fake Supabase, starts both servers fresh, and
# runs the beta-tester journey. Screenshots and results land in e2e/out/.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT_DIR="${TMPDIR:-/tmp}/trackstats-e2e-dist"
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=anon-test-key BASE_PATH=/Trackstats/ \
  node node_modules/vite/bin/vite.js build --outDir "$OUT_DIR" --emptyOutDir >/dev/null
node e2e/fake-supabase.mjs --port 54321 & API_PID=$!
node node_modules/vite/bin/vite.js preview --outDir "$OUT_DIR" --port 4180 --strictPort --base /Trackstats/ >/dev/null & WEB_PID=$!
trap 'kill $API_PID $WEB_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -sf -o /dev/null http://localhost:4180/Trackstats/ && curl -s -o /dev/null http://localhost:54321/__test/stats && break
  sleep 0.5
done
node e2e/beta-journey.cjs
