# MyMA — Roadmap

Vertical-slice delivery. Each slice is independently shippable. Slices 1 and 2
are the MVP milestone ("working end-to-end Moodle provisioning flow") and are
implemented first; everything else builds on them.

## Milestone 0 — Foundation (this repo)

- [x] Monorepo scaffold (pnpm + turborepo)
- [x] ARCHITECTURE.md, ROADMAP.md, AGENTS.md
- [x] `@myma/types` — domain entities, enums, DTOs
- [x] `@myma/validation` — zod schemas
- [x] `@myma/db` — D1 schema + migrations + repositories
- [x] `@myma/agent` — VPS agent prototype (HMAC-signed explicit API)
- [x] `infra/` — Docker/Moodle/FrankenPHP/Traefik prototype
- [ ] `@myma/api` — Hono Workers API + services
- [ ] `@myma/web` + `@myma/ui` — React dashboard

## Slice 1 — Infrastructure Proof

Register a VPS node, connect the agent, health-check it.

```text
Register VPS → Connect MyMA Agent → Health check VPS
```

- `POST /api/nodes` + agent `/v1/health`
- Node status transitions: `OFFLINE → ACTIVE`

## Slice 2 — Moodle Provisioning

Create a student, create an instance, provision Docker, install Moodle, verify.

```text
Create Student → Create Instance → Provision Docker → Install Moodle → Verify
```

- `POST /api/students`, `POST /api/instances`
- Provisioning state machine (§8) fully implemented and idempotent
- Agent `create_instance` → compose project + volumes + DB + Moodle CLI install
- Health check → `ACTIVE`

## Slice 3 — Domain

Cloudflare DNS + Traefik routing + HTTPS verification.

```text
Create instance → Cloudflare DNS → Traefik → Verify https://student.myma.id
```

## Slice 4 — Lifecycle

Start / Stop / Restart / Delete / Reset (with confirmations).

## Slice 5 — Backup

Backup → list → restore via R2 (metadata in D1).

## Slice 6 — Monitoring

CPU / RAM / storage / HTTP health / container status (metrics polled from agent).

## Slice 7 — Dashboard Polish

Dashboard, instance detail, node management, activity logs.

---

## Future (post-MVP, architecture supports but does not implement now)

Student self-service · subscriptions · QRIS · payment gateway · free trial ·
plans · usage limits · custom domains · multiple campuses · org accounts ·
campus admin · automatic VPS scheduling · multi-provider · Moodle upgrades ·
email notifications · usage-based billing.