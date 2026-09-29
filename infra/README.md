# MyMA Infrastructure

This directory contains the Docker / Docker Compose / Traefik infrastructure that
runs Moodle instances on each MyMA VPS node. It is a static, version-controlled
prototype — no live system is required to review it.

## Layout

```
infra/
├── docker/
│   ├── docker-compose.yml   # One-time node bootstrap stack
│   └── .env.example         # Required env vars for the node
├── moodle/
│   ├── Dockerfile           # FrankenPHP classic mode runtime
│   ├── config/myma.php.ini  # PHP overrides
│   ├── scripts/
│   │   ├── docker-entrypoint.sh
│   │   └── install-moodle.sh
│   └── compose.template.yml # Per-instance renderable compose file
├── traefik/
│   ├── traefik.yml          # Traefik static config
│   └── dynamic.yml          # Shared middlewares + dashboard router
├── scripts/
│   └── bootstrap-node.sh    # Idempotent node bootstrap
└── README.md                # This file
```

## Design Decisions (from ARCHITECTURE.md)

| Decision | Choice | Why |
|----------|--------|-----|
| Reverse proxy | **Traefik** | Route discovery via Docker labels eliminates proxy-config edits when a new instance is created (D1). |
| PHP runtime | **FrankenPHP classic mode** | Worker mode is unsafe for Moodle plugins; classic mode gives a modern SAPI without compatibility risk (D2). |
| Database topology | **One shared MariaDB per node** | ~300–400 MB per MariaDB container is too expensive for 50 instances/node. One engine with per-instance DBs + users gives strong isolation at low cost (D3). |
| Isolation | Per-instance DB, DB user, `moodledata` volume, hostname, Docker project, and resource limits | Logical + filesystem + process + network boundary (D4). |
| Agent auth | HMAC-signed requests (handled by `@myma/agent`) | No exposed command endpoint; no live secrets in this repo. |

## Bootstrap a Node

```bash
# On the VPS as root, export the required values.
export MYMA_NODE_FQDN="node-1.myma.id"
export ACME_EMAIL="admin@example.com"
export MARIADB_ROOT_PASSWORD="REPLACE_WITH_STRONG_PASSWORD"
export AGENT_KEY="$(openssl rand -base64 32)"

# Run the idempotent bootstrap script from the repo checkout.
./infra/scripts/bootstrap-node.sh
```

What the script does:

1. Creates the persistent `.env` under `/opt/myma/infra/docker/.env`.
2. Creates the `myma` group/user and configures Docker to own its Unix socket.
3. Installs Docker CE + docker compose plugin (if missing).
4. Syncs the agent source to `/opt/myma/agent` and the infra configs to
   `/opt/myma/infra`.
5. Runs `docker compose up -d` for the shared stack.
6. Verifies MariaDB, Redis, Traefik, and the agent are healthy.

The script can safely be re-run. It will not recreate volumes or destroy instance
data.

## Shared Node Stack (`infra/docker/docker-compose.yml`)

| Service | Purpose |
|---------|---------|
| `mariadb` | Shared MariaDB 11.4. One engine, one root account. Per-instance DBs/users are created by the agent. |
| `redis` | Shared session/cache store for Moodle. |
| `traefik` | Reverse proxy. Publishes 80/443, terminates TLS with Let's Encrypt, discovers routes from Docker labels. |
| `myma-agent` | Builds from `../../agent`. Does **not** publish a host port; reachable only through Traefik TLS on `agent.<node>`. |

Only one copy of this stack runs per VPS. It defines the `myma-infra` Docker
network that every instance compose project joins as an external network.

## Per-Instance Stack (`infra/moodle/compose.template.yml`)

Each Moodle instance has its own Compose project. The MyMA agent renders the
template by replacing `{{PLACEHOLDER}}` tokens, then writes the result to
`/opt/myma/instances/<project>/compose.yml`.

### Isolation model

- **Database**: dedicated `{{DB_NAME}}` + `{{DB_USER}}` in the shared MariaDB.
- **Filesystem**: dedicated named volume `moodledata-{{PROJECT}}`.
- **Application code**: bind-mounted from `/opt/myma/instances/<project>/moodle`,
  which the agent checks out at provision time. Code lives outside the image so
  image updates never destroy data.
- **Network**: instance container attaches to `myma-infra` for DB/Redis/Traefik
  and an internal default network for project-local services.
- **Host**: unique `{{HOSTNAME}}` routed by a Traefik Docker label.
- **Resources**: `deploy.resources.limits` + `mem_limit` from `{{CPU_LIMIT}}` / `{{MEM_LIMIT}}`.

### Placeholders (must match `renderCompose`)

