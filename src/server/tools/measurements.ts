import { z } from 'zod';
import type { ServerContext } from '../create-server.js';
import { MeasurementService } from '../../domain/measurements/service.js';
import { success } from '../../shared/response.js';
import { toolHandler } from './handler.js';

export function registerMeasurementTools(ctx: ServerContext): void {
  const { mcpServer, db } = ctx;
  const service = new MeasurementService(db);

  mcpServer.tool(
    'kitchen_measurement_convert',
    'Convert a measurement between units (weight, volume)',
    {
      value: z.number().describe('Value to convert'),
      from_unit: z.string().describe('Source unit (e.g. g, kg, ml, l, tsp, tbsp, cup)'),
      to_unit: z.string().describe('Target unit'),
      ingredient_id: z.string().optional().describe('Ingredient ID for density-based conversion'),
    },
    async (args) => toolHandler(() => {
      const result = service.convert(args.value, args.from_unit, args.to_unit, {
        ingredient_id: args.ingredient_id,
      });
      return success('CONVERSION_COMPLETE', result);
    }),
  );

  mcpServer.tool(
    'kitchen_measurement_express_household',
    'Express a metric amount using calibrated household containers',
    {
      value_ml: z.number().describe('Amount in ml to express'),
    },
    async (args) => toolHandler(() => {
      const calibrations = db
        .prepare(
          `SELECT cc.*, e.name as equipment_name
           FROM container_calibrations cc
           JOIN equipment e ON e.equipment_id = cc.equipment_id
           WHERE e.household_id = 'hh_default'`,
        )
        .all() as { equipment_name: string; capacity_ml: number }[];

      const result = service.expressInHousehold(args.value_ml, calibrations);
      return success('HOUSEHOLD_EXPRESSION', { value_ml: args.value_ml, expressions: result });
    }),
  );

  mcpServer.tool(
    'kitchen_measurement_estimate_piece_weight',
    'Get average piece weight estimate for an ingredient from the catalog',
    {
      ingredient_id: z.string().describe('Ingredient ID'),
    },
    async (args) => toolHandler(() => {
      const estimate = service.estimatePieceWeight(args.ingredient_id);
      if (!estimate) {
        return success('PIECE_WEIGHT_UNKNOWN', {
          ingredient_id: args.ingredient_id,
          message: 'No piece weight data available for this ingredient',
        });
      }
      return success('PIECE_WEIGHT_ESTIMATE', {
        ingredient_id: args.ingredient_id,
        ...estimate,
      });
    }),
  );
}
