[English](Development) | [Русский](Development-RU)

---

# Development

<p align="center">
  <img src="https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docs/images/development_banner.svg" alt="FCC Development">
</p>

Instructions for local development, running tests, and building release packages.

---

## Prerequisites

- [Node.js 24](https://nodejs.org/)
- Git
- C++ build tools (required to compile `better-sqlite3` native bindings):
  - **Windows:** Visual Studio Build Tools (with "Desktop development with C++") or Visual Studio Community
  - **Linux:** `build-essential` (`gcc`, `g++`, `make`) and `python3`


---

## Project Structure

- `src/` — Backend (NestJS, TypeORM, SQLite, WebSockets)
- `client/` — Frontend (React, Vite)
- `locale/` — Localization files (`server_lang_*.json`, `server_commands_*.json`)
- `scripts/` — Packaging and systemd service scripts
- `wiki/` — Documentation source files for GitHub Wiki

---

## Development Setup

The easiest way is using the interactive development launcher:

- **Windows:** Run **`StartDEV.bat`**
- **Linux:** Run **`./StartDEV.sh`**

The launcher can install dependencies, start dev servers, run tests, and pack releases.

### Manual Setup via Terminal

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/LouisFahrenheit/Factorio-Control-Center.git
   cd Factorio-Control-Center
   npm install && npm install --prefix client
   ```

2. Start the backend and frontend in separate terminals:
   ```bash
   # Terminal 1: Backend API (port 8080 with auto-reload)
   npm run start:dev

   # Terminal 2: Frontend UI (Vite dev server on http://127.0.0.1:5173 with HMR)
   npm run client:dev
   ```

3. Open `http://127.0.0.1:5173` in your browser. Vite automatically proxies API and WebSocket requests to port 8080.

---

## API Documentation (Swagger)

FCC has a built-in interactive Swagger UI.

1. Add to your `.env` file:
   ```env
   SWAGGER_ENABLED=true
   ```
2. Open `http://127.0.0.1:8080/api/docs` in your browser.
3. To send protected requests, log in through the web panel or pass `API_TOKEN` configured in `.env`.

---

## Tests and Linting

```bash
# Tests
npm test            # backend unit tests
npm run client:test # frontend unit tests
npm run test:all    # run all tests

# Code quality
npm run lint:check  # backend ESLint check
npm run client:lint # frontend ESLint check
npm run lint        # auto-fix linting issues
npm run format      # format code with Prettier

# Check translation files
npm run locale:check
```

---

## Building and Packaging

### Production Build

```bash
# Build both frontend and backend
npm run build:all

# Run the production build
npm run start:prod
```

### Release Archives

The packaging script creates ready-to-use release archives in the `release/` folder:

```bash
npm run pack:release
```

- Windows: `release/factorio-control-center-win.zip`
- Linux: `release/factorio-control-center-linux.tar.gz`

*(Note: to package Linux releases with native modules from Windows, run the command inside WSL or a Docker container).*

### Building a Custom Docker Image

If you modified the code and want to build your own Docker container:

1. In `docker-compose.yml`, replace `image:` with `build: .`
2. Build and start the container:
   ```bash
   docker compose up -d --build
   ```
