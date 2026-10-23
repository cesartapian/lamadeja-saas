import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
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
