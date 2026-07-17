import { z } from 'zod';
import type { ServerContext } from '../create-server.js';
import { RecipeService } from '../../domain/recipes/service.js';
import { success } from '../../shared/response.js';
import { toolHandler } from './handler.js';

const RecipeDifficultySchema = z.enum(['beginner', 'intermediate', 'advanced']);

export function registerRecipeTools(ctx: ServerContext): void {
  const { mcpServer, db } = ctx;
  const service = new RecipeService(db);

  mcpServer.tool(
    'kitchen_recipe_search',
    'Search recipes by name, cuisine, meal type, or difficulty',
    {
      query: z.string().optional().describe('Search term'),
      meal_type: z.string().optional().describe('Filter by meal type'),
      cuisine: z.string().optional().describe('Filter by cuisine'),
      difficulty: RecipeDifficultySchema.optional().describe('Filter by difficulty'),
      status: z.string().optional().describe('Filter by status (default: verified)'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (args) => toolHandler(() => {
      const recipes = service.search({ ...args, status: args.status ?? 'verified' });
      return success('RECIPES_SEARCHED', { recipes, count: recipes.length });
    }),
  );

  mcpServer.tool(
    'kitchen_recipe_get',
    'Get full recipe with version, ingredients, steps, and equipment',
    {
      recipe_id: z.string().describe('Recipe ID'),
    },
    async (args) => toolHandler(() => {
      const full = service.getFullRecipe(args.recipe_id);
      if (!full) {
        throw new Error('Recipe not found');
      }
      return success('RECIPE_RETRIEVED', full);
    }),
  );

  mcpServer.tool(
    'kitchen_recipe_create',
    'Create a new draft recipe',
    {
      name: z.string().describe('Recipe name'),
      description: z.string().optional().describe('Description'),
      cuisine: z.string().optional().describe('Cuisine'),
      meal_types: z.array(z.string()).optional().describe('Meal types (e.g. breakfast, lunch, dinner, snack)'),
      difficulty: RecipeDifficultySchema.optional().describe('Difficulty level'),
      default_servings: z.number().optional().describe('Default serving count'),
      source_type: z.string().optional().describe('Source type'),
    },
    async (args) => toolHandler(() => {
      const recipe = service.create(args);
      return success('RECIPE_CREATED', { recipe });
    }),
  );

  mcpServer.tool(
    'kitchen_recipe_create_version',
    'Create a new version of a recipe with ingredients, steps, and equipment',
    {
      recipe_id: z.string().describe('Recipe ID'),
      yield_value: z.number().optional().describe('Yield value'),
      yield_unit: z.string().optional().describe('Yield unit (default: serving)'),
      prep_time_minutes: z.number().optional().describe('Prep time in minutes'),
      cook_time_minutes: z.number().optional().describe('Cook time in minutes'),
      rest_time_minutes: z.number().optional().describe('Rest time in minutes'),
      change_summary: z.string().optional().describe('What changed in this version'),
      ingredients: z.array(z.object({
        ingredient_id: z.string(),
        quantity_value: z.number(),
        quantity_unit: z.string(),
        quantity_min: z.number().optional(),
        quantity_max: z.number().optional(),
        required: z.boolean().optional(),
        preparation: z.string().optional(),
        usage_role: z.enum(['main', 'structure', 'flavour', 'garnish', 'optional']).optional(),
        group_name: z.string().optional(),
        sort_order: z.number().optional(),
        notes: z.string().optional(),
      })).optional().describe('Recipe ingredients'),
      steps: z.array(z.object({
        sequence_number: z.number(),
        title: z.string(),
        action_type: z.string().optional(),
        instruction_text: z.string().optional(),
        instruction_data: z.record(z.unknown()).optional(),
        required_equipment: z.array(z.string()).optional(),
        timer_recommended: z.boolean().optional(),
        depends_on: z.array(z.number()).optional(),
      })).optional().describe('Recipe steps'),
      equipment: z.array(z.object({
        equipment_type: z.string(),
        required: z.boolean().optional(),
        capability_needed: z.string().optional(),
        notes: z.string().optional(),
      })).optional().describe('Required equipment'),
    },
    async (args) => toolHandler(() => {
      const version = service.createVersion(args);
      return success('RECIPE_VERSION_CREATED', { version });
    }),
  );

  mcpServer.tool(
    'kitchen_recipe_validate',
    'Validate a recipe version for completeness and correctness',
    {
      recipe_version_id: z.string().describe('Recipe version ID'),
    },
    async (args) => toolHandler(() => {
      const result = service.validate(args.recipe_version_id);
      return success('RECIPE_VALIDATED', result);
    }),
  );

  mcpServer.tool(
    'kitchen_recipe_publish_version',
    'Publish a validated recipe version as the active version',
    {
      recipe_version_id: z.string().describe('Recipe version ID'),
    },
    async (args) => toolHandler(() => {
      const version = service.publishVersion(args.recipe_version_id);
      return success('RECIPE_PUBLISHED', { version });
    }),
  );

  mcpServer.tool(
    'kitchen_recipe_deprecate',
    'Deprecate a recipe (preserves historical versions)',
    {
      recipe_id: z.string().describe('Recipe ID'),
    },
    async (args) => toolHandler(() => {
      const recipe = service.deprecate(args.recipe_id);
      return success('RECIPE_DEPRECATED', { recipe });
    }),
  );

  mcpServer.tool(
    'kitchen_recipe_check_availability',
    'Check if a recipe can be made with current inventory',
    {
      recipe_id: z.string().describe('Recipe ID'),
      servings: z.number().describe('Number of servings to check'),
    },
    async (args) => toolHandler(() => {
      const result = service.checkAvailability(args.recipe_id, args.servings);
      return success('RECIPE_AVAILABILITY_CHECKED', result);
    }),
  );

  mcpServer.tool(
    'kitchen_recipe_scale',
    'Scale a recipe to a different serving count',
    {
      recipe_id: z.string().describe('Recipe ID'),
      target_servings: z.number().describe('Target serving count'),
    },
    async (args) => toolHandler(() => {
      const result = service.scale(args.recipe_id, args.target_servings);
      if (!result) {
        throw new Error('Recipe not found or no active version');
      }
      return success('RECIPE_SCALED', result);
    }),
  );
}
