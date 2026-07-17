import type Database from 'better-sqlite3';

export const migration005 = {
  version: 5,
  name: '005_phase4_restrictions_preferences',

  up(db: Database.Database): void {
    db.exec(`
      -- Person dietary restrictions (allergies, intolerances, etc.)
      CREATE TABLE IF NOT EXISTS person_restrictions (
        restriction_id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL REFERENCES people(person_id),
        restriction_type TEXT NOT NULL,
        ingredient_id TEXT REFERENCES ingredient_catalog(ingredient_id),
        ingredient_category TEXT,
        severity TEXT NOT NULL DEFAULT 'moderate',
        cross_contamination_sensitive INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'user_entered',
        active INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_pr_person ON person_restrictions(person_id);
      CREATE INDEX IF NOT EXISTS idx_pr_ingredient ON person_restrictions(ingredient_id);
      CREATE INDEX IF NOT EXISTS idx_pr_active ON person_restrictions(active);

      -- Person flavour/texture preferences
      CREATE TABLE IF NOT EXISTS person_preferences (
        preference_id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL REFERENCES people(person_id),
        dimension TEXT NOT NULL,
        value_numeric REAL NOT NULL,
        scale_min REAL NOT NULL DEFAULT 0,
        scale_max REAL NOT NULL DEFAULT 10,
        scope TEXT NOT NULL DEFAULT 'global',
        scope_value TEXT,
        confidence TEXT NOT NULL DEFAULT 'confirmed',
        source TEXT NOT NULL DEFAULT 'explicit_user_statement',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(person_id, dimension, scope, scope_value)
      );

      CREATE INDEX IF NOT EXISTS idx_pp_person ON person_preferences(person_id);
      CREATE INDEX IF NOT EXISTS idx_pp_dimension ON person_preferences(dimension);

      -- Person cooking skills
      CREATE TABLE IF NOT EXISTS person_skills (
        skill_id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL REFERENCES people(person_id),
        skill_type TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'unknown',
        guidance_level TEXT NOT NULL DEFAULT 'detailed',
        requires_safety_reminders INTEGER NOT NULL DEFAULT 1,
        successful_attempts INTEGER NOT NULL DEFAULT 0,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(person_id, skill_type)
      );

      CREATE INDEX IF NOT EXISTS idx_pskill_person ON person_skills(person_id);

      -- Meal feedback history
      CREATE TABLE IF NOT EXISTS meal_feedback (
        feedback_id TEXT PRIMARY KEY,
        session_id TEXT,
        person_id TEXT NOT NULL REFERENCES people(person_id),
        recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id),
        rating INTEGER,
        liked INTEGER,
        disliked INTEGER,
        too_spicy INTEGER,
        too_salty INTEGER,
        too_sweet INTEGER,
        texture_feedback TEXT,
        would_make_again INTEGER,
        free_text_note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_mf_person ON meal_feedback(person_id);
      CREATE INDEX IF NOT EXISTS idx_mf_recipe ON meal_feedback(recipe_id);

      -- Seed default household and person
      INSERT OR IGNORE INTO households (household_id, name, default_timezone, default_language, default_currency, default_measurement_system)
      VALUES ('hh_default', 'Home Kitchen', 'Asia/Kolkata', 'en', 'INR', 'metric');

      INSERT OR IGNORE INTO people (person_id, household_id, display_name, active, default_portion_multiplier)
      VALUES ('person_default', 'hh_default', 'Primary user', 1, 1.0);
    `);
  },

  down(db: Database.Database): void {
    db.exec(`
      DROP TABLE IF EXISTS meal_feedback;
      DROP TABLE IF EXISTS person_skills;
      DROP TABLE IF EXISTS person_preferences;
      DROP TABLE IF EXISTS person_restrictions;
    `);
  },
};
