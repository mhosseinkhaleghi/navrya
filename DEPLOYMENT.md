# Navrya production deployment

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

Every push to `main` runs tests and a production build before deploying. The workflow only
replaces the checked-out application source; `.env`, PostgreSQL data, uploads, and Caddy's TLS
state remain on server volumes.
