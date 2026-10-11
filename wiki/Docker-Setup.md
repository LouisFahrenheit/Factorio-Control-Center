[English](Docker-Setup) | [Русский](Docker-Setup-RU)

---

# Docker Setup

<p align="center">
  <img src="https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docs/images/docker_banner.svg" alt="FCC Docker Setup">
</p>

Installation and setup for Factorio Control Center (FCC) using Docker Compose.

---

## Prerequisites

- **Docker:** Docker Engine 20.10+ and Docker Compose v2+.
- Node.js is bundled inside the container image and does not need to be installed on the host.

---

## Installation Methods

### Option 1: Automated Script

To install Docker (if missing), fetch `docker-compose.yml`, pull the container image, and start the service in one command:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/install-docker.sh)"
```

Once execution finishes, navigate to `http://127.0.0.1:8080/` (or `http://<your-server-ip>:8080/` for remote access).

### Option 2: Manual Setup

1. Create a directory (for example, `/opt/factorio-control-center`) and place `docker-compose.yml` inside:

```yaml
services:
  factorio-control-center:
    image: ghcr.io/louisfahrenheit/factorio-control-center:latest
    container_name: factorio-control-center
    restart: unless-stopped
    ports:
      - "8080:8080"
      - "34197-34207:34197-34207/udp"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
      # Optional automated admin account initialization:
      # - FCC_ADMIN_USER=admin
      # - FCC_ADMIN_PASSWORD=your_password
```

2. Start the container:
```bash
docker compose up -d
```

3. Open `http://127.0.0.1:8080/` (or `http://<your-server-ip>:8080/` for remote access) in your browser.

---

## Docker-Specific Configuration

### 1. Autostart Configuration
The container autostart behavior is managed by the `restart: unless-stopped` directive in `docker-compose.yml`. This instructs the Docker daemon to automatically start the container when the operating system boots.

### 2. Volume Storage and Persistence Rule
By default, the compose file maps two persistent directories:
- `./data` -> `/app/data` (stores databases, settings, and Factorio server files)
- `./logs` -> `/app/logs` (stores application logs)

> [!CAUTION]
> **Server Path Rule:**  
> When creating or registering a Factorio server instance in the web panel, the installation path must be placed inside the `/app/data` hierarchy (for example, `/app/data/servers/my_server`).  
> If an instance is saved outside `/app/data` (such as in `/opt/factorio` or `/home`), files exist only in the temporary container overlay and will be lost when the container is updated or recreated.

If you store server data on a separate filesystem mount (for example, `/mnt/ssd/servers`), add a volume mapping in `docker-compose.yml`:
```yaml
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - /mnt/ssd/servers:/servers
```

### 3. Port Mapping
- **Web Interface:** Port `8080` (TCP).
- **Game Traffic:** UDP ports `34197-34207` are mapped to support up to 11 concurrent Factorio servers. To run additional servers, extend the port range in `docker-compose.yml`.
- Direct host networking can also be used on Linux by specifying `network_mode: host`.

### 4. Automated Administrator Creation
To bypass the browser-based initial setup wizard in automated environments, uncomment the environment variables in `docker-compose.yml`:
```yaml
    environment:
      - FCC_ADMIN_USER=admin
      - FCC_ADMIN_PASSWORD=your_secure_password
```

---

## Updating FCC in Docker

To update to the latest image without losing data:

```bash
cd /opt/factorio-control-center
docker compose pull
docker compose up -d
```

---

## Next Steps

To configure environment overrides, network options, security tokens, or Factorio account credentials, review **[General Configuration](General-Configuration)**.
