# @myma/agent — MyMA VPS Agent

The MyMA VPS Agent runs on every VPS node and exposes an authenticated,
explicit API for Moodle-instance lifecycle operations.

It is a **Node + Hono** service. It is **not** a Cloudflare Worker.

## How provisioning works

1. The control plane calls `POST /v1/instances` with the instance contract.
2. The agent validates the request, writes the rendered `.env` and `compose.yml`
   from the canonical template at `MYMA_COMPOSE_TEMPLATE`, and creates a
   per-instance database/user in the shared MariaDB.
3. The agent checks out the requested Moodle source into
   `$MYMA_INSTANCES_DIR/<docker_project>/moodle`.
4. The agent starts the project's Compose stack and runs the containerised
   one-shot installer (`/usr/local/bin/install-moodle.sh`) inside the Moodle
   container.

All per-instance secrets live in the rendered `.env` file. `compose.yml` only
contains non-secret placeholders.

## Auth scheme

Every request (except `GET /v1/health`) must be signed with HMAC-SHA256 using
a shared secret configured on the agent.

Headers:

- `X-Myma-Key-Id: <key id>`
- `X-Myma-Timestamp: <unix seconds>`
- `X-Myma-Nonce: <128-bit random, base64url>`
- `X-Myma-Signature: <hex hmac>`

Canonical string:

```text
METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + NONCE + "\n" + SHA256(BODY)
```

`SHA256(BODY)` is the lowercase hex digest of the raw request body (empty string
for requests without a body). The signature is the lowercase hex HMAC-SHA256 of
the canonical string with the agent key.

The agent verifies:

- all headers are present
- the timestamp is within ±300 s
- the nonce has not been used before
- the signature matches the configured `AGENT_KEY_ID`
- per-key-id rate limits (60 req/min default)

## Endpoints

Base path: `/v1`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/v1/health` | no | liveness probe |
| POST | `/v1/instances` | yes | idempotent create + provision |
| GET | `/v1/instances/:id/status` | yes | |
| POST | `/v1/instances/:id/start` | yes | |
| POST | `/v1/instances/:id/stop` | yes | |
| POST | `/v1/instances/:id/restart` | yes | |
| POST | `/v1/instances/:id/reset` | yes | backup → wipe → reinstall |
| POST | `/v1/instances/:id/delete` | yes | remove project, volumes, DB |
| POST | `/v1/instances/:id/backup` | yes | returns `{ backup_id, size }` |
| POST | `/v1/instances/:id/restore` | yes | |
| GET | `/v1/instances/:id/metrics` | yes | |

There is no generic command endpoint; `POST /exec` does not exist.

## Configuration

Copy `.env.example` to `.env` and set real values. Required for real operation:

- `AGENT_KEY_ID` & `AGENT_KEY` — HMAC credentials shared with the Worker
- `MYMA_INSTANCES_DIR` — working directory for instances (`/opt/myma/instances`)
- `MYMA_COMPOSE_TEMPLATE` — path to `infra/moodle/compose.template.yml`
- `MARIADB_HOST`, `MARIADB_PORT`, `MARIADB_ROOT_USER`, `MARIADB_ROOT_PASSWORD`
- `REDIS_HOST`, `REDIS_PORT`

`MYMA_AGENT_PORT` defaults to `3000`.

## Running

```bash
pnpm install
pnpm --filter @myma/agent typecheck
pnpm --filter @myma/agent test
pnpm --filter @myma/agent dev
pnpm --filter @myma/agent build   # emits dist/index.js via tsup
```

## Security

- The Docker daemon socket is never exposed over the network.
- The agent uses the local `docker` CLI, which talks to the local Unix socket.
- Secrets are never returned in responses or written to logs.
- `docker_project` / `database_name` values are derived strictly from validated
  input and passed to CLI tools as array arguments.
