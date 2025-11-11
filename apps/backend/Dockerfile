# syntax=docker/dockerfile:1.6

###
# Builder stage – installs deps, compiles TypeScript, and prepares a production bundle.
###
FROM node:22-bookworm AS builder

WORKDIR /workspace

# Enable pnpm via corepack.
RUN corepack enable

# Avoid interactive prompts inside the container (required by pnpm in non-TTY environments).
ENV CI=true

# Install build prerequisites for native modules (bcrypt, mediasoup, prisma engines, etc.)
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Copy workspace manifests first for efficient caching.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json apps/backend/package.json

# Pre-fetch dependencies for the backend workspace.
RUN pnpm fetch --filter @connect-sdk/backend

# Copy the rest of the repository (needed for build and Prisma schema).
COPY . .

# Install dependencies only for the backend workspace and build the TypeScript output.
RUN pnpm install --filter @connect-sdk/backend --frozen-lockfile --prefer-offline \
 && pnpm --filter @connect-sdk/backend db:generate \
 && pnpm --filter @connect-sdk/backend build \
 && pnpm prune --prod


###
# Runtime stage – minimal image containing only the production build.
###
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# Copy the production bundle from the builder stage.
COPY --from=builder /workspace/apps/backend ./

ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "dist/index.js"]

