#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/opt/final-tier2"
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"

echo "========================================"
echo "Final Tier 2 Server Provisioning Script"
echo "========================================"

echo "[1/8] Updating apt package index..."
sudo apt update

echo "[2/8] Installing base system packages..."
sudo apt install -y \
  ca-certificates \
  curl \
  gnupg \
  git \
  ufw \
  rsync \
  nano \
  jq \
  unzip

echo "[3/8] Installing Docker if missing..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
else
  echo "Docker is already installed."
fi

echo "[4/8] Enabling Docker service..."
sudo systemctl enable docker
sudo systemctl start docker

echo "[5/8] Adding user ${DEPLOY_USER} to docker group..."
if id "${DEPLOY_USER}" >/dev/null 2>&1; then
  sudo usermod -aG docker "${DEPLOY_USER}"
else
  echo "WARNING: user ${DEPLOY_USER} does not exist. Skipping docker group update."
fi

echo "[6/8] Configuring firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "[7/8] Creating production project directory..."
sudo mkdir -p "${PROJECT_DIR}"
sudo chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${PROJECT_DIR}"

echo "[8/8] Verifying installation..."
docker --version
docker compose version || true
sudo ufw status verbose

echo "========================================"
echo "Provisioning completed successfully."
echo "IMPORTANT: log out and SSH back in if docker permission was just added."
echo "Production directory: ${PROJECT_DIR}"
echo "========================================"