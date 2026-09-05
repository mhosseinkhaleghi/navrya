#!/usr/bin/env bash
set -euo pipefail

# Launch-readiness audit fix (P0-1, docs/PUBLIC-LAUNCH-READINESS-AUDIT.md): before this script
# existed, NEITHER PostgreSQL nor the uploads volume had any backup at all - a disk failure,
# accidental `docker volume rm`, host compromise, or bad migration on the single production server
# would have destroyed every user's trades, patterns, strategies, mental-health profiles,
# screenshots, and wallet ledgers permanently, with no recovery path whatsoever.
#
# Run via the `backup` service in docker-compose.production.yml (see that file's own comment for
# why every RESTIC_*/BACKUP_* value is soft-defaulted at the Compose level - this script's guards
# below are the ONLY place "must actually be configured" is enforced), invoked on a schedule by
# host cron (DEPLOYMENT.md) or by hand. See docs/BACKUP-AND-RESTORE.md for the full runbook,
# one-time setup, and the mandatory restore-drill procedure - a backup that has never been restored
# is a hypothesis, not a guarantee.
#
# Uses restic (https://restic.net) rather than a hand-rolled upload script: real encryption at
# rest, real deduplication (so repeated nightly full dumps of a mostly-unchanged database cost far
# less storage than they sound like), a real retention/pruning model, and a real `restic check`
# integrity verifier - reusing an established, widely-audited tool instead of reinventing any of
# that, the same "reuse the maintained library" principle already applied throughout this codebase
# (the `cookie` package, `openid-client`, argon2, etc.).
#
# Every required value is guarded here, in order, BEFORE any pg_dump/restic binary is ever
# invoked - this is what makes tests/backup-restore-contract.test.mjs able to prove these guards
# actually fire in real bash without pg_dump/restic needing to be installed in the test
# environment at all.
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY must be set - see .env.production.example / docs/BACKUP-AND-RESTORE.md}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD must be set - see .env.production.example / docs/BACKUP-AND-RESTORE.md}"
: "${DATABASE_URL:?DATABASE_URL must be set}"
: "${UPLOADS_DIR:=/uploads}"

# A stable per-run host tag, not the container's own ephemeral hostname (which restic would
# otherwise default to and which changes every single run under Docker) - this is what lets
# restore.sh/`restic snapshots` reliably filter to "this application's own backups" regardless of
# which container instance produced them.
HOST_TAG="navrya-production"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "[backup] $STAMP: dumping PostgreSQL..."
DUMP_FILE="$WORKDIR/postgres-$STAMP.dump"
# --format=custom (not plain SQL) is what makes pg_restore's --clean/--if-exists/selective-restore
# options available on the way back in - see restore.sh.
pg_dump --format=custom --no-owner --no-privileges --file="$DUMP_FILE" "$DATABASE_URL"

# A 0-byte or near-empty "successful" dump is worse than a loud failure here - it would silently
# satisfy every later step (upload, retention, check) while protecting nothing at all. 1KB is a
# deliberately tiny floor (a genuinely empty schema still emits real pg_dump header bytes well
# above this) - this is a sanity floor against a badly wrong connection string, not a real size
# expectation.
DUMP_SIZE=$(stat -c%s "$DUMP_FILE")
if [ "$DUMP_SIZE" -lt 1024 ]; then
  echo "[backup] FATAL: pg_dump output is suspiciously small ($DUMP_SIZE bytes) - refusing to treat this as a valid backup. Check DATABASE_URL." >&2
  exit 1
fi
echo "[backup] pg_dump wrote $DUMP_SIZE bytes"

# Idempotent-safe to attempt on every run - initializing an already-initialized repository just
# errors harmlessly, which `|| true` absorbs ONLY here. Every restic command below this line still
# fails the whole script loudly on its own (set -e) if the repository is genuinely unreachable or
# misconfigured - this is not a general "ignore restic errors" escape hatch.
restic snapshots --host "$HOST_TAG" >/dev/null 2>&1 || restic init

echo "[backup] pushing PostgreSQL dump to the backup repository..."
restic backup "$DUMP_FILE" --tag postgres --tag "$STAMP" --host "$HOST_TAG"

echo "[backup] pushing uploads directory to the backup repository..."
restic backup "$UPLOADS_DIR" --tag uploads --tag "$STAMP" --host "$HOST_TAG"

echo "[backup] applying retention policy (daily=${BACKUP_RETENTION_DAILY:-14} weekly=${BACKUP_RETENTION_WEEKLY:-8} monthly=${BACKUP_RETENTION_MONTHLY:-12})..."
for tag in postgres uploads; do
  restic forget \
    --tag "$tag" --host "$HOST_TAG" \
    --keep-daily "${BACKUP_RETENTION_DAILY:-14}" \
    --keep-weekly "${BACKUP_RETENTION_WEEKLY:-8}" \
    --keep-monthly "${BACKUP_RETENTION_MONTHLY:-12}" \
    --prune
done

# A bounded, fast integrity check every run (not a full 100% read-verify, which would transfer the
# entire repository on every nightly run) - over ~20 runs this samples the whole repository at
# least once without materially slowing down or costing more on any single night.
echo "[backup] verifying repository integrity (5% data subset)..."
restic check --read-data-subset=5%

echo "[backup] $STAMP: complete."
