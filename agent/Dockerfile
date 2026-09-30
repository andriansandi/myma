# syntax=docker/dockerfile:1.7
# MyMA VPS Agent — production build.
#
# Build context must be the repository root so the Dockerfile can access the
# shared packages (@myma/types, @myma/validation) via pnpm workspaces.
# In Compose:
#   build:
#     context: ../..
#     dockerfile: agent/Dockerfile
#
# tsup bundles all dependencies into a single self-contained ESM file,
# so the final image only needs Node.js and dist/index.js.

# --------------------------------------------------------------------------- #
# Stage 1 — build environment
# --------------------------------------------------------------------------- #
FROM node:22-alpine AS builder
WORKDIR /app

# Enable pnpm via corepack and install workspace deps from lockfile.
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo files required to install workspace dependencies.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY packages/types ./packages/types
COPY packages/validation ./packages/validation
COPY agent ./agent

# Install dependencies respecting the frozen lockfile.
RUN pnpm install --frozen-lockfile

# Bundle the agent into agent/dist/index.js with all deps inlined.
RUN pnpm --filter @myma/agent build

# --------------------------------------------------------------------------- #
# Stage 2 — runtime image
# --------------------------------------------------------------------------- #
FROM node:22-alpine

# Runtime CLI tools the agent shells out to: docker (via the mounted Unix
# socket), mysql/mysqldump (shared MariaDB), git (Moodle checkout).
RUN apk add --no-cache docker-cli mariadb-client git

# Non-root user with uid/gid 1000 to match the host's `myma` group that owns
# the Docker socket (see bootstrap-node.sh daemon.json).
RUN addgroup -g 1000 myma && adduser -u 1000 -G myma -s /bin/sh -D myma

WORKDIR /app

# The bundled application and nothing else.
COPY --from=builder --chown=myma:myma /app/agent/dist/index.js ./dist/index.js

USER myma

EXPOSE 3000

CMD ["node", "dist/index.js"]
