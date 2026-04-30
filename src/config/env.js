import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env');

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const packageJson = require('../../package.json');

export const env = {
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
  hubspotAccessToken:
    process.env.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_PRIVATE_APP_TOKEN,
  mongoUrl: process.env.MONGO_URL,
  mongoDbName: process.env.MONGO_DB_NAME ?? 'smartcoti',
  r2: {
    publicUrl:
      process.env.URL_PUBLIC_dEV ||
      process.env.URL_PUBLIC_DEV ||
      process.env.R2_PUBLIC_URL,
    accountId: process.env.ACCOUNT_ID || process.env.R2_ACCOUNT_ID,
    endpoint: process.env.S3_API || process.env.R2_S3_API,
    bucketName: process.env.BUCKET_NAME || process.env.R2_BUCKET_NAME,
    accessKeyId:
      process.env.R2_ACCESS_KEY_ID ||
      process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey:
      process.env.R2_SECRET_ACCESS_KEY ||
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
  version: packageJson.version,
};
