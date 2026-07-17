import { describe, it, expect } from 'vitest';
import { KitchenError, kitchenError, ErrorCode } from '../../src/shared/errors/catalogue.js';

describe('error catalogue', () => {
  it('creates a KitchenError', () => {
    const err = new KitchenError({
      code: ErrorCode.NOT_FOUND,
      message: 'item not found',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(KitchenError);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('item not found');
    expect(err.recoverable).toBe(false);
    expect(err.suggestedActions).toEqual([]);
  });

  it('creates via kitchenError helper', () => {
    const err = kitchenError(ErrorCode.INSUFFICIENT_QUANTITY, 'not enough milk', {
      details: { requested: 200, available: 100 },
      recoverable: true,
      suggested_actions: ['find_substitution'],
    });
    expect(err.code).toBe('INSUFFICIENT_QUANTITY');
    expect(err.recoverable).toBe(true);
    expect(err.suggestedActions).toEqual(['find_substitution']);
    expect(err.details).toEqual({ requested: 200, available: 100 });
  });

  it('has all expected error codes', () => {
    expect(ErrorCode.INVALID_ARGUMENT).toBe('INVALID_ARGUMENT');
    expect(ErrorCode.ALLERGEN_CONFLICT).toBe('ALLERGEN_CONFLICT');
    expect(ErrorCode.CONCURRENT_MODIFICATION).toBe('CONCURRENT_MODIFICATION');
    expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
  });
});
