import { describe, it, expect } from 'vitest';
import { generateId, generateRequestId, generateAuditId } from '../../src/shared/ids.js';

describe('ids', () => {
  it('generates a UUID-based id', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generates a prefixed id', () => {
    const id = generateId('lot');
    expect(id).toMatch(/^lot_[0-9a-f]{32}$/);
  });

  it('generates unique request ids', () => {
    const a = generateRequestId();
    const b = generateRequestId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^req_/);
  });

  it('generates unique audit ids', () => {
    const a = generateAuditId();
    expect(a).toMatch(/^audit_/);
  });
});
