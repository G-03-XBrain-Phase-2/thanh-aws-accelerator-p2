#!/bin/sh
set -eu

while true; do
  echo "---- $(date) ----"
  echo "DB_USERNAME=$(cat /etc/app-secrets/DB_USERNAME 2>/dev/null || true)"
  echo "DB_PASSWORD=$(cat /etc/app-secrets/DB_PASSWORD 2>/dev/null || true)"
  sleep 10
done