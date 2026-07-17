import { z } from 'zod';
import type { ServerContext } from '../create-server.js';
import { LocationService } from '../../domain/locations/service.js';
import { success } from '../../shared/response.js';
import { toolHandler } from './handler.js';

const LocationTypeSchema = z.enum([
  'room', 'shelf', 'drawer', 'cabinet', 'door', 'counter', 'bin', 'container', 'other',
]);

const StorageEnvironmentSchema = z.enum([
  'ambient', 'cool_dry', 'refrigerated', 'frozen', 'heated', 'temporary', 'unknown',
]);

const DEFAULT_HOUSEHOLD = 'hh_default';

export function registerLocationTools(ctx: ServerContext): void {
  const { mcpServer, db } = ctx;
  const service = new LocationService(db);

  mcpServer.tool(
    'kitchen_location_list',
    'List kitchen locations, optionally filtered by parent',
    {
      parent_location_id: z.string().optional().describe('Filter by parent location ID'),
      include_inactive: z.boolean().optional().describe('Include inactive locations (default: false)'),
    },
    async (args) => toolHandler(() => {
      const locations = service.list(DEFAULT_HOUSEHOLD, args.parent_location_id);
      return success('LOCATIONS_LISTED', { locations, count: locations.length });
    }),
  );

  mcpServer.tool(
    'kitchen_location_get',
    'Get a single location with its children',
    {
      location_id: z.string().describe('Location ID'),
    },
    async (args) => toolHandler(() => {
      const location = service.get(args.location_id);
      if (!location) {
        throw new Error('Location not found');
      }
      return success('LOCATION_RETRIEVED', { location });
    }),
  );

  mcpServer.tool(
    'kitchen_location_create',
    'Create a new kitchen location',
    {
      name: z.string().describe('Location name'),
      parent_location_id: z.string().optional().describe('Parent location ID for nesting'),
      location_type: LocationTypeSchema.describe('Type of location'),
      storage_environment: StorageEnvironmentSchema.describe('Storage environment'),
      temperature_min_c: z.number().optional().describe('Minimum temperature in Celsius'),
      temperature_max_c: z.number().optional().describe('Maximum temperature in Celsius'),
      position_order: z.number().optional().describe('Sort order (default: 0)'),
    },
    async (args) => toolHandler(() => {
      const location = service.create({
        household_id: DEFAULT_HOUSEHOLD,
        parent_location_id: args.parent_location_id,
        name: args.name,
        location_type: args.location_type,
        storage_environment: args.storage_environment,
        temperature_min_c: args.temperature_min_c,
        temperature_max_c: args.temperature_max_c,
        position_order: args.position_order,
      });
      return success('LOCATION_CREATED', { location });
    }),
  );
}
