import type { ServerContext } from '../create-server.js';
import { success } from '../../shared/response.js';

export function registerSystemTools(ctx: ServerContext): void {
  const { mcpServer, db } = ctx;

  mcpServer.tool(
    'kitchen_system_health',
    'Returns server health status including database and migration state',
    {},
    async () => {
      let dbOk = true;
      let migrationVersion = 0;

      try {
        const row = db
          .prepare('SELECT MAX(version) as v FROM schema_migrations')
          .get() as { v: number | null };
        migrationVersion = row.v ?? 0;
      } catch {
        dbOk = false;
      }

      const data = {
        server_version: '0.1.0',
        database: {
          status: dbOk ? 'healthy' : 'unhealthy',
          migration_version: migrationVersion,
        },
        timer_scheduler: {
          status: 'not_implemented',
        },
        storage: {
          status: dbOk ? 'accessible' : 'inaccessible',
        },
        enabled_integrations: [] as string[],
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(success('HEALTH_OK', data)),
          },
        ],
      };
    },
  );

  mcpServer.tool(
    'kitchen_system_capabilities',
    'Returns list of enabled domain capabilities',
    {},
    async () => {
      const capabilities = [
        'system',
      ];

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(success('CAPABILITIES_OK', { capabilities })),
          },
        ],
      };
    },
  );
}
