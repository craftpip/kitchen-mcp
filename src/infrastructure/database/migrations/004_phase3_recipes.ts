import type Database from 'better-sqlite3';

export const migration004 = {
  version: 4,
  name: '004_phase3_recipes',

  up(db: Database.Database): void {
    db.exec(`
      -- Recipes (top-level)
      CREATE TABLE IF NOT EXISTS recipes (
        recipe_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        cuisine TEXT,
        meal_types TEXT NOT NULL DEFAULT '[]',
        difficulty TEXT NOT NULL DEFAULT 'beginner',
        default_servings INTEGER NOT NULL DEFAULT 1,
        active_version_id TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        source_type TEXT NOT NULL DEFAULT 'user_entered',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_recipe_status ON recipes(status);
      CREATE INDEX IF NOT EXISTS idx_recipe_cuisine ON recipes(cuisine);
      CREATE INDEX IF NOT EXISTS idx_recipe_difficulty ON recipes(difficulty);

      -- Recipe versions (immutable once used in sessions)
      CREATE TABLE IF NOT EXISTS recipe_versions (
        recipe_version_id TEXT PRIMARY KEY,
        recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id),
        version_number INTEGER NOT NULL,
        yield_value REAL NOT NULL DEFAULT 1,
        yield_unit TEXT NOT NULL DEFAULT 'serving',
        prep_time_minutes INTEGER,
        cook_time_minutes INTEGER,
        rest_time_minutes INTEGER,
        change_summary TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(recipe_id, version_number)
      );

      CREATE INDEX IF NOT EXISTS idx_rv_recipe ON recipe_versions(recipe_id);

      -- Recipe ingredients (per version)
      CREATE TABLE IF NOT EXISTS recipe_ingredients (
        recipe_ingredient_id TEXT PRIMARY KEY,
        recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(recipe_version_id),
        ingredient_id TEXT NOT NULL REFERENCES ingredient_catalog(ingredient_id),
        quantity_value REAL NOT NULL,
        quantity_unit TEXT NOT NULL,
        quantity_min REAL,
        quantity_max REAL,
        required INTEGER NOT NULL DEFAULT 1,
        preparation TEXT,
        usage_role TEXT NOT NULL DEFAULT 'main',
        group_name TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        notes TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ri_version ON recipe_ingredients(recipe_version_id);
      CREATE INDEX IF NOT EXISTS idx_ri_ingredient ON recipe_ingredients(ingredient_id);

      -- Recipe steps (per version)
      CREATE TABLE IF NOT EXISTS recipe_steps (
        recipe_step_id TEXT PRIMARY KEY,
        recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(recipe_version_id),
        sequence_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        action_type TEXT,
        instruction_text TEXT,
        instruction_data TEXT NOT NULL DEFAULT '{}',
        required_equipment TEXT NOT NULL DEFAULT '[]',
        timer_recommended INTEGER NOT NULL DEFAULT 0,
        safety_rule_ids TEXT NOT NULL DEFAULT '[]'
      );

      CREATE INDEX IF NOT EXISTS idx_rs_version ON recipe_steps(recipe_version_id);

      -- Recipe step dependencies
      CREATE TABLE IF NOT EXISTS recipe_step_dependencies (
        id TEXT PRIMARY KEY,
        recipe_step_id TEXT NOT NULL REFERENCES recipe_steps(recipe_step_id),
        depends_on_step_id TEXT NOT NULL REFERENCES recipe_steps(recipe_step_id),
        UNIQUE(recipe_step_id, depends_on_step_id)
      );

      CREATE INDEX IF NOT EXISTS idx_rsd_step ON recipe_step_dependencies(recipe_step_id);

      -- Recipe equipment requirements
      CREATE TABLE IF NOT EXISTS recipe_equipment (
        id TEXT PRIMARY KEY,
        recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(recipe_version_id),
        equipment_type TEXT NOT NULL,
        required INTEGER NOT NULL DEFAULT 1,
        capability_needed TEXT,
        notes TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_re_version ON recipe_equipment(recipe_version_id);

      -- Substitution rules
      CREATE TABLE IF NOT EXISTS substitution_rules (
        substitution_rule_id TEXT PRIMARY KEY,
        original_ingredient_id TEXT NOT NULL REFERENCES ingredient_catalog(ingredient_id),
        substitute_ingredient_id TEXT NOT NULL REFERENCES ingredient_catalog(ingredient_id),
        conversion_ratio REAL NOT NULL DEFAULT 1.0,
        original_unit TEXT NOT NULL,
        substitute_unit TEXT NOT NULL,
        valid_roles TEXT NOT NULL DEFAULT '[]',
        valid_dish_categories TEXT NOT NULL DEFAULT '[]',
        invalid_recipes TEXT NOT NULL DEFAULT '[]',
        flavour_difference TEXT,
        confidence TEXT NOT NULL DEFAULT 'verified',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sub_original ON substitution_rules(original_ingredient_id);
      CREATE INDEX IF NOT EXISTS idx_sub_substitute ON substitution_rules(substitute_ingredient_id);

      -- Recovery rules (for cooking session failures)
      CREATE TABLE IF NOT EXISTS recovery_rules (
        recovery_rule_id TEXT PRIMARY KEY,
        recipe_version_id TEXT REFERENCES recipe_versions(recipe_version_id),
        symptom TEXT NOT NULL,
        applicable_step_id TEXT,
        conditions TEXT NOT NULL DEFAULT '{}',
        actions TEXT NOT NULL DEFAULT '[]',
        severity TEXT NOT NULL DEFAULT 'recoverable',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },

  down(db: Database.Database): void {
    db.exec(`
      DROP TABLE IF EXISTS recovery_rules;
      DROP TABLE IF EXISTS substitution_rules;
      DROP TABLE IF EXISTS recipe_step_dependencies;
      DROP TABLE IF EXISTS recipe_steps;
      DROP TABLE IF EXISTS recipe_ingredients;
      DROP TABLE IF EXISTS recipe_equipment;
      DROP TABLE IF EXISTS recipe_versions;
      DROP TABLE IF EXISTS recipes;
    `);
  },
};
