# AGENTS.md — MyMA Developer Guide

Repository rules and conventions for humans and AI agents working in this repo.

## TL;DR

- **Monorepo**: pnpm + turborepo. Packages under `packages/*`, apps under
  `apps/*`, the VPS agent in `agent/`, infrastructure in `infra/`.
- **Language**: TypeScript, `strict: true` everywhere.
- **Contracts live in `packages/types`** (entities, enums, DTOs) and
  `packages/validation` (zod). The DB layer (`packages/db`) implements
  repositories against those types. Do not redefine entity shapes ad hoc.
- **Never** commit secrets, `.env`, Moodle source, or runtime data (see
  `.gitignore`).
- **No payment / QRIS / subscriptions / Kubernetes** in this MVP.

## Build & Test

```bash
pnpm install
pnpm build          # typecheck + build all packages
pnpm test           # run all tests
pnpm lint
pnpm typecheck
```

Run a single package: `pnpm --filter @myma/api test`.

## Package Map

| Package | Purpose | Depends on |
|---------|---------|-----------|
| `@myma/types` | domain entities, enums, DTOs, result types | — |
| `@myma/validation` | zod schemas for every input | `@myma/types` |
| `@myma/db` | D1 migrations + repository interfaces/impl | `@myma/types` |
| `@myma/ui` | shared React components | `@myma/types` |
| `@myma/api` | Hono Workers API + services | db, types, validation |
| `@myma/web` | React dashboard | ui, types |
| `@myma/agent` | VPS agent (Node + Hono) | types, validation |

## Conventions

1. **Strict mode** is mandatory; `noUncheckedIndexedAccess` is on.
2. **Handlers vs services**: HTTP handlers are thin; business logic lives in
   services (`StudentService`, `ProvisioningService`, …).
3. **Ids are UUIDv4** (`crypto.randomUUID()`). Timestamps are ISO-8601 UTC
   strings.
4. **Errors** use the envelope `{ error: { code, message, details } }`; map
   domain errors to stable codes in one place.
5. **Idempotency**: provisioning and agent mutations must be safe to retry.
   Use `instance_id`/operation as the idempotency key on the agent.
6. **Tests** for: validation schemas, provisioning state machine, agent signing
   (HMAC + replay), repository queries, and service logic. No test may require a
   live Moodle or Docker — abstract those behind interfaces and use fakes.

## Agent Rules (the VPS agent)

- Expose **only** the explicit operations in `ARCHITECTURE.md` §5.
- **Never** add a generic `POST /exec` or shell-command endpoint.
- Sign/verify every request (HMAC-SHA256 + timestamp + nonce). Replay-window
  300 s.
- Run Docker via a local Unix socket owned by a `myma` group, never an exposed
  TCP socket.

## Secrets & Env

- Worker secrets (Cloudflare API token, agent signing key, R2 keys) → set via
  `wrangler secret put`, never in code or `.env` committed to git.
- VPS `.env` (DB root password, agent key) → created by infra scripts, never
  committed.
- `.env.example` files are safe to commit (no real values).

## Definition of Done

- Type-checks (`pnpm typecheck`), tests pass, no new secrets, docs updated where
  a decision or contract changed (ADR in `docs/`).

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
