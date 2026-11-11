#!/usr/bin/env bash
# Static export build for GitHub Pages (`bun run build:gh`).
#
# The /api routes are server-only (Prisma + SQLite) and are not supported by
# `output: export`. This script parks them outside src/ for the duration of
# the build and restores them afterwards, so a local working tree stays intact
# (the Pages workflow additionally removes them right after checkout — both
# paths are safe).
set -euo pipefail
cd "$(dirname "$0")"

API_DIR="src/app/api"
BAK=".api-backup"

if [ -d "$API_DIR" ]; then
  rm -rf "$BAK"
  mv "$API_DIR" "$BAK"
fi

restore() {
  if [ -d "$BAK" ]; then
    rm -rf "$API_DIR"
    mkdir -p "$(dirname "$API_DIR")"
    mv "$BAK" "$API_DIR"
  fi
}
trap restore EXIT

# Drop stale dev-server type stubs (they reference /api routes that are
# parked away for this build and would fail `next build`'s type check).
rm -rf .next/dev

NEXT_EXPORT=1 NEXT_PUBLIC_STATIC=1 next build
touch out/.nojekyll
echo "OK Static export ready in out/ (with .nojekyll)"
