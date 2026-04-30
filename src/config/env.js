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
  version: packageJson.version,
};
