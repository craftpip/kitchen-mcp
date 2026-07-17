import { z } from 'zod';
import type { ServerContext } from '../create-server.js';
import { InventoryService } from '../../domain/inventory/service.js';
import { success } from '../../shared/response.js';
import { toolHandler } from './handler.js';

const InventoryStateSchema = z.enum([
  'sealed', 'opened', 'washed', 'peeled', 'cut', 'prepared', 'cooked',
  'frozen', 'thawing', 'marinating', 'spoiled', 'discarded', 'consumed', 'unknown',
]);

const QuantityPrecisionSchema = z.enum([
  'measured', 'package_declared', 'piece_estimate', 'visual_estimate', 'user_estimate', 'unknown',
]);

const DEFAULT_HOUSEHOLD = 'hh_default';

export function registerInventoryTools(ctx: ServerContext): void {
  const { mcpServer, db } = ctx;
  const service = new InventoryService(db);

  mcpServer.tool(
    'kitchen_inventory_search',
    'Search current inventory with optional filters',
    {
      ingredient_id: z.string().optional().describe('Filter by ingredient ID'),
      location_id: z.string().optional().describe('Filter by location ID'),
      category: z.string().optional().describe('Filter by ingredient category'),
      states: z.array(z.string()).optional().describe('Filter by inventory states'),
      expiring_before: z.string().optional().describe('ISO date — return items expiring before this'),
      include_zero_quantity: z.boolean().optional().describe('Include zero-quantity lots (default: false)'),
      limit: z.number().optional().describe('Max results (default: 50)'),
    },
    async (args) => toolHandler(() => {
      const lots = service.search(DEFAULT_HOUSEHOLD, args);
      return success('INVENTORY_SEARCHED', { lots, count: lots.length });
    }),
  );

  mcpServer.tool(
    'kitchen_inventory_get',
    'Get a single inventory lot with its transaction history',
    {
      inventory_lot_id: z.string().describe('Inventory lot ID'),
    },
    async (args) => toolHandler(() => {
      const lot = service.get(args.inventory_lot_id);
      if (!lot) {
        throw new Error('Inventory lot not found');
      }
      const transactions = service.getTransactions(args.inventory_lot_id);
      return success('INVENTORY_LOT_RETRIEVED', { lot, transactions });
    }),
  );

  mcpServer.tool(
    'kitchen_inventory_add',
    'Add a new inventory lot',
    {
      ingredient_id: z.string().describe('Ingredient ID from the catalog'),
      display_label: z.string().describe('Human-readable label (e.g. "Amul Taaza 500ml")'),
      quantity_value: z.number().describe('Quantity value'),
      quantity_unit: z.string().describe('Unit of measurement'),
      brand: z.string().optional().describe('Brand name'),
      quantity_precision: QuantityPrecisionSchema.optional().describe('Precision of the quantity'),
      location_id: z.string().optional().describe('Storage location ID'),
      state: InventoryStateSchema.optional().describe('Initial state (default: sealed)'),
      purchased_at: z.string().optional().describe('Purchase date (ISO)'),
      printed_expiry_at: z.string().optional().describe('Printed expiry date (ISO)'),
      estimated_expiry_at: z.string().optional().describe('Estimated expiry date (ISO)'),
      barcode: z.string().optional().describe('Barcode'),
      notes: z.string().optional().describe('Notes'),
      idempotency_key: z.string().describe('Idempotency key for this operation'),
    },
    async (args) => toolHandler(() => {
      const lot = service.add({
        household_id: DEFAULT_HOUSEHOLD,
        ...args,
      });
      return success('INVENTORY_ITEM_CREATED', { lot });
    }),
  );

  mcpServer.tool(
    'kitchen_inventory_adjust',
    'Correct or update the quantity of an inventory lot',
    {
      inventory_lot_id: z.string().describe('Inventory lot ID'),
      quantity_value: z.number().describe('New quantity value'),
      quantity_unit: z.string().describe('Unit of measurement'),
      quantity_precision: QuantityPrecisionSchema.optional().describe('Precision of the quantity'),
      reason: z.string().describe('Reason for adjustment'),
      idempotency_key: z.string().describe('Idempotency key for this operation'),
    },
    async (args) => toolHandler(() => {
      const lot = service.adjust(args);
      return success('INVENTORY_ADJUSTED', { lot });
    }),
  );

  mcpServer.tool(
    'kitchen_inventory_consume',
    'Consume a quantity from an inventory lot',
    {
      inventory_lot_id: z.string().describe('Inventory lot ID'),
      quantity_value: z.number().describe('Quantity to consume'),
      quantity_unit: z.string().describe('Unit of measurement'),
      reason: z.string().describe('Reason for consumption'),
      session_id: z.string().optional().describe('Cooking session ID'),
      idempotency_key: z.string().describe('Idempotency key for this operation'),
    },
    async (args) => toolHandler(() => {
      const lot = service.consume(args);
      return success('INVENTORY_CONSUMED', { lot });
    }),
  );

  mcpServer.tool(
    'kitchen_inventory_move',
    'Move an inventory lot to a different location',
    {
      inventory_lot_id: z.string().describe('Inventory lot ID'),
      location_id: z.string().describe('Destination location ID'),
      idempotency_key: z.string().describe('Idempotency key for this operation'),
    },
    async (args) => toolHandler(() => {
      const lot = service.move(args);
      return success('INVENTORY_MOVED', { lot });
    }),
  );

  mcpServer.tool(
    'kitchen_inventory_expiring',
    'List items expiring soon, ordered by urgency',
    {
      before: z.string().optional().describe('Expiry cutoff date (ISO, default: 7 days from now)'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (args) => toolHandler(() => {
      const lots = service.expiring(DEFAULT_HOUSEHOLD, args);
      return success('EXPIRING_ITEMS', { lots, count: lots.length });
    }),
  );
}
