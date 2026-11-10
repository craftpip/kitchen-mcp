import type Database from 'better-sqlite3';
import { generateId } from '../../shared/ids.js';
import { kitchenError, ErrorCode } from '../../shared/errors/catalogue.js';
import { writeAuditLog } from '../../infrastructure/audit.js';
import type {
  MealPlan,
  MealPlanEntry,
  CreateMealPlanInput,
  AddMealPlanEntryInput,
  UpdateMealPlanEntryInput,
  MealPlanValidation,
  MealPlanStatus,
} from './types.js';

interface PlanRow {
  meal_plan_id: string;
  household_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToPlan(row: PlanRow): MealPlan {
  return {
    ...row,
    status: row.status as MealPlanStatus,
  };
}

interface EntryRow {
  meal_plan_entry_id: string;
  meal_plan_id: string;
  date: string;
  meal_type: string;
  recipe_id: string;
  recipe_version_id: string;
  servings: number;
  priority_reasons: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEntry(row: EntryRow): MealPlanEntry {
  return {
    ...row,
    priority_reasons: JSON.parse(row.priority_reasons),
  };
}

export class MealPlanService {
  constructor(private db: Database.Database) {}

  create(input: CreateMealPlanInput): MealPlan {
    const id = generateId('mp');
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO meal_plans (meal_plan_id, household_id, name, start_date, end_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
      )
      .run(id, input.household_id, input.name, input.start_date, input.end_date, now, now);

    writeAuditLog(this.db, {
      tool_name: 'kitchen_meal_plan_create',
      entity_type: 'meal_plan',
      entity_id: id,
      operation: 'create',
      after_data: { name: input.name, start_date: input.start_date, end_date: input.end_date },
    });

    return this.get(id)!;
  }

  get(planId: string): MealPlan | undefined {
    const row = this.db
      .prepare('SELECT * FROM meal_plans WHERE meal_plan_id = ?')
      .get(planId) as PlanRow | undefined;
    return row ? rowToPlan(row) : undefined;
  }

  list(householdId: string, options?: { status?: string; limit?: number }): MealPlan[] {
    const conditions = ['household_id = ?'];
    const params: unknown[] = [householdId];

    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    const limit = options?.limit ?? 20;
    const where = conditions.join(' AND ');

    const rows = this.db
      .prepare(
        `SELECT * FROM meal_plans WHERE ${where} ORDER BY start_date DESC LIMIT ?`,
      )
      .all(...params, limit) as PlanRow[];

    return rows.map(rowToPlan);
  }

  getEntries(planId: string): MealPlanEntry[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM meal_plan_entries WHERE meal_plan_id = ? ORDER BY date, meal_type',
      )
      .all(planId) as EntryRow[];

    return rows.map(rowToEntry);
  }

  getEntry(entryId: string): MealPlanEntry | undefined {
    const row = this.db
      .prepare('SELECT * FROM meal_plan_entries WHERE meal_plan_entry_id = ?')
      .get(entryId) as EntryRow | undefined;
    return row ? rowToEntry(row) : undefined;
  }

