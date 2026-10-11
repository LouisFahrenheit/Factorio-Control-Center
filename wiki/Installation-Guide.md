[English](Installation-Guide) | [Русский](Installation-Guide-RU)

---

# Installation Overview

<p align="center">
  <img src="https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docs/images/requirements_banner.svg" alt="FCC Installation Overview">
</p>

System prerequisites and installation options for Factorio Control Center (FCC): standalone or Docker container.

---

## Installation Options

### 1. Standalone Setup (Windows and Linux)
- **Requirements:**
  - Windows 10+ or Linux with `systemd`
  - [Node.js 24](https://nodejs.org/)
- **Service Integration:** Installs directly as a Windows Service or a Linux systemd unit.

### 2. Docker Setup
- **Requirements:**
  - Docker Engine
  - Docker Compose
- **Service Integration:** Automatic container restart managed via Docker restart policies.

---

## Factorio Requirements

- **Factorio Server:**
  - A pre-installed server is not required prior to installing FCC.
  - When creating a server in the panel, you can either select an existing Factorio server directory on disk or have FCC automatically download and unpack a fresh server installation.
- **Factorio Account:**
  - An account is optional and not required to run FCC or manage local servers.
  - A [factorio.com](https://factorio.com/profile) account with an active game license is required only if you want FCC to automatically download Factorio server builds and updates, or install and update mods from the official Mod Portal.

---

## Next Steps

Select your preferred deployment method to continue:
- **[Standalone Setup Guide](Standalone-Setup)**
- **[Docker Setup Guide](Docker-Setup)**
- After completing installation, review **[General Configuration](General-Configuration)** for network and security options.
