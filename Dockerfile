# syntax=docker/dockerfile:1

# Multi-stage build for a Next.js 16 (App Router, output:"standalone") app with
# Prisma 7. Targets Google Cloud Run on node:24-alpine.
#
# Key constraints honored here:
#  - `output: "standalone"` emits .next/standalone (+ server.js) but does NOT
#    include public/ or .next/static/ — both are copied into the runner manually.
#  - Cloud Run injects PORT (8080). We never hardcode PORT; we only set
#    HOSTNAME=0.0.0.0 so the standalone server binds the right interface
#    (otherwise health checks fail).
#  - `prisma generate` runs at build time (after deps, before next build).
#    `prisma migrate deploy` is NOT run here (no DB at build) — it runs as a
#    separate step (see deploy/cloudbuild.yaml and deploy/README.md).
#  - Alpine needs openssl + libc6-compat for the Prisma engine; the schema
#    already pins binaryTargets to include linux-musl-openssl-3.0.x.

ARG NODE_VERSION=24-alpine

# ---------------------------------------------------------------------------
# Stage 1: deps — install full dependency tree (incl. devDeps).
# devDeps are required at build time: `prisma` (generate) and `tsx`/tailwind
# (build) live there. The runner stage does not carry node_modules at all.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
# libc6-compat + openssl: needed by the Prisma query engine on Alpine/musl.
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# Install deps against the lockfile only, for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2: builder — generate Prisma client, then build Next.js standalone.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the Prisma client (emits the musl/openssl3 engine per binaryTargets).
RUN npx prisma generate

# Disable Next.js telemetry in CI/build images.
ENV NEXT_TELEMETRY_DISABLED=1
# Build produces .next/standalone, .next/static, and leaves public/ in place.
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: runner — minimal production image, non-root.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
# openssl + libc6-compat are required at RUNTIME too: the Prisma engine loads
# them when the server opens a DB connection.
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Bind to all interfaces so Cloud Run health checks reach the server.
# PORT is supplied by Cloud Run (8080) at runtime — do NOT hardcode it.
ENV HOSTNAME=0.0.0.0

# The base node:alpine image already ships a non-root "node" user (uid 1000).
USER node

# Copy the three pieces required by a standalone deployment:
#  1) the standalone server bundle (includes a pruned node_modules + server.js)
#  2) static assets (.next/static) — excluded from standalone output
#  3) public/ — excluded from standalone output
# --chown keeps everything owned by the non-root user.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Documentation only; Cloud Run routes to $PORT regardless of EXPOSE.
EXPOSE 8080

# server.js is emitted at the root of the standalone bundle.
CMD ["node", "server.js"]
