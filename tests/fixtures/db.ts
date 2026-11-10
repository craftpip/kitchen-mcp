import Database from 'better-sqlite3';
import { runMigrations } from '../../src/infrastructure/database/migrate.js';

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  runMigrations(db);
  return db;
}

export function seedHousehold(db: Database.Database, householdId = 'hh_default'): void {
  db.prepare(
    `INSERT OR IGNORE INTO households (household_id, name, default_timezone, default_language, default_currency, default_measurement_system)
     VALUES (?, 'Test Kitchen', 'Asia/Kolkata', 'en', 'INR', 'metric')`,
  ).run(householdId);
}

export function seedIngredient(db: Database.Database, id: string, name: string, category = 'vegetable'): void {
  db.prepare(
    `INSERT OR IGNORE INTO ingredient_catalog (ingredient_id, canonical_name, display_name, category, default_unit, perishable, default_storage_type, allergens, dietary_tags)
     VALUES (?, ?, ?, ?, 'piece', 1, 'refrigerated', '[]', '[]')`,
  ).run(id, name, name, category);
}

export function seedRecipe(
  db: Database.Database,
  recipeId: string,
  name: string,
  options?: {
    meal_types?: string[];
    difficulty?: string;
    default_servings?: number;
    status?: string;
    ingredients?: { ingredient_id: string; quantity_value: number; quantity_unit: string; required?: boolean }[];
    prep_time_minutes?: number;
    cook_time_minutes?: number;
  },
): string {
  const mealTypes = JSON.stringify(options?.meal_types ?? ['lunch']);
  const status = options?.status ?? 'verified';
  const servings = options?.default_servings ?? 2;

  db.prepare(
    `INSERT INTO recipes (recipe_id, name, description, cuisine, meal_types, difficulty, default_servings, active_version_id, status, source_type, created_at, updated_at)
     VALUES (?, ?, 'Test recipe', 'Indian', ?, ?, ?, NULL, ?, 'user_entered', datetime('now'), datetime('now'))`,
  ).run(recipeId, name, mealTypes, options?.difficulty ?? 'beginner', servings, status);

  const versionId = `rv_${recipeId.replace('recipe_', '')}_v1`;
  db.prepare(
    `INSERT INTO recipe_versions (recipe_version_id, recipe_id, version_number, yield_value, yield_unit, prep_time_minutes, cook_time_minutes, rest_time_minutes, change_summary, created_at)
     VALUES (?, ?, 1, ?, 'serving', ?, ?, 0, 'Initial version', datetime('now'))`,
  ).run(versionId, recipeId, servings, options?.prep_time_minutes ?? 10, options?.cook_time_minutes ?? 20);

  if (options?.ingredients) {
    for (let i = 0; i < options.ingredients.length; i++) {
      const ing = options.ingredients[i];
      db.prepare(
        `INSERT INTO recipe_ingredients (recipe_ingredient_id, recipe_version_id, ingredient_id, quantity_value, quantity_unit, quantity_min, quantity_max, required, preparation, usage_role, group_name, sort_order, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'main', NULL, ?, NULL)`,
      ).run(
        `ri_${recipeId.replace('recipe_', '')}_${i}`,
        versionId,
        ing.ingredient_id,
        ing.quantity_value,
        ing.quantity_unit,
        ing.quantity_value,
        ing.quantity_value,
        ing.required !== false ? 1 : 0,
        i * 10,
      );
    }
  }

  db.prepare(
    `UPDATE recipes SET active_version_id = ? WHERE recipe_id = ?`,
  ).run(versionId, recipeId);

  return versionId;
}

export function seedInventoryLot(
  db: Database.Database,
  lotId: string,
  householdId: string,
  ingredientId: string,
  quantity: number,
  unit = 'piece',
): void {
  db.prepare(
    `INSERT INTO inventory_lots (inventory_lot_id, household_id, ingredient_id, display_label, quantity_value, quantity_unit, quantity_precision, state, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'measured', 'sealed', 1, datetime('now'), datetime('now'))`,
  ).run(lotId, householdId, ingredientId, `${ingredientId} test`, quantity, unit);
}
