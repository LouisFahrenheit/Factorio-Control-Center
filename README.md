<p align="center">
  <img src="docs/images/logo.svg" alt="Factorio Control Center">
</p>

<p align="center">
  <a href="#features"><img src="docs/images/menu_features.svg" alt="Features"></a> &nbsp;
  <a href="#requirements"><img src="docs/images/menu_requirements.svg" alt="Requirements"></a> &nbsp;
  <a href="#install-and-run"><img src="docs/images/menu_install.svg" alt="Install and run"></a> &nbsp;
  <a href="#development"><img src="docs/images/menu_development.svg" alt="Development"></a>
</p>

Web panel for managing Factorio dedicated servers. Install on
your PC or VPS - add servers and manage everything from one place.

<p align="center">
  <img src="docs/images/01_server_list.png" width="49%">
  <img src="docs/images/02_server_control.png" width="49%">
  <img src="docs/images/03_mods.png" width="49%">
  <img src="docs/images/04_map_generator.png" width="49%">
</p>

<p align="center">
  <a href="README.ru.md"><img src="docs/images/badge_ru.svg" alt="Русский"></a> &nbsp;
  <a href="TRANSLATING.md"><img src="docs/images/badge_translate.svg" alt="Translations"></a> &nbsp;
  <img src="docs/images/badge_ai.svg" alt="AI Assisted">
</p>

<h2 id="features"><img src="docs/images/features_banner.svg" alt="FCC Features"></h2>

**Server**

- Start, stop, and restart
- Server log and history
- RCON console
- Server updates via the official API
- Multiple servers in one panel
- Automatic setup for a new server
- Protection against accidental updates

**Saves**

- Save management: list, upload, download, delete, rename, copy
- Built-in map generator with all in-game settings
- `.fcc` presets - save generator settings, export a file, and share it

**Mods**

- Enable and disable mods, change versions
- Download and update mods from the Factorio mod portal
- Upload mods from disk
- Import mods from a save
- Automatic dependency resolution
- Built-in mod settings editor
- `.fcc` modpacks - export, share, and import on another panel; mods download from the portal; you can also copy the modpack folder directly
- Symlink support for modpacks

**Players and moderation**

- Who is online, uptime, and server stats
- Chat log and sending messages to players
- Full moderation tools
- Admin, ban, and whitelist lists; optionally shared across all servers
- In-game announcements

**Settings and commands**

- Edit `server-settings.json` in the UI
- Built-in RCON command catalog and editor
- Scheduled server and mod updates - weekly, with timezone support
- Shared Factorio portal username and token for all servers

**Access and UI**

- Roles: administrator, server engineer, moderator - per-tab and per-server permissions
- Full desktop UI and a simplified mobile view
- English and Russian UI
- Several themes - all dark.

<h2 id="requirements"><img src="docs/images/requirements_banner.svg" alt="FCC Requirements"></h2>

- **OS:** Windows 10+ or Linux (systemd)
- **[Node.js 24+](https://nodejs.org/)**
- **Factorio dedicated server** - already on disk, or download via the panel when creating a server
- **[Factorio account](https://factorio.com/profile)** - needed to download / update the server and fetch mods from `mods.factorio.com`

  Set **Username** and **Token** under **Settings → Global username / Global token**.
  Without them you can still run a manually installed server, but portal downloads
  and in-panel updates will not work.

<h2 id="install-and-run"><img src="docs/images/install_banner.svg" alt="FCC Install and run"></h2>


<p align="center">
  <a href="https://github.com/LouisFahrenheit/Factorio-Control-Center/releases/latest/download/factorio-control-center-win.zip"><img src="docs/images/download_windows.svg" height="60" alt="Download for Windows"></a>
  &nbsp;&nbsp;
  <a href="https://github.com/LouisFahrenheit/Factorio-Control-Center/releases/latest/download/factorio-control-center-linux.tar.gz"><img src="docs/images/download_linux.svg" height="60" alt="Download for Linux"></a>
</p>

1. Download the release from GitHub Releases.
   - **Windows** - unpack and run **`Start.bat`**.
   - **Linux** - **Quick start**:
     ```bash
     bash -c "$(curl -fsSL https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/install.sh)"
     ```
     Or manual install: download `factorio-control-center-linux.tar.gz` to `/opt`, then:

     ```bash
     cd /opt && sudo tar -xzf factorio-control-center-linux.tar.gz && cd /opt/factorio-control-center && sudo chmod +x Start.sh && sudo ./Start.sh
     ```

2. In the menu - **1. Start panel**, open the URL from the output: `http://127.0.0.1/` on your PC, `http://server_IP/` on a VPS (port - shown in the menu).
3. Log in: `admin` / `admin` - change the password right away.

### Autostart (Service Installation)

You can configure the panel to start automatically when your system boots. In the main menu, select **3. Install service**. 

- **Windows:** Run **`Start.bat` as Administrator** before installing the service.
- **Linux:** If you run the panel as `root`, it installs a system-wide service. If you run it as a normal user, it installs a user service.

**Note for Linux user services:** To ensure the panel starts at boot without requiring you to log in, enable lingering for your user:

```bash
sudo loginctl enable-linger $USER
```

**Firewall:** Factorio's UDP port opens automatically only when running as admin/root - otherwise set it up yourself.

**Panel ports:**

- **Auto** - on Linux without root: **8080** (HTTP) or **8443** (HTTPS); otherwise **80** / **443**
- **Custom** - your port in settings or `fcc-settings.ini` (`port_mode=custom`, `listen_port=…`)

The start menu shows the URL to open.

<h2 id="development"><img src="docs/images/development_banner.svg" alt="FCC Development"></h2>

Use **`StartDEV.bat`** or **`StartDEV.sh`** - dev/prod run, build, pack release.

```bash
git clone https://github.com/LouisFahrenheit/Factorio-Control-Center.git
cd Factorio-Control-Center
```

Or manually:

```bash
npm install
npm install --prefix client
npm run start:dev      # API
npm run client:dev     # UI → http://127.0.0.1:5173/login
```

Local release build: `npm run pack:release` → `release/factorio-control-center-win.zip` and `release/factorio-control-center-linux.tar.gz`.

## Security

Do not publish or commit `fcc-settings.ini`, `data/`, tokens, or TLS keys.
