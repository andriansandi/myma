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
FROM node:20-alpine AS builder
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
FROM node:20-alpine

# Create a non-root runtime user.
RUN addgroup -S myma && adduser -S myma -G myma

WORKDIR /app

# The bundled application and nothing else.
COPY --from=builder --chown=myma:myma /app/agent/dist/index.js ./dist/index.js

USER myma

EXPOSE 3000

CMD ["node", "dist/index.js"]
