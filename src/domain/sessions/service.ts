import type Database from 'better-sqlite3';
import { generateId } from '../../shared/ids.js';
import { kitchenError, ErrorCode } from '../../shared/errors/catalogue.js';
import { writeAuditLog } from '../../infrastructure/audit.js';
import type {
  CookingSession,
  SessionStep,
  SessionEvent,
  IngredientReservation,
  IngredientUsage,
  SessionStatus,
  SessionStepStatus,
  StartSessionInput,
  CompleteStepInput,
  ReportProblemInput,
  SubstituteIngredientInput,
} from './types.js';
import type { RecipeStep } from '../recipes/types.js';

interface SessionRow {
  session_id: string;
  household_id: string;
  recipe_id: string;
  recipe_version_id: string;
  name: string;
  servings: number;
  status: string;
  current_step_id: string | null;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  total_paused_seconds: number;
  actual_duration_seconds: number | null;
  session_version: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToSession(row: SessionRow): CookingSession {
  return {
    ...row,
    status: row.status as SessionStatus,
  };
}

interface StepRow {
  session_step_id: string;
  session_id: string;
  source_recipe_step_id: string;
  sequence_number: number;
  title: string;
  action_type: string | null;
  instruction_text: string | null;
  instruction_data: string;
  required_equipment: string;
  timer_recommended: number;
  safety_rule_ids: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  actual_duration_seconds: number | null;
  notes: string | null;
  created_at: string;
}

function rowToStep(row: StepRow): SessionStep {
  return {
    session_step_id: row.session_step_id,
    session_id: row.session_id,
    source_recipe_step_id: row.source_recipe_step_id,
    sequence_number: row.sequence_number,
    title: row.title,
    action_type: row.action_type,
    instruction_text: row.instruction_text,
    instruction_data: JSON.parse(row.instruction_data),
    required_equipment: JSON.parse(row.required_equipment),
    timer_recommended: row.timer_recommended === 1,
    safety_rule_ids: JSON.parse(row.safety_rule_ids),
    status: row.status as SessionStepStatus,
    started_at: row.started_at,
    completed_at: row.completed_at,
    actual_duration_seconds: row.actual_duration_seconds,
    notes: row.notes,
    created_at: row.created_at,
  };
}

interface EventRow {
  event_id: string;
  session_id: string;
  event_type: string;
  event_data: string;
  actor_type: string;
  request_id: string | null;
  created_at: string;
}

function rowToEvent(row: EventRow): SessionEvent {
  return {
    ...row,
    event_type: row.event_type as SessionEvent['event_type'],
    event_data: JSON.parse(row.event_data),
  };
}

export class SessionService {
  constructor(private db: Database.Database) {}

  private writeEvent(sessionId: string, eventType: SessionEvent['event_type'], data: Record<string, unknown> = {}, requestId?: string): void {
    this.db
      .prepare(
        `INSERT INTO cooking_session_events (event_id, session_id, event_type, event_data, actor_type, request_id, created_at)
         VALUES (?, ?, ?, ?, 'mcp_client', ?, datetime('now'))`,
      )
      .run(generateId('evt'), sessionId, eventType, JSON.stringify(data), requestId ?? null);
  }

