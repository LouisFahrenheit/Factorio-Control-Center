[English](Standalone-Setup) | [Русский](Standalone-Setup-RU)

---

# Standalone Setup

<p align="center">
  <img src="https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docs/images/install_banner.svg" alt="FCC Standalone Setup">
</p>

Installation and setup for Factorio Control Center (FCC) directly on Windows and Linux (without Docker).

<p align="center">
  <a href="https://github.com/LouisFahrenheit/Factorio-Control-Center/releases/latest/download/factorio-control-center-win.zip"><img src="https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docs/images/download_windows.svg" height="60" alt="Download for Windows"></a>
  &nbsp;&nbsp;
  <a href="https://github.com/LouisFahrenheit/Factorio-Control-Center/releases/latest/download/factorio-control-center-linux.tar.gz"><img src="https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docs/images/download_linux.svg" height="60" alt="Download for Linux"></a>
</p>

---

## Prerequisites

- **Operating System:**
  - Windows 10, 11, or Windows Server 2016+
  - Linux with `systemd` (Ubuntu 20.04+, Debian 11+, CentOS/RHEL 8+)
- **Runtime:**
  - [Node.js 24](https://nodejs.org/)

---

## Windows Installation

1. Open the [Releases page](https://github.com/LouisFahrenheit/Factorio-Control-Center/releases) or use the button above to download `factorio-control-center-win.zip`.
2. Extract the archive into a permanent directory (for example, `C:\FactorioControlCenter`).
3. Run **`Start.bat`**.
4. In the text menu:
   - Select **`1. Start panel`**.
5. Open your browser and go to `http://127.0.0.1:8080/` (or `http://<your-server-ip>:8080/` for remote access).
6. Complete the initial wizard to create the administrator account.

---

## Linux Installation

### Option 1: Automated Shell Script

Run the following command in your terminal:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/install.sh)"
```

The script verifies system dependencies, downloads the latest archive, extracts it to `/opt/factorio-control-center`, and launches the interactive menu.

### Option 2: Manual Installation

1. Download the release archive using the button above or wget:
   ```bash
   cd /opt
   sudo wget https://github.com/LouisFahrenheit/Factorio-Control-Center/releases/latest/download/factorio-control-center-linux.tar.gz
   ```
2. Unpack the files:
   ```bash
   sudo tar -xzf factorio-control-center-linux.tar.gz
   cd /opt/factorio-control-center
   ```
3. Set executable permissions and launch:
   ```bash
   sudo chmod +x Start.sh
   sudo ./Start.sh
   ```
4. Select **`1. Start panel`**.
5. Open `http://127.0.0.1:8080/` (or `http://<your-server-ip>:8080/` for remote access) in your browser.

---

## Autostart Configuration (System Services)

To keep FCC running in the background and ensure it starts automatically when the system boots:

### Windows Service
1. Run **`Start.bat`** as Administrator.
2. Select menu option **`3. Install service`**.
3. Manage the service directly from the **`Start.bat`** menu:
   - **`5. Start service`**
   - **`6. Stop service`**
   - **`4. Remove service`**
   *(Standard management via `services.msc` under **Factorio Control Center** is also supported).*

### Linux systemd Service
1. Run **`Start.sh`** (with `sudo` for a system-wide service or as the current user).
2. Select menu option **`3. Install service`**.
3. Manage the service directly from the **`Start.sh`** menu:
   - **`5. Start service`**
   - **`6. Stop service`**
   - **`4. Remove service`**
   *(Standard management via the `systemctl` command is also supported).*

---

## Updating the Panel

> [!NOTE]
> All configuration files, databases, and server files in `data/` and `logs/` are preserved during updates.

### Method 1: Start Menu (Windows and Linux)
Launch **`Start.bat`** or **`./Start.sh`** and select:
- **`7. Update panel`**

### Method 2: Terminal (Linux)
```bash
cd /opt/factorio-control-center
sudo ./scripts/update-panel.sh
```

---

## Next Steps

To configure network interfaces, firewall rules, or security tokens, review **[General Configuration](General-Configuration)**.
