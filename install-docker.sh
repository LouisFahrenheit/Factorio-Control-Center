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

# (Git is no longer required because we just download the compose file using curl)

# 2. Install Docker if missing
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Installing..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sh get-docker.sh
  rm get-docker.sh
fi

# 3. Check for docker-compose or docker compose plugin
COMPOSE_CMD="docker compose"
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
  else
    echo "Docker Compose not found. Installing..."
    if command -v apt-get >/dev/null 2>&1; then
      apt-get install -y docker-compose-plugin || apt-get install -y docker-compose
    else
      echo "ERROR: Please install docker-compose manually."
      exit 1
    fi
  fi
fi

echo "1. Downloading docker-compose.yml to /opt/factorio-control-center..."
mkdir -p /opt/factorio-control-center
cd /opt/factorio-control-center
curl -fsSL -o docker-compose.yml https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docker-compose.yml

echo "2. Starting Docker container..."
$COMPOSE_CMD up -d

echo
echo "================================================="
echo " Installation Complete!"
echo " The panel is now running in Docker."
echo " Open http://<YOUR_SERVER_IP>:8080/ in your browser"
echo " Default login: admin / admin"
echo "================================================="
