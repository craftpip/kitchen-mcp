import { describe, it, expect } from 'vitest';
import { success, error, confirmation } from '../../src/shared/response.js';
import { ErrorCode } from '../../src/shared/errors/catalogue.js';

describe('response envelope', () => {
  it('creates a success response', () => {
    const res = success('TEST_OK', { foo: 'bar' });
    expect(res.ok).toBe(true);
    expect(res.status).toBe('success');
    expect(res.code).toBe('TEST_OK');
    expect(res.data).toEqual({ foo: 'bar' });
    expect(res.warnings).toEqual([]);
    expect(res.requires_confirmation).toBe(false);
    expect(res.confirmation).toBeNull();
    expect(res.metadata.server_time).toBeDefined();
  });

  it('creates a success response with warnings', () => {
    const res = success('TEST_OK', {}, { warnings: ['low stock'] });
    expect(res.warnings).toEqual(['low stock']);
  });

  it('creates an error response', () => {
    const res = error(ErrorCode.NOT_FOUND, 'item not found', {
      details: { id: 'abc' },
      recoverable: true,
      suggested_actions: ['create_item'],
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe('error');
    expect(res.code).toBe('NOT_FOUND');
    expect(res.message).toBe('item not found');
    expect(res.recoverable).toBe(true);
    expect(res.suggested_actions).toEqual(['create_item']);
  });

  it('creates a confirmation response', () => {
    const res = confirmation(
      'NEEDS_CONFIRM',
      { item: 'milk' },
      'confirm_abc123',
      '2026-07-17T10:00:00Z',
      { operation: 'consume', quantity: '100ml' },
    );
    expect(res.ok).toBe(true);
    expect(res.status).toBe('confirmation_required');
    expect(res.requires_confirmation).toBe(true);
    expect(res.confirmation.confirmation_token).toBe('confirm_abc123');
  });
});
