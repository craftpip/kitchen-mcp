export const InventoryState = {
  SEALED: 'sealed',
  OPENED: 'opened',
  WASHED: 'washed',
  PEELED: 'peeled',
  CUT: 'cut',
  PREPARED: 'prepared',
  COOKED: 'cooked',
  FROZEN: 'frozen',
  THAWING: 'thawing',
  MARINATING: 'marinating',
  SPOILED: 'spoiled',
  DISCARDED: 'discarded',
  CONSUMED: 'consumed',
  UNKNOWN: 'unknown',
} as const;

export type InventoryState = (typeof InventoryState)[keyof typeof InventoryState];

export const QuantityPrecision = {
  MEASURED: 'measured',
  PACKAGE_DECLARED: 'package_declared',
  PIECE_ESTIMATE: 'piece_estimate',
  VISUAL_ESTIMATE: 'visual_estimate',
  USER_ESTIMATE: 'user_estimate',
  UNKNOWN: 'unknown',
} as const;

export type QuantityPrecision = (typeof QuantityPrecision)[keyof typeof QuantityPrecision];

export const ExpiryConfidence = {
  PRINTED: 'printed',
  ESTIMATED: 'estimated',
  USER_ESTIMATED: 'user_estimated',
  UNKNOWN: 'unknown',
} as const;

export type ExpiryConfidence = (typeof ExpiryConfidence)[keyof typeof ExpiryConfidence];

export const TransactionType = {
  ACQUIRED: 'acquired',
  CONSUMED: 'consumed',
  DISCARDED: 'discarded',
  ADJUSTED: 'adjusted',
  TRANSFERRED: 'transferred',
  SPLIT: 'split',
  MERGED: 'merged',
  CONVERTED: 'converted',
  RESERVED: 'reserved',
  RESERVATION_RELEASED: 'reservation_released',
} as const;

export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export interface InventoryLot {
  inventory_lot_id: string;
  household_id: string;
  ingredient_id: string;
  display_label: string;
  brand: string | null;
  quantity_value: number;
  quantity_unit: string;
  quantity_precision: QuantityPrecision;
  location_id: string | null;
  state: InventoryState;
  opened_at: string | null;
  purchased_at: string | null;
  printed_expiry_at: string | null;
  estimated_expiry_at: string | null;
  expiry_confidence: ExpiryConfidence | null;
  barcode: string | null;
  notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransaction {
  inventory_transaction_id: string;
  inventory_lot_id: string;
  transaction_type: TransactionType;
  quantity_delta: number;
  unit: string;
  reason: string;
  session_id: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface AddInventoryInput {
  household_id: string;
  ingredient_id: string;
  display_label: string;
  brand?: string;
  quantity_value: number;
  quantity_unit: string;
  quantity_precision?: QuantityPrecision;
  location_id?: string;
  state?: InventoryState;
  purchased_at?: string;
  printed_expiry_at?: string;
  estimated_expiry_at?: string;
  expiry_confidence?: ExpiryConfidence;
  barcode?: string;
  notes?: string;
  idempotency_key: string;
}

export interface AdjustInventoryInput {
  inventory_lot_id: string;
  quantity_value: number;
  quantity_unit: string;
  quantity_precision?: QuantityPrecision;
  reason: string;
  idempotency_key: string;
}

export interface ConsumeInventoryInput {
  inventory_lot_id: string;
  quantity_value: number;
  quantity_unit: string;
  reason: string;
  session_id?: string;
  idempotency_key: string;
}

export interface MoveInventoryInput {
  inventory_lot_id: string;
  location_id: string;
  idempotency_key: string;
}
