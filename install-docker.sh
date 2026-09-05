#!/usr/bin/env bash
set -e

echo "================================================="
echo " Factorio Control Center - Docker Installer      "
echo "================================================="
echo

# Require root/sudo for /opt and installing Docker
if [ "$EUID" -ne 0 ]; then
  echo "Please run this script with sudo or as root."
  exit 1
fi

# Install Docker if missing or daemon not running
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "Docker not found or not running. Installing..."

  apt-get update -y
  apt-get install -y ca-certificates curl gnupg

  # Add Docker's official GPG key
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  # Add Docker's official apt repository
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

  systemctl enable docker
  systemctl start docker

  echo "Docker installed successfully."
fi

# Verify docker compose plugin is available
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin not found. Installing..."
  apt-get update -y
  if ! apt-get install -y docker-compose-plugin; then
    echo "Downloading standalone docker-compose binary..."
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
  fi
fi

echo "Configure web panel port..."
read -r -p "Choose port for web panel [1-65535] (default 8080): " PANEL_PORT
PANEL_PORT=${PANEL_PORT:-8080}
if ! [[ "$PANEL_PORT" =~ ^[0-9]+$ ]] || [ "$PANEL_PORT" -lt 1 ] || [ "$PANEL_PORT" -gt 65535 ]; then
  echo "Invalid port. Using default 8080."
  PANEL_PORT=8080
fi
echo

echo "1. Downloading docker-compose.yml to /opt/factorio-control-center..."
mkdir -p /opt/factorio-control-center
cd /opt/factorio-control-center
curl -fsSL -o docker-compose.yml https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docker-compose.yml

# Apply the custom port to docker-compose.yml
sed -i "s/8080:8080\/tcp/${PANEL_PORT}:8080\/tcp/" docker-compose.yml

echo "2. Starting Docker container..."
docker compose up -d

# Detect server IP
SERVER_IP=$(curl -sS --connect-timeout 2 https://api.ipify.org 2>/dev/null || true)
if [[ -z "$SERVER_IP" ]]; then
  SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
fi
if [[ -z "$SERVER_IP" ]]; then
  SERVER_IP="<YOUR_SERVER_IP>"
fi

echo
echo "================================================="
echo " Installation Complete!"
echo " The panel is now running in Docker."
echo " Open http://${SERVER_IP}:${PANEL_PORT}/ in your browser"
echo " Default login: admin / admin"
echo "================================================="