These are the exact token names in `infra/moodle/compose.template.yml`:

- `{{INSTANCE_ID}}`      — UUIDv4, used for resource naming.
- `{{HOSTNAME}}`         — public FQDN (`student.myma.id`).
- `{{PROJECT}}`          — Docker Compose project slug (`student-a`).
- `{{MOODLE_VERSION}}`   — image tag / Moodle version (`4.5.1`).
- `{{MOODLE_CODE_PATH}}` — host path of the checked-out Moodle source.
- `{{DB_HOST}}`          — usually `mariadb` on `myma-infra`.
- `{{DB_PORT}}`          — usually `3306`.
- `{{DB_NAME}}`          — dedicated database name.
- `{{DB_USER}}`          — dedicated database user.
- `{{DB_PASS}}`          — dedicated database password.
- `{{REDIS_HOST}}`       — usually `redis` on `myma-infra`.
- `{{REDIS_PORT}}`       — usually `6379`.
- `{{CPU_LIMIT}}`        — e.g. `0.50`, `1.0`.
- `{{MEM_LIMIT}}`        — e.g. `512M`.

## Moodle Image (`infra/moodle/Dockerfile`)

- Base: `dunglas/frankenphp:1.3.6-php8.3-alpine`.
- Mode: **classic** (per-request, no worker directive).
- Extensions: `mysqli`, `gd`, `intl`, `xmlrpc`, `soap`, `opcache`, `zip`,
  `curl`, `mbstring`, `exif`, `pcntl`, `sodium`, `ldap`.
- Configuration: `PHP_INI_SCAN_DIR` includes `/usr/local/etc/php/myma.d`, where
  `config/myma.php.ini` sets memory, upload, opcache, and security values.
- Moodle source is **not** in the image; it must be bind-mounted at runtime.
- Helper scripts are baked in:
  - `docker-entrypoint.sh` validates that Moodle code is mounted and owns
    `/var/www/moodledata`.
  - `install-moodle.sh` is invoked by the agent to run
    `php admin/cli/install.php` once, idempotently.

## One-Shot Moodle Installation (`infra/moodle/scripts/install-moodle.sh`)

The agent can run this inside the Moodle container:

```bash
docker compose exec moodle /usr/local/bin/install-moodle.sh
```

The script:

- Exits early if `config.php` exists **and** the database schema is current.
- Backs up a stale `config.php` if the DB has not been installed.
- Runs Moodle's CLI installer with env-driven DB and admin credentials.
- Sets restrictive permissions on `config.php` and `moodledata`.

## Traefik Routing (`infra/traefik/`)

- `traefik.yml` is the **static** config: entrypoints, Docker + file providers,
  and the Let's Encrypt `le` resolver.
- `dynamic.yml` is the **dynamic** config: shared middlewares
  (`security-headers`, `rate-limit`, `https-only`) and an optional dashboard
  router.
- **Per-instance routers are created entirely from Docker labels** on the Moodle
  containers (D1). The agent rendering `compose.template.yml` does not need to
  touch Traefik config files.

## Operational Commands

### Bootstrap (or re-bootstrap) a node

```bash
./infra/scripts/bootstrap-node.sh
```

### Create an instance (agent workflow)

The agent performs these steps for each new instance:

1. Create the database and user in the shared MariaDB.
2. Create `/opt/myma/instances/<project>`.
3. Download the requested Moodle version into `./moodle`.
4. Render `compose.template.yml` → `compose.yml`.
5. `docker compose -p <project> -f compose.yml up -d`.
6. Run `install-moodle.sh` inside the container.
7. Register the Cloudflare DNS `A` record for `<hostname>`.
8. Poll `https://<hostname>/login/index.php` until healthy.

### Stop / start / restart an instance

```bash
cd /opt/myma/instances/<project>
docker compose stop
docker compose start
docker compose restart
```

### Back up an instance

The agent handles backups by:

1. Creating a tarball of the instance's database dump and `moodledata` volume.
2. Uploading the tarball to a presigned R2 URL.
3. Recording metadata in Cloudflare D1.

Manual database dump (for reference):

```bash
docker exec -i myma-mariadb mariadb-dump -u<dbuser> -p<dbpass> <dbname> > db.sql
```

## Security Notes

- No Docker TCP socket is exposed. The agent uses the local Unix socket owned
  by the `myma` group.
- No root SSH from the Worker; all control is through the signed agent API.
- Secrets live in `/opt/myma/infra/docker/.env` (git-ignored) or Docker
  Secrets/Cloudflare Workers secrets. No real secrets in this repository.
- Moodle source code is never vendored into the repo.
- Payment, QRIS, subscription, and Kubernetes features are out of scope for the
  MVP and not present here.
