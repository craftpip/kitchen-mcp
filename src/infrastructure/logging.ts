import pino from 'pino';

const level = process.env.KITCHEN_LOG_LEVEL ?? 'info';

export const logger = pino({
  level,
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

export function createChildLogger(name: string): pino.Logger {
  return logger.child({ component: name });
}
