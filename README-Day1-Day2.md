# Final Project Tier 2 - Day 1 and Day 2 Starter

This starter implements:

- Day 1: simple web application + production Dockerfile + local Docker test.
- Day 2: Docker Compose with app + PostgreSQL database + Caddy reverse proxy.
- Tier 2 direction: single-server containerized deployment using Docker Compose.

## Day 1 - Run app with Docker

```bash
cp .env.example .env
docker build -t final-tier2-app:day1 .
docker run --rm -p 3000:3000   -e APP_VERSION=day1   -e DATABASE_URL=postgres://finaluser:password@localhost:5432/finaldb   final-tier2-app:day1
```

Open:

```text
http://localhost:3000
http://localhost:3000/health
```

## Day 2 - Run app + database + Caddy with Docker Compose

```bash
cp .env.example .env
docker compose build
docker compose up -d
docker compose ps
```

Open:

```text
http://localhost:8080
http://localhost:8080/health
http://localhost:8080/db
```

## Show persistent volume

```bash
docker volume ls
docker compose down
docker compose up -d
```

The PostgreSQL data remains in the `postgres_data` volume.

## Test service separation

```bash
docker network ls
docker compose exec app wget -qO- http://db:5432 || true
docker compose exec app wget -qO- http://localhost:3000/health
```

## Prepare production server

On Ubuntu cloud server:

```bash
chmod +x scripts/setup-server.sh
./scripts/setup-server.sh
```

Copy these files to `/opt/final-tier2` on the server:

```text
docker-compose.prod.yml
Caddyfile.prod
.env
```

Edit `.env`:

```env
APP_IMAGE=your-dockerhub-username/final-tier2-app:commit-sha
APP_VERSION=commit-sha
POSTGRES_DB=finaldb
POSTGRES_USER=finaluser
POSTGRES_PASSWORD=strong_password
```

Edit `Caddyfile.prod` and replace:

```text
your-domain.com
```

with your real domain.

Then run:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

## Evidence to capture for report

- `docker build` success screenshot.
- `docker run` or `docker compose up -d` screenshot.
- Browser showing local app.
- Browser showing `/health`.
- Browser showing `/db`.
- `docker compose ps`.
- `docker volume ls`.
- `docker network ls`.
- In production: domain and HTTPS screenshot after DNS is configured.
