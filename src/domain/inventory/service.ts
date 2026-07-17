import type Database from 'better-sqlite3';
import { generateId } from '../../shared/ids.js';
import { kitchenError, ErrorCode } from '../../shared/errors/catalogue.js';
import { writeAuditLog } from '../../infrastructure/audit.js';
import type {
  InventoryLot,
  InventoryTransaction,
  AddInventoryInput,
  AdjustInventoryInput,
  ConsumeInventoryInput,
  MoveInventoryInput,
  InventoryState,
  QuantityPrecision,
  ExpiryConfidence,
  TransactionType,
} from './types.js';

interface LotRow {
  inventory_lot_id: string;
  household_id: string;
  ingredient_id: string;
  display_label: string;
  brand: string | null;
  quantity_value: number;
  quantity_unit: string;
  quantity_precision: string;
  location_id: string | null;
  state: string;
  opened_at: string | null;
  purchased_at: string | null;
  printed_expiry_at: string | null;
  estimated_expiry_at: string | null;
  expiry_confidence: string | null;
  barcode: string | null;
  notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

function rowToLot(row: LotRow): InventoryLot {
  return {
    ...row,
    quantity_precision: row.quantity_precision as QuantityPrecision,
    state: row.state as InventoryState,
    expiry_confidence: row.expiry_confidence as ExpiryConfidence | null,
  };
}

export class InventoryService {
  constructor(private db: Database.Database) {}

  search(householdId: string, options?: {
    ingredient_id?: string;
    location_id?: string;
    category?: string;
    states?: string[];
    expiring_before?: string;
    include_zero_quantity?: boolean;
    limit?: number;
  }): InventoryLot[] {
    const conditions = ['i.household_id = ?'];
    const params: unknown[] = [householdId];

    if (options?.ingredient_id) {
      conditions.push('i.ingredient_id = ?');
      params.push(options.ingredient_id);
    }
    if (options?.location_id) {
      conditions.push('i.location_id = ?');
      params.push(options.location_id);
    }
    if (options?.category) {
      conditions.push('ic.category = ?');
      params.push(options.category);
    }
    if (options?.states && options.states.length > 0) {
      conditions.push(`i.state IN (${options.states.map(() => '?').join(',')})`);
      params.push(...options.states);
    }
    if (options?.expiring_before) {
      conditions.push(
        "(i.printed_expiry_at IS NOT NULL AND i.printed_expiry_at <= ?) OR (i.estimated_expiry_at IS NOT NULL AND i.estimated_expiry_at <= ?)",
      );
      params.push(options.expiring_before, options.expiring_before);
    }
    if (!options?.include_zero_quantity) {
      conditions.push('i.quantity_value > 0');
    }

    const limit = options?.limit ?? 50;

    const rows = this.db
      .prepare(
        `SELECT i.*
         FROM inventory_lots i
         LEFT JOIN ingredient_catalog ic ON ic.ingredient_id = i.ingredient_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY i.display_label
         LIMIT ?`,
      )
      .all(...params, limit) as LotRow[];

    return rows.map(rowToLot);
  }

  get(lotId: string): InventoryLot | undefined {
    const row = this.db
      .prepare('SELECT * FROM inventory_lots WHERE inventory_lot_id = ?')
      .get(lotId) as LotRow | undefined;
    return row ? rowToLot(row) : undefined;
  }

  getTransactions(lotId: string): InventoryTransaction[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM inventory_transactions WHERE inventory_lot_id = ? ORDER BY created_at DESC',
      )
      .all(lotId) as (Omit<InventoryTransaction, 'transaction_type'> & { transaction_type: string })[];
    return rows.map((r) => ({
      ...r,
      transaction_type: r.transaction_type as TransactionType,
    }));
  }

