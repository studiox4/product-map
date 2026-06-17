#!/usr/bin/env bash
# Build → prerender → serve integration check (raw HTTP, no JS execution).
# Verifies the prerendered marketing HTML is in the RAW response at /, the SPA
# shell is served at /app/board, and /api/healthz still responds.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PORT="${PORT:-3499}"
# Must match HERO_HEADLINE in apps/web/src/lib/marketing.ts.
HERO_MARK="Your product roadmap. Self-hosted. Yours."

echo "[1/5] Building web (runs prerender)…"
pnpm --filter @productmap/web build

echo "[2/5] Asserting dist/marketing.html exists…"
test -f "$REPO_ROOT/apps/web/dist/marketing.html"

echo "[3/5] Booting API with SERVE_WEB=1 on :${PORT}…"
SERVE_WEB=1 PORT="$PORT" AUTH_SECRET="${AUTH_SECRET:-integration-secret}" \
  pnpm --filter @productmap/api exec tsx src/index.ts &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT

# Wait for the API to listen (up to ~20s).
for i in $(seq 1 40); do
  if curl -fsS "http://localhost:$PORT/api/healthz" >/dev/null 2>&1; then break; fi
  sleep 0.5
done

echo "[4/5] Raw HTTP assertions…"
ROOT_BODY="$(curl -fsS "http://localhost:$PORT/")"
echo "$ROOT_BODY" | grep -qF "$HERO_MARK" || { echo "FAIL: / missing hero headline"; exit 1; }
echo "$ROOT_BODY" | grep -qF 'property="og:title"' || { echo "FAIL: / missing og:title"; exit 1; }
echo "$ROOT_BODY" | grep -qF 'property="og:url"' || { echo "FAIL: / missing og:url"; exit 1; }

APP_BODY="$(curl -fsS "http://localhost:$PORT/app/board")"
echo "$APP_BODY" | grep -qF "$HERO_MARK" && { echo "FAIL: /app/board served marketing markup"; exit 1; }
echo "$APP_BODY" | grep -qF '<div id="root">' || { echo "FAIL: /app/board not the SPA shell"; exit 1; }

curl -fsS "http://localhost:$PORT/api/healthz" | grep -qF '"ok":true' || { echo "FAIL: /api/healthz not 200/ok"; exit 1; }

echo "[5/5] PASS — / = marketing (hero + OG), /app/board = SPA shell, /api/healthz = ok"
