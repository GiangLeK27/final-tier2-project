#!/usr/bin/env bash
set -euo pipefail

cp -n .env.example .env || true

docker compose build
docker compose up -d

echo "App is starting..."
sleep 5

docker compose ps
echo "Open: http://localhost:8080"
echo "Health: http://localhost:8080/health"
echo "Database check: http://localhost:8080/db"
