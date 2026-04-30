#!/usr/bin/env bash
set -euo pipefail

sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg git ufw

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi

sudo usermod -aG docker "$USER"

sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

sudo mkdir -p /opt/final-tier2
sudo chown -R "$USER:$USER" /opt/final-tier2

echo "Server setup completed."
echo "Log out and log in again if Docker permission is not active yet."
