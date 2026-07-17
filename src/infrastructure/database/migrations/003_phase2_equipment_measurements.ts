import type Database from 'better-sqlite3';

export const migration003 = {
  version: 3,
  name: '003_phase2_equipment_measurements',

  up(db: Database.Database): void {
    db.exec(`
      -- Equipment
      CREATE TABLE IF NOT EXISTS equipment (
        equipment_id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL REFERENCES households(household_id),
        name TEXT NOT NULL,
        equipment_type TEXT NOT NULL,
        capacity_value REAL,
        capacity_unit TEXT,
        manufacturer TEXT,
        model TEXT,
        condition TEXT NOT NULL DEFAULT 'working',
        available INTEGER NOT NULL DEFAULT 1,
        location_id TEXT REFERENCES locations(location_id),
        capabilities TEXT NOT NULL DEFAULT '[]',
        safety_profile_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_equipment_household
        ON equipment(household_id);
      CREATE INDEX IF NOT EXISTS idx_equipment_type
        ON equipment(equipment_type);
      CREATE INDEX IF NOT EXISTS idx_equipment_location
        ON equipment(location_id);

      -- Container calibrations (household containers as measurement units)
      CREATE TABLE IF NOT EXISTS container_calibrations (
        container_id TEXT PRIMARY KEY,
        equipment_id TEXT NOT NULL REFERENCES equipment(equipment_id),
        capacity_ml REAL NOT NULL,
        capacity_confidence TEXT NOT NULL DEFAULT 'measured',
        tare_weight_g REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_calibration_equipment
        ON container_calibrations(equipment_id);

      -- Seed common measurement unit definitions
      CREATE TABLE IF NOT EXISTS measurement_units (
        unit_id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        system TEXT NOT NULL DEFAULT 'metric',
        base_unit TEXT,
        factor_to_base REAL,
        category TEXT NOT NULL
      );

      INSERT OR IGNORE INTO measurement_units (unit_id, name, system, base_unit, factor_to_base, category) VALUES
        ('unit_g', 'g', 'metric', 'g', 1.0, 'weight'),
        ('unit_kg', 'kg', 'metric', 'g', 1000.0, 'weight'),
        ('unit_oz', 'oz', 'imperial', 'g', 28.3495, 'weight'),
        ('unit_lb', 'lb', 'imperial', 'g', 453.592, 'weight'),
        ('unit_ml', 'ml', 'metric', 'ml', 1.0, 'volume'),
        ('unit_l', 'l', 'metric', 'ml', 1000.0, 'volume'),
        ('unit_tsp', 'tsp', 'metric', 'ml', 5.0, 'volume'),
        ('unit_tbsp', 'tbsp', 'metric', 'ml', 15.0, 'volume'),
        ('unit_cup', 'cup', 'metric', 'ml', 240.0, 'volume'),
        ('unit_floz', 'fl oz', 'imperial', 'ml', 29.5735, 'volume'),
        ('unit_piece', 'piece', 'counting', NULL, NULL, 'count'),
        ('unit_packet', 'packet', 'counting', NULL, NULL, 'count'),
        ('unit_pinch', 'pinch', 'metric', 'ml', 0.3125, 'volume'),
        ('unit_handful', 'handful', 'metric', 'ml', 40.0, 'volume'),
        ('unit_serving', 'serving', 'counting', NULL, NULL, 'count');
    `);
  },

  down(db: Database.Database): void {
    db.exec(`
      DROP TABLE IF EXISTS container_calibrations;
      DROP TABLE IF EXISTS equipment;
      DROP TABLE IF EXISTS measurement_units;
    `);
  },
};
