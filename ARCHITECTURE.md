# MyMA — Architecture

**My Moodle Manager** · "Your Moodle. Ready in minutes."

A lightweight SaaS control plane for provisioning and managing independent Moodle
instances across Linux VPS nodes. This document is the authoritative technical
contract for the system.

---

## 1. System Shape

```
                          Cloudflare (control plane)
                              │
                ┌─────────────┴─────────────┐
                │                           │
          MyMA Dashboard               Moodle domains
                │                           │
        Cloudflare Pages              Cloudflare DNS (myma.id)
                │                           │
         Cloudflare Worker (Hono)     https://student.myma.id
                │  │
                │  └── D1 (metadata) · R2 (backups)
                │
        MyMA VPS Agent (authenticated, signed)
                │
                ▼
        DigitalOcean VPS (Ubuntu 24.04)
                │
             Docker (Compose project per instance)
                │
        ┌───────┼────────┐
        │       │        │
     Moodle  Moodle    Moodle
       001     002       003   … up to ~50 per node
```

- **Control plane** runs on Cloudflare (Pages + Workers + D1 + R2).
- **Data plane** runs on one or more Linux VPS nodes (DigitalOcean), each running
  Docker and the MyMA Agent.
- The system supports **multiple VPS nodes from day one**; node scheduling is
  manual for MVP with automatic scheduling as a later feature.

---

## 2. Non-Goals (MVP)

Explicitly out of scope for the MVP:

- Payment, QRIS, subscription billing, payment gateways.
- Kubernetes (Docker Compose is sufficient).
- Student self-service portal (admin-only MVP).
- Generic hosting panel features.

---

## 3. Decision Log

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Reverse proxy | **Traefik** | Automatic route discovery via Docker labels — new Moodle instances get HTTPS routing with zero proxy-config edits. Let's Encrypt automation built in. Caddy was considered but its dynamic config via API is more work than Traefik's label-driven model for `N` per-host containers. |
| D2 | PHP runtime | **FrankenPHP classic mode** | Persistent worker mode is unsafe for Moodle and its plugin ecosystem (non-idempotent globals, long-lived state). Classic mode gives us a modern, single-binary PHP 8.x SAPI with HTTP/2, keep-alive, and graceful worker-per-request semantics — without Moodle compatibility risk. |
| D3 | Database topology | **One shared MariaDB per node, one DB per instance** | Per-instance MariaDB containers would consume ~300–400 MB RAM each and defeat the "50 instances per node" goal. A single MariaDB server with strict per-instance DBs + users gives strong isolation at a fraction of the memory cost. |
| D4 | Isolation model | Per-instance: DB, DB user, moodledata volume, hostname, Docker Compose project, resource limits | Logical (DB/user) + filesystem (named volume) + process (container) + network (unique host) isolation. |
| D5 | Agent auth | **HMAC-SHA256 signed requests** + timestamp window + nonce replay protection | Strong, stateless, no shared secrets in the Worker beyond the signing key. Designed so mTLS can be layered on later (D6). |
| D6 | Transport | HTTPS (TLS) now, mTLS as a later hardening step | TLS gives confidentiality + integrity; HMAC gives authentication + replay protection. mTLS adds client-cert identity when the fleet grows. |
| D7 | Identifiers | UUIDv4 (generated via `crypto.randomUUID`) | Global uniqueness across nodes without coordination. |
| D8 | Backup storage | **R2** (metadata stays in D1) | Object storage is the right home for tarballs; D1 holds only `backups` rows. Worker issues presigned upload URLs so R2 credentials never live on the VPS. |
| D9 | DNS authority | Cloudflare (wildcard `*.myma.id`) | Control plane still stores the exact hostname per instance; wildcard is a convenience, not a source of truth. |

---

## 4. Data Model (Cloudflare D1)

UUIDs as `TEXT` primary keys (D1 has no native UUID type). Timestamps as
`TEXT` (ISO-8601 UTC). All tables use soft-delete where a `status` exists.

### `users` (admin auth, minimal for MVP)
```
id            TEXT PK   -- uuid
email         TEXT UNIQUE
name          TEXT
auth_provider TEXT      -- 'clerk' | 'cloudflare_access' | 'auth0' | 'none' | ...
external_id   TEXT      -- provider's user id
role          TEXT      -- 'admin'
created_at    TEXT
updated_at    TEXT
```

### `students`
```
id         TEXT PK
name       TEXT NOT NULL
email      TEXT NOT NULL
status     TEXT NOT NULL   -- 'ACTIVE' | 'SUSPENDED'
created_at TEXT
updated_at TEXT
```