  getActiveSession(householdId: string): CookingSession | undefined {
    const row = this.db
      .prepare("SELECT * FROM cooking_sessions WHERE household_id = ? AND status IN ('planned', 'preparing', 'active', 'paused') ORDER BY created_at DESC LIMIT 1")
      .get(householdId) as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  get(sessionId: string): CookingSession | undefined {
    const row = this.db
      .prepare('SELECT * FROM cooking_sessions WHERE session_id = ?')
      .get(sessionId) as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  getSteps(sessionId: string): SessionStep[] {
    const rows = this.db
      .prepare('SELECT * FROM cooking_session_steps WHERE session_id = ? ORDER BY sequence_number')
      .all(sessionId) as StepRow[];
    return rows.map(rowToStep);
  }

  getStepDependencies(sessionId: string): { step_id: string; depends_on: string }[] {
    return this.db
      .prepare(
        `SELECT cssd.session_step_id as step_id, cssd.depends_on_step_id as depends_on
         FROM cooking_session_step_dependencies cssd
         JOIN cooking_session_steps css ON cssd.session_step_id = css.session_step_id
         WHERE css.session_id = ?`,
      )
      .all(sessionId) as { step_id: string; depends_on: string }[];
  }

  getEvents(sessionId: string, limit = 50): SessionEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM cooking_session_events WHERE session_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(sessionId, limit) as EventRow[];
    return rows.map(rowToEvent);
  }

  getReservations(sessionId: string): IngredientReservation[] {
    return this.db
      .prepare('SELECT * FROM session_ingredient_reservations WHERE session_id = ?')
      .all(sessionId) as IngredientReservation[];
  }

  getUsage(sessionId: string): IngredientUsage[] {
    return this.db
      .prepare('SELECT * FROM session_ingredient_usage WHERE session_id = ?')
      .all(sessionId) as IngredientUsage[];
  }

  plan(input: StartSessionInput & { household_id?: string }): {
    recipe_version_id: string;
    servings: number;
    ingredients: { ingredient_id: string; quantity: number; unit: string; required: boolean }[];
    equipment: { equipment_type: string; required: boolean }[];
    steps: { sequence_number: number; title: string; duration_estimate?: number }[];
    total_estimated_minutes: number;
  } {
    const servings = input.servings ?? 1;

    const recipe = this.db.prepare('SELECT * FROM recipes WHERE recipe_id = ?').get(input.recipe_id) as { recipe_id: string; default_servings: number; active_version_id: string | null } | undefined;
    if (!recipe) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Recipe not found', { details: { recipe_id: input.recipe_id } });
    }
    if (!recipe.active_version_id) {
      throw kitchenError(ErrorCode.RECIPE_INVALID, 'Recipe has no published version', { details: { recipe_id: input.recipe_id } });
    }

    const version = this.db.prepare('SELECT * FROM recipe_versions WHERE recipe_version_id = ?').get(recipe.active_version_id) as { recipe_version_id: string; prep_time_minutes: number | null; cook_time_minutes: number | null } | undefined;

    const scaleFactor = servings / (recipe.default_servings || 1);

    const rawIngredients = this.db
      .prepare('SELECT * FROM recipe_ingredients WHERE recipe_version_id = ? ORDER BY sort_order')
      .all(recipe.active_version_id) as { ingredient_id: string; quantity_value: number; quantity_unit: string; required: number }[];

    const equipment = this.db
      .prepare('SELECT * FROM recipe_equipment WHERE recipe_version_id = ?')
      .all(recipe.active_version_id) as { equipment_type: string; required: number }[];

    const rawSteps = this.db
      .prepare('SELECT * FROM recipe_steps WHERE recipe_version_id = ? ORDER BY sequence_number')
      .all(recipe.active_version_id) as { sequence_number: number; title: string }[];

    const prepMins = version?.prep_time_minutes ?? 10;
    const cookMins = version?.cook_time_minutes ?? 20;

    return {
      recipe_version_id: recipe.active_version_id,
      servings,
      ingredients: rawIngredients.map((i) => ({
        ingredient_id: i.ingredient_id,
        quantity: Math.round(i.quantity_value * scaleFactor * 1000) / 1000,
        unit: i.quantity_unit,
        required: i.required === 1,
      })),
      equipment: equipment.map((e) => ({
        equipment_type: e.equipment_type,
        required: e.required === 1,
      })),
      steps: rawSteps.map((s) => ({
        sequence_number: s.sequence_number,
        title: s.title,
      })),
      total_estimated_minutes: prepMins + cookMins,
    };
  }

