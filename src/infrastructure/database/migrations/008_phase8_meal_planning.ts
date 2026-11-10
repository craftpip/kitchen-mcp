import type Database from 'better-sqlite3';

export const migration008 = {
  version: 8,
  name: '008_phase8_meal_planning',

  up(db: Database.Database): void {
    db.exec(`
      -- Meal plans
      CREATE TABLE IF NOT EXISTS meal_plans (
        meal_plan_id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL REFERENCES households(household_id),
        name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_mp_household ON meal_plans(household_id);
      CREATE INDEX IF NOT EXISTS idx_mp_status ON meal_plans(status);
      CREATE INDEX IF NOT EXISTS idx_mp_dates ON meal_plans(start_date, end_date);

      -- Meal plan entries
      CREATE TABLE IF NOT EXISTS meal_plan_entries (
        meal_plan_entry_id TEXT PRIMARY KEY,
        meal_plan_id TEXT NOT NULL REFERENCES meal_plans(meal_plan_id),
        date TEXT NOT NULL,
        meal_type TEXT NOT NULL,
        recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id),
        recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(recipe_version_id),
        servings INTEGER NOT NULL DEFAULT 1,
        priority_reasons TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_mpe_plan ON meal_plan_entries(meal_plan_id);
      CREATE INDEX IF NOT EXISTS idx_mpe_date ON meal_plan_entries(date);
      CREATE INDEX IF NOT EXISTS idx_mpe_recipe ON meal_plan_entries(recipe_id);
    `);
  },

  down(db: Database.Database): void {
    db.exec(`
      DROP TABLE IF EXISTS meal_plan_entries;
      DROP TABLE IF EXISTS meal_plans;
    `);
  },
};
