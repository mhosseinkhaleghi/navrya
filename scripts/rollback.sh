#!/usr/bin/env bash
# One-command rollback - run this ON THE PRODUCTION SERVER, in /opt/navrya (the same directory
# .github/workflows/deploy.yml deploys into). Reverts to the commit that was running immediately
# before the current one (recorded in .previous-deployed-sha by the deploy workflow's own remote
# script), rebuilds, and restarts - the exact same build/migrate/up sequence a normal deploy uses,
# just checking out an older commit first.
#
# This does NOT run a destructive down-migration. Migrations are expand-only (server/db/migrate.mjs
# never edits an applied migration) - rolling back application code while a newer migration has
# already run is safe as long as that migration was additive, which is the whole point of the
# expand/contract convention this repo follows. If a specific rollback ever needs a real schema
# reversal, write and apply that as its own new forward migration - never edit history.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .previous-deployed-sha ]; then
  echo "FATAL: no .previous-deployed-sha recorded - there is nothing to roll back to yet (this file is written by the deploy workflow on its second-or-later run)." >&2
  exit 1
fi

TARGET_SHA="$(cat .previous-deployed-sha)"
echo "Rolling back to ${TARGET_SHA}..."

git fetch --prune origin
git cat-file -e "${TARGET_SHA}^{commit}"
git checkout --detach "${TARGET_SHA}"

docker compose --env-file .env -f docker-compose.production.yml build --build-arg NAVRYA_BUILD_COMMIT="$TARGET_SHA" --build-arg NAVRYA_BUILD_COMMIT_COUNT="$(git rev-list --count "$TARGET_SHA")"
docker compose --env-file .env -f docker-compose.production.yml up -d --remove-orphans

sleep 5
docker compose --env-file .env -f docker-compose.production.yml exec -T community-api wget -qO- http://127.0.0.1:8788/readyz
docker compose --env-file .env -f docker-compose.production.yml exec -T pattern-ai wget -qO- http://127.0.0.1:8787/health

echo "${TARGET_SHA}" > .last-deployed-sha
echo "Rolled back to ${TARGET_SHA}. Re-deploying a newer commit through the normal CI/CD workflow will move forward again."
