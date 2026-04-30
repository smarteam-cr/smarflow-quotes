import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { serverError } from '../utils/errors.js';

export default fp(async function r2Plugin(fastify) {
  const r2Config = getR2Config();

  if (!r2Config) {
    fastify.log.warn(
      'Cloudflare R2 configuration is incomplete. PDF uploads are disabled.',
    );
    fastify.decorate('r2Storage', {
      uploadPdf: async () => {
        throw serverError(
          'Cloudflare R2 configuration is incomplete. Check R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.',
        );
      },
    });
    return;
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: r2Config.endpoint,
    credentials: {
      accessKeyId: r2Config.accessKeyId,
      secretAccessKey: r2Config.secretAccessKey,
    },
  });

  fastify.decorate('r2Storage', {
    uploadPdf: async ({ key, body }) => {
      await client.send(
        new PutObjectCommand({
          Bucket: r2Config.bucketName,
          Key: key,
          Body: body,
          ContentType: 'application/pdf',
        }),
      );

      return {
        key,
        url: `${r2Config.publicUrl}/${key}`,
      };
    },
  });
});

function getR2Config() {
  const endpoint =
    env.r2.endpoint ||
    (env.r2.accountId
      ? `https://${env.r2.accountId}.r2.cloudflarestorage.com`
      : null);

  if (
    !env.r2.publicUrl ||
    !endpoint ||
    !env.r2.bucketName ||
    !env.r2.accessKeyId ||
    !env.r2.secretAccessKey
  ) {
    return null;
  }

  return {
    publicUrl: env.r2.publicUrl.replace(/\/$/, ''),
    endpoint,
    bucketName: env.r2.bucketName,
    accessKeyId: env.r2.accessKeyId,
    secretAccessKey: env.r2.secretAccessKey,
  };
}