### `vps_nodes`
```
id            TEXT PK
name          TEXT NOT NULL
hostname      TEXT NOT NULL
ip_address    TEXT NOT NULL
agent_url     TEXT NOT NULL   -- e.g. https://agent.<node>.myma.id
agent_key_id TEXT            -- HMAC key id used to select the signing key (not the raw secret)
status        TEXT NOT NULL   -- 'ACTIVE' | 'DRAINING' | 'OFFLINE'
cpu_total     REAL NOT NULL
memory_total  INTEGER NOT NULL  -- bytes
storage_total INTEGER NOT NULL  -- bytes
cpu_used      REAL DEFAULT 0
memory_used   INTEGER DEFAULT 0
storage_used  INTEGER DEFAULT 0
created_at    TEXT
updated_at    TEXT
```

### `instances`
```
id               TEXT PK
student_id       TEXT NOT NULL REFERENCES students(id)
node_id          TEXT NOT NULL REFERENCES vps_nodes(id)
hostname         TEXT NOT NULL UNIQUE
docker_project   TEXT NOT NULL   -- slug, e.g. 'student-a'
moodle_version   TEXT NOT NULL   -- e.g. '4.5.1'
database_name    TEXT NOT NULL
status           TEXT NOT NULL   -- PROVISIONING|ACTIVE|STOPPED|SUSPENDED|FAILED|DELETING|DELETED
cpu_limit        REAL NOT NULL
memory_limit     INTEGER NOT NULL -- bytes
storage_limit    INTEGER NOT NULL -- bytes
storage_used     INTEGER DEFAULT 0
provision_error  TEXT            -- last failure (failed_step + message), for retry
created_at       TEXT
updated_at       TEXT
last_backup_at   TEXT
```

### `instance_resources` (time-series snapshot of usage)
```
id          TEXT PK
instance_id TEXT NOT NULL REFERENCES instances(id)
node_id     TEXT NOT NULL
cpu_usage   REAL
memory_usage INTEGER
storage_usage INTEGER
db_size      INTEGER
recorded_at TEXT NOT NULL
```

### `backups` (metadata only — payload lives in R2)
```
id            TEXT PK
instance_id   TEXT NOT NULL REFERENCES instances(id)
node_id       TEXT NOT NULL
timestamp     TEXT NOT NULL
size          INTEGER          -- bytes
storage_location TEXT NOT NULL -- R2 key
status        TEXT NOT NULL    -- 'RUNNING' | 'COMPLETED' | 'FAILED'
created_at    TEXT
```

### `activity_logs`
```
id          TEXT PK
actor       TEXT NOT NULL    -- user id or 'system'
action      TEXT NOT NULL    -- 'instance.created' | 'instance.provision_completed' | …
instance_id TEXT
node_id     TEXT
status      TEXT NOT NULL    -- 'success' | 'error'
error       TEXT
metadata    TEXT             -- JSON, never secrets
timestamp   TEXT NOT NULL
```

**Secrets policy:** no table stores plaintext secrets. Agent signing keys,
Cloudflare tokens, DB credentials, R2 keys live in Cloudflare Workers secrets /
`.env` on the VPS and are **never** written to D1 or logs.

---

## 5. Agent API Contract

The MyMA Agent runs on each VPS and exposes explicit, authenticated operations.
**There is no arbitrary command execution endpoint.** The agent runs with the
minimum privilege needed to manage Docker (a dedicated `myma` group, no root
shell, no exposed Docker socket).

Base: `https://<agent_url>/v1`

Auth: every request carries
```
X-Myma-Key-Id:   <key id>
X-Myma-Timestamp: <unix seconds>
X-Myma-Nonce:     <random 128-bit, base64url>
X-Myma-Signature: HMAC-SHA256(key, method + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + sha256(body))  -- hex
```
Replay protection: reject if `|now − timestamp| > 300s` or nonce seen before
(in-memory LRU). Rate limited per key id.

### Operations

