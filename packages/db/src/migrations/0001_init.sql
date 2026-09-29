-- MyMA D1 initial schema
-- All identifiers are UUIDv4 strings; timestamps are ISO-8601 UTC strings.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE,
  name          TEXT,
  auth_provider TEXT,
  external_id   TEXT,
  role          TEXT,
  created_at    TEXT,
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS students (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS vps_nodes (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  hostname      TEXT NOT NULL,
  ip_address    TEXT NOT NULL,
  agent_url     TEXT NOT NULL,
  agent_key_id TEXT,
  status        TEXT NOT NULL,
  cpu_total     REAL NOT NULL,
  memory_total  INTEGER NOT NULL,
  storage_total INTEGER NOT NULL,
  cpu_used      REAL DEFAULT 0,
  memory_used   INTEGER DEFAULT 0,
  storage_used  INTEGER DEFAULT 0,
  created_at    TEXT,
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS instances (
  id               TEXT PRIMARY KEY,
  student_id       TEXT NOT NULL REFERENCES students(id),
  node_id          TEXT NOT NULL REFERENCES vps_nodes(id),
  hostname         TEXT NOT NULL UNIQUE,
  docker_project   TEXT NOT NULL,
  moodle_version   TEXT NOT NULL,
  database_name    TEXT NOT NULL,
  status           TEXT NOT NULL,
  cpu_limit        REAL NOT NULL,
  memory_limit     INTEGER NOT NULL,
  storage_limit    INTEGER NOT NULL,
  storage_used     INTEGER DEFAULT 0,
  provision_error  TEXT,
  created_at       TEXT,
  updated_at       TEXT,
  last_backup_at   TEXT
);

CREATE TABLE IF NOT EXISTS instance_resources (
  id             TEXT PRIMARY KEY,
  instance_id    TEXT NOT NULL REFERENCES instances(id),
  node_id        TEXT NOT NULL,
  cpu_usage      REAL,
  memory_usage   INTEGER,
  storage_usage  INTEGER,
  db_size        INTEGER,
  recorded_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backups (
  id               TEXT PRIMARY KEY,
  instance_id      TEXT NOT NULL REFERENCES instances(id),
  node_id          TEXT NOT NULL,
  timestamp        TEXT NOT NULL,
  size             INTEGER,
  storage_location TEXT NOT NULL,
  status           TEXT NOT NULL,
  created_at       TEXT
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id          TEXT PRIMARY KEY,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  instance_id TEXT,
  node_id     TEXT,
  status      TEXT NOT NULL,
  error       TEXT,
  metadata    TEXT,
  timestamp   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_instances_student_id    ON instances(student_id);
CREATE INDEX IF NOT EXISTS idx_instances_node_id       ON instances(node_id);
CREATE INDEX IF NOT EXISTS idx_instances_status        ON instances(status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_instance  ON activity_logs(instance_id);
CREATE INDEX IF NOT EXISTS idx_backups_instance        ON backups(instance_id);
CREATE INDEX IF NOT EXISTS idx_instance_resources_lookup
  ON instance_resources(instance_id, recorded_at DESC);
