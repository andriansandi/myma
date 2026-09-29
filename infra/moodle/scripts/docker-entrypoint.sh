#!/bin/sh
# MyMA Moodle container entrypoint — classic mode sanity checks only.
set -eu

MOODLE_DIR="${MOODLE_CODE_PATH:-/var/www/moodle}"
DATA_DIR="${MOODLE_DATA_PATH:-/var/www/moodledata}"
RUN_USER="${MOODLE_RUN_USER:-www-data}"
RUN_GROUP="${MOODLE_RUN_GROUP:-www-data}"

if [ ! -d "$MOODLE_DIR" ]; then
  echo "[myma-entrypoint] Moodle code directory not mounted: $MOODLE_DIR" >&2
  exit 1
fi

if [ ! -f "$MOODLE_DIR/version.php" ]; then
  echo "[myma-entrypoint] Moodle code not detected (missing $MOODLE_DIR/version.php)" >&2
  exit 1
fi

# Ensure moodledata exists with private, group-writable permissions. The PHP
# worker runs as $RUN_USER:$RUN_GROUP.
mkdir -p "$DATA_DIR"
chown -R "$RUN_USER:$RUN_GROUP" "$DATA_DIR" 2>/dev/null || true
chmod -R u+rwx,g+rwx,o-rwx "$DATA_DIR"

echo "[myma-entrypoint] Moodle code OK: $MOODLE_DIR"
echo "[myma-entrypoint] moodledata path: $DATA_DIR"

exec "$@"
