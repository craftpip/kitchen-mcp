import type Database from 'better-sqlite3';
import { generateId } from '../../shared/ids.js';
import { kitchenError, ErrorCode } from '../../shared/errors/catalogue.js';
import { writeAuditLog } from '../../infrastructure/audit.js';
import type {
  ShoppingList,
  ShoppingItem,
  CreateShoppingListInput,
  AddShoppingItemInput,
  UpdateShoppingItemInput,
  ShoppingItemStatus,
  ShoppingItemPriority,
  ShoppingListStatus,
} from './types.js';

interface ListRow {
  shopping_list_id: string;
  household_id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToList(row: ListRow): ShoppingList {
  return {
    ...row,
    status: row.status as ShoppingListStatus,
  };
}

interface ItemRow {
  shopping_item_id: string;
  shopping_list_id: string;
  ingredient_id: string;
  requested_quantity: number;
  requested_unit: string;
  priority: string;
  reason: string;
  source_recipe_id: string | null;
  preferred_brand: string | null;
  notes: string | null;
  status: string;
  purchased_quantity: number | null;
  purchased_unit: string | null;
  created_at: string;
  updated_at: string;
}

function rowToItem(row: ItemRow): ShoppingItem {
  return {
    ...row,
    priority: row.priority as ShoppingItemPriority,
    status: row.status as ShoppingItemStatus,
  };
}

export class ShoppingService {
  constructor(private db: Database.Database) {}

  createList(input: CreateShoppingListInput): ShoppingList {
    const id = generateId('spl');
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO shopping_lists (shopping_list_id, household_id, name, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)`,
      )
      .run(id, input.household_id, input.name, now, now);

    writeAuditLog(this.db, {
      tool_name: 'kitchen_shopping_list_create',
      entity_type: 'shopping_list',
      entity_id: id,
      operation: 'create',
      after_data: { name: input.name },
    });

    return this.getList(id)!;
  }

  getList(listId: string): ShoppingList | undefined {
    const row = this.db
      .prepare('SELECT * FROM shopping_lists WHERE shopping_list_id = ?')
      .get(listId) as ListRow | undefined;
    return row ? rowToList(row) : undefined;
  }

  listLists(householdId: string, options?: { status?: string; limit?: number }): ShoppingList[] {
    const conditions = ['household_id = ?'];
    const params: unknown[] = [householdId];

    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    const limit = options?.limit ?? 20;
    const where = conditions.join(' AND ');

    const rows = this.db
      .prepare(
        `SELECT * FROM shopping_lists WHERE ${where} ORDER BY created_at DESC LIMIT ?`,
      )
      .all(...params, limit) as ListRow[];

    return rows.map(rowToList);
  }

  getItems(listId: string, options?: { status?: string; limit?: number }): ShoppingItem[] {
    const conditions = ['shopping_list_id = ?'];
    const params: unknown[] = [listId];

    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    const limit = options?.limit ?? 100;
    const where = conditions.join(' AND ');

    const rows = this.db
      .prepare(
        `SELECT * FROM shopping_items WHERE ${where} ORDER BY created_at LIMIT ?`,
      )
      .all(...params, limit) as ItemRow[];

    return rows.map(rowToItem);
  }

  addItem(input: AddShoppingItemInput): ShoppingItem {
    const list = this.getList(input.shopping_list_id);
    if (!list) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Shopping list not found', {
        details: { shopping_list_id: input.shopping_list_id },
      });
    }

    if (list.status !== 'active') {
      throw kitchenError(ErrorCode.SESSION_STATE_CONFLICT, 'Shopping list is not active', {
        details: { shopping_list_id: input.shopping_list_id, status: list.status },
      });
    }

    const ingredient = this.db
      .prepare('SELECT ingredient_id FROM ingredient_catalog WHERE ingredient_id = ?')
      .get(input.ingredient_id) as { ingredient_id: string } | undefined;
    if (!ingredient) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Ingredient not found', {
        details: { ingredient_id: input.ingredient_id },
      });
    }

    const id = generateId('spi');
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO shopping_items (shopping_item_id, shopping_list_id, ingredient_id, requested_quantity, requested_unit, priority, reason, source_recipe_id, preferred_brand, notes, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'needed', ?, ?)`,
      )
      .run(
        id,
        input.shopping_list_id,
        input.ingredient_id,
        input.requested_quantity,
        input.requested_unit,
        input.priority ?? 'required',
        input.reason ?? 'manual',
        input.source_recipe_id ?? null,
        input.preferred_brand ?? null,
        input.notes ?? null,
        now,
        now,
      );

