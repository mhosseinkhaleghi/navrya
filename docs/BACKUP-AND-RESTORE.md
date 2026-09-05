# Backup & Disaster Recovery

Closes launch-readiness audit finding **P0-1** (`docs/PUBLIC-LAUNCH-READINESS-AUDIT.md`): before
this, NAVRYA had no backup mechanism at all for PostgreSQL or the uploads volume - a single-server
disk failure, an accidental `docker volume rm`, a host compromise, or a bad migration would have
destroyed every user's trades, patterns, strategies, mental-health profiles, screenshots, and
wallet ledgers permanently, with no recovery path whatsoever.

## What is backed up

| Data | Mechanism | Where | Frequency |
|---|---|---|---|
| PostgreSQL (all application data) | `pg_dump --format=custom`, pushed with [restic](https://restic.net) | An off-server, encrypted restic repository (S3/B2/R2/SFTP/rest-server/any restic-supported backend) | Nightly (host cron), configurable |
| Uploads (`uploads_data` volume) | `restic backup` of the mounted directory | Same repository, separate tag | Same nightly run |
| Redis | **Not backed up, by design** | - | - |

Redis holds only disposable state - rate-limit counters, AI-quota counters, Realtime SDP-relay
leases (`server/community/security/rate-limit.mjs`, `realtime-lease-store.mjs`). Losing it
degrades service (rate limits/quotas reset to zero) but never loses user data; backing it up would
add real complexity for no real durability benefit.

## Why restic, not a hand-rolled script

Real encryption at rest, real content-addressed deduplication (so repeated nightly full dumps of a
mostly-unchanged database cost far less storage than they sound like), a real retention/pruning
model (`restic forget --keep-daily/--keep-weekly/--keep-monthly --prune`), and a real integrity
verifier (`restic check`) - reusing an established, widely-audited tool instead of reinventing any
of that, the same principle already applied throughout this codebase (the `cookie` package,
`openid-client`, `argon2`, ...).

## Target RPO / RTO

- **RPO (acceptable data loss window): ≤ 24 hours** with the default nightly schedule. Run the
  `backup` service more often (every 6-12 hours, say) for a tighter RPO - `scripts/backup.sh` is
  safe to run as often as you like.
- **RTO (acceptable recovery time): a few hours** for this single-server topology - restoring a
  `pg_dump --format=custom` file of realistic size plus the uploads archive is normally a
  20-60 minute mechanical operation once a target Postgres instance is reachable; most of the
  window is provisioning a replacement server if the original is gone entirely.

Tighter numbers (near-zero RPO via WAL streaming, near-zero RTO via a hot standby) need a
managed/replicated Postgres service - a materially larger architectural change, and explicitly out
of scope for this fix. The job here is closing "there is currently no backup at all," not building
full database high availability.

## One-time setup (real operator action - cannot be completed from a sandboxed session)

1. **Create a repository on a backend genuinely separate from the NAVRYA production server** -
   that separation is the entire point of "off-server": a bucket/target on different
   infrastructure that a production-host disk failure, host compromise, or `docker volume rm`
   cannot also destroy. Any [restic-supported backend](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html)
   works: an AWS S3 bucket, a Backblaze B2 bucket, a Cloudflare R2 bucket, or an SFTP/`rest-server`
   target on a second machine.
2. **Generate a long, random `RESTIC_PASSWORD`** and store it somewhere durable and independent of
   the production server (a password manager, not a file on the same host). This encrypts the
   entire repository - **losing it makes every existing backup permanently unrecoverable**, and it
   is never derivable from anything else in this repository or on the server.
3. **Add the real values to the server's `.env`** (never committed - see the "Off-server backups"
   section of `.env.production.example` for the full template):
   ```
   RESTIC_REPOSITORY=s3:s3.amazonaws.com/your-bucket-name
   RESTIC_PASSWORD=<the long random value from step 2>
   BACKUP_AWS_ACCESS_KEY_ID=...
   BACKUP_AWS_SECRET_ACCESS_KEY=...
   BACKUP_AWS_DEFAULT_REGION=...
   ```
   Using a backend other than S3-compatible storage? Substitute that backend's own credential env
   vars, and add them to `docker-compose.production.yml`'s `backup` service `environment:` block
   (they are not there today, since they vary by backend).
4. **Install the nightly cron job on the production host** (outside Docker Compose - Compose alone
   has no scheduler, and this repository deliberately avoids adding a second, always-running
   scheduler container just for one nightly job):
   ```
   0 3 * * * cd /opt/navrya && docker compose --env-file .env -f docker-compose.production.yml run --rm -T backup >> /var/log/navrya-backup.log 2>&1
   ```
5. **Run it once by hand and confirm it actually succeeds:**
   ```sh
   docker compose --env-file .env -f docker-compose.production.yml run --rm backup
   ```
6. **Perform a real restore drill (below) before considering any of this done.** A backup that has
   never been restored is a hypothesis, not a guarantee - this is the single most important step
   on this list, not an optional nice-to-have.

## Running a restore drill

Never restore into the live production database or uploads volume as a "test" - always restore
into a scratch target first. `scripts/restore.sh` refuses to do otherwise (see below).

```sh
# List available snapshots
docker compose --env-file .env -f docker-compose.production.yml run --rm backup bash restore.sh list

# Restore the latest PostgreSQL snapshot into a scratch database (never the production one)
docker compose --env-file .env -f docker-compose.production.yml run --rm \
  -e RESTORE_DATABASE_URL=postgres://scratch_user:scratch_pass@scratch-host:5432/scratch_db \
  backup bash restore.sh postgres latest

# Restore the latest uploads snapshot into a scratch directory
docker compose --env-file .env -f docker-compose.production.yml run --rm \
  -e RESTORE_UPLOADS_DIR=/restore-drill \
  -v /tmp/restore-drill:/restore-drill \
  backup bash restore.sh uploads latest
```

Then, by hand: connect to the scratch database and spot-check real row counts and a handful of
actual records; confirm a few restored image files open correctly. **Record the result** (date,
what was checked, how long it took, anything that went wrong) somewhere durable - that record is
what turns "we have backups" into "we have proven we can recover," which is what this audit
finding actually required.

`restore.sh` refuses to target the live production database/uploads volume unless
`RESTORE_CONFIRM='RESTORE INTO PRODUCTION'` is explicitly set alongside a target that matches
production - a genuine disaster-recovery restore, never a drill, is the only time that should ever
be set.

## What this fix does NOT do (honest scope)

- It cannot itself create a real off-server bucket, generate/store a durable `RESTIC_PASSWORD`, or
  install the crontab line - those are real operator actions requiring real infrastructure and
  credentials this session had no access to.
- The actual backup-and-restore round trip against a live PostgreSQL instance and a live restic
  backend has **not** been exercised from this session (no reachable Postgres or object storage
  here). `tests/backup-restore-contract.test.mjs` proves the scripts' fail-closed guards and
  production-restore safeguards actually execute correctly in real bash, without requiring
  `pg_dump`/`restic` to be installed - it does not prove a real backup or restore against real
  infrastructure has ever succeeded. Treat step 6 above as mandatory, not optional, before trusting
  this.
- Point-in-time recovery (restoring to an arbitrary moment between nightly backups, rather than to
  the most recent nightly snapshot) is not supported - only continuous WAL archiving provides that,
  and is out of scope here.
- Redis is intentionally not backed up (see above) - this is a deliberate scope decision, not an
  oversight.
