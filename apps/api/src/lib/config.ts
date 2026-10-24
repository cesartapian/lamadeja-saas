import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  OUTBOX_MODE: z.enum(['disabled', 'simulated']).default('disabled'),
  DATABASE_URL: z.string().min(1).optional(),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(5),
  WORKER_RETRY_SECONDS: z.coerce.number().int().min(1).max(3600).default(30),
  WORKER_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(15000),
  WORKER_POLL_MS: z.coerce.number().int().min(100).max(60000).default(1000),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  ALLOWED_EMAILS: z.string().min(3),
  META_APP_SECRET: z.string().min(1),
  META_VERIFY_TOKEN: z.string().min(1),
  MVP_ORGANIZATION_ID: z.string().uuid(),
  MVP_STORE_ID: z.string().uuid(),
});
export const config = schema.parse(process.env);
export const allowedEmails = new Set(config.ALLOWED_EMAILS.split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
