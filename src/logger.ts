import pino from 'pino';

/**
 * Singleton structured logger for the application.
 *
 * Log level order (lowest → highest): trace | debug | info | warn | error | fatal
 *
 * Configuration:
 *   LOG_LEVEL env var overrides the default level ('info' in prod, 'silent' in tests).
 *   NODE_ENV=development activates pino-pretty for human-readable console output.
 *   NODE_ENV=test silences all output so test runs stay clean.
 */
const isTest = process.env.NODE_ENV === 'test';
const isDev  = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: isTest ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  base: { service: 'galactic-fleet-command' },
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname,service',
      },
    },
  }),
});
