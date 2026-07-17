import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import type Database from 'better-sqlite3';
import { createDatabase } from '../infrastructure/database/connection.js';
import { runMigrations } from '../infrastructure/database/migrate.js';
import { registerSystemTools } from './tools/system.js';
import { registerLocationTools } from './tools/locations.js';
import { registerIngredientTools } from './tools/ingredients.js';
import { registerInventoryTools } from './tools/inventory.js';
import { registerEquipmentTools } from './tools/equipment.js';
import { registerMeasurementTools } from './tools/measurements.js';
import { registerRecipeTools } from './tools/recipes.js';
import { registerRestrictionTools } from './tools/restrictions.js';
import { registerPreferenceTools } from './tools/preferences.js';
import { registerMatchingTools } from './tools/matching.js';
import { registerSessionTools } from './tools/sessions.js';
import { registerTimerTools } from './tools/timers.js';
import { createChildLogger } from '../infrastructure/logging.js';

const log = createChildLogger('server');

export interface ServerContext {
  db: Database.Database;
  mcpServer: McpServer;
}

export function createServer(): McpServer {
  const mcpServer = new McpServer({
    name: 'kitchen-mcp',
    version: '0.1.0',
  });

  const db = createDatabase();
  runMigrations(db);

  const ctx: ServerContext = { db, mcpServer };
  registerSystemTools(ctx);
  registerLocationTools(ctx);
  registerIngredientTools(ctx);
  registerInventoryTools(ctx);
  registerEquipmentTools(ctx);
  registerMeasurementTools(ctx);
  registerRecipeTools(ctx);
  registerRestrictionTools(ctx);
  registerPreferenceTools(ctx);
  registerMatchingTools(ctx);
  registerSessionTools(ctx);
  registerTimerTools(ctx);

  return mcpServer;
}

export async function startStdio(): Promise<void> {
  log.info('starting kitchen-mcp server (stdio)');

  const mcpServer = createServer();
  const transport = new StdioServerTransport();

  process.on('SIGINT', () => {
    log.info('received SIGINT, shutting down');
    transport.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log.info('received SIGTERM, shutting down');
    transport.close();
    process.exit(0);
  });

  await mcpServer.connect(transport);
  log.info('kitchen-mcp server running on stdio');
}

export async function startHttp(port: number = 3100): Promise<void> {
  log.info({ port }, 'starting kitchen-mcp server (http)');

  const app = createMcpExpressApp({ host: '0.0.0.0' });
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          log.info({ sessionId: sid }, 'session initialized');
          transports[sid] = transport;
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          log.info({ sessionId: sid }, 'session closed');
          delete transports[sid];
        }
      };

      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: no valid session' },
      id: null,
    });
  });

  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  app.listen(port, '0.0.0.0', () => {
    log.info({ port }, `kitchen-mcp listening on http://127.0.0.1:${port}/mcp`);
  });

  process.on('SIGINT', async () => {
    for (const sid of Object.keys(transports)) {
      await transports[sid].close().catch(() => {});
      delete transports[sid];
    }
    process.exit(0);
  });
}
