import type Database from 'better-sqlite3';
import { createDatabase, closeDatabase } from './connection.js';
import { migration001 } from './migrations/001_initial.js';
import { migration002 } from './migrations/002_phase1_kitchen_map_inventory.js';
import { migration003 } from './migrations/003_phase2_equipment_measurements.js';
import { migration004 } from './migrations/004_phase3_recipes.js';
import { migration005 } from './migrations/005_phase4_restrictions_preferences.js';
import { migration006 } from './migrations/006_phase5_cooking_sessions.js';
import { createChildLogger } from '../logging.js';

const log = createChildLogger('migrations');

const migrations = [migration001, migration002, migration003, migration004, migration005, migration006];

export function getAppliedMigrations(db: Database.Database): number[] {
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
    .get();
  if (!tableExists) {
    return [];
  }
  const rows = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all() as { version: number }[];
  return rows.map((r) => r.version);
}

export function runMigrations(db: Database.Database): void {
  const applied = new Set(getAppliedMigrations(db));

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      log.info({ version: migration.version, name: migration.name }, 'migration already applied');
      continue;
    }

    log.info({ version: migration.version, name: migration.name }, 'applying migration');

    const run = db.transaction(() => {
      migration.up(db);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, datetime(\'now\'))',
      ).run(migration.version, migration.name);
    });

    run();
    log.info({ version: migration.version }, 'migration applied');
  }
}

export function rollbackMigration(db: Database.Database, version: number): void {
  const migration = migrations.find((m) => m.version === version);
  if (!migration) {
    throw new Error(`Migration version ${version} not found`);
  }

  const applied = new Set(getAppliedMigrations(db));
  if (!applied.has(version)) {
    throw new Error(`Migration version ${version} has not been applied`);
  }

  log.info({ version, name: migration.name }, 'rolling back migration');

  const run = db.transaction(() => {
    migration.down(db);
    db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(version);
  });

  run();
  log.info({ version }, 'migration rolled back');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = createDatabase();
  try {
    runMigrations(db);
    log.info('all migrations complete');
  } finally {
    closeDatabase(db);
  }
}
