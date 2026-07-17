#!/usr/bin/env node

import { startStdio, startHttp } from './server/create-server.js';
import { logger } from './infrastructure/logging.js';

const port = parseInt(process.env.KITCHEN_PORT ?? '3100', 10);
const mode = process.argv.includes('--http') ? 'http' : process.env.KITCHEN_HTTP ? 'http' : 'stdio';

if (mode === 'http') {
  startHttp(port).catch((err) => {
    logger.error(err, 'failed to start http server');
    process.exit(1);
  });
} else {
  startStdio().catch((err) => {
    logger.error(err, 'failed to start stdio server');
    process.exit(1);
  });
}
