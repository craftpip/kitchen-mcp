import type Database from 'better-sqlite3';

export const migration007 = {
  version: 7,
  name: '007_phase8_shopping',

  up(db: Database.Database): void {
    db.exec(`
      -- Shopping lists
      CREATE TABLE IF NOT EXISTS shopping_lists (
        shopping_list_id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL REFERENCES households(household_id),
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_spl_household ON shopping_lists(household_id);
      CREATE INDEX IF NOT EXISTS idx_spl_status ON shopping_lists(status);

      -- Shopping items
      CREATE TABLE IF NOT EXISTS shopping_items (
        shopping_item_id TEXT PRIMARY KEY,
        shopping_list_id TEXT NOT NULL REFERENCES shopping_lists(shopping_list_id),
        ingredient_id TEXT NOT NULL,
        requested_quantity REAL NOT NULL,
        requested_unit TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'required',
        reason TEXT NOT NULL DEFAULT 'manual',
        source_recipe_id TEXT,
        preferred_brand TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'needed',
        purchased_quantity REAL,
        purchased_unit TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_spi_list ON shopping_items(shopping_list_id);
      CREATE INDEX IF NOT EXISTS idx_spi_ingredient ON shopping_items(ingredient_id);
      CREATE INDEX IF NOT EXISTS idx_spi_status ON shopping_items(status);
    `);
  },

  down(db: Database.Database): void {
    db.exec(`
      DROP TABLE IF EXISTS shopping_items;
      DROP TABLE IF EXISTS shopping_lists;
    `);
  },
};
