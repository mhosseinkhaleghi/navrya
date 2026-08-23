---
name: navrya-deployment
description: Deploy verified NAVRYA staging or production revisions using GitHub Actions, Docker Compose, and Caddy. Use for staging, production, server, Docker, DNS, Caddy, GitHub Actions, release, rollback, or deployment troubleshooting tasks.
---

# NAVRYA Deployment

GitHub Actions owns releases. Caddy is an application container, not a Git deployment tool.

## Environments

| Environment | Branch | Trigger | Host configuration |
| --- | --- | --- | --- |
| Production | `main` | Explicit guarded promotion from `dev` | `APP_HOST=app.navrya.com`, `ADMIN_HOST=admin.navrya.com` |
| Staging | `staging` | Explicit guarded promotion from `dev` | `APP_HOST=staging.navrya.com`, `ADMIN_HOST=admin.staging.navrya.com` |

Use a separate staging server. It prevents port 80/443, Docker volume, database, upload, and Caddy certificate conflicts with production. Do not run both environments on one host with the current Compose file.

## Release paths

Production:

```text
task branch -> scripts/push-to-dev.sh -> verify dev
explicit "publish production" -> scripts/promote-dev-to-production.sh -> main -> deploy main
```

Staging:

```text
explicit "publish staging" -> scripts/promote-dev-to-staging.sh -> deploy staging
```

`staging` and `main` are separately publishable snapshots. A `dev` push only verifies integration work. Never infer an environment release from "push to site", "deploy", or an equivalent ambiguous request: ask the user to choose `dev`, `staging`, or `production`.

## Deployment behavior

The deployment workflow checks out the requested branch at `/opt/navrya`, resets only application source to `origin/<branch>`, builds `docker-compose.production.yml`, runs migrations, and starts the stack. It does not replace the server `.env`, PostgreSQL volume, uploads volume, or Caddy certificate volumes.

`deploy/Caddyfile` terminates TLS, serves the built static client, proxies AI API routes to `pattern-ai`, and proxies remaining API/uploads routes to `community-api`. It uses `APP_HOST` and `ADMIN_HOST` from the server `.env` so one image supports either environment.

## First-time staging setup and memory

An explicit user request to "set up staging" or "publish staging" authorizes the staging setup when it does not already exist. Treat it as an implementation task, not a request for generic instructions.

1. Inspect the available authenticated server, DNS, and GitHub connections and confirm whether a separate staging host, staging DNS records, repository secrets, and `STAGING_DEPLOY_ENABLED=true` already exist.
2. If absent and the connection allows it, provision or select a separate server; install or verify Git, Docker Engine, Docker Compose, and ports 80/443; clone the repo to `/opt/navrya`; and create a staging-only `.env` with distinct secrets and staging hostnames.
3. Create the DNS A records for `staging.navrya.com` and `admin.staging.navrya.com`, pointed at the staging server. Configure the named staging GitHub secrets and deployment variable through the connected GitHub account.
4. Run the guarded staging promotion, wait for the workflow, and verify both HTTPS hosts and Caddy TLS before reporting success.
5. Record only verified, non-secret operational facts in `HANDOFF.md`: staging URLs, branch/revision, server role or approved alias, Actions result, current blocker, and next action. Never record tokens, private keys, passwords, full `.env` values, or secret host credentials.

If an action cannot be completed, first use every available authenticated connection. Then give the user one exact blocker: the missing account access, permission, server value, or DNS action, plus the precise next check the agent will perform after it is supplied. Do not replace implementation with a vague setup checklist.

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
- Never deploy a task branch directly or publish an environment without the explicit user request.
- Never use `git reset --hard` outside the workflow's scoped application checkout.
- Do not change Caddy or restart containers manually for an ordinary release.

## References

- `DEPLOYMENT.md` for server bootstrap and production secrets.
- `.github/workflows/verify-dev.yml`, `deploy.yml`, and `deploy-staging.yml` for executable policy.
- `docker-compose.production.yml`, `Dockerfile`, and `deploy/Caddyfile` for runtime behavior.
- `docs/ai/realtime-deployment.md` for Voice-specific deployment constraints.
