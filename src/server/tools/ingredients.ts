import { z } from 'zod';
import type { ServerContext } from '../create-server.js';
import { IngredientService } from '../../domain/ingredients/service.js';
import { success } from '../../shared/response.js';
import { toolHandler } from './handler.js';

const IngredientCategorySchema = z.enum([
  'vegetable', 'fruit', 'grain', 'pulse', 'flour', 'spice', 'herb', 'oil',
  'dairy', 'egg', 'meat', 'seafood', 'condiment', 'sauce', 'beverage',
  'prepared_food', 'leftover', 'other',
]);

const AliasTypeSchema = z.enum([
  'canonical', 'common_name', 'local_name', 'brand_name',
  'user_nickname', 'misspelling', 'transliteration',
]);

export function registerIngredientTools(ctx: ServerContext): void {
  const { mcpServer, db } = ctx;
  const service = new IngredientService(db);

  mcpServer.tool(
    'kitchen_ingredient_search',
    'Search the ingredient catalog by name or alias',
    {
      query: z.string().describe('Search term (matches canonical name, display name, and aliases)'),
      category: z.string().optional().describe('Filter by ingredient category'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (args) => toolHandler(() => {
      const results = service.search(args.query, {
        category: args.category,
        limit: args.limit,
      });
      return success('INGREDIENTS_SEARCHED', { results, count: results.length });
    }),
  );

  mcpServer.tool(
    'kitchen_ingredient_get',
    'Get a single ingredient from the catalog',
    {
      ingredient_id: z.string().describe('Ingredient ID'),
    },
    async (args) => toolHandler(() => {
      const ingredient = service.get(args.ingredient_id);
      if (!ingredient) {
        throw new Error('Ingredient not found');
      }
      const aliases = service.getAliases(args.ingredient_id);
      return success('INGREDIENT_RETRIEVED', { ingredient, aliases });
    }),
  );

  mcpServer.tool(
    'kitchen_ingredient_create',
    'Add a new ingredient to the catalog',
    {
      canonical_name: z.string().describe('Canonical name (lowercase, unique)'),
      display_name: z.string().describe('Human-readable display name'),
      category: IngredientCategorySchema.optional().describe('Ingredient category'),
      subcategory: z.string().optional().describe('Subcategory'),
      default_unit: z.string().optional().describe('Default measurement unit (default: piece)'),
      density_g_per_ml: z.number().optional().describe('Density in g/ml'),
      average_piece_weight_g: z.number().optional().describe('Average weight per piece in grams'),
      perishable: z.boolean().optional().describe('Whether the ingredient is perishable'),
      default_storage_type: z.string().optional().describe('Default storage type'),
      allergens: z.array(z.string()).optional().describe('Allergen tags'),
      dietary_tags: z.array(z.string()).optional().describe('Dietary tags'),
    },
    async (args) => toolHandler(() => {
      const ingredient = service.create(args);
      return success('INGREDIENT_CREATED', { ingredient });
    }),
  );

  mcpServer.tool(
    'kitchen_ingredient_add_alias',
    'Add an alias (local name, nickname, etc.) to an ingredient',
    {
      ingredient_id: z.string().describe('Ingredient ID'),
      alias: z.string().describe('Alias text'),
      language: z.string().optional().describe('Language code (default: en)'),
      region: z.string().optional().describe('Region'),
      alias_type: AliasTypeSchema.optional().describe('Alias type'),
      confidence: z.string().optional().describe('Confidence level'),
    },
    async (args) => toolHandler(() => {
      const alias = service.addAlias(args);
      return success('ALIAS_ADDED', { alias });
    }),
  );
}
