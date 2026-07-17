import type Database from 'better-sqlite3';

export const migration001 = {
  version: 1,
  name: '001_initial',

  up(db: Database.Database): void {
    db.exec(`
      -- Schema migrations tracking
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Households
      CREATE TABLE IF NOT EXISTS households (
        household_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        default_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
        default_language TEXT NOT NULL DEFAULT 'en',
        default_currency TEXT NOT NULL DEFAULT 'INR',
        default_measurement_system TEXT NOT NULL DEFAULT 'metric',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- People
      CREATE TABLE IF NOT EXISTS people (
        person_id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL REFERENCES households(household_id),
        display_name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        default_portion_multiplier REAL NOT NULL DEFAULT 1.0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Idempotency records
      CREATE TABLE IF NOT EXISTS idempotency_records (
        idempotency_key TEXT PRIMARY KEY,
        tool_name TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        result TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_idempotency_expires
        ON idempotency_records(expires_at);

      -- Audit log
      CREATE TABLE IF NOT EXISTS audit_log (
        audit_id TEXT PRIMARY KEY,
        request_id TEXT,
        actor_type TEXT NOT NULL DEFAULT 'mcp_client',
        actor_id TEXT,
        tool_name TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        operation TEXT NOT NULL,
        before_data TEXT,
        after_data TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_audit_tool_name
        ON audit_log(tool_name);
      CREATE INDEX IF NOT EXISTS idx_audit_entity
        ON audit_log(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_created
        ON audit_log(created_at);
    `);
  },

  down(db: Database.Database): void {
    db.exec(`
      DROP TABLE IF EXISTS audit_log;
      DROP TABLE IF EXISTS idempotency_records;
      DROP TABLE IF EXISTS people;
      DROP TABLE IF EXISTS households;
      DROP TABLE IF EXISTS schema_migrations;
    `);
  },
};
