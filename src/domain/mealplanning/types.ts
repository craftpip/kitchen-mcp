export const MealPlanStatus = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;

export type MealPlanStatus = (typeof MealPlanStatus)[keyof typeof MealPlanStatus];

export const MealType = {
  BREAKFAST: 'breakfast',
  LUNCH: 'lunch',
  DINNER: 'dinner',
  SNACK: 'snack',
} as const;

export type MealType = (typeof MealType)[keyof typeof MealType];

export interface MealPlan {
  meal_plan_id: string;
  household_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: MealPlanStatus;
  created_at: string;
  updated_at: string;
}

export interface MealPlanEntry {
  meal_plan_entry_id: string;
  meal_plan_id: string;
  date: string;
  meal_type: string;
  recipe_id: string;
  recipe_version_id: string;
  servings: number;
  priority_reasons: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMealPlanInput {
  household_id: string;
  name: string;
  start_date: string;
  end_date: string;
}

export interface AddMealPlanEntryInput {
  meal_plan_id: string;
  date: string;
  meal_type: string;
  recipe_id: string;
  servings: number;
  priority_reasons?: string[];
  notes?: string;
}

export interface UpdateMealPlanEntryInput {
  meal_plan_entry_id: string;
  date?: string;
  meal_type?: string;
  recipe_id?: string;
  servings?: number;
  priority_reasons?: string[];
  notes?: string;
}

export interface MealPlanValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface GenerateMealPlanInput {
  household_id: string;
  start_date: string;
  end_date: string;
  meal_types: string[];
  servings: number;
  max_cooking_minutes_per_meal?: number;
  use_expiring_first?: boolean;
  name?: string;
}
