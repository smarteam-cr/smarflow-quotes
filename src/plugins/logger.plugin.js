import crypto from 'node:crypto';
import fp from 'fastify-plugin';

export default fp(async function loggerPlugin(fastify) {
  fastify.decorateRequest('requestId', null);

  fastify.addHook('onRequest', async (request) => {
    request.requestId = crypto.randomUUID();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const log = {
      requestId: request.requestId,
      url: request.url,
      method: request.method,
      body: request.body ?? {},
      response: null,
      status: reply.statusCode,
      createdAt: new Date(),
    };

    fastify.log.info(log, 'request completed');

    if (fastify.mongo) {
      await fastify.mongo.collection('logs').insertOne(log);
    }
  });

  fastify.addHook('onError', async (request, _reply, error) => {
    fastify.log.error(
      {
        requestId: request.requestId,
        url: request.url,
        method: request.method,
        error: error.message,
      },
      'request failed',
    );
  });
});
