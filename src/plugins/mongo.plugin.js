import fp from 'fastify-plugin';
import { MongoClient } from 'mongodb';
import { env } from '../config/env.js';

export default fp(async function mongoPlugin(fastify) {
  if (!env.mongoUrl) {
    fastify.log.warn('MONGO_URL is not set. Mongo logging is disabled.');
    return;
  }

  const client = new MongoClient(env.mongoUrl);
  await client.connect();

  fastify.decorate('mongo', client.db(env.mongoDbName));

  fastify.addHook('onClose', async () => {
    await client.close();
  });
});
