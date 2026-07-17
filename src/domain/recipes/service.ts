import type Database from 'better-sqlite3';
import { generateId } from '../../shared/ids.js';
import { kitchenError, ErrorCode } from '../../shared/errors/catalogue.js';
import { writeAuditLog } from '../../infrastructure/audit.js';
import type {
  Recipe,
  RecipeVersion,
  RecipeIngredient,
  RecipeStep,
  RecipeStatus,
  RecipeDifficulty,
  UsageRole,
  CreateRecipeInput,
  CreateRecipeVersionInput,
  ScaledRecipe,
} from './types.js';

interface RecipeRow {
  recipe_id: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  meal_types: string;
  difficulty: string;
  default_servings: number;
  active_version_id: string | null;
  status: string;
  source_type: string;
  created_at: string;
  updated_at: string;
}

function rowToRecipe(row: RecipeRow): Recipe {
  return {
    ...row,
    meal_types: JSON.parse(row.meal_types),
    difficulty: row.difficulty as RecipeDifficulty,
    status: row.status as RecipeStatus,
  };
}

interface VersionRow {
  recipe_version_id: string;
  recipe_id: string;
  version_number: number;
  yield_value: number;
  yield_unit: string;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  rest_time_minutes: number | null;
  change_summary: string | null;
  created_at: string;
}

interface IngredientRow {
  recipe_ingredient_id: string;
  recipe_version_id: string;
  ingredient_id: string;
  quantity_value: number;
  quantity_unit: string;
  quantity_min: number | null;
  quantity_max: number | null;
  required: number;
  preparation: string | null;
  usage_role: string;
  group_name: string | null;
  sort_order: number;
  notes: string | null;
}

function rowToRecipeIngredient(row: IngredientRow): RecipeIngredient {
  return {
    ...row,
    required: row.required === 1,
    usage_role: row.usage_role as UsageRole,
  };
}

interface StepRow {
  recipe_step_id: string;
  recipe_version_id: string;
  sequence_number: number;
  title: string;
  action_type: string | null;
  instruction_text: string | null;
  instruction_data: string;
  required_equipment: string;
  timer_recommended: number;
  safety_rule_ids: string;
}

function rowToRecipeStep(row: StepRow): RecipeStep {
  return {
    ...row,
    instruction_data: JSON.parse(row.instruction_data),
    required_equipment: JSON.parse(row.required_equipment),
    timer_recommended: row.timer_recommended === 1,
    safety_rule_ids: JSON.parse(row.safety_rule_ids),
  };
}

export class RecipeService {
  constructor(private db: Database.Database) {}

  search(options?: {
    query?: string;
    meal_type?: string;
    cuisine?: string;
    difficulty?: string;
    max_total_minutes?: number;
    status?: string;
    limit?: number;
  }): Recipe[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.query) {
      conditions.push('(LOWER(r.name) LIKE ? OR LOWER(r.description) LIKE ?)');
      const term = `%${options.query.toLowerCase()}%`;
      params.push(term, term);
    }
    if (options?.meal_type) {
      conditions.push("r.meal_types LIKE ?");
      params.push(`%${options.meal_type}%`);
    }
    if (options?.cuisine) {
      conditions.push('LOWER(r.cuisine) = ?');
      params.push(options.cuisine.toLowerCase());
    }
    if (options?.difficulty) {
      conditions.push('r.difficulty = ?');
      params.push(options.difficulty);
    }
    if (options?.status) {
      conditions.push('r.status = ?');
      params.push(options.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit ?? 20;

    const rows = this.db
      .prepare(
        `SELECT r.* FROM recipes r ${where} ORDER BY r.name LIMIT ?`,
      )
      .all(...params, limit) as RecipeRow[];

    return rows.map(rowToRecipe);
  }

  get(recipeId: string): Recipe | undefined {
    const row = this.db
      .prepare('SELECT * FROM recipes WHERE recipe_id = ?')
      .get(recipeId) as RecipeRow | undefined;
    return row ? rowToRecipe(row) : undefined;
  }

  getVersion(versionId: string): RecipeVersion | undefined {
    const row = this.db
      .prepare('SELECT * FROM recipe_versions WHERE recipe_version_id = ?')
      .get(versionId) as VersionRow | undefined;
    return row ?? undefined;
  }

  getActiveVersion(recipeId: string): RecipeVersion | undefined {
    const recipe = this.get(recipeId);
    if (!recipe || !recipe.active_version_id) return undefined;
    return this.getVersion(recipe.active_version_id);
  }

  getIngredients(versionId: string): RecipeIngredient[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM recipe_ingredients WHERE recipe_version_id = ? ORDER BY sort_order, recipe_ingredient_id',
      )
      .all(versionId) as IngredientRow[];
    return rows.map(rowToRecipeIngredient);
  }

