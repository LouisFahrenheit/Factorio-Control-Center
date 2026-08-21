#!/usr/bin/env bash
set -e

echo "================================================="
echo " Factorio Control Center Installer               "
echo "================================================="
echo

# Require root/sudo for /opt
if [ "$EUID" -ne 0 ]; then
  echo "Please run this script with sudo or as root."
  exit 1
fi

NODE_NEED_INSTALL=0
if ! command -v node >/dev/null 2>&1; then
  NODE_NEED_INSTALL=1
else
  NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
  if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 24 ]; then
    NODE_NEED_INSTALL=1
  fi
fi

if [ "$NODE_NEED_INSTALL" -eq 1 ]; then
  echo "Node.js is missing or version is less than 24. Installing Node.js 24..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
    apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_24.x | bash -
    dnf install -y nodejs
  elif command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_24.x | bash -
    yum install -y nodejs
  else
    echo "ERROR: Unsupported package manager. Please install Node.js 24 manually."
    exit 1
  fi
fi
echo
echo "================================================="
echo " Configure Web Panel Port"
echo "================================================="
echo "Note: Privileged ports (<1024, e.g. 80) require running the panel as root."
read -r -p "Choose port for web panel [1-65535] (default 8080): " PANEL_PORT
PANEL_PORT=${PANEL_PORT:-8080}
if ! [[ "$PANEL_PORT" =~ ^[0-9]+$ ]] || [ "$PANEL_PORT" -lt 1 ] || [ "$PANEL_PORT" -gt 65535 ]; then
  echo "Invalid port. Using default 8080."
  PANEL_PORT=8080
fi
echo "Using port: $PANEL_PORT"
echo "================================================="
echo

echo "1. Downloading latest release..."
curl -fsSL -o /tmp/fcc.tar.gz "https://github.com/LouisFahrenheit/Factorio-Control-Center/releases/latest/download/factorio-control-center-linux.tar.gz"

echo "2. Extracting to /opt..."
tar -xzf /tmp/fcc.tar.gz -C /opt
rm /tmp/fcc.tar.gz

# Set up .env file
if [ ! -f /opt/factorio-control-center/.env ]; then
  if [ -f /opt/factorio-control-center/.env.example ]; then
    cp /opt/factorio-control-center/.env.example /opt/factorio-control-center/.env
  else
    touch /opt/factorio-control-center/.env
  fi
fi

# Set PORT in .env
sed -i "s/^PORT=.*/PORT=${PANEL_PORT}/" /opt/factorio-control-center/.env
# Handle case if PORT= is commented out or missing
if ! grep -q "^PORT=" /opt/factorio-control-center/.env; then
  if grep -q "^# PORT=" /opt/factorio-control-center/.env; then
    sed -i "s/^# PORT=.*/PORT=${PANEL_PORT}/" /opt/factorio-control-center/.env
  else
    echo "PORT=${PANEL_PORT}" >> /opt/factorio-control-center/.env
  fi
fi

echo
echo "Who will manage the firewall (opening ports for game servers)?"
echo "  1) Factorio Control Center. Panel will run as root."
echo "  2) I will open ports manually. Panel will run as a normal user."
read -r -p "Select option [1-2] (default 1): " FIREWALL_CHOICE

echo
echo "3. Ready! Starting Factorio Control Center..."
cd /opt/factorio-control-center

if [ "$FIREWALL_CHOICE" = "2" ]; then
  if [ -n "$SUDO_USER" ]; then
    echo "Configuring permissions for user $SUDO_USER..."
    chown -R "$SUDO_USER:$SUDO_USER" /opt/factorio-control-center
    sudo -u "$SUDO_USER" bash ./Start.sh
  else
    bash ./Start.sh
  fi
else
  bash ./Start.sh
fi
