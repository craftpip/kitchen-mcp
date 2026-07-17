export const ErrorCode = {
  // Validation
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_UNIT: 'INVALID_UNIT',
  INCOMPATIBLE_UNITS: 'INCOMPATIBLE_UNITS',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',

  // Entity
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  INACTIVE_ENTITY: 'INACTIVE_ENTITY',
  AMBIGUOUS_MATCH: 'AMBIGUOUS_MATCH',

  // Inventory
  INSUFFICIENT_QUANTITY: 'INSUFFICIENT_QUANTITY',
  INVENTORY_RESERVED: 'INVENTORY_RESERVED',
  UNKNOWN_LOCATION: 'UNKNOWN_LOCATION',
  INVENTORY_STATE_CONFLICT: 'INVENTORY_STATE_CONFLICT',
  LOT_MERGE_INCOMPATIBLE: 'LOT_MERGE_INCOMPATIBLE',

  // Recipe
  RECIPE_INVALID: 'RECIPE_INVALID',
  RECIPE_NOT_PUBLISHED: 'RECIPE_NOT_PUBLISHED',
  MISSING_REQUIRED_INGREDIENT: 'MISSING_REQUIRED_INGREDIENT',
  NO_VALID_SUBSTITUTION: 'NO_VALID_SUBSTITUTION',
  EQUIPMENT_UNAVAILABLE: 'EQUIPMENT_UNAVAILABLE',
  SERVING_SCALE_UNSUPPORTED: 'SERVING_SCALE_UNSUPPORTED',

  // Session
  SESSION_NOT_ACTIVE: 'SESSION_NOT_ACTIVE',
  STEP_DEPENDENCY_INCOMPLETE: 'STEP_DEPENDENCY_INCOMPLETE',
  STEP_ALREADY_COMPLETED: 'STEP_ALREADY_COMPLETED',
  SESSION_STATE_CONFLICT: 'SESSION_STATE_CONFLICT',

  // Safety
  ALLERGEN_CONFLICT: 'ALLERGEN_CONFLICT',
  FOOD_SAFETY_BLOCK: 'FOOD_SAFETY_BLOCK',
  CROSS_CONTAMINATION_RISK: 'CROSS_CONTAMINATION_RISK',
  PRESSURE_SAFETY_BLOCK: 'PRESSURE_SAFETY_BLOCK',
  EXPIRY_UNKNOWN: 'EXPIRY_UNKNOWN',
  SAFETY_INFORMATION_MISSING: 'SAFETY_INFORMATION_MISSING',

  // System
  CONCURRENT_MODIFICATION: 'CONCURRENT_MODIFICATION',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  INTEGRATION_UNAVAILABLE: 'INTEGRATION_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorDetail {
  message: string;
  code: ErrorCode;
  details?: Record<string, unknown>;
  recoverable?: boolean;
  suggested_actions?: string[];
}

export class KitchenError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly recoverable: boolean;
  public readonly suggestedActions: string[];

  constructor(error: ErrorDetail) {
    super(error.message);
    this.name = 'KitchenError';
    this.code = error.code;
    this.details = error.details;
    this.recoverable = error.recoverable ?? false;
    this.suggestedActions = error.suggested_actions ?? [];
  }
}

export function kitchenError(
  code: ErrorCode,
  message: string,
  options?: {
    details?: Record<string, unknown>;
    recoverable?: boolean;
    suggested_actions?: string[];
  },
): KitchenError {
  return new KitchenError({
    code,
    message,
    ...options,
  });
}
