#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
rm -rf src/app/api src/lib/db.ts prisma .next/dev
NEXT_EXPORT=1 NEXT_PUBLIC_STATIC=1 next build
touch out/.nojekyll
echo "OK Static export ready in out/ (with .nojekyll)"
