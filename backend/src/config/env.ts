import 'dotenv/config';
import { parseEnv } from './schema';

export const env = parseEnv(process.env);

export const corsOrigins: string[] = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
