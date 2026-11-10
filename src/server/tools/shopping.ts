import { z } from 'zod';
import type { ServerContext } from '../create-server.js';
import { ShoppingService } from '../../domain/shopping/service.js';
import { success } from '../../shared/response.js';
import { toolHandler } from './handler.js';

const DEFAULT_HOUSEHOLD = 'hh_default';

export function registerShoppingTools(ctx: ServerContext): void {
  const { mcpServer, db } = ctx;
  const service = new ShoppingService(db);

  mcpServer.tool(
    'kitchen_shopping_list_create',
    'Create a new shopping list',
    {
      name: z.string().describe('Name for the shopping list'),
    },
    async (args) => toolHandler(() => {
      const list = service.createList({ household_id: DEFAULT_HOUSEHOLD, name: args.name });
      return success('SHOPPING_LIST_CREATED', { list });
    }),
  );

  mcpServer.tool(
    'kitchen_shopping_list_get',
    'Get a shopping list with its items',
    {
      shopping_list_id: z.string().describe('Shopping list ID'),
    },
    async (args) => toolHandler(() => {
      const list = service.getList(args.shopping_list_id);
      if (!list) {
        throw new Error('Shopping list not found');
      }
      const items = service.getItems(args.shopping_list_id);
      return success('SHOPPING_LIST_RETRIEVED', { list, items, count: items.length });
    }),
  );

  mcpServer.tool(
    'kitchen_shopping_list_list',
    'List all shopping lists for the household',
    {
      status: z.string().optional().describe('Filter by status (active, completed, archived)'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (args) => toolHandler(() => {
      const lists = service.listLists(DEFAULT_HOUSEHOLD, args);
      return success('SHOPPING_LISTS_LISTED', { lists, count: lists.length });
    }),
  );

  mcpServer.tool(
    'kitchen_shopping_item_add',
    'Add an item to a shopping list',
    {
      shopping_list_id: z.string().describe('Shopping list ID'),
      ingredient_id: z.string().describe('Ingredient ID from the catalog'),
      requested_quantity: z.number().describe('Quantity to buy'),
      requested_unit: z.string().describe('Unit of measurement'),
      priority: z.enum(['required', 'preferred', 'optional']).optional().describe('Item priority (default: required)'),
      reason: z.string().optional().describe('Reason for adding (e.g. planned_recipes, restock_threshold, manual)'),
      source_recipe_id: z.string().optional().describe('Recipe ID that requires this item'),
      preferred_brand: z.string().optional().describe('Preferred brand'),
      notes: z.string().optional().describe('Additional notes'),
    },
    async (args) => toolHandler(() => {
      const item = service.addItem(args);
      return success('SHOPPING_ITEM_ADDED', { item });
    }),
  );

  mcpServer.tool(
    'kitchen_shopping_item_update',
    'Update a shopping item status or details',
    {
      shopping_item_id: z.string().describe('Shopping item ID'),
      status: z.enum(['needed', 'approved', 'ordered', 'purchased', 'stored', 'cancelled', 'unavailable']).optional().describe('New status'),
      requested_quantity: z.number().optional().describe('Updated requested quantity'),
      requested_unit: z.string().optional().describe('Updated unit'),
      priority: z.enum(['required', 'preferred', 'optional']).optional().describe('Updated priority'),
      notes: z.string().optional().describe('Updated notes'),
    },
    async (args) => toolHandler(() => {
      const item = service.updateItem(args);
      return success('SHOPPING_ITEM_UPDATED', { item });
    }),
  );

  mcpServer.tool(
    'kitchen_shopping_item_remove',
    'Remove an item from a shopping list',
    {
      shopping_item_id: z.string().describe('Shopping item ID'),
    },
    async (args) => toolHandler(() => {
      service.removeItem(args.shopping_item_id);
      return success('SHOPPING_ITEM_REMOVED', { shopping_item_id: args.shopping_item_id });
    }),
  );

  mcpServer.tool(
    'kitchen_shopping_mark_purchased',
    'Mark a shopping item as purchased',
    {
      shopping_item_id: z.string().describe('Shopping item ID'),
      purchased_quantity: z.number().optional().describe('Actual purchased quantity'),
      purchased_unit: z.string().optional().describe('Actual purchased unit'),
    },
    async (args) => toolHandler(() => {
      const item = service.markPurchased(args.shopping_item_id, args.purchased_quantity, args.purchased_unit);
      return success('SHOPPING_ITEM_PURCHASED', { item });
    }),
  );

  mcpServer.tool(
    'kitchen_shopping_store_purchased_item',
    'Store a purchased shopping item into inventory',
    {
      shopping_item_id: z.string().describe('Shopping item ID (must be purchased)'),
      inventory_lot_id: z.string().optional().describe('Existing inventory lot ID to update (creates new lot if omitted)'),
    },
    async (args) => toolHandler(() => {
      const result = service.storePurchasedItem(args.shopping_item_id, args.inventory_lot_id);
      return success('SHOPPING_ITEM_STORED', { item: result.item, lot_id: result.lot_id });
    }),
  );

  mcpServer.tool(
    'kitchen_shopping_list_complete',
    'Mark a shopping list as completed',
    {
      shopping_list_id: z.string().describe('Shopping list ID'),
    },
    async (args) => toolHandler(() => {
      const list = service.completeList(args.shopping_list_id);
      return success('SHOPPING_LIST_COMPLETED', { list });
    }),
  );

  mcpServer.tool(
    'kitchen_shopping_generate_for_recipes',
    'Generate a shopping list from recipe requirements, subtracting current inventory',
    {
      recipe_ids: z.array(z.string()).describe('Recipe IDs to generate shopping for'),
      servings: z.record(z.number()).optional().describe('Per-recipe serving overrides, e.g. {"recipe_xxx": 4}'),
      name: z.string().optional().describe('Custom list name'),
    },
    async (args) => toolHandler(() => {
      const servings = args.servings ?? {};
      const list = service.generateForRecipes({
        household_id: DEFAULT_HOUSEHOLD,
        recipe_ids: args.recipe_ids,
        servings,
        name: args.name,
      });
      const items = service.getItems(list.shopping_list_id);
      return success('SHOPPING_LIST_GENERATED', { list, items, count: items.length });
    }),
  );

  mcpServer.tool(
    'kitchen_shopping_generate_restock',
    'Generate a restock shopping list based on minimum stock thresholds',
    {
      thresholds: z.array(z.object({
        ingredient_id: z.string().describe('Ingredient ID'),
        min_quantity: z.number().describe('Minimum quantity to maintain'),
        unit: z.string().describe('Unit for the minimum quantity'),
      })).describe('Minimum stock thresholds per ingredient'),
      name: z.string().optional().describe('Custom list name'),
    },
    async (args) => toolHandler(() => {
      const list = service.generateRestock(DEFAULT_HOUSEHOLD, args.thresholds, args.name);
      const items = service.getItems(list.shopping_list_id);
      return success('SHOPPING_RESTOCK_GENERATED', { list, items, count: items.length });
    }),
  );
}
