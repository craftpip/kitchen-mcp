import { z } from 'zod';
import type { ServerContext } from '../create-server.js';
import { RestrictionService } from '../../domain/matching/restriction-service.js';
import { success } from '../../shared/response.js';
import { toolHandler } from './handler.js';

const RestrictionTypeSchema = z.enum(['allergy', 'intolerance', 'medical', 'religious', 'ethical', 'temporary', 'dislike']);
const SeveritySchema = z.enum(['mild', 'moderate', 'severe', 'life_threatening']);

export function registerRestrictionTools(ctx: ServerContext): void {
  const { mcpServer, db } = ctx;
  const service = new RestrictionService(db);

  mcpServer.tool(
    'kitchen_restriction_list',
    'List dietary restrictions for a person',
    {
      person_id: z.string().describe('Person ID (default: person_default)').default('person_default'),
      include_inactive: z.boolean().optional().describe('Include inactive restrictions'),
    },
    async (args) => toolHandler(() => {
      const restrictions = service.list(args.person_id, !args.include_inactive);
      return success('RESTRICTIONS_LISTED', { restrictions, count: restrictions.length });
    }),
  );

  mcpServer.tool(
    'kitchen_restriction_add',
    'Add a dietary restriction for a person',
    {
      person_id: z.string().describe('Person ID').default('person_default'),
      restriction_type: RestrictionTypeSchema.describe('Type of restriction'),
      ingredient_id: z.string().optional().describe('Specific ingredient ID (if restricting a specific ingredient)'),
      ingredient_category: z.string().optional().describe('Ingredient category to restrict (e.g. meat, dairy)'),
      severity: SeveritySchema.optional().describe('Severity level (default: moderate)'),
      cross_contamination_sensitive: z.boolean().optional().describe('Cross-contamination sensitivity'),
      source: z.string().optional().describe('Source of restriction info'),
      notes: z.string().optional().describe('Notes'),
    },
    async (args) => toolHandler(() => {
      const restriction = service.add(args);
      return success('RESTRICTION_ADDED', { restriction });
    }),
  );

  mcpServer.tool(
    'kitchen_restriction_deactivate',
    'Deactivate a dietary restriction',
    {
      restriction_id: z.string().describe('Restriction ID to deactivate'),
    },
    async (args) => toolHandler(() => {
      const restriction = service.deactivate(args.restriction_id);
      return success('RESTRICTION_DEACTIVATED', { restriction });
    }),
  );
}
