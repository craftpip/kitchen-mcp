export type RestrictionType = 'allergy' | 'intolerance' | 'medical' | 'religious' | 'ethical' | 'temporary' | 'dislike';
export type RestrictionSeverity = 'mild' | 'moderate' | 'severe' | 'life_threatening';
export type PreferenceDimension =
  | 'spice_heat' | 'saltiness' | 'sweetness' | 'sourness' | 'bitterness'
  | 'oiliness' | 'garlic_intensity' | 'ginger_intensity' | 'onion_visibility'
  | 'crispness' | 'creaminess' | 'softness' | 'chunk_size' | 'gravy_thickness'
  | 'serving_temperature';
export type PreferenceScope = 'global' | 'ingredient' | 'dish' | 'dish_category' | 'cooking_method' | 'meal_type';
export type PreferenceSource = 'explicit_user_statement' | 'meal_feedback' | 'repeated_inference' | 'manual_import';
export type SkillLevel = 'unknown' | 'never_attempted' | 'beginner' | 'comfortable' | 'experienced';

export interface PersonRestriction {
  restriction_id: string;
  person_id: string;
  restriction_type: RestrictionType;
  ingredient_id: string | null;
  ingredient_category: string | null;
  severity: RestrictionSeverity;
  cross_contamination_sensitive: boolean;
  source: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonPreference {
  preference_id: string;
  person_id: string;
  dimension: PreferenceDimension;
  value_numeric: number;
  scale_min: number;
  scale_max: number;
  scope: PreferenceScope;
  scope_value: string | null;
  confidence: string;
  source: PreferenceSource;
  created_at: string;
  updated_at: string;
}

export interface PersonSkill {
  skill_id: string;
  person_id: string;
  skill_type: string;
  level: SkillLevel;
  guidance_level: string;
  requires_safety_reminders: boolean;
  successful_attempts: number;
  failed_attempts: number;
  last_attempt_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MealFeedback {
  feedback_id: string;
  session_id: string | null;
  person_id: string;
  recipe_id: string;
  rating: number | null;
  liked: boolean | null;
  disliked: boolean | null;
  too_spicy: boolean | null;
  too_salty: boolean | null;
  too_sweet: boolean | null;
  texture_feedback: string | null;
  would_make_again: boolean | null;
  free_text_note: string | null;
  created_at: string;
}

export interface MatchResult {
  recipe_id: string;
  recipe_version_id: string;
  name: string;
  compatibility_score: number;
  can_make_now: boolean;
  available_required_items: string[];
  missing_required_items: { ingredient_id: string; needed: number; unit: string; available: number }[];
  missing_optional_items: string[];
  proposed_substitutions: { original: string; substitute: string; ratio: number }[];
  equipment_status: 'compatible' | 'missing' | 'partial';
  restriction_status: 'allowed' | 'blocked' | 'warning';
  expiry_utilization_score: number;
  reasons: string[];
}

export interface MatchOptions {
  person_ids?: string[];
  servings: number;
  max_total_minutes?: number;
  maximum_difficulty?: string;
  allowed_missing_required_items?: number;
  use_expiring_first?: boolean;
  meal_type?: string;
  include_unverified_recipes?: boolean;
  limit?: number;
}
