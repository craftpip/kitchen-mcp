import type Database from 'better-sqlite3';
import { RecipeService } from '../recipes/service.js';
import { RestrictionService } from './restriction-service.js';
import type { MatchResult, MatchOptions } from './types.js';

const DIFFICULTY_RANK: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 };

export class MatchingService {
  private recipes: RecipeService;
  private restrictions: RestrictionService;

  constructor(private db: Database.Database) {
    this.recipes = new RecipeService(db);
    this.restrictions = new RestrictionService(db);
  }

  match(options: MatchOptions): MatchResult[] {
    const {
      servings,
      max_total_minutes,
      maximum_difficulty,
      allowed_missing_required_items = 0,
      use_expiring_first = true,
      meal_type,
      include_unverified_recipes = false,
      limit = 10,
    } = options;

    const personIds = options.person_ids ?? this.getDefaultPersonIds();

    // Gather restriction data
    const blockedIngredients = this.restrictions.getBlockedIngredientIds(personIds);
    const blockedCategories = this.restrictions.getBlockedCategories(personIds);
    const severeAllergens = this.restrictions.getSevereAllergenIngredientIds(personIds);

    // Get candidate recipes
    let candidates = this.recipes.search({
      meal_type,
      difficulty: maximum_difficulty,
      status: include_unverified_recipes ? undefined : 'verified',
      limit: 100,
    });

    // Get expiring ingredients for scoring
    const expiringIngredients = use_expiring_first ? this.getExpiringIngredientIds() : new Set<string>();

    const results: MatchResult[] = [];

    for (const recipe of candidates) {
      if (!recipe.active_version_id) continue;

      const version = this.recipes.getVersion(recipe.active_version_id);
      if (!version) continue;

      // Time filter
      const totalTime = (version.prep_time_minutes ?? 0) + (version.cook_time_minutes ?? 0) + (version.rest_time_minutes ?? 0);
      if (max_total_minutes && totalTime > max_total_minutes) continue;

      const ingredients = this.recipes.getIngredients(recipe.active_version_id);
      const equipment = this.recipes.getEquipment(recipe.active_version_id) as { equipment_type: string; required: number }[];

      // Check restrictions — BLOCKED recipes are excluded entirely
      const restrictionResult = this.checkRestrictions(ingredients, blockedIngredients, blockedCategories, severeAllergens);
      if (restrictionResult.status === 'blocked') continue;

      // Check availability
      const avail = this.recipes.checkAvailability(recipe.recipe_id, servings);

      // Check equipment
      const equipResult = this.checkEquipment(equipment);

      // Check required items allowed
      if (avail.missing.length > allowed_missing_required_items) continue;

      // Calculate score
      const score = this.calculateScore({
        ingredients,
        availability: avail,
        equipment: equipResult,
        restrictionStatus: restrictionResult.status,
        expiringIngredients,
        totalTime,
        maxTotalMinutes: max_total_minutes,
        difficulty: recipe.difficulty,
        personIds,
        servings,
      });

      results.push({
        recipe_id: recipe.recipe_id,
        recipe_version_id: version.recipe_version_id,
        name: recipe.name,
        compatibility_score: score.total,
        can_make_now: avail.can_make && equipResult.status === 'compatible',
        available_required_items: avail.available,
        missing_required_items: avail.missing,
        missing_optional_items: ingredients.filter((i) => !i.required && !avail.available.includes(i.ingredient_id)).map((i) => i.ingredient_id),
        proposed_substitutions: avail.substitutions,
        equipment_status: equipResult.status,
        restriction_status: restrictionResult.status,
        expiry_utilization_score: score.expiryUtilization,
        reasons: score.reasons,
      });
    }

    // Sort by score descending
    results.sort((a, b) => b.compatibility_score - a.compatibility_score);
    return results.slice(0, limit);
  }

  private getDefaultPersonIds(): string[] {
    const rows = this.db
      .prepare("SELECT person_id FROM people WHERE household_id = 'hh_default' AND active = 1")
      .all() as { person_id: string }[];
    return rows.map((r) => r.person_id);
  }

  private getExpiringIngredientIds(): Set<string> {
    const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString();
    const rows = this.db
      .prepare(
        `SELECT DISTINCT ingredient_id FROM inventory_lots
         WHERE quantity_value > 0
         AND state NOT IN ('consumed', 'discarded', 'spoiled')
         AND (estimated_expiry_at IS NOT NULL AND estimated_expiry_at <= ?)
            OR (printed_expiry_at IS NOT NULL AND printed_expiry_at <= ?)`,
      )
      .all(sevenDays, sevenDays) as { ingredient_id: string }[];
    return new Set(rows.map((r) => r.ingredient_id));
  }

  private checkRestrictions(
    ingredients: { ingredient_id: string }[],
    blockedIngredients: Set<string>,
    blockedCategories: Set<string>,
    severeAllergens: Set<string>,
  ): { status: 'allowed' | 'blocked' | 'warning'; conflicts: string[] } {
    const conflicts: string[] = [];

    for (const ing of ingredients) {
      if (blockedIngredients.has(ing.ingredient_id)) {
        if (severeAllergens.has(ing.ingredient_id)) {
          return { status: 'blocked', conflicts: [...conflicts, ing.ingredient_id] };
        }
        conflicts.push(ing.ingredient_id);
      }

      // Check category
      const catRow = this.db
        .prepare('SELECT category FROM ingredient_catalog WHERE ingredient_id = ?')
        .get(ing.ingredient_id) as { category: string } | undefined;
      if (catRow && blockedCategories.has(catRow.category)) {
        return { status: 'blocked', conflicts: [...conflicts, ing.ingredient_id] };
      }
    }

    if (conflicts.length > 0) return { status: 'warning', conflicts };
    return { status: 'allowed', conflicts: [] };
  }

