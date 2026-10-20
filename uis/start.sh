#!/bin/sh
set -eu

stop() {
  kill "$website_pid" "$backoffice_pid" 2>/dev/null || true
  wait "$website_pid" "$backoffice_pid" 2>/dev/null || true
}

cd /app/website
if [ "${APP_ENV:-development}" = production ]; then
  caddy run --config /app/Caddyfile --adapter caddyfile &
else
  npm start -- --host 0.0.0.0 --port 3000 &
fi
website_pid=$!
cd /app/backoffice
if [ "${APP_ENV:-development}" = production ]; then
  npm start -- --hostname 0.0.0.0 --port 3001 &
else
  npm run dev -- --hostname 0.0.0.0 --port 3001 &
fi
backoffice_pid=$!
trap stop EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

while kill -0 "$website_pid" 2>/dev/null && kill -0 "$backoffice_pid" 2>/dev/null; do
  sleep 1
done
exit 1