import { z } from 'zod';
import type { ServerContext } from '../create-server.js';
import { EquipmentService } from '../../domain/equipment/service.js';
import { success } from '../../shared/response.js';
import { toolHandler } from './handler.js';

const EquipmentTypeSchema = z.enum([
  'stove', 'burner', 'induction_cooktop', 'oven', 'microwave', 'air_fryer',
  'pressure_cooker', 'rice_cooker', 'kadai', 'pan', 'saucepan', 'pot',
  'knife', 'chopping_board', 'mixer', 'blender', 'weighing_scale',
  'measuring_cup', 'measuring_spoon', 'storage_container', 'thermometer',
  'strainer', 'other',
]);

const EquipmentConditionSchema = z.enum(['working', 'needs_repair', 'broken', 'missing']);

const DEFAULT_HOUSEHOLD = 'hh_default';

export function registerEquipmentTools(ctx: ServerContext): void {
  const { mcpServer, db } = ctx;
  const service = new EquipmentService(db);

  mcpServer.tool(
    'kitchen_equipment_list',
    'List kitchen equipment with optional filters',
    {
      equipment_type: z.string().optional().describe('Filter by equipment type'),
      available_only: z.boolean().optional().describe('Show only available equipment'),
      limit: z.number().optional().describe('Max results (default: 50)'),
    },
    async (args) => toolHandler(() => {
      const equipment = service.list(DEFAULT_HOUSEHOLD, args);
      return success('EQUIPMENT_LISTED', { equipment, count: equipment.length });
    }),
  );

  mcpServer.tool(
    'kitchen_equipment_get',
    'Get a single equipment item',
    {
      equipment_id: z.string().describe('Equipment ID'),
    },
    async (args) => toolHandler(() => {
      const equipment = service.get(args.equipment_id);
      if (!equipment) {
        throw new Error('Equipment not found');
      }
      return success('EQUIPMENT_RETRIEVED', { equipment });
    }),
  );

  mcpServer.tool(
    'kitchen_equipment_add',
    'Add a new equipment item to the kitchen',
    {
      name: z.string().describe('Equipment name'),
      equipment_type: EquipmentTypeSchema.describe('Type of equipment'),
      capacity_value: z.number().optional().describe('Capacity value'),
      capacity_unit: z.string().optional().describe('Capacity unit (e.g. litre, ml)'),
      manufacturer: z.string().optional().describe('Manufacturer'),
      model: z.string().optional().describe('Model'),
      condition: EquipmentConditionSchema.optional().describe('Condition (default: working)'),
      available: z.boolean().optional().describe('Available for use (default: true)'),
      location_id: z.string().optional().describe('Storage location ID'),
      capabilities: z.array(z.string()).optional().describe('Capabilities (e.g. pressure_cook, boil, steam)'),
      safety_profile_id: z.string().optional().describe('Safety profile ID'),
    },
    async (args) => toolHandler(() => {
      const equipment = service.create({
        household_id: DEFAULT_HOUSEHOLD,
        ...args,
      });
      return success('EQUIPMENT_ADDED', { equipment });
    }),
  );

  mcpServer.tool(
    'kitchen_equipment_update',
    'Update an existing equipment item',
    {
      equipment_id: z.string().describe('Equipment ID'),
      name: z.string().optional().describe('Equipment name'),
      capacity_value: z.number().optional().describe('Capacity value'),
      capacity_unit: z.string().optional().describe('Capacity unit'),
      manufacturer: z.string().optional().describe('Manufacturer'),
      model: z.string().optional().describe('Model'),
      condition: EquipmentConditionSchema.optional().describe('Condition'),
      location_id: z.string().nullable().optional().describe('Storage location ID (null to clear)'),
      capabilities: z.array(z.string()).optional().describe('Capabilities'),
      safety_profile_id: z.string().nullable().optional().describe('Safety profile ID (null to clear)'),
    },
    async (args) => toolHandler(() => {
      const { equipment_id, ...updates } = args;
      const equipment = service.update({ equipment_id, ...updates });
      return success('EQUIPMENT_UPDATED', { equipment });
    }),
  );

  mcpServer.tool(
    'kitchen_equipment_set_availability',
    'Set equipment availability status',
    {
      equipment_id: z.string().describe('Equipment ID'),
      available: z.boolean().describe('Whether equipment is available'),
    },
    async (args) => toolHandler(() => {
      const equipment = service.setAvailability(args.equipment_id, args.available);
      return success('EQUIPMENT_AVAILABILITY_UPDATED', { equipment });
    }),
  );

  mcpServer.tool(
    'kitchen_equipment_calibrate_container',
    'Calibrate a container with its actual volume and tare weight',
    {
      equipment_id: z.string().describe('Equipment ID (must be a container)'),
      capacity_ml: z.number().describe('Measured capacity in ml'),
      capacity_confidence: z.string().describe('Confidence: measured, estimated, user_estimate'),
      tare_weight_g: z.number().optional().describe('Tare weight in grams'),
    },
    async (args) => toolHandler(() => {
      const calibration = service.calibrateContainer(
        args.equipment_id,
        args.capacity_ml,
        args.capacity_confidence,
        args.tare_weight_g,
      );
      return success('CONTAINER_CALIBRATED', { calibration });
    }),
  );
}