  start(input: StartSessionInput): CookingSession {
    const householdId = input.household_id ?? 'hh_default';
    const servings = input.servings ?? 1;
    const name = input.name ?? 'Cooking session';

    const recipe = this.db.prepare('SELECT * FROM recipes WHERE recipe_id = ?').get(input.recipe_id) as { recipe_id: string; name: string; default_servings: number; active_version_id: string | null } | undefined;
    if (!recipe) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Recipe not found', { details: { recipe_id: input.recipe_id } });
    }
    if (!recipe.active_version_id) {
      throw kitchenError(ErrorCode.RECIPE_INVALID, 'Recipe has no published version', { details: { recipe_id: input.recipe_id } });
    }

    const active = this.getActiveSession(householdId);
    if (active) {
      throw kitchenError(ErrorCode.SESSION_STATE_CONFLICT, 'Active session already exists', { details: { existing_session_id: active.session_id } });
    }

    const sessionId = generateId('session');
    const recipeVersionId = recipe.active_version_id;
    const now = new Date().toISOString();

    const startTx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO cooking_sessions (session_id, household_id, recipe_id, recipe_version_id, name, servings, status, started_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        )
        .run(sessionId, householdId, input.recipe_id, recipeVersionId, name, servings, now, now, now);

      const recipeSteps = this.db
        .prepare('SELECT * FROM recipe_steps WHERE recipe_version_id = ? ORDER BY sequence_number')
        .all(recipeVersionId) as RecipeStep[];

