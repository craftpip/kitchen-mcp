import { z } from 'zod';
import type { ServerContext } from '../create-server.js';
import { SessionService } from '../../domain/sessions/service.js';
import { success } from '../../shared/response.js';
import { toolHandler } from './handler.js';

const ProblemTypeSchema = z.enum([
  'ingredient_missing', 'too_wet', 'too_dry', 'burning', 'undercooked', 'overcooked',
  'too_salty', 'too_spicy', 'wrong_texture', 'equipment_failure', 'spillage', 'safety_concern', 'other',
]);

export function registerSessionTools(ctx: ServerContext): void {
  const { mcpServer, db } = ctx;
  const service = new SessionService(db);

  mcpServer.tool(
    'kitchen_session_plan',
    'Build an executable cooking plan without changing inventory (dry run)',
    {
      recipe_id: z.string().describe('Recipe ID'),
      servings: z.number().optional().describe('Number of servings (default: recipe default)'),
      household_id: z.string().optional().describe('Household ID (default: hh_default)'),
    },
    async (args) => toolHandler(() => {
      const plan = service.plan({
        recipe_id: args.recipe_id,
        servings: args.servings,
        household_id: args.household_id,
      });
      return success('SESSION_PLAN_BUILT', plan);
    }),
  );

  mcpServer.tool(
    'kitchen_session_start',
    'Start a cooking session — reserves ingredients, creates immutable session steps, returns first ready steps',
    {
      recipe_id: z.string().describe('Recipe ID'),
      servings: z.number().optional().describe('Number of servings (default: recipe default)'),
      name: z.string().optional().describe('Session name'),
      notes: z.string().optional().describe('Notes'),
      household_id: z.string().optional().describe('Household ID (default: hh_default)'),
    },
    async (args) => toolHandler(() => {
      const session = service.start(args);
      const steps = service.getSteps(session.session_id);
      const next = service.getNextActions(session.session_id);
      return success('SESSION_STARTED', { session, steps, next_actions: next });
    }),
  );

  mcpServer.tool(
    'kitchen_session_get',
    'Get complete cooking session state including steps, events, reservations, and usage',
    {
      session_id: z.string().describe('Session ID'),
    },
    async (args) => toolHandler(() => {
      const session = service.get(args.session_id);
      if (!session) {
        throw new Error('Session not found');
      }
      const steps = service.getSteps(args.session_id);
      const events = service.getEvents(args.session_id);
      const reservations = service.getReservations(args.session_id);
      const usage = service.getUsage(args.session_id);
      const next_actions = service.getNextActions(args.session_id);
      return success('SESSION_RETRIEVED', { session, steps, events, reservations, usage, next_actions });
    }),
  );

  mcpServer.tool(
    'kitchen_session_get_next_actions',
    'Get steps whose dependencies are satisfied and are ready to start',
    {
      session_id: z.string().describe('Session ID'),
    },
    async (args) => toolHandler(() => {
      const next = service.getNextActions(args.session_id);
      return success('NEXT_ACTIONS', { next_actions: next, count: next.length });
    }),
  );

  mcpServer.tool(
    'kitchen_session_start_step',
    'Mark a session step as active (in progress)',
    {
      session_id: z.string().describe('Session ID'),
      session_step_id: z.string().describe('Session step ID'),
    },
    async (args) => toolHandler(() => {
      const step = service.startStep(args.session_id, args.session_step_id);
      return success('STEP_STARTED', { step });
    }),
  );

  mcpServer.tool(
    'kitchen_session_complete_step',
    'Complete a step — records ingredient usage, creates inventory transactions, unlocks dependent steps',
    {
      session_id: z.string().describe('Session ID'),
      session_step_id: z.string().describe('Session step ID'),
      ingredient_usage: z.array(z.object({
        ingredient_id: z.string(),
        inventory_lot_id: z.string(),
        quantity_used: z.number(),
        unit: z.string(),
      })).optional().describe('Ingredients consumed in this step'),
      notes: z.string().optional().describe('Notes about this step'),
    },
    async (args) => toolHandler(() => {
      const step = service.completeStep(args);
      const next = service.getNextActions(args.session_id);
      return success('STEP_COMPLETED', { step, next_actions: next });
    }),
  );

  mcpServer.tool(
    'kitchen_session_skip_step',
    'Skip a step (must be optional/pending)',
    {
      session_id: z.string().describe('Session ID'),
      session_step_id: z.string().describe('Session step ID'),
      notes: z.string().optional().describe('Reason for skipping'),
    },
    async (args) => toolHandler(() => {
      const step = service.skipStep(args.session_id, args.session_step_id, args.notes);
      const next = service.getNextActions(args.session_id);
      return success('STEP_SKIPPED', { step, next_actions: next });
    }),
  );

  mcpServer.tool(
    'kitchen_session_pause',
    'Pause an active cooking session',
    {
      session_id: z.string().describe('Session ID'),
    },
    async (args) => toolHandler(() => {
      const session = service.pause(args.session_id);
      return success('SESSION_PAUSED', { session });
    }),
  );

  mcpServer.tool(
    'kitchen_session_resume',
    'Resume a paused cooking session',
    {
      session_id: z.string().describe('Session ID'),
    },
    async (args) => toolHandler(() => {
      const session = service.resume(args.session_id);
      const next = service.getNextActions(args.session_id);
      return success('SESSION_RESUMED', { session, next_actions: next });
    }),
  );

  mcpServer.tool(
    'kitchen_session_report_problem',
    'Report a cooking problem — returns applicable recovery rules',
    {
      session_id: z.string().describe('Session ID'),
      session_step_id: z.string().optional().describe('Step where problem occurred'),
      problem_type: ProblemTypeSchema.describe('Problem type'),
      description: z.string().optional().describe('Description of the problem'),
    },
    async (args) => toolHandler(() => {
      const result = service.reportProblem({
        session_id: args.session_id,
        session_step_id: args.session_step_id,
        problem_type: args.problem_type,
        description: args.description,
      });
      return success('PROBLEM_REPORTED', result);
    }),
  );

  mcpServer.tool(
    'kitchen_session_apply_recovery',
    'Record which recovery action was selected',
    {
      session_id: z.string().describe('Session ID'),
      session_step_id: z.string().optional().describe('Step ID'),
      action: z.string().describe('Recovery action taken'),
    },
    async (args) => toolHandler(() => {
      service.applyRecovery(args.session_id, args.session_step_id, args.action);
      return success('RECOVERY_APPLIED', { session_id: args.session_id, action: args.action });
    }),
  );

  mcpServer.tool(
    'kitchen_session_substitute_ingredient',
    'Validate and apply an ingredient substitution during cooking',
    {
      session_id: z.string().describe('Session ID'),
      original_ingredient_id: z.string().describe('Original ingredient ID'),
      substitute_ingredient_id: z.string().describe('Substitute ingredient ID'),
      inventory_lot_id: z.string().describe('Inventory lot ID for the substitute'),
      quantity_used: z.number().describe('Quantity used'),
      unit: z.string().describe('Unit'),
      session_step_id: z.string().optional().describe('Step where substitution occurred'),
    },
    async (args) => toolHandler(() => {
      service.substituteIngredient(args);
      return success('INGREDIENT_SUBSTITUTED', {
        original_ingredient_id: args.original_ingredient_id,
        substitute_ingredient_id: args.substitute_ingredient_id,
        quantity_used: args.quantity_used,
      });
    }),
  );

  mcpServer.tool(
    'kitchen_session_adjust_servings',
    'Adjust session servings (only before incompatible steps have started)',
    {
      session_id: z.string().describe('Session ID'),
      new_servings: z.number().describe('New serving count'),
    },
    async (args) => toolHandler(() => {
      const session = service.get(args.session_id);
      if (!session) {
        throw new Error('Session not found');
      }

      const steps = service.getSteps(args.session_id);
      const activeSteps = steps.filter((s) => s.status === 'active' || s.status === 'completed');
      if (activeSteps.length > 0) {
        throw new Error('Cannot adjust servings after steps have started');
      }

      const now = new Date().toISOString();
      service['db']
        .prepare('UPDATE cooking_sessions SET servings = ?, session_version = session_version + 1, updated_at = ? WHERE session_id = ?')
        .run(args.new_servings, now, args.session_id);

      return success('SERVINGS_ADJUSTED', { session_id: args.session_id, new_servings: args.new_servings });
    }),
  );

  mcpServer.tool(
    'kitchen_session_complete',
    'Complete the session — finalize inventory deductions, release reservations, close timers',
    {
      session_id: z.string().describe('Session ID'),
    },
    async (args) => toolHandler(() => {
      const session = service.complete(args.session_id);
      return success('SESSION_COMPLETED', { session });
    }),
  );

  mcpServer.tool(
    'kitchen_session_abandon',
    'Abandon an active session — releases all reservations and cancels timers',
    {
      session_id: z.string().describe('Session ID'),
      notes: z.string().optional().describe('Reason for abandoning'),
    },
    async (args) => toolHandler(() => {
      const session = service.abandon(args.session_id, args.notes);
      return success('SESSION_ABANDONED', { session });
    }),
  );

  mcpServer.tool(
    'kitchen_session_list',
    'List cooking sessions for a household',
    {
      status: z.string().optional().describe('Filter by status'),
      limit: z.number().optional().describe('Max results (default: 20)'),
      household_id: z.string().optional().describe('Household ID (default: hh_default)'),
    },
    async (args) => toolHandler(() => {
      const householdId = args.household_id ?? 'hh_default';
      const sessions = service.list(householdId, { status: args.status, limit: args.limit });
      return success('SESSIONS_LISTED', { sessions, count: sessions.length });
    }),
  );
}
