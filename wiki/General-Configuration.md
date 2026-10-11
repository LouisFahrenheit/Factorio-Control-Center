[English](General-Configuration) | [Русский](General-Configuration-RU)

---

# General Configuration

<p align="center">
  <img src="https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docs/images/configuration_banner.svg" alt="FCC Configuration">
</p>

Configuration options for Factorio Control Center (FCC): environment variables, network ports, firewall rules, and security tokens.

---

## Configuration Precedence

1. **Environment Variables (`.env` or container environment):**
   - Values set here override settings in the database and disable edits to those fields in the web interface.
   - Requires an application restart to take effect.
2. **Database Settings (Web UI):**
   - Managed directly through the panel under **Settings** without requiring application restarts.

---

## Environment Variables Reference

| Variable | Default | Description |
| :--- | :--- | :--- |
| `HOST` | `0.0.0.0` | IP interface to bind the web server to. |
| `PORT` | `8080` | Port for the web interface to listen on. |
| `PUBLIC_HOST` | _Empty_ | Public domain or IP used for shareable links when behind a proxy. |
| `PUBLIC_PORT` | _Empty_ | External port if different from internal `PORT`. |
| `API_TOKEN` | _Random_ | Token for REST API access via `Authorization: Bearer <API_TOKEN>`. |
| `APP_SECRET` | _Auto_ | 64-character encryption secret for protecting sensitive database values. |
| `FCC_ADMIN_USER` | _Empty_ | Username for administrator account creation on first boot. |
| `FCC_ADMIN_PASSWORD` | _Empty_ | Password for administrator account creation on first boot. |
| `TLS_ENABLED` | `false` | Enable built-in HTTPS listener (`true`/`false`). |
| `TLS_CERTFILE` | _Empty_ | Path to SSL certificate file (`.crt` or `.pem`). |
| `TLS_KEYFILE` | _Empty_ | Path to SSL private key file (`.key`). |
| `TLS_KEY_PASSWORD` | _Empty_ | Password for encrypted private key. |
| `TELEGRAM_BOT_TOKEN` | _Empty_ | Telegram bot token from `@BotFather` for alerts. |
| `TELEGRAM_CHAT_ID` | _Empty_ | Telegram chat ID for alert delivery. |
| `DEBUG_LOGS` | `false` | Enables verbose debug logging in application output. |
| `SWAGGER_ENABLED` | `false` | Enables OpenAPI / Swagger UI at `/api/docs`. |

---

## Factorio Account Credentials

To allow FCC to download official server versions and manage mods from `mods.factorio.com`:

1. Log into your profile at [factorio.com/profile](https://factorio.com/profile).
2. Retrieve your **Username** and **Token**.
3. In the FCC panel, navigate to **Settings -> Global Settings**.
4. Set **Global Factorio Username** and **Global Factorio Token**, then click **Save**.

This configuration applies across all server instances managed by the panel.

---

## Network and Firewall

### Port Summary
| Port | Protocol | Usage |
| :--- | :--- | :--- |
| `8080` | TCP | Web panel HTTP interface |
| `8443` | TCP | Web panel HTTPS interface (when TLS is active) |
| `34197` | UDP | Default Factorio game port for server instance 1 |
| `34198-34207` | UDP | Default ports for additional Factorio server instances |

### Firewall Rules
- **Linux (UFW):**
  ```bash
  sudo ufw allow 8080/tcp
  sudo ufw allow 34197:34207/udp
  ```
- **Windows (PowerShell):**
  ```powershell
  New-NetFirewallRule -DisplayName "Factorio Dedicated Servers" -Direction Inbound -LocalPort 34197-34207 -Protocol UDP -Action Allow
  New-NetFirewallRule -DisplayName "Factorio Control Center Panel" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow
  ```

---

## Rate Limiting and Security

FCC includes rate limiting settings for authentication:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `AUTH_MAX_FAILED_ATTEMPTS` | `5` | Failed attempts allowed before lockout. |
| `AUTH_LOCKOUT_MINUTES` | `10` | Lockout duration in minutes. |
| `AUTH_ATTEMPT_WINDOW_MINUTES` | `10` | Time window in minutes to accumulate failed attempts. |

---

## Interface Overrides

Language and theme can be fixed for all users via `.env`:

```env
# Options: 'en', 'ru'
PANEL_LANGUAGE=en

# Options: 'fcc_classic', 'dark_space', 'vulcanus', 'ion_storm', 'cryogenics'
PANEL_THEME=fcc_classic
```
