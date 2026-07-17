export const RecipeDifficulty = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
} as const;

export type RecipeDifficulty = (typeof RecipeDifficulty)[keyof typeof RecipeDifficulty];

export const RecipeStatus = {
  DRAFT: 'draft',
  IMPORTED_UNVERIFIED: 'imported_unverified',
  VERIFIED: 'verified',
  TESTED: 'tested',
  DEPRECATED: 'deprecated',
} as const;

export type RecipeStatus = (typeof RecipeStatus)[keyof typeof RecipeStatus];

export const UsageRole = {
  MAIN: 'main',
  STRUCTURE: 'structure',
  FLAVOUR: 'flavour',
  GARNISH: 'garnish',
  OPTIONAL: 'optional',
} as const;

export type UsageRole = (typeof UsageRole)[keyof typeof UsageRole];

export interface Recipe {
  recipe_id: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  meal_types: string[];
  difficulty: RecipeDifficulty;
  default_servings: number;
  active_version_id: string | null;
  status: RecipeStatus;
  source_type: string;
  created_at: string;
  updated_at: string;
}

export interface RecipeVersion {
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

export interface RecipeIngredient {
  recipe_ingredient_id: string;
  recipe_version_id: string;
  ingredient_id: string;
  quantity_value: number;
  quantity_unit: string;
  quantity_min: number | null;
  quantity_max: number | null;
  required: boolean;
  preparation: string | null;
  usage_role: UsageRole;
  group_name: string | null;
  sort_order: number;
  notes: string | null;
}

export interface RecipeStep {
  recipe_step_id: string;
  recipe_version_id: string;
  sequence_number: number;
  title: string;
  action_type: string | null;
  instruction_text: string | null;
  instruction_data: Record<string, unknown>;
  required_equipment: string[];
  timer_recommended: boolean;
  safety_rule_ids: string[];
}

export interface SubstitutionRule {
  substitution_rule_id: string;
  original_ingredient_id: string;
  substitute_ingredient_id: string;
  conversion_ratio: number;
  original_unit: string;
  substitute_unit: string;
  valid_roles: string[];
  valid_dish_categories: string[];
  invalid_recipes: string[];
  flavour_difference: string | null;
  confidence: string;
}

export interface CreateRecipeInput {
  name: string;
  description?: string;
  cuisine?: string;
  meal_types?: string[];
  difficulty?: RecipeDifficulty;
  default_servings?: number;
  source_type?: string;
}

export interface CreateRecipeVersionInput {
  recipe_id: string;
  yield_value?: number;
  yield_unit?: string;
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  rest_time_minutes?: number;
  change_summary?: string;
  ingredients?: {
    ingredient_id: string;
    quantity_value: number;
    quantity_unit: string;
    quantity_min?: number;
    quantity_max?: number;
    required?: boolean;
    preparation?: string;
    usage_role?: UsageRole;
    group_name?: string;
    sort_order?: number;
    notes?: string;
  }[];
  steps?: {
    sequence_number: number;
    title: string;
    action_type?: string;
    instruction_text?: string;
    instruction_data?: Record<string, unknown>;
    required_equipment?: string[];
    timer_recommended?: boolean;
    depends_on?: number[];
  }[];
  equipment?: {
    equipment_type: string;
    required?: boolean;
    capability_needed?: string;
    notes?: string;
  }[];
}

export interface RecipeMatchResult {
  recipe_id: string;
  recipe_version_id: string;
  name: string;
  compatibility_score: number;
  can_make_now: boolean;
  available_required_items: string[];
  missing_required_items: string[];
  missing_optional_items: string[];
  proposed_substitutions: {
    original: string;
    substitute: string;
    conversion_ratio: number;
  }[];
  equipment_status: 'compatible' | 'missing' | 'partial';
  restriction_status: 'allowed' | 'blocked';
  reasons: string[];
}

export interface ScaledRecipe {
  recipe_id: string;
  name: string;
  original_servings: number;
  target_servings: number;
  scale_factor: number;
  ingredients: {
    ingredient_id: string;
    original_quantity: number;
    scaled_quantity: number;
    unit: string;
    notes: string | null;
  }[];
  unsupported_ingredients: string[];
}
