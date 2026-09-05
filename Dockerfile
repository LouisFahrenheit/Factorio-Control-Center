# Stage 1: Build everything
FROM node:24 AS builder
WORKDIR /app

# Install dependencies for both root and client
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci
RUN npm ci --prefix client

# Copy the rest of the codebase
COPY . .

# Build both client and server
ARG FCC_BUILD_ID=dev
ARG FCC_BUILD_NUMBER
RUN if [ "$FCC_BUILD_ID" != "dev" ]; then sed -i "s/export const APP_BUILD = 'dev';/export const APP_BUILD = '${FCC_BUILD_ID}';/" src/constants/fcc.constants.ts; fi
RUN if [ -n "$FCC_BUILD_NUMBER" ]; then sed -i "s/export const APP_BUILD_NUMBER = [0-9]*;/export const APP_BUILD_NUMBER = ${FCC_BUILD_NUMBER};/" src/constants/fcc.constants.ts; fi
RUN npm run build:all

# Prune dev dependencies to leave only production ones in node_modules
RUN npm prune --omit=dev

# Stage 2: Production Image
# Using Debian-based image because Factorio headless requires glibc.
FROM node:24-bookworm-slim

# Install xz-utils in case Factorio tarballs use .tar.xz
RUN apt-get update && apt-get install -y xz-utils && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy built server and client from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist

# Copy static assets, package.json, env example and localization
COPY package.json .env.example ./
COPY locale ./locale
COPY public ./public

ENV NODE_ENV=production

# Default web panel port
EXPOSE 8080

# Expose default factorio UDP port range
EXPOSE 34197-34207/udp

# Volumes for persistent data
VOLUME ["/app/data", "/app/logs"]

CMD ["node", "dist/main"]