  addEntry(input: AddMealPlanEntryInput): MealPlanEntry {
    const plan = this.get(input.meal_plan_id);
    if (!plan) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Meal plan not found', {
        details: { meal_plan_id: input.meal_plan_id },
      });
    }

    if (plan.status === 'completed' || plan.status === 'archived') {
      throw kitchenError(ErrorCode.SESSION_STATE_CONFLICT, `Cannot add entries to a ${plan.status} meal plan`, {
        details: { meal_plan_id: input.meal_plan_id, status: plan.status },
      });
    }

    const recipe = this.db
      .prepare('SELECT recipe_id, active_version_id FROM recipes WHERE recipe_id = ?')
      .get(input.recipe_id) as { recipe_id: string; active_version_id: string | null } | undefined;
    if (!recipe) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Recipe not found', {
        details: { recipe_id: input.recipe_id },
      });
    }
    if (!recipe.active_version_id) {
      throw kitchenError(ErrorCode.RECIPE_NOT_PUBLISHED, 'Recipe has no published version', {
        details: { recipe_id: input.recipe_id },
      });
    }

    if (input.date < plan.start_date || input.date > plan.end_date) {
      throw kitchenError(ErrorCode.INVALID_ARGUMENT, 'Entry date is outside the meal plan date range', {
        details: { date: input.date, plan_start: plan.start_date, plan_end: plan.end_date },
      });
    }

    const id = generateId('mpi');

    this.db
      .prepare(
        `INSERT INTO meal_plan_entries (meal_plan_entry_id, meal_plan_id, date, meal_type, recipe_id, recipe_version_id, servings, priority_reasons, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .run(
        id,
        input.meal_plan_id,
        input.date,
        input.meal_type,
        input.recipe_id,
        recipe.active_version_id,
        input.servings,
        JSON.stringify(input.priority_reasons ?? []),
        input.notes ?? null,
      );

    this.db
      .prepare("UPDATE meal_plans SET updated_at = datetime('now') WHERE meal_plan_id = ?")
      .run(input.meal_plan_id);

    writeAuditLog(this.db, {
      tool_name: 'kitchen_meal_plan_add_entry',
      entity_type: 'meal_plan_entry',
      entity_id: id,
      operation: 'create',
      after_data: { recipe_id: input.recipe_id, date: input.date, meal_type: input.meal_type },
    });

    return this.getEntry(id)!;
  }

  updateEntry(input: UpdateMealPlanEntryInput): MealPlanEntry {
    const entry = this.getEntry(input.meal_plan_entry_id);
    if (!entry) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Meal plan entry not found', {
        details: { meal_plan_entry_id: input.meal_plan_entry_id },
      });
    }

    const plan = this.get(entry.meal_plan_id);
    if (plan && (plan.status === 'completed' || plan.status === 'archived')) {
      throw kitchenError(ErrorCode.SESSION_STATE_CONFLICT, `Cannot update entries in a ${plan.status} meal plan`, {
        details: { meal_plan_id: entry.meal_plan_id, status: plan.status },
      });
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.date !== undefined) {
      updates.push('date = ?');
      params.push(input.date);
    }
    if (input.meal_type !== undefined) {
      updates.push('meal_type = ?');
      params.push(input.meal_type);
    }
    if (input.recipe_id !== undefined) {
      const recipe = this.db
        .prepare('SELECT recipe_id, active_version_id FROM recipes WHERE recipe_id = ?')
        .get(input.recipe_id) as { recipe_id: string; active_version_id: string | null } | undefined;
      if (!recipe) {
        throw kitchenError(ErrorCode.NOT_FOUND, 'Recipe not found', {
          details: { recipe_id: input.recipe_id },
        });
      }
      if (!recipe.active_version_id) {
        throw kitchenError(ErrorCode.RECIPE_NOT_PUBLISHED, 'Recipe has no published version', {
          details: { recipe_id: input.recipe_id },
        });
      }
      updates.push('recipe_id = ?, recipe_version_id = ?');
      params.push(input.recipe_id, recipe.active_version_id);
    }
    if (input.servings !== undefined) {
      updates.push('servings = ?');
      params.push(input.servings);
    }
    if (input.priority_reasons !== undefined) {
      updates.push('priority_reasons = ?');
      params.push(JSON.stringify(input.priority_reasons));
    }
    if (input.notes !== undefined) {
      updates.push('notes = ?');
      params.push(input.notes);
    }

    if (updates.length === 0) return entry;

    updates.push("updated_at = datetime('now')");
    params.push(input.meal_plan_entry_id);

    this.db
      .prepare(`UPDATE meal_plan_entries SET ${updates.join(', ')} WHERE meal_plan_entry_id = ?`)
      .run(...params);

    this.db
      .prepare("UPDATE meal_plans SET updated_at = datetime('now') WHERE meal_plan_id = ?")
      .run(entry.meal_plan_id);

    return this.getEntry(input.meal_plan_entry_id)!;
  }

  removeEntry(entryId: string): void {
    const entry = this.getEntry(entryId);
    if (!entry) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Meal plan entry not found', {
        details: { meal_plan_entry_id: entryId },
      });
    }

    const plan = this.get(entry.meal_plan_id);
    if (plan && (plan.status === 'completed' || plan.status === 'archived')) {
      throw kitchenError(ErrorCode.SESSION_STATE_CONFLICT, `Cannot remove entries from a ${plan.status} meal plan`, {
        details: { meal_plan_id: entry.meal_plan_id, status: plan.status },
      });
    }

    this.db
      .prepare('DELETE FROM meal_plan_entries WHERE meal_plan_entry_id = ?')
      .run(entryId);

    this.db
      .prepare("UPDATE meal_plans SET updated_at = datetime('now') WHERE meal_plan_id = ?")
      .run(entry.meal_plan_id);

    writeAuditLog(this.db, {
      tool_name: 'kitchen_meal_plan_remove_entry',
      entity_type: 'meal_plan_entry',
      entity_id: entryId,
      operation: 'delete',
    });
  }

  validate(planId: string): MealPlanValidation {
    const plan = this.get(planId);
    if (!plan) {
      return { valid: false, errors: ['Meal plan not found'], warnings: [] };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const entries = this.getEntries(planId);

    if (entries.length === 0) {
      warnings.push('Meal plan has no entries');
    }

    for (const entry of entries) {
      if (entry.date < plan.start_date || entry.date > plan.end_date) {
        errors.push(`Entry ${entry.meal_plan_entry_id} date ${entry.date} is outside plan range`);
      }

      const recipe = this.db
        .prepare('SELECT recipe_id, active_version_id, status FROM recipes WHERE recipe_id = ?')
        .get(entry.recipe_id) as { recipe_id: string; active_version_id: string | null; status: string } | undefined;

      if (!recipe) {
        errors.push(`Entry ${entry.meal_plan_entry_id}: recipe ${entry.recipe_id} not found`);
      } else if (!recipe.active_version_id) {
        errors.push(`Entry ${entry.meal_plan_entry_id}: recipe ${entry.recipe_id} has no published version`);
      } else if (recipe.status === 'deprecated') {
        warnings.push(`Entry ${entry.meal_plan_entry_id}: recipe ${entry.recipe_id} is deprecated`);
      }

      if (entry.servings <= 0) {
        errors.push(`Entry ${entry.meal_plan_entry_id}: servings must be positive`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  commit(planId: string): MealPlan {
    const plan = this.get(planId);
    if (!plan) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Meal plan not found', {
        details: { meal_plan_id: planId },
      });
    }

    const validation = this.validate(planId);
    if (!validation.valid) {
      throw kitchenError(ErrorCode.RECIPE_INVALID, 'Meal plan validation failed', {
        details: { errors: validation.errors },
      });
    }

    this.db
      .prepare("UPDATE meal_plans SET status = 'active', updated_at = datetime('now') WHERE meal_plan_id = ?")
      .run(planId);

    writeAuditLog(this.db, {
      tool_name: 'kitchen_meal_plan_commit',
      entity_type: 'meal_plan',
      entity_id: planId,
      operation: 'update',
      before_data: { status: plan.status },
      after_data: { status: 'active' },
    });

    return this.get(planId)!;
  }

  complete(planId: string): MealPlan {
    const plan = this.get(planId);
    if (!plan) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Meal plan not found', {
        details: { meal_plan_id: planId },
      });
    }

    this.db
      .prepare("UPDATE meal_plans SET status = 'completed', updated_at = datetime('now') WHERE meal_plan_id = ?")
      .run(planId);

    return this.get(planId)!;
  }

  generate(input: {
    household_id: string;
    start_date: string;
    end_date: string;
    meal_types: string[];
    servings: number;
    max_cooking_minutes_per_meal?: number;
    use_expiring_first?: boolean;
    name?: string;
  }): MealPlan {
    const planName = input.name ?? `Meal plan ${input.start_date} to ${input.end_date}`;
    const plan = this.create({
      household_id: input.household_id,
      name: planName,
      start_date: input.start_date,
      end_date: input.end_date,
    });

    const startDate = new Date(input.start_date);
    const endDate = new Date(input.end_date);
    const dayCount = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const recipes = this.db
      .prepare(
        "SELECT r.*, rv.recipe_version_id, rv.prep_time_minutes, rv.cook_time_minutes FROM recipes r LEFT JOIN recipe_versions rv ON rv.recipe_version_id = r.active_version_id WHERE r.status IN ('verified', 'tested') AND r.active_version_id IS NOT NULL",
      )
      .all() as {
        recipe_id: string;
        recipe_version_id: string;
        name: string;
        meal_types: string;
        difficulty: string;
        prep_time_minutes: number | null;
        cook_time_minutes: number | null;
      }[];

    const parsedRecipes = recipes.map((r) => ({
      ...r,
      meal_types: JSON.parse(r.meal_types) as string[],
      total_minutes: (r.prep_time_minutes ?? 0) + (r.cook_time_minutes ?? 0),
    }));

    const expiringItems = this.db
      .prepare(
        "SELECT ingredient_id, SUM(quantity_value) as total FROM inventory_lots WHERE household_id = ? AND quantity_value > 0 AND state NOT IN ('consumed', 'discarded', 'spoiled') AND ((printed_expiry_at IS NOT NULL AND printed_expiry_at <= datetime('now', '+3 days')) OR (estimated_expiry_at IS NOT NULL AND estimated_expiry_at <= datetime('now', '+3 days'))) GROUP BY ingredient_id",
      )
      .all(input.household_id) as { ingredient_id: string; total: number }[];

    const expiringIngredientIds = new Set(expiringItems.map((i) => i.ingredient_id));

    const usedRecipeIds = new Set<string>();

    for (let dayOffset = 0; dayOffset < dayCount; dayOffset++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + dayOffset);
      const dateStr = date.toISOString().slice(0, 10);

      for (const mealType of input.meal_types) {
        const candidates = parsedRecipes.filter((r) => {
          if (!r.meal_types.includes(mealType)) return false;
          if (usedRecipeIds.has(r.recipe_id)) return false;
          if (input.max_cooking_minutes_per_meal && r.total_minutes > input.max_cooking_minutes_per_meal) return false;
          return true;
        });

        if (candidates.length === 0) continue;

        candidates.sort((a, b) => {
          const aIngs = this.db
            .prepare('SELECT ingredient_id FROM recipe_ingredients WHERE recipe_version_id = ?')
            .all(a.recipe_version_id) as { ingredient_id: string }[];
          const aUsesExpiring = aIngs.some((i) => expiringIngredientIds.has(i.ingredient_id));
          const bIngs = this.db
            .prepare('SELECT ingredient_id FROM recipe_ingredients WHERE recipe_version_id = ?')
            .all(b.recipe_version_id) as { ingredient_id: string }[];
          const bUsesExpiring = bIngs.some((i) => expiringIngredientIds.has(i.ingredient_id));
          if (aUsesExpiring && !bUsesExpiring) return -1;
          if (!aUsesExpiring && bUsesExpiring) return 1;
          return 0;
        });

        const selected = candidates[0];
        const priorityReasons: string[] = [];

        const recipeIngs = this.db
          .prepare('SELECT ingredient_id FROM recipe_ingredients WHERE recipe_version_id = ?')
          .all(selected.recipe_version_id) as { ingredient_id: string }[];
        if (recipeIngs.some((i) => expiringIngredientIds.has(i.ingredient_id))) {
          priorityReasons.push('uses_expiring_ingredients');
        }

        this.addEntry({
          meal_plan_id: plan.meal_plan_id,
          date: dateStr,
          meal_type: mealType,
          recipe_id: selected.recipe_id,
          servings: input.servings,
          priority_reasons: priorityReasons,
        });

        usedRecipeIds.add(selected.recipe_id);
      }
    }

    return plan;
  }
}