    this.db
      .prepare("UPDATE shopping_lists SET updated_at = datetime('now') WHERE shopping_list_id = ?")
      .run(input.shopping_list_id);

    writeAuditLog(this.db, {
      tool_name: 'kitchen_shopping_item_add',
      entity_type: 'shopping_item',
      entity_id: id,
      operation: 'create',
      after_data: { ingredient_id: input.ingredient_id, requested_quantity: input.requested_quantity },
    });

    return this.getItem(id)!;
  }

  getItem(itemId: string): ShoppingItem | undefined {
    const row = this.db
      .prepare('SELECT * FROM shopping_items WHERE shopping_item_id = ?')
      .get(itemId) as ItemRow | undefined;
    return row ? rowToItem(row) : undefined;
  }

  updateItem(input: UpdateShoppingItemInput): ShoppingItem {
    const item = this.getItem(input.shopping_item_id);
    if (!item) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Shopping item not found', {
        details: { shopping_item_id: input.shopping_item_id },
      });
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }
    if (input.requested_quantity !== undefined) {
      updates.push('requested_quantity = ?');
      params.push(input.requested_quantity);
    }
    if (input.requested_unit !== undefined) {
      updates.push('requested_unit = ?');
      params.push(input.requested_unit);
    }
    if (input.priority !== undefined) {
      updates.push('priority = ?');
      params.push(input.priority);
    }
    if (input.notes !== undefined) {
      updates.push('notes = ?');
      params.push(input.notes);
    }
    if (input.purchased_quantity !== undefined) {
      updates.push('purchased_quantity = ?');
      params.push(input.purchased_quantity);
    }
    if (input.purchased_unit !== undefined) {
      updates.push('purchased_unit = ?');
      params.push(input.purchased_unit);
    }

    if (updates.length === 0) return item;

    updates.push("updated_at = datetime('now')");
    params.push(input.shopping_item_id);

    this.db
      .prepare(`UPDATE shopping_items SET ${updates.join(', ')} WHERE shopping_item_id = ?`)
      .run(...params);

    this.db
      .prepare("UPDATE shopping_lists SET updated_at = datetime('now') WHERE shopping_list_id = ?")
      .run(item.shopping_list_id);

    return this.getItem(input.shopping_item_id)!;
  }

  removeItem(itemId: string): void {
    const item = this.getItem(itemId);
    if (!item) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Shopping item not found', {
        details: { shopping_item_id: itemId },
      });
    }

    this.db
      .prepare('DELETE FROM shopping_items WHERE shopping_item_id = ?')
      .run(itemId);

    this.db
      .prepare("UPDATE shopping_lists SET updated_at = datetime('now') WHERE shopping_list_id = ?")
      .run(item.shopping_list_id);

    writeAuditLog(this.db, {
      tool_name: 'kitchen_shopping_item_remove',
      entity_type: 'shopping_item',
      entity_id: itemId,
      operation: 'delete',
    });
  }

  markPurchased(itemId: string, purchasedQuantity?: number, purchasedUnit?: string): ShoppingItem {
    const item = this.getItem(itemId);
    if (!item) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Shopping item not found', {
        details: { shopping_item_id: itemId },
      });
    }

    if (item.status === 'cancelled' || item.status === 'stored') {
      throw kitchenError(ErrorCode.SESSION_STATE_CONFLICT, `Cannot mark item as purchased in status '${item.status}'`, {
        details: { shopping_item_id: itemId, status: item.status },
      });
    }

    return this.updateItem({
      shopping_item_id: itemId,
      status: 'purchased',
      purchased_quantity: purchasedQuantity ?? item.requested_quantity,
      purchased_unit: purchasedUnit ?? item.requested_unit,
    });
  }

  storePurchasedItem(itemId: string, inventoryLotId?: string): { item: ShoppingItem; lot_id: string | null } {
    const item = this.getItem(itemId);
    if (!item) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Shopping item not found', {
        details: { shopping_item_id: itemId },
      });
    }

    if (item.status !== 'purchased') {
      throw kitchenError(ErrorCode.SESSION_STATE_CONFLICT, 'Item must be purchased before storing', {
        details: { shopping_item_id: itemId, status: item.status },
      });
    }

    const updated = this.updateItem({
      shopping_item_id: itemId,
      status: 'stored',
    });

    let lotId: string | null = inventoryLotId ?? null;

    if (!lotId) {
      const id = generateId('lot');
      const now = new Date().toISOString();
      const quantity = item.purchased_quantity ?? item.requested_quantity;
      const unit = item.purchased_unit ?? item.requested_unit;

      this.db
        .prepare(
          `INSERT INTO inventory_lots (inventory_lot_id, household_id, ingredient_id, display_label, brand, quantity_value, quantity_unit, quantity_precision, state, version, created_at, updated_at)
           SELECT ?, hh.household_id, ?, ?, ?, ?, ?, ?, 'sealed', 1, ?, ?
           FROM shopping_lists sl
           JOIN households hh ON hh.household_id = sl.household_id
           WHERE sl.shopping_list_id = ?`,
        )
        .run(
          id,
          item.ingredient_id,
          item.notes ?? item.ingredient_id,
          item.preferred_brand ?? null,
          quantity,
          unit,
          'package_declared',
          now,
          now,
          item.shopping_list_id,
        );

      this.db
        .prepare(
          `INSERT INTO inventory_transactions (inventory_transaction_id, inventory_lot_id, transaction_type, quantity_delta, unit, reason, session_id, idempotency_key, created_at)
           VALUES (?, ?, 'acquired', ?, ?, 'shopping_store', NULL, NULL, ?)`,
        )
        .run(generateId('tx'), id, quantity, unit, now);

      writeAuditLog(this.db, {
        tool_name: 'kitchen_shopping_store_purchased_item',
        entity_type: 'inventory_lot',
        entity_id: id,
        operation: 'create',
        after_data: { ingredient_id: item.ingredient_id, quantity, unit },
      });

      lotId = id;
    }

    return { item: updated, lot_id: lotId };
  }

  completeList(listId: string): ShoppingList {
    const list = this.getList(listId);
    if (!list) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Shopping list not found', {
        details: { shopping_list_id: listId },
      });
    }

    this.db
      .prepare("UPDATE shopping_lists SET status = 'completed', updated_at = datetime('now') WHERE shopping_list_id = ?")
      .run(listId);

    writeAuditLog(this.db, {
      tool_name: 'kitchen_shopping_list_complete',
      entity_type: 'shopping_list',
      entity_id: listId,
      operation: 'update',
      before_data: { status: list.status },
      after_data: { status: 'completed' },
    });

    return this.getList(listId)!;
  }

  archiveList(listId: string): ShoppingList {
    const list = this.getList(listId);
    if (!list) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Shopping list not found', {
        details: { shopping_list_id: listId },
      });
    }

    this.db
      .prepare("UPDATE shopping_lists SET status = 'archived', updated_at = datetime('now') WHERE shopping_list_id = ?")
      .run(listId);

    return this.getList(listId)!;
  }

  generateForRecipes(input: {
    household_id: string;
    recipe_ids: string[];
    servings: Record<string, number>;
    name?: string;
  }): ShoppingList {
    const listName = input.name ?? `Recipe shopping — ${new Date().toISOString().slice(0, 10)}`;
    const list = this.createList({ household_id: input.household_id, name: listName });

    const ingredientNeeds = new Map<string, { quantity: number; unit: string; recipe_ids: string[] }>();

    for (const recipeId of input.recipe_ids) {
      const recipe = this.db
        .prepare('SELECT * FROM recipes WHERE recipe_id = ?')
        .get(recipeId) as { recipe_id: string; active_version_id: string | null; default_servings: number } | undefined;

      if (!recipe || !recipe.active_version_id) continue;

      const servings = input.servings[recipeId] ?? recipe.default_servings;
      const scaleFactor = servings / (recipe.default_servings || 1);

      const ingredients = this.db
        .prepare(
          "SELECT * FROM recipe_ingredients WHERE recipe_version_id = ? AND required = 1",
        )
        .all(recipe.active_version_id) as { ingredient_id: string; quantity_value: number; quantity_unit: string }[];

      for (const ing of ingredients) {
        const scaledQty = ing.quantity_value * scaleFactor;
        const existing = ingredientNeeds.get(ing.ingredient_id);

        if (existing && existing.unit === ing.quantity_unit) {
          existing.quantity += scaledQty;
          existing.recipe_ids.push(recipeId);
        } else if (!existing) {
          ingredientNeeds.set(ing.ingredient_id, {
            quantity: scaledQty,
            unit: ing.quantity_unit,
            recipe_ids: [recipeId],
          });
        }
      }
    }

    const inventoryRows = this.db
      .prepare(
        "SELECT ingredient_id, SUM(quantity_value) as total FROM inventory_lots WHERE household_id = ? AND quantity_value > 0 AND state NOT IN ('consumed', 'discarded', 'spoiled') GROUP BY ingredient_id",
      )
      .all(input.household_id) as { ingredient_id: string; total: number }[];

    const inventoryMap = new Map(inventoryRows.map((r) => [r.ingredient_id, r.total]));

    for (const [ingredientId, need] of ingredientNeeds) {
      const have = inventoryMap.get(ingredientId) ?? 0;
      const deficit = need.quantity - have;

      if (deficit > 0) {
        this.addItem({
          shopping_list_id: list.shopping_list_id,
          ingredient_id: ingredientId,
          requested_quantity: Math.round(deficit * 1000) / 1000,
          requested_unit: need.unit,
          priority: 'required',
          reason: 'planned_recipes',
        });
      }
    }

    return list;
  }

  generateRestock(householdId: string, thresholds: { ingredient_id: string; min_quantity: number; unit: string }[], name?: string): ShoppingList {
    const listName = name ?? `Restock — ${new Date().toISOString().slice(0, 10)}`;
    const list = this.createList({ household_id: householdId, name: listName });

    for (const threshold of thresholds) {
      const inventory = this.db
        .prepare(
          "SELECT SUM(quantity_value) as total FROM inventory_lots WHERE household_id = ? AND ingredient_id = ? AND quantity_value > 0 AND state NOT IN ('consumed', 'discarded', 'spoiled')",
        )
        .get(householdId, threshold.ingredient_id) as { total: number | null };

      const have = inventory.total ?? 0;

      if (have < threshold.min_quantity) {
        const deficit = threshold.min_quantity - have;
        this.addItem({
          shopping_list_id: list.shopping_list_id,
          ingredient_id: threshold.ingredient_id,
          requested_quantity: Math.round(deficit * 1000) / 1000,
          requested_unit: threshold.unit,
          priority: 'required',
          reason: 'restock_threshold',
        });
      }
    }

    return list;
  }
}
