export const ShoppingListStatus = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;

export type ShoppingListStatus = (typeof ShoppingListStatus)[keyof typeof ShoppingListStatus];

export const ShoppingItemStatus = {
  NEEDED: 'needed',
  APPROVED: 'approved',
  ORDERED: 'ordered',
  PURCHASED: 'purchased',
  STORED: 'stored',
  CANCELLED: 'cancelled',
  UNAVAILABLE: 'unavailable',
} as const;

export type ShoppingItemStatus = (typeof ShoppingItemStatus)[keyof typeof ShoppingItemStatus];

export const ShoppingItemPriority = {
  REQUIRED: 'required',
  PREFERRED: 'preferred',
  OPTIONAL: 'optional',
} as const;

export type ShoppingItemPriority = (typeof ShoppingItemPriority)[keyof typeof ShoppingItemPriority];

export interface ShoppingList {
  shopping_list_id: string;
  household_id: string;
  name: string;
  status: ShoppingListStatus;
  created_at: string;
  updated_at: string;
}

export interface ShoppingItem {
  shopping_item_id: string;
  shopping_list_id: string;
  ingredient_id: string;
  requested_quantity: number;
  requested_unit: string;
  priority: ShoppingItemPriority;
  reason: string;
  source_recipe_id: string | null;
  preferred_brand: string | null;
  notes: string | null;
  status: ShoppingItemStatus;
  purchased_quantity: number | null;
  purchased_unit: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateShoppingListInput {
  household_id: string;
  name: string;
}

export interface AddShoppingItemInput {
  shopping_list_id: string;
  ingredient_id: string;
  requested_quantity: number;
  requested_unit: string;
  priority?: ShoppingItemPriority;
  reason?: string;
  source_recipe_id?: string;
  preferred_brand?: string;
  notes?: string;
}

export interface UpdateShoppingItemInput {
  shopping_item_id: string;
  status?: ShoppingItemStatus;
  requested_quantity?: number;
  requested_unit?: string;
  priority?: ShoppingItemPriority;
  notes?: string;
  purchased_quantity?: number;
  purchased_unit?: string;
}

export interface GenerateForRecipesInput {
  household_id: string;
  recipe_ids: string[];
  servings: Record<string, number>;
  name?: string;
}
