import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { addMinutes } from '../shared/time.js';
import { kitchenError, ErrorCode } from '../shared/errors/catalogue.js';
import { nowUtc } from '../shared/time.js';

const IDEMPOTENCY_TTL_MINUTES = 60;

function hashPayload(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  cachedResult?: string;
}

export function checkIdempotency(
  db: Database.Database,
  key: string,
  toolName: string,
  payload: unknown,
): IdempotencyCheckResult {
  const row = db
    .prepare(
      'SELECT request_hash, result, status FROM idempotency_records WHERE idempotency_key = ?',
    )
    .get(key) as { request_hash: string; result: string; status: string } | undefined;

  if (!row) {
    return { isDuplicate: false };
  }

  const currentHash = hashPayload({ toolName, payload });

  if (row.request_hash !== currentHash) {
    throw kitchenError(ErrorCode.IDEMPOTENCY_CONFLICT, 'Idempotency key reused with different payload', {
      details: { idempotency_key: key },
      recoverable: false,
    });
  }

  return { isDuplicate: true, cachedResult: row.result };
}

export function storeIdempotency(
  db: Database.Database,
  key: string,
  toolName: string,
  payload: unknown,
  result: string,
): void {
  const hash = hashPayload({ toolName, payload });
  const expiresAt = addMinutes(nowUtc(), IDEMPOTENCY_TTL_MINUTES);

  db.prepare(
    `INSERT OR REPLACE INTO idempotency_records (idempotency_key, tool_name, request_hash, result, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, 'completed', datetime('now'), ?)`,
  ).run(key, toolName, hash, result, expiresAt);
}

export function cleanupExpiredIdempotency(db: Database.Database): number {
  const result = db
    .prepare('DELETE FROM idempotency_records WHERE expires_at < datetime(\'now\')')
    .run();
  return result.changes;
}
