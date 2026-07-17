export const IngredientCategory = {
  VEGETABLE: 'vegetable',
  FRUIT: 'fruit',
  GRAIN: 'grain',
  PULSE: 'pulse',
  FLOUR: 'flour',
  SPICE: 'spice',
  HERB: 'herb',
  OIL: 'oil',
  DAIRY: 'dairy',
  EGG: 'egg',
  MEAT: 'meat',
  SEAFOOD: 'seafood',
  CONDIMENT: 'condiment',
  SAUCE: 'sauce',
  BEVERAGE: 'beverage',
  PREPARED_FOOD: 'prepared_food',
  LEFTOVER: 'leftover',
  OTHER: 'other',
} as const;

export type IngredientCategory = (typeof IngredientCategory)[keyof typeof IngredientCategory];

export const AliasType = {
  CANONICAL: 'canonical',
  COMMON_NAME: 'common_name',
  LOCAL_NAME: 'local_name',
  BRAND_NAME: 'brand_name',
  USER_NICKNAME: 'user_nickname',
  MISSPELLING: 'misspelling',
  TRANSLITERATION: 'transliteration',
} as const;

export type AliasType = (typeof AliasType)[keyof typeof AliasType];

export interface Ingredient {
  ingredient_id: string;
  canonical_name: string;
  display_name: string;
  category: IngredientCategory;
  subcategory: string | null;
  default_unit: string;
  density_g_per_ml: number | null;
  average_piece_weight_g: number | null;
  perishable: boolean;
  default_storage_type: string;
  allergens: string[];
  dietary_tags: string[];
  created_at: string;
  updated_at: string;
}

export interface IngredientAlias {
  alias_id: string;
  ingredient_id: string;
  alias: string;
  language: string;
  region: string | null;
  alias_type: AliasType;
  confidence: string;
  created_at: string;
}

export interface CreateIngredientInput {
  canonical_name: string;
  display_name: string;
  category?: IngredientCategory;
  subcategory?: string;
  default_unit?: string;
  density_g_per_ml?: number;
  average_piece_weight_g?: number;
  perishable?: boolean;
  default_storage_type?: string;
  allergens?: string[];
  dietary_tags?: string[];
}

export interface AddAliasInput {
  ingredient_id: string;
  alias: string;
  language?: string;
  region?: string;
  alias_type?: AliasType;
  confidence?: string;
}
