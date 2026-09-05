#!/usr/bin/env bash
set -euo pipefail

# Launch-readiness audit fix (P0-1) - the restore half of scripts/backup.sh. See
# docs/BACKUP-AND-RESTORE.md for the full runbook and the mandatory restore-drill procedure.
#
# Deliberately NEVER targets the live production database/uploads volume by default - both the
# `postgres` and `uploads` actions below refuse to proceed if their target matches the live
# DATABASE_URL/UPLOADS_DIR unless RESTORE_CONFIRM is set to the exact string
# "RESTORE INTO PRODUCTION". A real disaster-recovery restore (not a drill) is the only time that
# should ever be set - see this file's own guards, checked BEFORE restic/pg_restore ever run.
HOST_TAG="navrya-production"

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY must be set - see .env.production.example / docs/BACKUP-AND-RESTORE.md}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD must be set - see .env.production.example / docs/BACKUP-AND-RESTORE.md}"

ACTION="${1:-}"
SNAPSHOT="${2:-latest}"

usage() {
  cat >&2 <<'USAGE'
Usage:
  restore.sh list [postgres|uploads]        List available snapshots (optionally by tag).
  restore.sh check                          Run `restic check` against the repository.
  restore.sh postgres [snapshot-id|latest]  Restore a PostgreSQL dump into RESTORE_DATABASE_URL.
  restore.sh uploads  [snapshot-id|latest]  Restore the uploads directory into RESTORE_UPLOADS_DIR.

RESTORE_DATABASE_URL / RESTORE_UPLOADS_DIR must point at a scratch/staging target, never the live
production database or uploads volume, unless RESTORE_CONFIRM is set to the exact string
"RESTORE INTO PRODUCTION". See docs/BACKUP-AND-RESTORE.md for the real restore-drill procedure.
USAGE
  exit 1
}

case "$ACTION" in
  list)
    if [ -n "${2:-}" ]; then
      restic snapshots --host "$HOST_TAG" --tag "$2"
    else
      restic snapshots --host "$HOST_TAG"
    fi
    ;;

  check)
    restic check
    ;;

  postgres)
    : "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL must be set - point this at a scratch/staging database, never production}"
    if [ "$RESTORE_DATABASE_URL" = "${DATABASE_URL:-}" ] && [ "${RESTORE_CONFIRM:-}" != "RESTORE INTO PRODUCTION" ]; then
      echo "[restore] FATAL: RESTORE_DATABASE_URL matches the live DATABASE_URL. Refusing to overwrite production. Set RESTORE_CONFIRM='RESTORE INTO PRODUCTION' only for a real, deliberate disaster-recovery restore." >&2
      exit 1
    fi
    WORKDIR="$(mktemp -d)"
    trap 'rm -rf "$WORKDIR"' EXIT
    echo "[restore] restoring snapshot '$SNAPSHOT' (tag:postgres) to a scratch directory..."
    restic restore "$SNAPSHOT" --host "$HOST_TAG" --tag postgres --target "$WORKDIR"
    DUMP_FILE="$(find "$WORKDIR" -name 'postgres-*.dump' 2>/dev/null | sort | tail -n1)"
    if [ -z "$DUMP_FILE" ]; then
      echo "[restore] FATAL: no postgres-*.dump file found in the restored snapshot." >&2
      exit 1
    fi
    echo "[restore] restoring $DUMP_FILE into the target database..."
    # --clean --if-exists: the target is expected to be an empty/scratch database in the normal
    # drill case, but this makes a re-run against an already-populated scratch target safe too,
    # rather than failing on every already-existing object.
    pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$RESTORE_DATABASE_URL" "$DUMP_FILE"
    echo "[restore] done. This is a mechanical restore only - verify real row counts and spot-check actual data before treating a drill as passed."
    ;;

  uploads)
    : "${RESTORE_UPLOADS_DIR:?RESTORE_UPLOADS_DIR must be set - a scratch directory, never the live uploads volume}"
    if [ "$RESTORE_UPLOADS_DIR" = "${UPLOADS_DIR:-}" ] && [ "${RESTORE_CONFIRM:-}" != "RESTORE INTO PRODUCTION" ]; then
      echo "[restore] FATAL: RESTORE_UPLOADS_DIR matches the live UPLOADS_DIR. Refusing to overwrite production. Set RESTORE_CONFIRM='RESTORE INTO PRODUCTION' only for a real, deliberate disaster-recovery restore." >&2
      exit 1
    fi
    mkdir -p "$RESTORE_UPLOADS_DIR"
    echo "[restore] restoring snapshot '$SNAPSHOT' (tag:uploads) to $RESTORE_UPLOADS_DIR..."
    restic restore "$SNAPSHOT" --host "$HOST_TAG" --tag uploads --target "$RESTORE_UPLOADS_DIR"
    echo "[restore] done."
    ;;

  *)
    usage
    ;;
esac
