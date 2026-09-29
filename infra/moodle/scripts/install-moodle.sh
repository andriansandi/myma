#!/usr/bin/env bash
# One-shot Moodle installer for use INSIDE the MyMA Moodle container.
# Idempotent: skips installation if config.php exists and the database is up to date.
set -euo pipefail

MOODLE_DIR="${MOODLE_CODE_PATH:-/var/www/moodle}"
DATA_DIR="${MOODLE_DATA_PATH:-/var/www/moodledata}"
RUN_USER="${MOODLE_RUN_USER:-www-data}"
RUN_GROUP="${MOODLE_RUN_GROUP:-www-data}"
HOSTNAME="${HOSTNAME:?Must set HOSTNAME}"
WWWROOT="https://${HOSTNAME}"

required_vars=(
  MOODLE_DB_HOST
  MOODLE_DB_NAME
  MOODLE_DB_USER
  MOODLE_DB_PASSWORD
  MOODLE_ADMIN_USER
  MOODLE_ADMIN_PASSWORD
  MOODLE_ADMIN_EMAIL
)

for var in "${required_vars[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "[install-moodle] Missing required environment variable: $var" >&2
    exit 1
  fi
done

if [ -f "$MOODLE_DIR/config.php" ]; then
  echo "[install-moodle] config.php exists; checking database schema"
  if php "$MOODLE_DIR/admin/cli/check_database_schema.php" >/dev/null 2>&1; then
    echo "[install-moodle] Database schema is up to date; nothing to do."
    exit 0
  fi
  echo "[install-moodle] config.php exists but database is not installed; backing up config.php"
  mv "$MOODLE_DIR/config.php" "$MOODLE_DIR/config.php.bak.$(date +%s)"
fi

echo "[install-moodle] Installing Moodle at $WWWROOT"

php "$MOODLE_DIR/admin/cli/install.php" \
  --chmod=2777 \
  --lang=en \
  --wwwroot="$WWWROOT" \
  --dataroot="$DATA_DIR" \
  --dbtype=mariadb \
  --dbhost="$MOODLE_DB_HOST" \
  --dbname="$MOODLE_DB_NAME" \
  --dbuser="$MOODLE_DB_USER" \
  --dbpass="$MOODLE_DB_PASSWORD" \
  --dbport="${MOODLE_DB_PORT:-3306}" \
  --prefix=mdl_ \
  --fullname="${MOODLE_SITE_FULLNAME:-MyMA Moodle}" \
  --shortname="${MOODLE_SITE_SHORTNAME:-MyMA}" \
  --summary="${MOODLE_SITE_SUMMARY:-Managed by MyMA}" \
  --adminuser="$MOODLE_ADMIN_USER" \
  --adminpass="$MOODLE_ADMIN_PASSWORD" \
  --adminemail="$MOODLE_ADMIN_EMAIL" \
  --non-interactive \
  --agree-license \
  --allow-unstable

# Harden: config.php contains DB credentials; make it readable only by the PHP
# runtime user.
chown "$RUN_USER:$RUN_GROUP" "$MOODLE_DIR/config.php" 2>/dev/null || true
chmod 640 "$MOODLE_DIR/config.php"

# moodledata must be private for the runtime PHP user.
chown -R "$RUN_USER:$RUN_GROUP" "$DATA_DIR" 2>/dev/null || true
chmod -R u+rwx,g+rwx,o-rwx "$DATA_DIR"

echo "[install-moodle] Installation complete for $HOSTNAME"