  getSteps(versionId: string): RecipeStep[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM recipe_steps WHERE recipe_version_id = ? ORDER BY sequence_number',
      )
      .all(versionId) as StepRow[];
    return rows.map(rowToRecipeStep);
  }

  getEquipment(versionId: string) {
    return this.db
      .prepare('SELECT * FROM recipe_equipment WHERE recipe_version_id = ?')
      .all(versionId);
  }

  getSubstitutions(ingredientId: string): {
    original_ingredient_id: string;
    substitute_ingredient_id: string;
    conversion_ratio: number;
  }[] {
    return this.db
      .prepare('SELECT original_ingredient_id, substitute_ingredient_id, conversion_ratio FROM substitution_rules WHERE original_ingredient_id = ?')
      .all(ingredientId) as { original_ingredient_id: string; substitute_ingredient_id: string; conversion_ratio: number }[];
  }

  getFullRecipe(recipeId: string) {
    const recipe = this.get(recipeId);
    if (!recipe) return undefined;

    const version = recipe.active_version_id
      ? this.getVersion(recipe.active_version_id)
      : undefined;

    const ingredients = version ? this.getIngredients(version.recipe_version_id) : [];
    const steps = version ? this.getSteps(version.recipe_version_id) : [];
    const equipment = version ? this.getEquipment(version.recipe_version_id) : [];

    return { recipe, version, ingredients, steps, equipment };
  }

  create(input: CreateRecipeInput): Recipe {
    const id = generateId('recipe');
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO recipes (recipe_id, name, description, cuisine, meal_types, difficulty, default_servings, status, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.description ?? null,
        input.cuisine ?? null,
        JSON.stringify(input.meal_types ?? []),
        input.difficulty ?? 'beginner',
        input.default_servings ?? 1,
        'draft',
        input.source_type ?? 'user_entered',
        now,
        now,
      );

    writeAuditLog(this.db, {
      tool_name: 'kitchen_recipe_create',
      entity_type: 'recipe',
      entity_id: id,
      operation: 'create',
      after_data: { name: input.name },
    });

    return this.get(id)!;
  }

  createVersion(input: CreateRecipeVersionInput): RecipeVersion {
    const recipe = this.get(input.recipe_id);
    if (!recipe) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Recipe not found', {
        details: { recipe_id: input.recipe_id },
      });
    }

    const maxVersion = this.db
      .prepare('SELECT MAX(version_number) as max_v FROM recipe_versions WHERE recipe_id = ?')
      .get(input.recipe_id) as { max_v: number | null };
    const nextVersion = (maxVersion.max_v ?? 0) + 1;

    const versionId = generateId('rv');

    const createTx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO recipe_versions (recipe_version_id, recipe_id, version_number, yield_value, yield_unit, prep_time_minutes, cook_time_minutes, rest_time_minutes, change_summary, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .run(
          versionId,
          input.recipe_id,
          nextVersion,
          input.yield_value ?? recipe.default_servings,
          input.yield_unit ?? 'serving',
          input.prep_time_minutes ?? null,
          input.cook_time_minutes ?? null,
          input.rest_time_minutes ?? null,
          input.change_summary ?? null,
        );

      if (input.ingredients) {
        for (let i = 0; i < input.ingredients.length; i++) {
          const ing = input.ingredients[i];
          this.db
            .prepare(
              `INSERT INTO recipe_ingredients (recipe_ingredient_id, recipe_version_id, ingredient_id, quantity_value, quantity_unit, quantity_min, quantity_max, required, preparation, usage_role, group_name, sort_order, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              generateId('ri'),
              versionId,
              ing.ingredient_id,
              ing.quantity_value,
              ing.quantity_unit,
              ing.quantity_min ?? null,
              ing.quantity_max ?? null,
              ing.required !== false ? 1 : 0,
              ing.preparation ?? null,
              ing.usage_role ?? 'main',
              ing.group_name ?? null,
              ing.sort_order ?? i * 10,
              ing.notes ?? null,
            );
        }
      }

      if (input.steps) {
        const stepIdMap = new Map<number, string>();

        for (const step of input.steps) {
          const stepId = generateId('rs');
          stepIdMap.set(step.sequence_number, stepId);

          this.db
            .prepare(
              `INSERT INTO recipe_steps (recipe_step_id, recipe_version_id, sequence_number, title, action_type, instruction_text, instruction_data, required_equipment, timer_recommended, safety_rule_ids)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              stepId,
              versionId,
              step.sequence_number,
              step.title,
              step.action_type ?? null,
              step.instruction_text ?? null,
              JSON.stringify(step.instruction_data ?? {}),
              JSON.stringify(step.required_equipment ?? []),
              step.timer_recommended ? 1 : 0,
              JSON.stringify([]),
            );
        }

        for (const step of input.steps) {
          if (step.depends_on) {
            const stepId = stepIdMap.get(step.sequence_number);
            for (const depSeq of step.depends_on) {
              const depStepId = stepIdMap.get(depSeq);
              if (stepId && depStepId) {
                this.db
                  .prepare(
                    `INSERT INTO recipe_step_dependencies (id, recipe_step_id, depends_on_step_id)
                     VALUES (?, ?, ?)`,
                  )
                  .run(generateId('rsd'), stepId, depStepId);
              }
            }
          }
        }
      }

      if (input.equipment) {
        for (const eq of input.equipment) {
          this.db
            .prepare(
              `INSERT INTO recipe_equipment (id, recipe_version_id, equipment_type, required, capability_needed, notes)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .run(
              generateId('re'),
              versionId,
              eq.equipment_type,
              eq.required !== false ? 1 : 0,
              eq.capability_needed ?? null,
              eq.notes ?? null,
            );
        }
      }
    });

    createTx();

    return this.getVersion(versionId)!;
  }

  validate(versionId: string): { valid: boolean; errors: string[] } {
    const version = this.getVersion(versionId);
    if (!version) {
      return { valid: false, errors: ['Version not found'] };
    }

    const errors: string[] = [];
    const ingredients = this.getIngredients(versionId);
    const steps = this.getSteps(versionId);

    if (ingredients.length === 0) {
      errors.push('No ingredients defined');
    }

    if (steps.length === 0) {
      errors.push('No steps defined');
    }

    for (const ing of ingredients) {
      if (ing.quantity_value <= 0) {
        errors.push(`Ingredient ${ing.ingredient_id} has invalid quantity: ${ing.quantity_value}`);
      }
    }

    const stepSequence = steps.map((s) => s.sequence_number).sort((a, b) => a - b);
    for (let i = 0; i < stepSequence.length; i++) {
      if (stepSequence[i] !== i + 1) {
        errors.push(`Step sequence gap: expected ${i + 1}, found ${stepSequence[i]}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  publishVersion(versionId: string): RecipeVersion {
    const version = this.getVersion(versionId);
    if (!version) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Version not found', {
        details: { recipe_version_id: versionId },
      });
    }

    const validation = this.validate(versionId);
    if (!validation.valid) {
      throw kitchenError(ErrorCode.RECIPE_INVALID, 'Recipe validation failed', {
        details: { errors: validation.errors },
      });
    }

    this.db
      .prepare("UPDATE recipes SET active_version_id = ?, status = 'verified', updated_at = datetime('now') WHERE recipe_id = ?")
      .run(versionId, version.recipe_id);

    return this.getVersion(versionId)!;
  }

  deprecate(recipeId: string): Recipe {
    const recipe = this.get(recipeId);
    if (!recipe) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Recipe not found', {
        details: { recipe_id: recipeId },
      });
    }

    this.db
      .prepare("UPDATE recipes SET status = 'deprecated', updated_at = datetime('now') WHERE recipe_id = ?")
      .run(recipeId);

    return this.get(recipeId)!;
  }

  checkAvailability(recipeId: string, servings: number): {
    can_make: boolean;
    available: string[];
    missing: { ingredient_id: string; needed: number; unit: string; available: number }[];
    substitutions: { original: string; substitute: string; ratio: number }[];
  } {
    const recipe = this.get(recipeId);
    if (!recipe || !recipe.active_version_id) {
      return { can_make: false, available: [], missing: [], substitutions: [] };
    }

    const ingredients = this.getIngredients(recipe.active_version_id);
    const scaleFactor = servings / (recipe.default_servings || 1);

    const available: string[] = [];
    const missing: { ingredient_id: string; needed: number; unit: string; available: number }[] = [];
    const substitutions: { original: string; substitute: string; ratio: number }[] = [];

    for (const ing of ingredients) {
      if (!ing.required) continue;

      const needed = ing.quantity_value * scaleFactor;
      const inventory = this.db
        .prepare(
          "SELECT SUM(quantity_value) as total FROM inventory_lots WHERE ingredient_id = ? AND quantity_value > 0 AND state NOT IN ('consumed', 'discarded', 'spoiled')",
        )
        .get(ing.ingredient_id) as { total: number | null };
      const have = inventory.total ?? 0;

      if (have >= needed) {
        available.push(ing.ingredient_id);
      } else {
        const subs = this.getSubstitutions(ing.ingredient_id);
        let foundSub = false;
        for (const sub of subs) {
          const subInventory = this.db
            .prepare(
              "SELECT SUM(quantity_value) as total FROM inventory_lots WHERE ingredient_id = ? AND quantity_value > 0 AND state NOT IN ('consumed', 'discarded', 'spoiled')",
            )
            .get(sub.substitute_ingredient_id) as { total: number | null };
          const subHave = subInventory.total ?? 0;
          if (subHave >= needed * sub.conversion_ratio) {
            substitutions.push({
              original: ing.ingredient_id,
              substitute: sub.substitute_ingredient_id,
              ratio: sub.conversion_ratio,
            });
            foundSub = true;
            break;
          }
        }
        if (!foundSub) {
          missing.push({ ingredient_id: ing.ingredient_id, needed, unit: ing.quantity_unit, available: have });
        }
      }
    }

    return {
      can_make: missing.length === 0,
      available,
      missing,
      substitutions,
    };
  }

  scale(recipeId: string, targetServings: number): ScaledRecipe | null {
    const recipe = this.get(recipeId);
    if (!recipe || !recipe.active_version_id) return null;

    const ingredients = this.getIngredients(recipe.active_version_id);
    const scaleFactor = targetServings / (recipe.default_servings || 1);

    return {
      recipe_id: recipeId,
      name: recipe.name,
      original_servings: recipe.default_servings,
      target_servings: targetServings,
      scale_factor: scaleFactor,
      ingredients: ingredients.map((ing) => ({
        ingredient_id: ing.ingredient_id,
        original_quantity: ing.quantity_value,
        scaled_quantity: Math.round(ing.quantity_value * scaleFactor * 1000) / 1000,
        unit: ing.quantity_unit,
        notes: ing.notes,
      })),
      unsupported_ingredients: [],
    };
  }
}
