#!/usr/bin/env bash
# MyMA VPS node bootstrap.
# Idempotent: safe to run multiple times; it will (re)apply configuration and
# restart the shared stack without destroying instance data.
#
# Run as root on a fresh Ubuntu 24.04 VPS (or any Debian-derived system with
# apt-get). Required environment variables (or pre-written target .env):
#   MYMA_NODE_FQDN        Public FQDN of this node, e.g. node-1.myma.id
#   ACME_EMAIL            Let's Encrypt contact email
#   MARIADB_ROOT_PASSWORD Shared MariaDB root password
#   AGENT_KEY_ID          Key id used in HMAC request headers
#   AGENT_KEY             HMAC signing key used by the MyMA agent
#
# Optional environment variables:
#   MYMA_NODE_DIR         Base directory on the node (default: /opt/myma)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET_DIR="${MYMA_NODE_DIR:-/opt/myma}"
AGENT_DIR="$TARGET_DIR/agent"
INFRA_DIR="$TARGET_DIR/infra"
COMPOSE_DIR="$INFRA_DIR/docker"
TRAEFIK_DIR="$INFRA_DIR/traefik"
MOODLE_DIR="$INFRA_DIR/moodle"

if [ "$EUID" -ne 0 ]; then
  echo "[myma] This script must be run as root." >&2
  exit 1
fi

# --------------------------------------------------------------------------- #
# 1. Environment persistence
# --------------------------------------------------------------------------- #

mkdir -p "$COMPOSE_DIR"
TARGET_ENV="$COMPOSE_DIR/.env"

if [ -f "$TARGET_ENV" ]; then
  echo "[myma] Loading existing $TARGET_ENV"
  set -a
  # shellcheck source=/dev/null
  source "$TARGET_ENV"
  set +a
fi

: "${MYMA_NODE_FQDN:?MYMA_NODE_FQDN is required}"
: "${ACME_EMAIL:?ACME_EMAIL is required}"
: "${MARIADB_ROOT_PASSWORD:?MARIADB_ROOT_PASSWORD is required}"
: "${AGENT_KEY_ID:?AGENT_KEY_ID is required}"
: "${AGENT_KEY:?AGENT_KEY is required}"

echo "[myma] Writing $TARGET_ENV"
cat > "$TARGET_ENV" <<EOF
MYMA_NODE_FQDN=$MYMA_NODE_FQDN
ACME_EMAIL=$ACME_EMAIL
MARIADB_ROOT_PASSWORD=$MARIADB_ROOT_PASSWORD
AGENT_KEY_ID=$AGENT_KEY_ID
AGENT_KEY=$AGENT_KEY
EOF
chmod 600 "$TARGET_ENV"

# --------------------------------------------------------------------------- #
# 2. myma group/user (Decision D4/Docker socket access)
# --------------------------------------------------------------------------- #

MYMA_GID=1000
MYMA_UID=1000

if ! getent group myma >/dev/null; then
  if groupadd -g "$MYMA_GID" myma 2>/dev/null; then
    echo "[myma] Created group myma (gid=$MYMA_GID)"
  else
    groupadd myma
    echo "[myma] Created group myma (system-assigned gid)"
  fi
fi

if ! id myma >/dev/null 2>&1; then
  if useradd -m -u "$MYMA_UID" -g myma -s /bin/bash myma 2>/dev/null; then
    echo "[myma] Created user myma (uid=$MYMA_UID)"
  else
    useradd -m -g myma -s /bin/bash myma
    echo "[myma] Created user myma (system-assigned uid)"
  fi
fi

# --------------------------------------------------------------------------- #
# 3. Docker installation
# --------------------------------------------------------------------------- #

if command -v docker >/dev/null 2>&1; then
  echo "[myma] Docker already installed: $(docker --version)"
else
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "[myma] Error: this script uses apt-get to install Docker." >&2
    exit 1
  fi

  echo "[myma] Installing Docker CE and compose plugin"
  apt-get update
  apt-get install -y ca-certificates curl gnupg

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  # shellcheck disable=SC1091
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

# Configure the Docker daemon so the Unix socket is owned by the myma group.
# https://docs.docker.com/engine/reference/commandline/dockerd/#daemon-socket-option
if [ ! -f /etc/docker/daemon.json ]; then
  echo '{"group": "myma"}' > /etc/docker/daemon.json
  echo "[myma] Configured Docker socket group = myma"
  systemctl restart docker || true
elif ! grep -q '"group"' /etc/docker/daemon.json; then
  echo "[myma] Warning: /etc/docker/daemon.json exists without a \"group\" key." >&2
  echo "          Add { \"group\": \"myma\" } and restart Docker to enforce socket ownership." >&2
fi

# Fallback membership in case the socket remains owned by docker/another group.
usermod -aG docker myma 2>/dev/null || true

# --------------------------------------------------------------------------- #
# 4. Directory layout
# --------------------------------------------------------------------------- #

mkdir -p "$TARGET_DIR/instances"
chown -R myma:myma "$TARGET_DIR"
chmod 750 "$TARGET_DIR"

# --------------------------------------------------------------------------- #
# 5. Sync IaC from repository checkout to the node
# --------------------------------------------------------------------------- #

