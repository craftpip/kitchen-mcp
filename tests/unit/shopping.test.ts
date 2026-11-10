import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, seedHousehold, seedIngredient } from '../fixtures/db.js';
import { ShoppingService } from '../../src/domain/shopping/service.js';
import { ErrorCode } from '../../src/shared/errors/catalogue.js';

let db: Database.Database;
let service: ShoppingService;

beforeEach(() => {
  db = createTestDb();
  seedHousehold(db);
  seedIngredient(db, 'ing_tomato', 'Tomato', 'vegetable');
  seedIngredient(db, 'ing_onion', 'Onion', 'vegetable');
  seedIngredient(db, 'ing_milk', 'Milk', 'dairy');
  service = new ShoppingService(db);
});

describe('ShoppingService', () => {
  describe('createList', () => {
    it('creates a shopping list with default active status', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Weekly groceries' });
      expect(list.shopping_list_id).toMatch(/^spl_/);
      expect(list.name).toBe('Weekly groceries');
      expect(list.status).toBe('active');
      expect(list.household_id).toBe('hh_default');
    });

    it('writes an audit log entry', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test list' });
      const audit = db.prepare('SELECT * FROM audit_log WHERE entity_id = ?').get(list.shopping_list_id) as { operation: string } | undefined;
      expect(audit).toBeDefined();
      expect(audit!.operation).toBe('create');
    });
  });

  describe('getList / listLists', () => {
    it('retrieves a list by id', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      const found = service.getList(list.shopping_list_id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Test');
    });

    it('returns undefined for nonexistent list', () => {
      expect(service.getList('spl_nonexistent')).toBeUndefined();
    });

    it('lists all lists for a household', () => {
      service.createList({ household_id: 'hh_default', name: 'List 1' });
      service.createList({ household_id: 'hh_default', name: 'List 2' });
      const lists = service.listLists('hh_default');
      expect(lists.length).toBe(2);
    });

    it('filters by status', () => {
      service.createList({ household_id: 'hh_default', name: 'Active' });
      const list = service.createList({ household_id: 'hh_default', name: 'Done' });
      service.completeList(list.shopping_list_id);

      const active = service.listLists('hh_default', { status: 'active' });
      expect(active.length).toBe(1);
      expect(active[0].name).toBe('Active');

      const completed = service.listLists('hh_default', { status: 'completed' });
      expect(completed.length).toBe(1);
    });
  });

  describe('addItem', () => {
    it('adds an item to an active list', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      const item = service.addItem({
        shopping_list_id: list.shopping_list_id,
        ingredient_id: 'ing_tomato',
        requested_quantity: 5,
        requested_unit: 'piece',
      });
      expect(item.shopping_item_id).toMatch(/^spi_/);
      expect(item.ingredient_id).toBe('ing_tomato');
      expect(item.requested_quantity).toBe(5);
      expect(item.status).toBe('needed');
      expect(item.priority).toBe('required');
    });

    it('rejects adding to a nonexistent list', () => {
      expect(() =>
        service.addItem({
          shopping_list_id: 'spl_nonexistent',
          ingredient_id: 'ing_tomato',
          requested_quantity: 5,
          requested_unit: 'piece',
        }),
      ).toThrow();
    });

    it('rejects adding to a completed list', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      service.completeList(list.shopping_list_id);
      expect(() =>
        service.addItem({
          shopping_list_id: list.shopping_list_id,
          ingredient_id: 'ing_tomato',
          requested_quantity: 5,
          requested_unit: 'piece',
        }),
      ).toThrow();
    });

    it('rejects adding with nonexistent ingredient', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      expect(() =>
        service.addItem({
          shopping_list_id: list.shopping_list_id,
          ingredient_id: 'ing_nonexistent',
          requested_quantity: 5,
          requested_unit: 'piece',
        }),
      ).toThrow();
    });

    it('sets priority and reason from input', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      const item = service.addItem({
        shopping_list_id: list.shopping_list_id,
        ingredient_id: 'ing_tomato',
        requested_quantity: 3,
        requested_unit: 'kg',
        priority: 'optional',
        reason: 'restock_threshold',
        notes: 'Organic preferred',
      });
      expect(item.priority).toBe('optional');
      expect(item.reason).toBe('restock_threshold');
      expect(item.notes).toBe('Organic preferred');
    });
  });

  describe('getItems', () => {
    it('returns all items for a list', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      service.addItem({ shopping_list_id: list.shopping_list_id, ingredient_id: 'ing_tomato', requested_quantity: 5, requested_unit: 'piece' });
      service.addItem({ shopping_list_id: list.shopping_list_id, ingredient_id: 'ing_onion', requested_quantity: 3, requested_unit: 'piece' });

      const items = service.getItems(list.shopping_list_id);
      expect(items.length).toBe(2);
    });

    it('filters by status', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      const item = service.addItem({ shopping_list_id: list.shopping_list_id, ingredient_id: 'ing_tomato', requested_quantity: 5, requested_unit: 'piece' });
      service.addItem({ shopping_list_id: list.shopping_list_id, ingredient_id: 'ing_onion', requested_quantity: 3, requested_unit: 'piece' });
      service.markPurchased(item.shopping_item_id);

      const needed = service.getItems(list.shopping_list_id, { status: 'needed' });
      expect(needed.length).toBe(1);
      expect(needed[0].ingredient_id).toBe('ing_onion');

      const purchased = service.getItems(list.shopping_list_id, { status: 'purchased' });
      expect(purchased.length).toBe(1);
    });
  });

  describe('updateItem', () => {
    it('updates item fields', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      const item = service.addItem({ shopping_list_id: list.shopping_list_id, ingredient_id: 'ing_tomato', requested_quantity: 5, requested_unit: 'piece' });

      const updated = service.updateItem({
        shopping_item_id: item.shopping_item_id,
        requested_quantity: 10,
        priority: 'preferred',
        notes: 'Updated note',
      });
      expect(updated.requested_quantity).toBe(10);
      expect(updated.priority).toBe('preferred');
      expect(updated.notes).toBe('Updated note');
    });

    it('returns unchanged item when no updates provided', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      const item = service.addItem({ shopping_list_id: list.shopping_list_id, ingredient_id: 'ing_tomato', requested_quantity: 5, requested_unit: 'piece' });
      const same = service.updateItem({ shopping_item_id: item.shopping_item_id });
      expect(same.requested_quantity).toBe(5);
    });
  });

  describe('removeItem', () => {
    it('removes an item from the list', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      const item = service.addItem({ shopping_list_id: list.shopping_list_id, ingredient_id: 'ing_tomato', requested_quantity: 5, requested_unit: 'piece' });
      service.removeItem(item.shopping_item_id);

      const items = service.getItems(list.shopping_list_id);
      expect(items.length).toBe(0);
    });
  });

  describe('markPurchased', () => {
    it('marks a needed item as purchased', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      const item = service.addItem({ shopping_list_id: list.shopping_list_id, ingredient_id: 'ing_tomato', requested_quantity: 5, requested_unit: 'piece' });

      const purchased = service.markPurchased(item.shopping_item_id, 4, 'piece');
      expect(purchased.status).toBe('purchased');
      expect(purchased.purchased_quantity).toBe(4);
      expect(purchased.purchased_unit).toBe('piece');
    });

    it('defaults purchased quantity to requested when not specified', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      const item = service.addItem({ shopping_list_id: list.shopping_list_id, ingredient_id: 'ing_tomato', requested_quantity: 5, requested_unit: 'kg' });

      const purchased = service.markPurchased(item.shopping_item_id);
      expect(purchased.purchased_quantity).toBe(5);
      expect(purchased.purchased_unit).toBe('kg');
    });

    it('rejects marking a cancelled item as purchased', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      const item = service.addItem({ shopping_list_id: list.shopping_list_id, ingredient_id: 'ing_tomato', requested_quantity: 5, requested_unit: 'piece' });
      service.updateItem({ shopping_item_id: item.shopping_item_id, status: 'cancelled' });

      expect(() => service.markPurchased(item.shopping_item_id)).toThrow();
    });
  });

  describe('storePurchasedItem', () => {
    it('stores a purchased item and creates an inventory lot', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      const item = service.addItem({ shopping_list_id: list.shopping_list_id, ingredient_id: 'ing_tomato', requested_quantity: 5, requested_unit: 'piece' });
      service.markPurchased(item.shopping_item_id);

      const result = service.storePurchasedItem(item.shopping_item_id);
      expect(result.item.status).toBe('stored');
      expect(result.lot_id).toBeDefined();
      expect(result.lot_id).toMatch(/^lot_/);

      const lot = db.prepare('SELECT * FROM inventory_lots WHERE inventory_lot_id = ?').get(result.lot_id!) as { ingredient_id: string; quantity_value: number };
      expect(lot.ingredient_id).toBe('ing_tomato');
      expect(lot.quantity_value).toBe(5);
    });

    it('rejects storing a non-purchased item', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      const item = service.addItem({ shopping_list_id: list.shopping_list_id, ingredient_id: 'ing_tomato', requested_quantity: 5, requested_unit: 'piece' });

      expect(() => service.storePurchasedItem(item.shopping_item_id)).toThrow();
    });
  });

  describe('completeList / archiveList', () => {
    it('marks a list as completed', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      const completed = service.completeList(list.shopping_list_id);
      expect(completed.status).toBe('completed');
    });

    it('archives a list', () => {
      const list = service.createList({ household_id: 'hh_default', name: 'Test' });
      const archived = service.archiveList(list.shopping_list_id);
      expect(archived.status).toBe('archived');
    });
  });

  describe('generateForRecipes', () => {
    it('creates a shopping list from recipe requirements minus inventory', () => {
      db.prepare(
        `INSERT INTO ingredient_catalog (ingredient_id, canonical_name, display_name, category, default_unit, perishable, default_storage_type, allergens, dietary_tags)
         VALUES ('ing_flour', 'Flour', 'Flour', 'flour', 'kg', 0, 'ambient', '[]', '[]')`,
      ).run();

      const versionId = `rv_bread_v1`;
      db.prepare(
        `INSERT INTO recipes (recipe_id, name, description, cuisine, meal_types, difficulty, default_servings, active_version_id, status, source_type, created_at, updated_at)
         VALUES ('recipe_bread', 'Bread', 'Test bread', 'Indian', '["lunch"]', 'beginner', 2, ?, 'verified', 'user_entered', datetime('now'), datetime('now'))`,
      ).run(versionId);

      db.prepare(
        `INSERT INTO recipe_versions (recipe_version_id, recipe_id, version_number, yield_value, yield_unit, prep_time_minutes, cook_time_minutes, rest_time_minutes, change_summary, created_at)
         VALUES (?, 'recipe_bread', 1, 2, 'serving', 10, 30, 0, 'Initial', datetime('now'))`,
      ).run(versionId);

      db.prepare(
        `INSERT INTO recipe_ingredients (recipe_ingredient_id, recipe_version_id, ingredient_id, quantity_value, quantity_unit, quantity_min, quantity_max, required, preparation, usage_role, group_name, sort_order, notes)
         VALUES ('ri_bread_1', ?, 'ing_flour', 2, 'kg', 2, 2, 1, NULL, 'main', NULL, 0, NULL)`,
      ).run(versionId);

      const list = service.generateForRecipes({
        household_id: 'hh_default',
        recipe_ids: ['recipe_bread'],
        servings: { recipe_bread: 2 },
      });

      expect(list.name).toMatch(/Recipe shopping/);
      const items = service.getItems(list.shopping_list_id);
      expect(items.length).toBe(1);
      expect(items[0].ingredient_id).toBe('ing_flour');
      expect(items[0].requested_quantity).toBe(2);
      expect(items[0].reason).toBe('planned_recipes');
    });

    it('subtracts existing inventory from recipe needs', () => {
      db.prepare(
        `INSERT INTO ingredient_catalog (ingredient_id, canonical_name, display_name, category, default_unit, perishable, default_storage_type, allergens, dietary_tags)
         VALUES ('ing_sugar', 'Sugar', 'Sugar', 'condiment', 'kg', 0, 'ambient', '[]', '[]')`,
      ).run();

      const versionId = `rv_tea_v1`;
      db.prepare(
        `INSERT INTO recipes (recipe_id, name, description, cuisine, meal_types, difficulty, default_servings, active_version_id, status, source_type, created_at, updated_at)
         VALUES ('recipe_tea', 'Tea', 'Test tea', 'Indian', '["breakfast"]', 'beginner', 1, ?, 'verified', 'user_entered', datetime('now'), datetime('now'))`,
      ).run(versionId);

      db.prepare(
        `INSERT INTO recipe_versions (recipe_version_id, recipe_id, version_number, yield_value, yield_unit, prep_time_minutes, cook_time_minutes, rest_time_minutes, change_summary, created_at)
         VALUES (?, 'recipe_tea', 1, 1, 'serving', 5, 5, 0, 'Initial', datetime('now'))`,
      ).run(versionId);

      db.prepare(
        `INSERT INTO recipe_ingredients (recipe_ingredient_id, recipe_version_id, ingredient_id, quantity_value, quantity_unit, quantity_min, quantity_max, required, preparation, usage_role, group_name, sort_order, notes)
         VALUES ('ri_tea_1', ?, 'ing_sugar', 0.5, 'kg', 0.5, 0.5, 1, NULL, 'main', NULL, 0, NULL)`,
      ).run(versionId);

      db.prepare(
        `INSERT INTO inventory_lots (inventory_lot_id, household_id, ingredient_id, display_label, quantity_value, quantity_unit, quantity_precision, state, version, created_at, updated_at)
         VALUES ('lot_sugar_1', 'hh_default', 'ing_sugar', 'Sugar bag', 0.3, 'kg', 'measured', 'sealed', 1, datetime('now'), datetime('now'))`,
      ).run();

      const list = service.generateForRecipes({
        household_id: 'hh_default',
        recipe_ids: ['recipe_tea'],
        servings: { recipe_tea: 1 },
      });

      const items = service.getItems(list.shopping_list_id);
      expect(items.length).toBe(1);
      expect(items[0].ingredient_id).toBe('ing_sugar');
      expect(items[0].requested_quantity).toBeCloseTo(0.2, 5);
    });

    it('creates an empty list when all ingredients are in stock', () => {
      db.prepare(
        `INSERT INTO ingredient_catalog (ingredient_id, canonical_name, display_name, category, default_unit, perishable, default_storage_type, allergens, dietary_tags)
         VALUES ('ing_salt', 'Salt', 'Salt', 'condiment', 'kg', 0, 'ambient', '[]', '[]')`,
      ).run();

      const versionId = `rv_rice_v1`;
      db.prepare(
        `INSERT INTO recipes (recipe_id, name, description, cuisine, meal_types, difficulty, default_servings, active_version_id, status, source_type, created_at, updated_at)
         VALUES ('recipe_rice', 'Rice', 'Test rice', 'Indian', '["lunch"]', 'beginner', 1, ?, 'verified', 'user_entered', datetime('now'), datetime('now'))`,
      ).run(versionId);

      db.prepare(
        `INSERT INTO recipe_versions (recipe_version_id, recipe_id, version_number, yield_value, yield_unit, prep_time_minutes, cook_time_minutes, rest_time_minutes, change_summary, created_at)
         VALUES (?, 'recipe_rice', 1, 1, 'serving', 5, 15, 0, 'Initial', datetime('now'))`,
      ).run(versionId);

      db.prepare(
        `INSERT INTO recipe_ingredients (recipe_ingredient_id, recipe_version_id, ingredient_id, quantity_value, quantity_unit, quantity_min, quantity_max, required, preparation, usage_role, group_name, sort_order, notes)
         VALUES ('ri_rice_1', ?, 'ing_salt', 0.01, 'kg', 0.01, 0.01, 1, NULL, 'main', NULL, 0, NULL)`,
      ).run(versionId);

      db.prepare(
        `INSERT INTO inventory_lots (inventory_lot_id, household_id, ingredient_id, display_label, quantity_value, quantity_unit, quantity_precision, state, version, created_at, updated_at)
         VALUES ('lot_salt_1', 'hh_default', 'ing_salt', 'Salt box', 1, 'kg', 'measured', 'sealed', 1, datetime('now'), datetime('now'))`,
      ).run();

      const list = service.generateForRecipes({
        household_id: 'hh_default',
        recipe_ids: ['recipe_rice'],
        servings: { recipe_rice: 1 },
      });

      const items = service.getItems(list.shopping_list_id);
      expect(items.length).toBe(0);
    });
  });

  describe('generateRestock', () => {
    it('generates items for ingredients below threshold', () => {
      db.prepare(
        `INSERT INTO inventory_lots (inventory_lot_id, household_id, ingredient_id, display_label, quantity_value, quantity_unit, quantity_precision, state, version, created_at, updated_at)
         VALUES ('lot_milk_1', 'hh_default', 'ing_milk', 'Milk packet', 0.2, 'litre', 'measured', 'opened', 1, datetime('now'), datetime('now'))`,
      ).run();

      const list = service.generateRestock('hh_default', [
        { ingredient_id: 'ing_milk', min_quantity: 1, unit: 'litre' },
        { ingredient_id: 'ing_tomato', min_quantity: 5, unit: 'piece' },
      ]);

      const items = service.getItems(list.shopping_list_id);
      expect(items.length).toBe(2);

      const milkItem = items.find((i) => i.ingredient_id === 'ing_milk');
      expect(milkItem).toBeDefined();
      expect(milkItem!.requested_quantity).toBeCloseTo(0.8, 5);
      expect(milkItem!.reason).toBe('restock_threshold');

      const tomatoItem = items.find((i) => i.ingredient_id === 'ing_tomato');
      expect(tomatoItem).toBeDefined();
      expect(tomatoItem!.requested_quantity).toBe(5);
    });

    it('skips ingredients above threshold', () => {
      db.prepare(
        `INSERT INTO inventory_lots (inventory_lot_id, household_id, ingredient_id, display_label, quantity_value, quantity_unit, quantity_precision, state, version, created_at, updated_at)
         VALUES ('lot_milk_2', 'hh_default', 'ing_milk', 'Milk carton', 2, 'litre', 'measured', 'sealed', 1, datetime('now'), datetime('now'))`,
      ).run();

      const list = service.generateRestock('hh_default', [
        { ingredient_id: 'ing_milk', min_quantity: 1, unit: 'litre' },
      ]);

      const items = service.getItems(list.shopping_list_id);
      expect(items.length).toBe(0);
    });
  });
});
