import cors from '@fastify/cors';
import Fastify from 'fastify';
import { env } from './config/env.js';
import { AppError } from './utils/errors.js';
import dealRoutes from './modules/deals/deal.routes.js';
import loggerPlugin from './plugins/logger.plugin.js';
import mongoPlugin from './plugins/mongo.plugin.js';
import r2Plugin from './plugins/r2.plugin.js';

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
  await app.register(r2Plugin);

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
    service: 'smartquotes-api',
    version: env.version,
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    checks: {
      // Presencia de configuración (no se llama a los servicios para no gastar rate-limit).
      hubspot: Boolean(env.hubspotAccessToken),
      r2: Boolean(
        env.r2.endpoint && env.r2.bucketName && env.r2.accessKeyId,
      ),
    },
  }));
  await app.register(dealRoutes, { prefix: '/deals' });

  return app;
}
