import cors from '@fastify/cors';
import Fastify from 'fastify';
import { env } from './config/env.js';
import { AppError } from './utils/errors.js';
import dealRoutes from './modules/deals/deal.routes.js';
import loggerPlugin from './plugins/logger.plugin.js';
import mongoPlugin from './plugins/mongo.plugin.js';

export async function buildApp() {
  const app = Fastify({
    logger:
      process.env.NODE_ENV === 'production'
        ? true
        : {
            transport: {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            },
          },
  });

  await app.register(cors, { origin: true });
  await app.register(loggerPlugin);
  await app.register(mongoPlugin);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }

    if (error.validation) {
      return reply.status(400).send({ message: error.message });
    }

    app.log.error(error);
    return reply.status(500).send({ message: 'Internal server error' });
  });

  app.get('/health', async () => ({
    status: 'ok',
    version: env.version,
  }));
  await app.register(dealRoutes, { prefix: '/deals' });

  return app;
}
