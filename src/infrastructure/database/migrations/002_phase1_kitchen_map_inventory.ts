import type Database from 'better-sqlite3';

export const migration002 = {
  version: 2,
  name: '002_phase1_kitchen_map_inventory',

  up(db: Database.Database): void {
    db.exec(`
      -- Storage locations (nested hierarchy)
      CREATE TABLE IF NOT EXISTS locations (
        location_id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL REFERENCES households(household_id),
        parent_location_id TEXT REFERENCES locations(location_id),
        name TEXT NOT NULL,
        location_type TEXT NOT NULL,
        storage_environment TEXT NOT NULL DEFAULT 'ambient',
        temperature_min_c REAL,
        temperature_max_c REAL,
        position_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_locations_household
        ON locations(household_id);
      CREATE INDEX IF NOT EXISTS idx_locations_parent
        ON locations(parent_location_id);

      -- Ingredient catalog (canonical definitions)
      CREATE TABLE IF NOT EXISTS ingredient_catalog (
        ingredient_id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other',
        subcategory TEXT,
        default_unit TEXT NOT NULL DEFAULT 'piece',
        density_g_per_ml REAL,
        average_piece_weight_g REAL,
        perishable INTEGER NOT NULL DEFAULT 0,
        default_storage_type TEXT NOT NULL DEFAULT 'ambient',
        allergens TEXT NOT NULL DEFAULT '[]',
        dietary_tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ingredient_category
        ON ingredient_catalog(category);
      CREATE INDEX IF NOT EXISTS idx_ingredient_canonical
        ON ingredient_catalog(canonical_name);

      -- Ingredient aliases
      CREATE TABLE IF NOT EXISTS ingredient_aliases (
        alias_id TEXT PRIMARY KEY,
        ingredient_id TEXT NOT NULL REFERENCES ingredient_catalog(ingredient_id),
        alias TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en',
        region TEXT,
        alias_type TEXT NOT NULL DEFAULT 'common_name',
        confidence TEXT NOT NULL DEFAULT 'verified',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_alias_ingredient
        ON ingredient_aliases(ingredient_id);
      CREATE INDEX IF NOT EXISTS idx_alias_text
        ON ingredient_aliases(alias);

      -- Inventory lots
      CREATE TABLE IF NOT EXISTS inventory_lots (
        inventory_lot_id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL REFERENCES households(household_id),
        ingredient_id TEXT NOT NULL REFERENCES ingredient_catalog(ingredient_id),
        display_label TEXT NOT NULL,
        brand TEXT,
        quantity_value REAL NOT NULL DEFAULT 0,
        quantity_unit TEXT NOT NULL,
        quantity_precision TEXT NOT NULL DEFAULT 'measured',
        location_id TEXT REFERENCES locations(location_id),
        state TEXT NOT NULL DEFAULT 'sealed',
        opened_at TEXT,
        purchased_at TEXT,
        printed_expiry_at TEXT,
        estimated_expiry_at TEXT,
        expiry_confidence TEXT,
        barcode TEXT,
        notes TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_lot_household
        ON inventory_lots(household_id);
      CREATE INDEX IF NOT EXISTS idx_lot_ingredient
        ON inventory_lots(ingredient_id);
      CREATE INDEX IF NOT EXISTS idx_lot_location
        ON inventory_lots(location_id);
      CREATE INDEX IF NOT EXISTS idx_lot_expiry
        ON inventory_lots(printed_expiry_at, estimated_expiry_at);
      CREATE INDEX IF NOT EXISTS idx_lot_state
        ON inventory_lots(state);

      -- Inventory transactions
      CREATE TABLE IF NOT EXISTS inventory_transactions (
        inventory_transaction_id TEXT PRIMARY KEY,
        inventory_lot_id TEXT NOT NULL REFERENCES inventory_lots(inventory_lot_id),
        transaction_type TEXT NOT NULL,
        quantity_delta REAL NOT NULL,
        unit TEXT NOT NULL,
        reason TEXT NOT NULL,
        session_id TEXT,
        idempotency_key TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_tx_lot
        ON inventory_transactions(inventory_lot_id);
      CREATE INDEX IF NOT EXISTS idx_tx_session
        ON inventory_transactions(session_id);
      CREATE INDEX IF NOT EXISTS idx_tx_idempotency
        ON inventory_transactions(idempotency_key);

      -- Seed a default household for local single-user mode
      INSERT OR IGNORE INTO households (household_id, name)
      VALUES ('hh_default', 'Home Kitchen');
    `);
  },

  down(db: Database.Database): void {
    db.exec(`
      DROP TABLE IF EXISTS inventory_transactions;
      DROP TABLE IF EXISTS inventory_lots;
      DROP TABLE IF EXISTS ingredient_aliases;
      DROP TABLE IF EXISTS ingredient_catalog;
      DROP TABLE IF EXISTS locations;
    `);
  },
};
