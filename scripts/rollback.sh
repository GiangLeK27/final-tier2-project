#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/opt/final-tier2"
COMPOSE_FILE="docker-compose.prod.yml"
PRODUCTION_URL="https://devops20.online"

if [ $# -ne 1 ]; then
  echo "Usage:"
  echo "  bash scripts/rollback.sh docker.io/legiang2090/final-tier2-app:sha-OLD_COMMIT"
  exit 1
fi

TARGET_IMAGE="$1"

cd "$PROJECT_DIR"

if [ ! -f ".env" ]; then
  echo "ERROR: .env file not found in $PROJECT_DIR"
  exit 1
fi

CURRENT_IMAGE="$(grep '^APP_IMAGE=' .env | cut -d '=' -f2-)"

if [ -z "$CURRENT_IMAGE" ]; then
  echo "ERROR: APP_IMAGE not found in .env"
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p rollback-logs

echo "Current image: $CURRENT_IMAGE"
echo "Target rollback image: $TARGET_IMAGE"

echo "$CURRENT_IMAGE" > "rollback-logs/previous-image-$TIMESTAMP.txt"

deploy_image() {
  local image="$1"

  echo "Updating APP_IMAGE to: $image"

  if grep -q "^APP_IMAGE=" .env; then
    sed -i "s|^APP_IMAGE=.*|APP_IMAGE=$image|" .env
  else
    echo "APP_IMAGE=$image" >> .env
  fi

  echo "Pulling image..."
  docker compose -f "$COMPOSE_FILE" pull app

  echo "Recreating application containers..."
  docker compose -f "$COMPOSE_FILE" up -d --scale app=2 --remove-orphans

  echo "Waiting for containers to stabilize..."
  sleep 15

  echo "Current container status:"
  docker compose -f "$COMPOSE_FILE" ps
}

check_production() {
  echo "Checking production health endpoint..."
  curl -fsS "$PRODUCTION_URL/health"

  echo ""
  echo "Checking production database endpoint..."
  curl -fsS "$PRODUCTION_URL/db"

  echo ""
  echo "Production checks passed."
}

echo "Starting rollback..."
deploy_image "$TARGET_IMAGE"

if check_production; then
  echo "Rollback completed successfully."
  echo "Rolled back from:"
  echo "  $CURRENT_IMAGE"
  echo "to:"
  echo "  $TARGET_IMAGE"
else
  echo "Rollback health check failed."
  echo "Restoring previous image: $CURRENT_IMAGE"

  deploy_image "$CURRENT_IMAGE"

  if check_production; then
    echo "Previous image restored successfully."
  else
    echo "CRITICAL: Previous image restoration also failed. Manual investigation required."
  fi

  exit 1
fi