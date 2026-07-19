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

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Installing Node.js 24..."
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

echo "1. Downloading latest release..."
curl -fsSL -o /tmp/fcc.tar.gz "https://github.com/LouisFahrenheit/Factorio-Control-Center/releases/latest/download/factorio-control-center-linux.tar.gz"

echo "2. Extracting to /opt..."
tar -xzf /tmp/fcc.tar.gz -C /opt
rm /tmp/fcc.tar.gz

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
