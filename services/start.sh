#!/bin/sh
set -eu

if [ -z "${SECRET_KEY:-}" ]; then
  if [ "${APP_ENV:-development}" != development ]; then
    echo 'SECRET_KEY must be set outside development.' >&2
    exit 1
  fi
  umask 077
  if [ ! -s /data/signing-key ]; then
    python -c 'import secrets; print(secrets.token_hex(32))' > /data/signing-key
  fi
  SECRET_KEY=$(cat /data/signing-key)
  export SECRET_KEY
fi

cd /app/api
if [ "${APP_ENV:-development}" = production ]; then
  exec uvicorn main:app --host 0.0.0.0 --port 8000
fi
exec uvicorn main:app --host 0.0.0.0 --port 8000 --reload --reload-dir /app/api