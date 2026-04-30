import { createDealController } from './deal.controller.js';
import { createDealService } from './deal.service.js';
import { env } from '../../config/env.js';

export default async function dealRoutes(fastify) {
  const dealService = createDealService({
    hubspotAccessToken: env.hubspotAccessToken,
    logger: fastify.log,
    storage: fastify.r2Storage,
  });
  const dealController = createDealController({ dealService });

  fastify.post(
    '/send-quote',
    {
      schema: {
        body: {
          type: 'object',
          required: ['dealId'],
          properties: {
            dealId: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    dealController.sendQuote,
  );
}
