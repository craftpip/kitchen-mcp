import type Database from 'better-sqlite3';
import { generateId } from '../../shared/ids.js';
import { kitchenError, ErrorCode } from '../../shared/errors/catalogue.js';
import type {
  Ingredient,
  IngredientAlias,
  CreateIngredientInput,
  AddAliasInput,
  IngredientCategory,
  AliasType,
} from './types.js';

interface IngredientRow {
  ingredient_id: string;
  canonical_name: string;
  display_name: string;
  category: string;
  subcategory: string | null;
  default_unit: string;
  density_g_per_ml: number | null;
  average_piece_weight_g: number | null;
  perishable: number;
  default_storage_type: string;
  allergens: string;
  dietary_tags: string;
  created_at: string;
  updated_at: string;
}

function rowToIngredient(row: IngredientRow): Ingredient {
  return {
    ...row,
    category: row.category as IngredientCategory,
    perishable: row.perishable === 1,
    allergens: JSON.parse(row.allergens),
    dietary_tags: JSON.parse(row.dietary_tags),
  };
}

interface AliasRow {
  alias_id: string;
  ingredient_id: string;
  alias: string;
  language: string;
  region: string | null;
  alias_type: string;
  confidence: string;
  created_at: string;
}

function rowToAlias(row: AliasRow): IngredientAlias {
  return {
    ...row,
    alias_type: row.alias_type as AliasType,
  };
}

export class IngredientService {
  constructor(private db: Database.Database) {}

  search(query: string, options?: { category?: string; limit?: number }): Ingredient[] {
    const limit = options?.limit ?? 20;
    const searchTerm = `%${query.toLowerCase()}%`;

    const rows = this.db
      .prepare(
        `SELECT DISTINCT i.*
         FROM ingredient_catalog i
         LEFT JOIN ingredient_aliases a ON a.ingredient_id = i.ingredient_id
         WHERE (
           LOWER(i.canonical_name) LIKE ?
           OR LOWER(i.display_name) LIKE ?
           OR LOWER(a.alias) LIKE ?
         )
         ${options?.category ? 'AND i.category = ?' : ''}
         ORDER BY i.display_name
         LIMIT ?`,
      )
      .all(
        ...(options?.category
          ? [searchTerm, searchTerm, searchTerm, options.category, limit]
          : [searchTerm, searchTerm, searchTerm, limit]),
      ) as IngredientRow[];

    return rows.map(rowToIngredient);
  }

  get(ingredientId: string): Ingredient | undefined {
    const row = this.db
      .prepare('SELECT * FROM ingredient_catalog WHERE ingredient_id = ?')
      .get(ingredientId) as IngredientRow | undefined;
    return row ? rowToIngredient(row) : undefined;
  }

  getAliases(ingredientId: string): IngredientAlias[] {
    const rows = this.db
      .prepare('SELECT * FROM ingredient_aliases WHERE ingredient_id = ? ORDER BY alias_type, alias')
      .all(ingredientId) as AliasRow[];
    return rows.map(rowToAlias);
  }

  create(input: CreateIngredientInput): Ingredient {
    const canonicalName = input.canonical_name.toLowerCase().trim();

    const existing = this.db
      .prepare('SELECT ingredient_id FROM ingredient_catalog WHERE canonical_name = ?')
      .get(canonicalName) as { ingredient_id: string } | undefined;

    if (existing) {
      throw kitchenError(ErrorCode.ALREADY_EXISTS, 'Ingredient already exists', {
        details: { canonical_name: canonicalName, ingredient_id: existing.ingredient_id },
      });
    }

    const id = generateId('ing');
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO ingredient_catalog (ingredient_id, canonical_name, display_name, category, subcategory, default_unit, density_g_per_ml, average_piece_weight_g, perishable, default_storage_type, allergens, dietary_tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        canonicalName,
        input.display_name,
        input.category ?? 'other',
        input.subcategory ?? null,
        input.default_unit ?? 'piece',
        input.density_g_per_ml ?? null,
        input.average_piece_weight_g ?? null,
        input.perishable ? 1 : 0,
        input.default_storage_type ?? 'ambient',
        JSON.stringify(input.allergens ?? []),
        JSON.stringify(input.dietary_tags ?? []),
        now,
        now,
      );

    return this.get(id)!;
  }

  addAlias(input: AddAliasInput): IngredientAlias {
    const ingredient = this.get(input.ingredient_id);
    if (!ingredient) {
      throw kitchenError(ErrorCode.NOT_FOUND, 'Ingredient not found', {
        details: { ingredient_id: input.ingredient_id },
      });
    }

    const aliasText = input.alias.toLowerCase().trim();

    const existing = this.db
      .prepare('SELECT alias_id FROM ingredient_aliases WHERE ingredient_id = ? AND alias = ?')
      .get(input.ingredient_id, aliasText) as { alias_id: string } | undefined;

    if (existing) {
      throw kitchenError(ErrorCode.ALREADY_EXISTS, 'Alias already exists for this ingredient', {
        details: { ingredient_id: input.ingredient_id, alias: aliasText },
      });
    }

    const id = generateId('alias');

    this.db
      .prepare(
        `INSERT INTO ingredient_aliases (alias_id, ingredient_id, alias, language, region, alias_type, confidence, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(
        id,
        input.ingredient_id,
        aliasText,
        input.language ?? 'en',
        input.region ?? null,
        input.alias_type ?? 'common_name',
        input.confidence ?? 'verified',
      );

    const row = this.db
      .prepare('SELECT * FROM ingredient_aliases WHERE alias_id = ?')
      .get(id) as AliasRow;
    return rowToAlias(row);
  }
}
