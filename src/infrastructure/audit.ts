import type Database from 'better-sqlite3';
import { generateAuditId } from '../shared/ids.js';

export interface AuditEntry {
  request_id?: string;
  actor_type?: string;
  actor_id?: string;
  tool_name: string;
  entity_type?: string;
  entity_id?: string;
  operation: string;
  before_data?: Record<string, unknown>;
  after_data?: Record<string, unknown>;
}

export function writeAuditLog(db: Database.Database, entry: AuditEntry): void {
  db.prepare(
    `INSERT INTO audit_log (audit_id, request_id, actor_type, actor_id, tool_name, entity_type, entity_id, operation, before_data, after_data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    generateAuditId(),
    entry.request_id ?? null,
    entry.actor_type ?? 'mcp_client',
    entry.actor_id ?? null,
    entry.tool_name,
    entry.entity_type ?? null,
    entry.entity_id ?? null,
    entry.operation,
    entry.before_data ? JSON.stringify(entry.before_data) : null,
    entry.after_data ? JSON.stringify(entry.after_data) : null,
  );
}

export interface AuditQueryOptions {
  tool_name?: string;
  entity_type?: string;
  entity_id?: string;
  limit?: number;
  offset?: number;
}

export function queryAuditLog(db: Database.Database, options: AuditQueryOptions) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.tool_name) {
    conditions.push('tool_name = ?');
    params.push(options.tool_name);
  }
  if (options.entity_type) {
    conditions.push('entity_type = ?');
    params.push(options.entity_type);
  }
  if (options.entity_id) {
    conditions.push('entity_id = ?');
    params.push(options.entity_id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  return db
    .prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
}
