import { z } from 'zod';
import type { ServerContext } from '../create-server.js';
import { PreferenceService } from '../../domain/matching/preference-service.js';
import { success } from '../../shared/response.js';
import { toolHandler } from './handler.js';

const DimensionSchema = z.enum([
  'spice_heat', 'saltiness', 'sweetness', 'sourness', 'bitterness',
  'oiliness', 'garlic_intensity', 'ginger_intensity', 'onion_visibility',
  'crispness', 'creaminess', 'softness', 'chunk_size', 'gravy_thickness',
  'serving_temperature',
]);

const ScopeSchema = z.enum(['global', 'ingredient', 'dish', 'dish_category', 'cooking_method', 'meal_type']);

export function registerPreferenceTools(ctx: ServerContext): void {
  const { mcpServer, db } = ctx;
  const service = new PreferenceService(db);

  mcpServer.tool(
    'kitchen_preference_list',
    'List flavour/texture preferences for a person',
    {
      person_id: z.string().describe('Person ID').default('person_default'),
    },
    async (args) => toolHandler(() => {
      const preferences = service.list(args.person_id);
      return success('PREFERENCES_LISTED', { preferences, count: preferences.length });
    }),
  );

  mcpServer.tool(
    'kitchen_preference_set',
    'Set or update a flavour/texture preference (0-10 scale)',
    {
      person_id: z.string().describe('Person ID').default('person_default'),
      dimension: DimensionSchema.describe('Preference dimension'),
      value: z.number().describe('Value on the scale (0 = none, 10 = maximum)'),
      scale_min: z.number().optional().describe('Minimum scale value (default: 0)'),
      scale_max: z.number().optional().describe('Maximum scale value (default: 10)'),
      scope: ScopeSchema.optional().describe('Scope: global, ingredient, dish, dish_category, etc.'),
      scope_value: z.string().optional().describe('Scope value (e.g. ingredient_id for ingredient scope)'),
      source: z.string().optional().describe('Source: explicit_user_statement, meal_feedback, etc.'),
    },
    async (args) => toolHandler(() => {
      const preference = service.set({
        person_id: args.person_id,
        dimension: args.dimension,
        value: args.value,
        scale_min: args.scale_min,
        scale_max: args.scale_max,
        scope: args.scope,
        scope_value: args.scope_value,
        source: args.source as 'explicit_user_statement' | undefined,
      });
      return success('PREFERENCE_SET', { preference });
    }),
  );

  mcpServer.tool(
    'kitchen_preference_profile',
    'Get full preference profile for one or more people',
    {
      person_ids: z.array(z.string()).optional().describe('Person IDs (default: all household members)'),
    },
    async (args) => toolHandler(() => {
      const ids = args.person_ids ?? ['person_default'];
      const profile = service.getProfile(ids);
      return success('PREFERENCE_PROFILE', { profile });
    }),
  );
}
