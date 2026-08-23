# NAVRYA deployment environments

## Production

The production stack exposes:

- `https://app.navrya.com` for the client application.
- `https://admin.navrya.com` for the admin dashboard only.
- The apex `navrya.com` domain and `www` are intentionally not claimed by this project.
- The AI and Community APIs under the same hostnames through Caddy.
- PostgreSQL and uploads only on Docker's private network/volumes.

## DNS

Create these records after the server receives its fixed public IPv4 address:

| Type | Name | Value |
|---|---|---|
| A | `app` | server public IPv4 |
| A | `admin` | server public IPv4 |

Ports 80 and 443 must be reachable. Caddy obtains and renews TLS certificates automatically.

## First server bootstrap

Install Git, Docker Engine, and the Docker Compose plugin. Then clone the public repository to
`/opt/navrya`, copy `.env.production.example` to `.env`, and replace every placeholder with a
secret value. The `.env` file stays only on the server and must never be committed.

Run the migration before starting the full stack:

```sh
docker compose --env-file .env -f docker-compose.production.yml build
docker compose --env-file .env -f docker-compose.production.yml run --rm migrate
docker compose --env-file .env -f docker-compose.production.yml up -d
```

## GitHub Actions secrets

Add these repository Actions secrets:

- `SERVER_HOST`: the fixed public IPv4 address.
- `SERVER_PORT`: normally `22`.
- `SERVER_USER`: the dedicated deployment user.
- `SSH_PRIVATE_KEY`: the dedicated deployment private key.
- `SSH_KNOWN_HOSTS`: the server's pinned SSH host-key line.

After the server bootstrap and secrets are complete, add the repository Actions variable
`DEPLOY_ENABLED=true`. Until then, GitHub still runs tests/builds but safely skips deployment.

Production starts only when a user explicitly requests `publish production` or `push to production`.
The release agent then runs `scripts/promote-dev-to-production.sh` from an up-to-date `dev`
checkout. The workflow only replaces the checked-out application source; `.env`, PostgreSQL data,
uploads, and Caddy's TLS state remain on server volumes.

## Staging

Staging runs the same Docker Compose stack on a separate server from the `staging` branch. It is a
separate deployment snapshot, published only after an explicit `publish staging` or `push to
staging` request. It is not a required gate before production.

Create these DNS records for the staging server:

| Type | Name | Value |
| --- | --- | --- |
| A | `staging` | staging server public IPv4 |
| A | `admin.staging` | staging server public IPv4 |

Clone the repository to `/opt/navrya` on the staging server. Create an independent `.env` with
different database, authentication, and internal secrets. Set:

```text
APP_HOST=staging.navrya.com
ADMIN_HOST=admin.staging.navrya.com
```

Do not place staging on the production host: both Compose stacks bind ports 80/443 and need
independent Caddy, PostgreSQL, and upload volumes.

Add these GitHub Actions secrets and variable:

```text
STAGING_SERVER_HOST
STAGING_SERVER_PORT
STAGING_SERVER_USER
STAGING_SSH_PRIVATE_KEY
STAGING_SSH_KNOWN_HOSTS
STAGING_DEPLOY_ENABLED=true
```

Publish staging only through an explicit user request and:

```sh
git switch dev
git pull --ff-only origin dev
scripts/promote-dev-to-staging.sh
```

The staging workflow tests, builds, migrates, and deploys `staging`. Caddy reads the two hostname
variables from the server `.env`, so the same application image serves either environment.

Publish production only through an explicit user request and:

```sh
git switch dev
git pull --ff-only origin dev
scripts/promote-dev-to-production.sh
```

Do not treat a general "push to site" request as permission to publish an environment. Ask whether
the user means `dev`, `staging`, or `production`.