  private checkEquipment(
    recipeEquipment: { equipment_type: string; required: number }[],
  ): { status: 'compatible' | 'missing' | 'partial'; missing: string[] } {
    const missing: string[] = [];

    for (const eq of recipeEquipment) {
      if (!eq.required) continue;
      const has = this.db
        .prepare(
          "SELECT 1 FROM equipment WHERE equipment_type = ? AND condition = 'working' AND available = 1 LIMIT 1",
        )
        .get(eq.equipment_type);
      if (!has) missing.push(eq.equipment_type);
    }

    if (missing.length === 0) return { status: 'compatible', missing: [] };
    const requiredCount = recipeEquipment.filter((e) => e.required).length;
    if (missing.length >= requiredCount) return { status: 'missing', missing };
    return { status: 'partial', missing };
  }

  private calculateScore(ctx: {
    ingredients: { ingredient_id: string; required: boolean; usage_role: string }[];
    availability: { available: string[]; missing: { ingredient_id: string }[]; can_make: boolean; substitutions: unknown[] };
    equipment: { status: string; missing: string[] };
    restrictionStatus: string;
    expiringIngredients: Set<string>;
    totalTime: number;
    maxTotalMinutes?: number;
    difficulty: string;
    personIds: string[];
    servings: number;
  }): { total: number; expiryUtilization: number; reasons: string[] } {
    const reasons: string[] = [];

    // 1. Ingredient coverage (35%)
    const requiredIngredients = ctx.ingredients.filter((i) => i.required);
    const availableRequired = requiredIngredients.filter((i) => ctx.availability.available.includes(i.ingredient_id));
    const ingredientScore = requiredIngredients.length > 0
      ? (availableRequired.length / requiredIngredients.length) * 35
      : 35;
    if (ctx.availability.can_make) reasons.push('all_required_ingredients_available');

    // 2. Restriction compatibility — mandatory gate, already filtered
    const restrictionScore = ctx.restrictionStatus === 'allowed' ? 15 : ctx.restrictionStatus === 'warning' ? 5 : 0;

    // 3. Equipment compatibility (15%)
    let equipmentScore: number;
    if (ctx.equipment.status === 'compatible') {
      equipmentScore = 15;
      reasons.push('all_equipment_available');
    } else if (ctx.equipment.status === 'partial') {
      equipmentScore = 8;
    } else {
      equipmentScore = 0;
    }

    // 4. Time compatibility (10%)
    let timeScore = 10;
    if (ctx.maxTotalMinutes && ctx.totalTime > 0) {
      const ratio = ctx.totalTime / ctx.maxTotalMinutes;
      timeScore = Math.max(0, 10 * (1 - ratio));
    }
    if (ctx.totalTime <= 30) reasons.push('quick_recipe');

    // 5. Preference compatibility (10%)
    const prefScore = this.calculatePreferenceScore(ctx.personIds, ctx.ingredients);

    // 6. Expiry utilization (10%)
    let expiryScore = 0;
    if (ctx.expiringIngredients.size > 0) {
      const usedExpiring = ctx.ingredients.filter(
        (i) => ctx.expiringIngredients.has(i.ingredient_id) && ctx.availability.available.includes(i.ingredient_id),
      );
      if (usedExpiring.length > 0) {
        expiryScore = Math.min(10, (usedExpiring.length / ctx.expiringIngredients.size) * 10 + 3);
        reasons.push('uses_expiring_ingredients');
      }
    }

    // 7. Substitution bonus (5%)
    const subScore = ctx.availability.substitutions.length > 0 ? 5 : 0;
    if (ctx.availability.substitutions.length > 0) reasons.push('has_substitutions');

    // 8. Difficulty (5%)
    const diffRank = DIFFICULTY_RANK[ctx.difficulty] ?? 2;
    const diffScore = diffRank === 1 ? 5 : diffRank === 2 ? 3 : 1;

    const total = Math.round(ingredientScore + restrictionScore + equipmentScore + timeScore + prefScore + expiryScore + subScore + diffScore);

    return {
      total: Math.min(100, Math.max(0, total)),
      expiryUtilization: Math.round(expiryScore * 10),
      reasons,
    };
  }

  private calculatePreferenceScore(personIds: string[], ingredients: { ingredient_id: string }[]): number {
    if (personIds.length === 0) return 5; // neutral

    // Simple heuristic: check if spice preference aligns
    const spicePrefs = this.db
      .prepare(
        `SELECT value_numeric, scale_max FROM person_preferences
         WHERE person_id IN (${personIds.map(() => '?').join(',')})
         AND dimension = 'spice_heat' AND scope = 'global'`,
      )
      .all(...personIds) as { value_numeric: number; scale_max: number }[];

    if (spicePrefs.length === 0) return 5;

    // If user prefers mild (low spice), penalize recipes with spicy ingredients
    const avgSpice = spicePrefs.reduce((s, p) => s + p.value_numeric / p.scale_max, 0) / spicePrefs.length;
    const spiceIngredients = this.db
      .prepare(
        `SELECT ic.ingredient_id FROM ingredient_catalog ic
         WHERE ic.ingredient_id IN (${ingredients.map(() => '?').join(',')})
         AND (ic.category = 'spice' OR ic.canonical_name LIKE '%chili%' OR ic.canonical_name LIKE '%pepper%')`,
      )
      .all(...ingredients.map((i) => i.ingredient_id)) as { ingredient_id: string }[];

    if (spiceIngredients.length === 0) return 7; // no spices = fine for everyone

    // Mild preference + many spices = lower score
    if (avgSpice < 0.3 && spiceIngredients.length > 3) return 3;
    if (avgSpice > 0.7 && spiceIngredients.length > 0) return 8;
    return 6;
  }
}
