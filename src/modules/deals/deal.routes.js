import { createDealController } from './deal.controller.js';
import { DealService } from './deal.service.js';
import { env } from '../../config/env.js';

export default async function dealRoutes(fastify) {
  const dealService = new DealService({
    hubspotAccessToken: env.hubspotAccessToken,
    logger: fastify.log,
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
