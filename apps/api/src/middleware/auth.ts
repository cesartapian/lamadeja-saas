import { createClient } from '@supabase/supabase-js';
import { allowedEmails, config } from '../lib/config.js';
import { pool } from '../lib/database.js';
import { authentication } from './authorization.js';
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
export const requireAuth = authentication(pool, async token => {
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user;
}, allowedEmails, config.MVP_ORGANIZATION_ID, config.MVP_STORE_ID);
