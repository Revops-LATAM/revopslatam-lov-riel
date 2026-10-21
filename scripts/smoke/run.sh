#!/usr/bin/env bash
# Compila en modo node-server con variables de Supabase falsas, levanta la app y corre la prueba de humo.
# No necesita una base de datos: solo valida arranque, SSR, hidratación y redirecciones.
set -u
cd "$(dirname "$0")/../.."
export VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_smoketest
export SUPABASE_URL=https://example.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_smoketest SUPABASE_SERVICE_ROLE_KEY=smoke-service PUBLIC_APP_URL=http://127.0.0.1:8787
PORT="${SMOKE_PORT:-8787}"
rm -rf .output
NITRO_PRESET=node-server npm run build > /tmp/smoke-build.log 2>&1 || { echo "FALLA el build"; tail -20 /tmp/smoke-build.log; exit 2; }
PORT="$PORT" node .output/server/index.mjs > /tmp/smoke-server.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$PORT/login" && break; sleep 1; done
node scripts/smoke/smoke.mjs "http://127.0.0.1:$PORT"