      const stepIdMap = new Map<number, string>();
      for (const rs of recipeSteps) {
        const stepId = generateId('ss');
        stepIdMap.set(rs.sequence_number, stepId);

        this.db
          .prepare(
            `INSERT INTO cooking_session_steps (session_step_id, session_id, source_recipe_step_id, sequence_number, title, action_type, instruction_text, instruction_data, required_equipment, timer_recommended, safety_rule_ids, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
          )
          .run(
            stepId,
            sessionId,
            rs.recipe_step_id,
            rs.sequence_number,
            rs.title,
            rs.action_type ?? null,
            rs.instruction_text ?? null,
            JSON.stringify(rs.instruction_data),
            JSON.stringify(rs.required_equipment),
            rs.timer_recommended ? 1 : 0,
            JSON.stringify(rs.safety_rule_ids),
            now,
          );
      }

      const recipeDeps = this.db
        .prepare(
          `SELECT rsd.* FROM recipe_step_dependencies rsd
           JOIN recipe_steps rs ON rsd.depends_on_step_id = rs.recipe_step_id
           WHERE rs.recipe_version_id = ?`,
        )
        .all(recipeVersionId) as { recipe_step_id: string; depends_on_step_id: string }[];

      for (const dep of recipeDeps) {
        const fromSeq = this.db.prepare('SELECT sequence_number FROM recipe_steps WHERE recipe_step_id = ?').get(dep.recipe_step_id) as { sequence_number: number } | undefined;
        const toSeq = this.db.prepare('SELECT sequence_number FROM recipe_steps WHERE recipe_step_id = ?').get(dep.depends_on_step_id) as { sequence_number: number } | undefined;
        const fromStepId = fromSeq ? stepIdMap.get(fromSeq.sequence_number) : undefined;
        const toStepId = toSeq ? stepIdMap.get(toSeq.sequence_number) : undefined;
        if (fromStepId && toStepId) {
          this.db
            .prepare(
              `INSERT INTO cooking_session_step_dependencies (id, session_step_id, depends_on_step_id) VALUES (?, ?, ?)`,
            )
            .run(generateId('cssd'), fromStepId, toStepId);
        }
      }

      this.writeEvent(sessionId, 'session_started', { recipe_id: input.recipe_id, servings, recipe_version_id: recipeVersionId });
    });

    startTx();

    writeAuditLog(this.db, {
      tool_name: 'kitchen_session_start',
      entity_type: 'cooking_session',
      entity_id: sessionId,
      operation: 'create',
      after_data: { recipe_id: input.recipe_id, servings },
    });

    return this.get(sessionId)!;
  }

  getNextActions(sessionId: string): SessionStep[] {
    const session = this.get(sessionId);
    if (!session) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Session not found', { details: { session_id: sessionId } });
    }

    const steps = this.getSteps(sessionId);
    const deps = this.getStepDependencies(sessionId);

    const completedStepIds = new Set(
      steps.filter((s) => s.status === 'completed' || s.status === 'skipped').map((s) => s.session_step_id),
    );

    const ready: SessionStep[] = [];
    for (const step of steps) {
      if (step.status !== 'pending') continue;

      const stepDeps = deps.filter((d) => d.step_id === step.session_step_id);
      const allDepsSatisfied = stepDeps.every((d) => completedStepIds.has(d.depends_on));

      if (allDepsSatisfied) {
        ready.push(step);
      }
    }

    return ready;
  }

  startStep(sessionId: string, sessionStepId: string): SessionStep {
    const session = this.get(sessionId);
    if (!session) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Session not found', { details: { session_id: sessionId } });
    }

    const step = this.db
      .prepare('SELECT * FROM cooking_session_steps WHERE session_step_id = ? AND session_id = ?')
      .get(sessionStepId, sessionId) as StepRow | undefined;
    if (!step) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Session step not found', { details: { session_step_id: sessionStepId } });
    }

    if (step.status !== 'pending' && step.status !== 'ready') {
      throw kitchenError(ErrorCode.SESSION_STATE_CONFLICT, `Step is already ${step.status}`, { details: { session_step_id: sessionStepId, status: step.status } });
    }

    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE cooking_session_steps SET status = 'active', started_at = ? WHERE session_step_id = ?")
      .run(now, sessionStepId);

    this.db
      .prepare("UPDATE cooking_sessions SET current_step_id = ?, session_version = session_version + 1, updated_at = datetime('now') WHERE session_id = ?")
      .run(sessionStepId, sessionId);

    this.writeEvent(sessionId, 'step_started', { step_id: sessionStepId, sequence_number: step.sequence_number });

    return this.db.prepare('SELECT * FROM cooking_session_steps WHERE session_step_id = ?').get(sessionStepId) as unknown as SessionStep;
  }

  completeStep(input: CompleteStepInput): SessionStep {
    const session = this.get(input.session_id);
    if (!session) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Session not found', { details: { session_id: input.session_id } });
    }

    const step = this.db
      .prepare('SELECT * FROM cooking_session_steps WHERE session_step_id = ? AND session_id = ?')
      .get(input.session_step_id, input.session_id) as StepRow | undefined;
    if (!step) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Session step not found', { details: { session_step_id: input.session_step_id } });
    }
    if (step.status !== 'active') {
      throw kitchenError(ErrorCode.SESSION_STATE_CONFLICT, `Step must be active to complete, current: ${step.status}`);
    }

    const now = new Date().toISOString();
    const durationSeconds = step.started_at
      ? Math.floor((Date.now() - new Date(step.started_at).getTime()) / 1000)
      : null;

    const completeTx = this.db.transaction(() => {
      this.db
        .prepare("UPDATE cooking_session_steps SET status = 'completed', completed_at = ?, actual_duration_seconds = ?, notes = ? WHERE session_step_id = ?")
        .run(now, durationSeconds, input.notes ?? null, input.session_step_id);

      if (input.ingredient_usage && input.ingredient_usage.length > 0) {
        for (const usage of input.ingredient_usage) {
          this.db
            .prepare(
              `INSERT INTO session_ingredient_usage (usage_id, session_id, session_step_id, inventory_lot_id, ingredient_id, quantity_used, unit, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(generateId('siu'), input.session_id, input.session_step_id, usage.inventory_lot_id, usage.ingredient_id, usage.quantity_used, usage.unit, now);

          this.db
            .prepare(
              "UPDATE inventory_lots SET quantity_value = quantity_value - ?, updated_at = datetime('now') WHERE inventory_lot_id = ?",
            )
            .run(usage.quantity_used, usage.inventory_lot_id);

          this.db
            .prepare(
              `INSERT INTO inventory_transactions (inventory_transaction_id, inventory_lot_id, transaction_type, quantity_delta, unit, reason, session_id, created_at)
               VALUES (?, ?, 'consumed', ?, ?, 'recipe_use', ?, ?)`,
            )
            .run(generateId('tx'), usage.inventory_lot_id, -usage.quantity_used, usage.unit, input.session_id, now);
        }
      }

      this.writeEvent(input.session_id, 'step_completed', {
        step_id: input.session_step_id,
        sequence_number: step.sequence_number,
        duration_seconds: durationSeconds,
        ingredient_usage: input.ingredient_usage,
      });
    });

