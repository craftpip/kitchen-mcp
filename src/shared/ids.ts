import { v4 as uuidv4 } from 'uuid';

export function generateId(prefix?: string): string {
  const id = uuidv4().replace(/-/g, '');
  return prefix ? `${prefix}_${id}` : id;
}

export function generateRequestId(): string {
  return generateId('req');
}

export function generateAuditId(): string {
  return generateId('audit');
}

export function generateIdempotencyKey(): string {
  return generateId('idem');
}
