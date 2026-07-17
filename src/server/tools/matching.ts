import { z } from 'zod';
import type { ServerContext } from '../create-server.js';
import { MatchingService } from '../../domain/matching/matching-service.js';
import { success } from '../../shared/response.js';
import { toolHandler } from './handler.js';

const DifficultySchema = z.enum(['beginner', 'intermediate', 'advanced']);

export function registerMatchingTools(ctx: ServerContext): void {
  const { mcpServer, db } = ctx;
  const service = new MatchingService(db);

  mcpServer.tool(
    'kitchen_recipe_match',
    'Find the best recipes for your current inventory, restrictions, and preferences. Returns scored and ranked results.',
    {
      servings: z.number().describe('Number of servings to cook for'),
      person_ids: z.array(z.string()).optional().describe('Person IDs to check restrictions/preferences for (default: household members)'),
      meal_type: z.string().optional().describe('Filter by meal type (breakfast, lunch, dinner, snack)'),
      max_total_minutes: z.number().optional().describe('Maximum total time (prep + cook + rest) in minutes'),
      maximum_difficulty: DifficultySchema.optional().describe('Maximum difficulty level'),
      allowed_missing_required_items: z.number().optional().describe('How many required items can be missing (default: 0)'),
      use_expiring_first: z.boolean().optional().describe('Boost score for recipes using expiring ingredients (default: true)'),
      include_unverified_recipes: z.boolean().optional().describe('Include unverified/draft recipes (default: false)'),
      limit: z.number().optional().describe('Max results (default: 10)'),
    },
    async (args) => toolHandler(() => {
      const results = service.match({
        servings: args.servings,
        person_ids: args.person_ids,
        meal_type: args.meal_type,
        max_total_minutes: args.max_total_minutes,
        maximum_difficulty: args.maximum_difficulty,
        allowed_missing_required_items: args.allowed_missing_required_items,
        use_expiring_first: args.use_expiring_first,
        include_unverified_recipes: args.include_unverified_recipes,
        limit: args.limit,
      });
      return success('RECIPES_MATCHED', {
        results,
        count: results.length,
        filters: {
          servings: args.servings,
          meal_type: args.meal_type,
          max_total_minutes: args.max_total_minutes,
          maximum_difficulty: args.maximum_difficulty,
        },
      });
    }),
  );
}