# Agent source. The Dockerfile build context is the repo root, so this path
# only needs the actual source; the Dockerfile copies the workspace packages.
if [ -d "$REPO_DIR/agent" ]; then
  echo "[myma] Syncing agent source to $AGENT_DIR"
  mkdir -p "$AGENT_DIR"
  rsync -a "$REPO_DIR/agent/" "$AGENT_DIR/"
else
  echo "[myma] Warning: agent source not found at $REPO_DIR/agent" >&2
fi

# Bootstrap workspace files required by the agent Dockerfile build context.
echo "[myma] Syncing workspace files to $TARGET_DIR"
mkdir -p "$TARGET_DIR/packages/types" "$TARGET_DIR/packages/validation"
rsync -a "$REPO_DIR/package.json" "$TARGET_DIR/package.json"
rsync -a "$REPO_DIR/pnpm-workspace.yaml" "$TARGET_DIR/pnpm-workspace.yaml"
rsync -a "$REPO_DIR/pnpm-lock.yaml" "$TARGET_DIR/pnpm-lock.yaml"
if [ -f "$REPO_DIR/.npmrc" ]; then
  rsync -a "$REPO_DIR/.npmrc" "$TARGET_DIR/.npmrc"
fi
rsync -a "$REPO_DIR/packages/types/" "$TARGET_DIR/packages/types/"
rsync -a "$REPO_DIR/packages/validation/" "$TARGET_DIR/packages/validation/"

# Bootstrap compose file + Traefik configs + Moodle image/template.
echo "[myma] Syncing infra configs to $INFRA_DIR"
mkdir -p "$COMPOSE_DIR" "$TRAEFIK_DIR" "$MOODLE_DIR"
rsync -a "$REPO_DIR/infra/docker/" "$COMPOSE_DIR/"
rsync -a "$REPO_DIR/infra/traefik/" "$TRAEFIK_DIR/"
rsync -a "$REPO_DIR/infra/moodle/" "$MOODLE_DIR/"

# The compose file mounts ./traefik.yml and ./dynamic.yml relative to its own
# directory, so link the traefik files next to the compose file as well.
ln -sf "$TRAEFIK_DIR/traefik.yml" "$COMPOSE_DIR/traefik.yml"
ln -sf "$TRAEFIK_DIR/dynamic.yml" "$COMPOSE_DIR/dynamic.yml"

# --------------------------------------------------------------------------- #
# 6. Build the shared Moodle runtime image
# --------------------------------------------------------------------------- #

if [ -f "$MOODLE_DIR/Dockerfile" ]; then
  echo "[myma] Building Moodle runtime image"
  docker build -t "myma/moodle-frankenphp:latest" "$MOODLE_DIR"
else
  echo "[myma] Warning: Moodle Dockerfile not found at $MOODLE_DIR/Dockerfile" >&2
fi

# --------------------------------------------------------------------------- #
# 7. Bring up the shared node stack
# --------------------------------------------------------------------------- #

cd "$COMPOSE_DIR"

docker compose pull
docker compose up -d --remove-orphans

# --------------------------------------------------------------------------- #
# 8. Wait for / verify services
# --------------------------------------------------------------------------- #

wait_for_container() {
  local service=$1
  local i
  echo -n "[myma] Waiting for $service"
  for i in $(seq 1 30); do
    if docker compose ps "$service" 2>/dev/null | grep -qEi 'Running|Healthy'; then
      echo " OK"
      return 0
    fi
    echo -n "."
    sleep 2
  done
  echo " TIMEOUT"
  return 1
}

wait_for_container mariadb
wait_for_container redis
wait_for_container traefik
wait_for_container myma-agent

# Functional health checks
HEALTH_FAILED=0

if ! docker compose exec -T mariadb healthcheck.sh --su-mysql --connect --innodb_initialized >/dev/null 2>&1; then
  echo "[myma] Health check failed: MariaDB" >&2
  HEALTH_FAILED=1
else
  echo "[myma] Health check passed: MariaDB"
fi

if ! docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
  echo "[myma] Health check failed: Redis" >&2
  HEALTH_FAILED=1
else
  echo "[myma] Health check passed: Redis"
fi

if ! docker compose exec -T traefik traefik healthcheck >/dev/null 2>&1; then
  echo "[myma] Health check failed: Traefik ping" >&2
  HEALTH_FAILED=1
else
  echo "[myma] Health check passed: Traefik"
fi

if ! docker compose exec -T myma-agent wget -qO- http://localhost:3000/v1/health 2>/dev/null | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then
  echo "[myma] Health check failed: agent /v1/health" >&2
  HEALTH_FAILED=1
else
  echo "[myma] Health check passed: agent"
fi

if [ "$HEALTH_FAILED" -eq 0 ]; then
  echo "[myma] Node bootstrap complete."
  echo "[myma] Traefik dashboard: https://traefik.$MYMA_NODE_FQDN/dashboard/"
  echo "[myma] Agent endpoint:    https://agent.$MYMA_NODE_FQDN"
else
  echo "[myma] Bootstrap finished with health-check failures. Investigate with:"
  echo "          docker compose -f $COMPOSE_DIR/docker-compose.yml logs"
  exit 1
fi
