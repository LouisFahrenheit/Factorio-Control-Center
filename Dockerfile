# Stage 1: Build everything
FROM node:24-alpine AS builder
WORKDIR /app

# Install dependencies for both root and client
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci
RUN npm ci --prefix client

# Copy the rest of the codebase
COPY . .

# Build both client and server (this uses 'npm run build:all' from root)
RUN npm run build:all

# Stage 2: Production Image
# Using Debian-based image because Factorio headless requires glibc.
FROM node:24-bookworm-slim

# Install xz-utils in case Factorio tarballs use .tar.xz
RUN apt-get update && apt-get install -y xz-utils && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built server and client from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist

# Copy static assets and localization
COPY locale ./locale
COPY public ./public

ENV NODE_ENV=production

# Default web panel port
EXPOSE 80

# Expose default factorio UDP port (for documentation/convenience)
EXPOSE 34197/udp

# Volumes for persistent data
VOLUME ["/app/data", "/app/logs"]

CMD ["node", "dist/main"]