    completeTx();

    return this.db.prepare('SELECT * FROM cooking_session_steps WHERE session_step_id = ?').get(input.session_step_id) as unknown as SessionStep;
  }

  skipStep(sessionId: string, sessionStepId: string, notes?: string): SessionStep {
    const step = this.db
      .prepare('SELECT * FROM cooking_session_steps WHERE session_step_id = ? AND session_id = ?')
      .get(sessionStepId, sessionId) as StepRow | undefined;
    if (!step) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Session step not found');
    }
    if (step.status !== 'pending' && step.status !== 'ready') {
      throw kitchenError(ErrorCode.SESSION_STATE_CONFLICT, `Step must be pending/ready to skip, current: ${step.status}`);
    }

    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE cooking_session_steps SET status = 'skipped', completed_at = ?, notes = ? WHERE session_step_id = ?")
      .run(now, notes ?? 'Skipped', sessionStepId);

    this.writeEvent(sessionId, 'step_skipped', { step_id: sessionStepId, notes });

    return this.db.prepare('SELECT * FROM cooking_session_steps WHERE session_step_id = ?').get(sessionStepId) as unknown as SessionStep;
  }

  pause(sessionId: string): CookingSession {
    const session = this.get(sessionId);
    if (!session) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Session not found');
    }
    if (session.status !== 'active') {
      throw kitchenError(ErrorCode.SESSION_NOT_ACTIVE, `Session must be active to pause, current: ${session.status}`);
    }

    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE cooking_sessions SET status = 'paused', paused_at = ?, session_version = session_version + 1, updated_at = ? WHERE session_id = ?")
      .run(now, now, sessionId);

    this.writeEvent(sessionId, 'session_paused', {});

    return this.get(sessionId)!;
  }

  resume(sessionId: string): CookingSession {
    const session = this.get(sessionId);
    if (!session) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Session not found');
    }
    if (session.status !== 'paused') {
      throw kitchenError(ErrorCode.SESSION_STATE_CONFLICT, `Session must be paused to resume, current: ${session.status}`);
    }

    const now = new Date().toISOString();
    const pauseDuration = session.paused_at
      ? Math.floor((Date.now() - new Date(session.paused_at).getTime()) / 1000)
      : 0;

    this.db
      .prepare("UPDATE cooking_sessions SET status = 'active', paused_at = NULL, total_paused_seconds = total_paused_seconds + ?, session_version = session_version + 1, updated_at = ? WHERE session_id = ?")
      .run(pauseDuration, now, sessionId);

    this.writeEvent(sessionId, 'session_resumed', { pause_duration_seconds: pauseDuration });

    return this.get(sessionId)!;
  }

  reportProblem(input: ReportProblemInput): { problem_type: string; recovery_rules: unknown[] } {
    const session = this.get(input.session_id);
    if (!session) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Session not found');
    }

    this.writeEvent(input.session_id, 'problem_reported', {
      step_id: input.session_step_id,
      problem_type: input.problem_type,
      description: input.description,
    });

    const recoveryRules = this.db
      .prepare(
        "SELECT * FROM recovery_rules WHERE recipe_version_id = ? AND symptom = ?",
      )
      .all(session.recipe_version_id, input.problem_type);

    return { problem_type: input.problem_type, recovery_rules: recoveryRules };
  }

  applyRecovery(sessionId: string, stepId: string | undefined, action: string): void {
    const session = this.get(sessionId);
    if (!session) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Session not found');
    }

    this.writeEvent(sessionId, 'recovery_applied', { step_id: stepId, action });
  }

  substituteIngredient(input: SubstituteIngredientInput): void {
    const session = this.get(input.session_id);
    if (!session) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Session not found');
    }

    const subTx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO session_ingredient_usage (usage_id, session_id, session_step_id, inventory_lot_id, ingredient_id, quantity_used, unit, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .run(generateId('siu'), input.session_id, input.session_step_id ?? null, input.inventory_lot_id, input.substitute_ingredient_id, input.quantity_used, input.unit);

      this.db
        .prepare("UPDATE inventory_lots SET quantity_value = quantity_value - ?, updated_at = datetime('now') WHERE inventory_lot_id = ?")
        .run(input.quantity_used, input.inventory_lot_id);

      this.db
        .prepare(
          `INSERT INTO inventory_transactions (inventory_transaction_id, inventory_lot_id, transaction_type, quantity_delta, unit, reason, session_id, created_at)
           VALUES (?, ?, 'consumed', ?, ?, 'recipe_use', ?, datetime('now'))`,
        )
        .run(generateId('tx'), input.inventory_lot_id, -input.quantity_used, input.unit, input.session_id);

      this.writeEvent(input.session_id, 'ingredient_substituted', {
        original_ingredient_id: input.original_ingredient_id,
        substitute_ingredient_id: input.substitute_ingredient_id,
        quantity_used: input.quantity_used,
        unit: input.unit,
      });
    });

    subTx();
  }

  complete(sessionId: string): CookingSession {
    const session = this.get(sessionId);
    if (!session) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Session not found');
    }
    if (session.status !== 'active' && session.status !== 'paused') {
      throw kitchenError(ErrorCode.SESSION_NOT_ACTIVE, `Session must be active/paused to complete, current: ${session.status}`);
    }

    const now = new Date().toISOString();
    const duration = session.started_at
      ? Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000) - session.total_paused_seconds
      : null;

    this.db
      .prepare(
        "UPDATE cooking_sessions SET status = 'completed', completed_at = ?, actual_duration_seconds = ?, session_version = session_version + 1, updated_at = ? WHERE session_id = ?",
      )
      .run(now, duration, now, sessionId);

    this.db
      .prepare("UPDATE session_ingredient_reservations SET status = 'released' WHERE session_id = ? AND status = 'active'")
      .run(sessionId);

    this.db
      .prepare("UPDATE timers SET status = 'cancelled' WHERE session_id = ? AND status IN ('running', 'paused', 'scheduled')")
      .run(sessionId);

    this.writeEvent(sessionId, 'session_completed', { actual_duration_seconds: duration });

    writeAuditLog(this.db, {
      tool_name: 'kitchen_session_complete',
      entity_type: 'cooking_session',
      entity_id: sessionId,
      operation: 'complete',
    });

    return this.get(sessionId)!;
  }

  abandon(sessionId: string, notes?: string): CookingSession {
    const session = this.get(sessionId);
    if (!session) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Session not found');
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE cooking_sessions SET status = 'abandoned', completed_at = ?, session_version = session_version + 1, updated_at = ?, notes = ? WHERE session_id = ?",
      )
      .run(now, now, notes ?? null, sessionId);

    this.db
      .prepare("UPDATE session_ingredient_reservations SET status = 'released' WHERE session_id = ? AND status = 'active'")
      .run(sessionId);

    this.db
      .prepare("UPDATE timers SET status = 'cancelled' WHERE session_id = ? AND status IN ('running', 'paused', 'scheduled')")
      .run(sessionId);

    this.writeEvent(sessionId, 'session_abandoned', { notes });

    writeAuditLog(this.db, {
      tool_name: 'kitchen_session_abandon',
      entity_type: 'cooking_session',
      entity_id: sessionId,
      operation: 'abandon',
    });

    return this.get(sessionId)!;
  }

  list(householdId: string, options?: { status?: string; limit?: number }): CookingSession[] {
    const conditions = ['household_id = ?'];
    const params: unknown[] = [householdId];

    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    const limit = options?.limit ?? 20;

    return this.db
      .prepare(`SELECT * FROM cooking_sessions WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ?`)
      .all(...params, limit)
      .map((row) => rowToSession(row as SessionRow));
  }
}