| Method | Path | Body → Response | Notes |
|--------|------|-----------------|-------|
| GET | `/v1/health` | → `{status:"ok", version, docker_ok, uptime_s}` | unauthenticated (liveness) |
| POST | `/v1/instances` | `{instance_id, docker_project, hostname, moodle_version, database_name, cpu_limit, memory_limit, storage_limit, db_host, db_port, admin_*}` → `{job_id, status}` | create + provision (idempotent by `instance_id`) |
| GET | `/v1/instances/:id/status` | → `{status, running, containers:[…], http_ok, metrics}` | |
| POST | `/v1/instances/:id/start` | → `{status}` | |
| POST | `/v1/instances/:id/stop` | → `{status}` | |
| POST | `/v1/instances/:id/restart` | → `{status}` | |
| POST | `/v1/instances/:id/reset` | → `{job_id}` | safety backup → wipe DB + moodledata → reinstall |
| POST | `/v1/instances/:id/delete` | → `{job_id}` | removes project, volumes, DB, DB user |
| POST | `/v1/instances/:id/backup` | `{upload_url, upload_headers}` → `{backup_id, size}` | agent tars DB+moodledata, uploads to R2 presigned URL |
| POST | `/v1/instances/:id/restore` | `{download_url}` → `{job_id}` | agent downloads + restores + restarts |
| GET | `/v1/instances/:id/metrics` | → `{cpu_usage, memory_usage, storage_usage, db_size}` | |

The agent's create/backup/reset operations are **async** and return a `job_id`;
the Worker polls `status`/`metrics`. All agent mutations are idempotent —
re-calling with the same `instance_id`/operation yields the same result, never a
duplicate.

---

## 6. Control-Plane API (Hono, Cloudflare Worker)

Base: `/api` (MVP behind admin auth — abstracted behind an `AuthService`).

```
POST   /api/auth            → authenticate against configured IdP (abstract)
GET    /api/students        → list students
POST   /api/students        → create student
GET    /api/nodes           → list VPS nodes
POST   /api/nodes           → register node
GET    /api/instances       → list instances
POST   /api/instances       → create + provision (idempotent)
GET    /api/instances/:id   → detail
POST   /api/instances/:id/start
POST   /api/instances/:id/stop
POST   /api/instances/:id/restart
POST   /api/instances/:id/reset
POST   /api/instances/:id/backup
POST   /api/instances/:id/restore
DELETE /api/instances/:id
GET    /api/backups         → list backups
GET    /api/activity        → activity log
GET    /api/health          → liveness
```

Error envelope (consistent everywhere):
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": {} } }
```

---

## 7. Services (Worker)

`StudentService`, `InstanceService`, `ProvisioningService`, `NodeService`,
`BackupService`, `CloudflareService` (DNS), `AgentService` (signed agent client),
`AuthService`, `ActivityService`. Handlers are thin; all business logic lives in
services. DB access goes through repository interfaces in `@myma/db`.

---

## 8. Provisioning State Machine

```
VALIDATE → CREATE_RECORD(PROVISIONING) → AGENT_CREATE → VOLUMES → DATABASE
   → MOODLE_CONFIGURE → MOODLE_INSTALL → REDIS → TRAEFIK → DNS → HEALTH_CHECK
   → ACTIVE
```

- Each step records `failed_step` + `error` + timestamp on failure and moves the
  instance to `FAILED`; the whole flow is **retryable and idempotent**.
- DNS is performed by `CloudflareService` (server-side only; tokens never reach
  the frontend). Health check verifies an HTTP 200/3xx from `https://<hostname>`
  and that the Moodle login page is reachable.

---

## 9. Repository Layout

```
myma/
├── apps/web/          React + Vite + Tailwind dashboard (Cloudflare Pages)
├── apps/api/          Hono Workers API
├── packages/db/       D1 schema, migrations, repositories
├── packages/types/    domain entities, enums, API DTOs
├── packages/validation/  zod schemas
├── packages/ui/       shared React components
├── agent/             MyMA VPS Agent (Node + Hono)
├── infra/
│   ├── docker/        node bootstrap (MariaDB, Redis, Traefik, agent)
│   ├── moodle/        per-instance compose template + FrankenPHP Dockerfile
│   ├── traefik/       static + dynamic Traefik config
│   └── scripts/       node provisioning scripts
├── docs/              ADRs, runbooks
├── ARCHITECTURE.md / ROADMAP.md / AGENTS.md
```

---

## 10. Security Posture

- Docker socket is **not** exposed; agent talks to Docker via a local Unix socket
  owned by a `myma` group.
- No root SSH from the Worker; agent exposes only the explicit API above.
- Secrets live in Cloudflare Workers secrets + VPS `.env` (git-ignored).
- Cloudflare API token is least-privilege (DNS-edit on `myma.id` only) and used
  server-side only.
- Signed agent requests with timestamp + nonce replay protection; rate limiting;
  mTLS-ready.
- MVP uses a **single shared signing key** across all nodes; `vps_nodes.agent_key_id`
  is recorded so per-node key rotation can be layered on later without a schema change.
- Activity logs never capture passwords, tokens, keys, or DB credentials.