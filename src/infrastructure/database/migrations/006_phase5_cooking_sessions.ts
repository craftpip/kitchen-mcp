import type Database from 'better-sqlite3';

export const migration006 = {
  version: 6,
  name: '006_phase5_cooking_sessions',

  up(db: Database.Database): void {
    db.exec(`
      -- Cooking sessions
      CREATE TABLE IF NOT EXISTS cooking_sessions (
        session_id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL REFERENCES households(household_id),
        recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id),
        recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(recipe_version_id),
        name TEXT NOT NULL,
        servings INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'planned',
        current_step_id TEXT,
        started_at TEXT,
        paused_at TEXT,
        completed_at TEXT,
        total_paused_seconds INTEGER NOT NULL DEFAULT 0,
        actual_duration_seconds INTEGER,
        session_version INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_cs_household ON cooking_sessions(household_id);
      CREATE INDEX IF NOT EXISTS idx_cs_status ON cooking_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_cs_recipe ON cooking_sessions(recipe_id);

      -- Session steps (immutable copies from recipe)
      CREATE TABLE IF NOT EXISTS cooking_session_steps (
        session_step_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES cooking_sessions(session_id),
        source_recipe_step_id TEXT NOT NULL,
        sequence_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        action_type TEXT,
        instruction_text TEXT,
        instruction_data TEXT NOT NULL DEFAULT '{}',
        required_equipment TEXT NOT NULL DEFAULT '[]',
        timer_recommended INTEGER NOT NULL DEFAULT 0,
        safety_rule_ids TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'pending',
        started_at TEXT,
        completed_at TEXT,
        actual_duration_seconds INTEGER,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_css_session ON cooking_session_steps(session_id);

      -- Session step dependencies (copied from recipe)
      CREATE TABLE IF NOT EXISTS cooking_session_step_dependencies (
        id TEXT PRIMARY KEY,
        session_step_id TEXT NOT NULL REFERENCES cooking_session_steps(session_step_id),
        depends_on_step_id TEXT NOT NULL REFERENCES cooking_session_steps(session_step_id),
        UNIQUE(session_step_id, depends_on_step_id)
      );

      CREATE INDEX IF NOT EXISTS idx_cssd_step ON cooking_session_step_dependencies(session_step_id);

      -- Session events (immutable)
      CREATE TABLE IF NOT EXISTS cooking_session_events (
        event_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES cooking_sessions(session_id),
        event_type TEXT NOT NULL,
        event_data TEXT NOT NULL DEFAULT '{}',
        actor_type TEXT NOT NULL DEFAULT 'mcp_client',
        request_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_cse_session ON cooking_session_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_cse_type ON cooking_session_events(event_type);

      -- Session ingredient reservations
      CREATE TABLE IF NOT EXISTS session_ingredient_reservations (
        reservation_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES cooking_sessions(session_id),
        inventory_lot_id TEXT NOT NULL REFERENCES inventory_lots(inventory_lot_id),
        ingredient_id TEXT NOT NULL,
        reserved_quantity REAL NOT NULL,
        reserved_unit TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sir_session ON session_ingredient_reservations(session_id);
      CREATE INDEX IF NOT EXISTS idx_sir_lot ON session_ingredient_reservations(inventory_lot_id);

      -- Session ingredient usage (actual consumption)
      CREATE TABLE IF NOT EXISTS session_ingredient_usage (
        usage_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES cooking_sessions(session_id),
        session_step_id TEXT REFERENCES cooking_session_steps(session_step_id),
        inventory_lot_id TEXT NOT NULL REFERENCES inventory_lots(inventory_lot_id),
        ingredient_id TEXT NOT NULL,
        quantity_used REAL NOT NULL,
        unit TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_siu_session ON session_ingredient_usage(session_id);

      -- Timers
      CREATE TABLE IF NOT EXISTS timers (
        timer_id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL REFERENCES households(household_id),
        session_id TEXT REFERENCES cooking_sessions(session_id),
        session_step_id TEXT REFERENCES cooking_session_steps(session_step_id),
        name TEXT NOT NULL,
        timer_type TEXT NOT NULL DEFAULT 'check',
        status TEXT NOT NULL DEFAULT 'scheduled',
        duration_seconds INTEGER NOT NULL,
        started_at TEXT,
        due_at TEXT,
        paused_remaining_seconds INTEGER,
        completed_at TEXT,
        acknowledged_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_timer_session ON timers(session_id);
      CREATE INDEX IF NOT EXISTS idx_timer_status ON timers(status);
      CREATE INDEX IF NOT EXISTS idx_timer_due ON timers(due_at);
    `);
  },

  down(db: Database.Database): void {
    db.exec(`
      DROP TABLE IF EXISTS timers;
      DROP TABLE IF EXISTS session_ingredient_usage;
      DROP TABLE IF EXISTS session_ingredient_reservations;
      DROP TABLE IF EXISTS cooking_session_events;
      DROP TABLE IF EXISTS cooking_session_step_dependencies;
      DROP TABLE IF EXISTS cooking_session_steps;
      DROP TABLE IF EXISTS cooking_sessions;
    `);
  },
};