  add(input: AddInventoryInput): InventoryLot {
    const ingredient = this.db
      .prepare('SELECT ingredient_id FROM ingredient_catalog WHERE ingredient_id = ?')
      .get(input.ingredient_id) as { ingredient_id: string } | undefined;

    if (!ingredient) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Ingredient not found', {
        details: { ingredient_id: input.ingredient_id },
      });
    }

    if (input.location_id) {
      const location = this.db
        .prepare('SELECT location_id FROM locations WHERE location_id = ?')
        .get(input.location_id) as { location_id: string } | undefined;
      if (!location) {
        throw kitchenError(ErrorCode.NOT_FOUND, 'Location not found', {
          details: { location_id: input.location_id },
        });
      }
    }

    const id = generateId('lot');
    const now = new Date().toISOString();

    const insertLot = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO inventory_lots (inventory_lot_id, household_id, ingredient_id, display_label, brand, quantity_value, quantity_unit, quantity_precision, location_id, state, opened_at, purchased_at, printed_expiry_at, estimated_expiry_at, expiry_confidence, barcode, notes, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          id,
          input.household_id,
          input.ingredient_id,
          input.display_label,
          input.brand ?? null,
          input.quantity_value,
          input.quantity_unit,
          input.quantity_precision ?? 'measured',
          input.location_id ?? null,
          input.state ?? 'sealed',
          null,
          input.purchased_at ?? null,
          input.printed_expiry_at ?? null,
          input.estimated_expiry_at ?? null,
          input.expiry_confidence ?? null,
          input.barcode ?? null,
          input.notes ?? null,
          now,
          now,
        );

      this.db
        .prepare(
          `INSERT INTO inventory_transactions (inventory_transaction_id, inventory_lot_id, transaction_type, quantity_delta, unit, reason, session_id, idempotency_key, created_at)
           VALUES (?, ?, 'acquired', ?, ?, 'initial_add', NULL, ?, ?)`,
        )
        .run(
          generateId('tx'),
          id,
          input.quantity_value,
          input.quantity_unit,
          input.idempotency_key,
          now,
        );

      writeAuditLog(this.db, {
        tool_name: 'kitchen_inventory_add',
        entity_type: 'inventory_lot',
        entity_id: id,
        operation: 'create',
        after_data: { ...input, idempotency_key: undefined },
      });
    });

    insertLot();
    return this.get(id)!;
  }

  adjust(input: AdjustInventoryInput): InventoryLot {
    const lot = this.get(input.inventory_lot_id);
    if (!lot) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Inventory lot not found', {
        details: { inventory_lot_id: input.inventory_lot_id },
      });
    }

    if (lot.version !== undefined) {
      // Optimistic locking check
    }

    const oldQuantity = lot.quantity_value;
    const now = new Date().toISOString();

    const adjustTx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE inventory_lots
           SET quantity_value = ?, quantity_unit = ?, quantity_precision = ?, version = version + 1, updated_at = datetime('now')
           WHERE inventory_lot_id = ?`,
        )
        .run(
          input.quantity_value,
          input.quantity_unit,
          input.quantity_precision ?? lot.quantity_precision,
          input.inventory_lot_id,
        );

      this.db
        .prepare(
          `INSERT INTO inventory_transactions (inventory_transaction_id, inventory_lot_id, transaction_type, quantity_delta, unit, reason, session_id, idempotency_key, created_at)
           VALUES (?, ?, 'adjusted', ?, ?, ?, NULL, ?, ?)`,
        )
        .run(
          generateId('tx'),
          input.inventory_lot_id,
          input.quantity_value - oldQuantity,
          input.quantity_unit,
          input.reason,
          input.idempotency_key,
          now,
        );

      writeAuditLog(this.db, {
        tool_name: 'kitchen_inventory_adjust',
        entity_type: 'inventory_lot',
        entity_id: input.inventory_lot_id,
        operation: 'update',
        before_data: { quantity_value: oldQuantity, quantity_unit: lot.quantity_unit },
        after_data: { quantity_value: input.quantity_value, quantity_unit: input.quantity_unit, reason: input.reason },
      });
    });

    adjustTx();
    return this.get(input.inventory_lot_id)!;
  }

  consume(input: ConsumeInventoryInput): InventoryLot {
    const lot = this.get(input.inventory_lot_id);
    if (!lot) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Inventory lot not found', {
        details: { inventory_lot_id: input.inventory_lot_id },
      });
    }

    if (lot.quantity_value < input.quantity_value) {
      throw kitchenError(ErrorCode.INSUFFICIENT_QUANTITY, 'Insufficient quantity', {
        details: {
          requested: { value: input.quantity_value, unit: input.quantity_unit },
          available: { value: lot.quantity_value, unit: lot.quantity_unit },
        },
        recoverable: true,
        suggested_actions: ['find_substitution', 'reduce_recipe_servings'],
      });
    }

    const newQuantity = lot.quantity_value - input.quantity_value;
    const now = new Date().toISOString();

    const consumeTx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE inventory_lots
           SET quantity_value = ?, version = version + 1, updated_at = datetime('now')
           WHERE inventory_lot_id = ?`,
        )
        .run(newQuantity, input.inventory_lot_id);

      this.db
        .prepare(
          `INSERT INTO inventory_transactions (inventory_transaction_id, inventory_lot_id, transaction_type, quantity_delta, unit, reason, session_id, idempotency_key, created_at)
           VALUES (?, ?, 'consumed', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          generateId('tx'),
          input.inventory_lot_id,
          -input.quantity_value,
          input.quantity_unit,
          input.reason,
          input.session_id ?? null,
          input.idempotency_key,
          now,
        );

      writeAuditLog(this.db, {
        tool_name: 'kitchen_inventory_consume',
        entity_type: 'inventory_lot',
        entity_id: input.inventory_lot_id,
        operation: 'update',
        before_data: { quantity_value: lot.quantity_value },
        after_data: { quantity_value: newQuantity, reason: input.reason },
      });
    });

    consumeTx();
    return this.get(input.inventory_lot_id)!;
  }

  move(input: MoveInventoryInput): InventoryLot {
    const lot = this.get(input.inventory_lot_id);
    if (!lot) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Inventory lot not found', {
        details: { inventory_lot_id: input.inventory_lot_id },
      });
    }

    const location = this.db
      .prepare('SELECT location_id FROM locations WHERE location_id = ?')
      .get(input.location_id) as { location_id: string } | undefined;
    if (!location) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Destination location not found', {
        details: { location_id: input.location_id },
      });
    }

    const oldLocation = lot.location_id;
    const now = new Date().toISOString();

    const moveTx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE inventory_lots
           SET location_id = ?, version = version + 1, updated_at = datetime('now')
           WHERE inventory_lot_id = ?`,
        )
        .run(input.location_id, input.inventory_lot_id);

      this.db
        .prepare(
          `INSERT INTO inventory_transactions (inventory_transaction_id, inventory_lot_id, transaction_type, quantity_delta, unit, reason, session_id, idempotency_key, created_at)
           VALUES (?, ?, 'transferred', 0, ?, 'location_move', NULL, ?, ?)`,
        )
        .run(
          generateId('tx'),
          input.inventory_lot_id,
          lot.quantity_unit,
          input.idempotency_key,
          now,
        );

      writeAuditLog(this.db, {
        tool_name: 'kitchen_inventory_move',
        entity_type: 'inventory_lot',
        entity_id: input.inventory_lot_id,
        operation: 'update',
        before_data: { location_id: oldLocation },
        after_data: { location_id: input.location_id },
      });
    });

    moveTx();
    return this.get(input.inventory_lot_id)!;
  }

  expiring(householdId: string, options?: { before?: string; limit?: number }): InventoryLot[] {
    const before = options?.before ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const limit = options?.limit ?? 20;

    const rows = this.db
      .prepare(
        `SELECT * FROM inventory_lots
         WHERE household_id = ?
           AND quantity_value > 0
           AND state NOT IN ('consumed', 'discarded', 'spoiled')
           AND (
             (printed_expiry_at IS NOT NULL AND printed_expiry_at <= ?)
             OR (estimated_expiry_at IS NOT NULL AND estimated_expiry_at <= ?)
           )
         ORDER BY
           COALESCE(printed_expiry_at, estimated_expiry_at) ASC
         LIMIT ?`,
      )
      .all(householdId, before, before, limit) as LotRow[];

    return rows.map(rowToLot);
  }
}
