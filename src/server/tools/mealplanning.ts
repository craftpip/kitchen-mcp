import { z } from 'zod';
import type { ServerContext } from '../create-server.js';
import { MealPlanService } from '../../domain/mealplanning/service.js';
import { success } from '../../shared/response.js';
import { toolHandler } from './handler.js';

const DEFAULT_HOUSEHOLD = 'hh_default';

export function registerMealPlanningTools(ctx: ServerContext): void {
  const { mcpServer, db } = ctx;
  const service = new MealPlanService(db);

  mcpServer.tool(
    'kitchen_meal_plan_create',
    'Create a new meal plan',
    {
      name: z.string().describe('Name for the meal plan'),
      start_date: z.string().describe('Start date (YYYY-MM-DD)'),
      end_date: z.string().describe('End date (YYYY-MM-DD)'),
    },
    async (args) => toolHandler(() => {
      const plan = service.create({
        household_id: DEFAULT_HOUSEHOLD,
        name: args.name,
        start_date: args.start_date,
        end_date: args.end_date,
      });
      return success('MEAL_PLAN_CREATED', { plan });
    }),
  );

  mcpServer.tool(
    'kitchen_meal_plan_get',
    'Get a meal plan with all its entries',
    {
      meal_plan_id: z.string().describe('Meal plan ID'),
    },
    async (args) => toolHandler(() => {
      const plan = service.get(args.meal_plan_id);
      if (!plan) {
        throw new Error('Meal plan not found');
      }
      const entries = service.getEntries(args.meal_plan_id);
      return success('MEAL_PLAN_RETRIEVED', { plan, entries, count: entries.length });
    }),
  );

  mcpServer.tool(
    'kitchen_meal_plan_list',
    'List all meal plans for the household',
    {
      status: z.string().optional().describe('Filter by status (draft, active, completed, archived)'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (args) => toolHandler(() => {
      const plans = service.list(DEFAULT_HOUSEHOLD, args);
      return success('MEAL_PLANS_LISTED', { plans, count: plans.length });
    }),
  );

  mcpServer.tool(
    'kitchen_meal_plan_add_entry',
    'Add a recipe entry to a meal plan',
    {
      meal_plan_id: z.string().describe('Meal plan ID'),
      date: z.string().describe('Date (YYYY-MM-DD)'),
      meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).describe('Meal type'),
      recipe_id: z.string().describe('Recipe ID'),
      servings: z.number().describe('Number of servings'),
      priority_reasons: z.array(z.string()).optional().describe('Reasons for this entry (e.g. uses_expiring_ingredients)'),
      notes: z.string().optional().describe('Notes'),
    },
    async (args) => toolHandler(() => {
      const entry = service.addEntry(args);
      return success('MEAL_PLAN_ENTRY_ADDED', { entry });
    }),
  );

  mcpServer.tool(
    'kitchen_meal_plan_update_entry',
    'Update a meal plan entry',
    {
      meal_plan_entry_id: z.string().describe('Meal plan entry ID'),
      date: z.string().optional().describe('Updated date (YYYY-MM-DD)'),
      meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional().describe('Updated meal type'),
      recipe_id: z.string().optional().describe('Updated recipe ID'),
      servings: z.number().optional().describe('Updated servings'),
      priority_reasons: z.array(z.string()).optional().describe('Updated priority reasons'),
      notes: z.string().optional().describe('Updated notes'),
    },
    async (args) => toolHandler(() => {
      const { meal_plan_entry_id, ...updates } = args;
      const entry = service.updateEntry({ meal_plan_entry_id, ...updates });
      return success('MEAL_PLAN_ENTRY_UPDATED', { entry });
    }),
  );

  mcpServer.tool(
    'kitchen_meal_plan_remove_entry',
    'Remove an entry from a meal plan',
    {
      meal_plan_entry_id: z.string().describe('Meal plan entry ID'),
    },
    async (args) => toolHandler(() => {
      service.removeEntry(args.meal_plan_entry_id);
      return success('MEAL_PLAN_ENTRY_REMOVED', { meal_plan_entry_id: args.meal_plan_entry_id });
    }),
  );

  mcpServer.tool(
    'kitchen_meal_plan_validate',
    'Validate a meal plan for recipe availability and date consistency',
    {
      meal_plan_id: z.string().describe('Meal plan ID'),
    },
    async (args) => toolHandler(() => {
      const validation = service.validate(args.meal_plan_id);
      return success('MEAL_PLAN_VALIDATED', validation);
    }),
  );

  mcpServer.tool(
    'kitchen_meal_plan_commit',
    'Commit a draft meal plan to active status (validates first)',
    {
      meal_plan_id: z.string().describe('Meal plan ID'),
    },
    async (args) => toolHandler(() => {
      const plan = service.commit(args.meal_plan_id);
      return success('MEAL_PLAN_COMMITTED', { plan });
    }),
  );

  mcpServer.tool(
    'kitchen_meal_plan_complete',
    'Mark a meal plan as completed',
    {
      meal_plan_id: z.string().describe('Meal plan ID'),
    },
    async (args) => toolHandler(() => {
      const plan = service.complete(args.meal_plan_id);
      return success('MEAL_PLAN_COMPLETED', { plan });
    }),
  );

  mcpServer.tool(
    'kitchen_meal_plan_generate',
    'Auto-generate a meal plan by selecting recipes for each day and meal type',
    {
      start_date: z.string().describe('Start date (YYYY-MM-DD)'),
      end_date: z.string().describe('End date (YYYY-MM-DD)'),
      meal_types: z.array(z.string()).describe('Meal types to plan (e.g. ["breakfast", "lunch", "dinner"])'),
      servings: z.number().describe('Number of servings per meal'),
      max_cooking_minutes_per_meal: z.number().optional().describe('Max total cooking time per meal (minutes)'),
      use_expiring_first: z.boolean().optional().describe('Prioritize recipes using expiring ingredients (default: true)'),
      name: z.string().optional().describe('Custom plan name'),
    },
    async (args) => toolHandler(() => {
      const plan = service.generate({
        household_id: DEFAULT_HOUSEHOLD,
        start_date: args.start_date,
        end_date: args.end_date,
        meal_types: args.meal_types,
        servings: args.servings,
        max_cooking_minutes_per_meal: args.max_cooking_minutes_per_meal,
        use_expiring_first: args.use_expiring_first ?? true,
        name: args.name,
      });
      const entries = service.getEntries(plan.meal_plan_id);
      return success('MEAL_PLAN_GENERATED', { plan, entries, count: entries.length });
    }),
  );
}
