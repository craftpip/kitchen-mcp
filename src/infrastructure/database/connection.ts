import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export interface DatabaseConfig {
  dbPath: string;
}

const DEFAULT_DB_PATH = path.join(
  process.env.KITCHEN_DATA_DIR ?? process.cwd(),
  'data',
  'kitchen.db',
);

export function createDatabase(config?: DatabaseConfig): Database.Database {
  const dbPath = config?.dbPath ?? DEFAULT_DB_PATH;

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  return db;
}

export function closeDatabase(db: Database.Database): void {
  db.close();
}
