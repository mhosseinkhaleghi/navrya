---
name: navrya-deployment
description: Deploy verified NAVRYA staging or production revisions using GitHub Actions, Docker Compose, and Caddy. Use for staging, production, server, Docker, DNS, Caddy, GitHub Actions, release, rollback, or deployment troubleshooting tasks.
---

# NAVRYA Deployment

GitHub Actions owns releases. Caddy is an application container, not a Git deployment tool.

## Environments

| Environment | Branch | Trigger | Host configuration |
| --- | --- | --- | --- |
| Production | `main` | Verified `dev` promotion | `APP_HOST=app.navrya.com`, `ADMIN_HOST=admin.navrya.com` |
| Staging | `staging` | Guarded promotion from `dev` | `APP_HOST=staging.navrya.com`, `ADMIN_HOST=admin.staging.navrya.com` |

Use a separate staging server. It prevents port 80/443, Docker volume, database, upload, and Caddy certificate conflicts with production. Do not run both environments on one host with the current Compose file.

## Release paths

Production:

```text
task branch -> scripts/push-to-dev.sh -> verify dev -> main -> deploy main
```

Staging:

```text
verified dev -> scripts/promote-dev-to-staging.sh -> deploy staging
```

`staging` is a separately publishable snapshot, not a quality gate before the current automatic `dev -> main` production promotion. Changing that policy requires an explicit workflow redesign.

## Deployment behavior

The deployment workflow checks out the requested branch at `/opt/navrya`, resets only application source to `origin/<branch>`, builds `docker-compose.production.yml`, runs migrations, and starts the stack. It does not replace the server `.env`, PostgreSQL volume, uploads volume, or Caddy certificate volumes.

`deploy/Caddyfile` terminates TLS, serves the built static client, proxies AI API routes to `pattern-ai`, and proxies remaining API/uploads routes to `community-api`. It uses `APP_HOST` and `ADMIN_HOST` from the server `.env` so one image supports either environment.

## Required GitHub configuration

Production requires `DEPLOY_ENABLED=true` and these repository secrets:

```text
SERVER_HOST
SERVER_PORT
SERVER_USER
SSH_PRIVATE_KEY
SSH_KNOWN_HOSTS
```

Staging requires `STAGING_DEPLOY_ENABLED=true` and distinct staging secrets:

```text
STAGING_SERVER_HOST
STAGING_SERVER_PORT
STAGING_SERVER_USER
STAGING_SSH_PRIVATE_KEY
STAGING_SSH_KNOWN_HOSTS
```

Create DNS A records for `staging.navrya.com` and `admin.staging.navrya.com` to the staging server. On that server, clone to `/opt/navrya`, create an independent `.env` with staging database and authentication secrets, and set the staging host variables above.

## Required release checks

- Confirm the Actions run succeeded before reporting deployment success.
- Run migrations through Compose only. Never run ad-hoc production SQL.
- Never deploy a task branch directly.
- Never use `git reset --hard` outside the workflow's scoped application checkout.
- Do not change Caddy or restart containers manually for an ordinary release.

## References

- `DEPLOYMENT.md` for server bootstrap and production secrets.
- `.github/workflows/promote-dev.yml`, `deploy.yml`, and `deploy-staging.yml` for executable policy.
- `docker-compose.production.yml`, `Dockerfile`, and `deploy/Caddyfile` for runtime behavior.
- `docs/ai/realtime-deployment.md` for Voice-specific deployment constraints.
