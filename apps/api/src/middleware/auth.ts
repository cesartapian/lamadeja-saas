import { createClient } from '@supabase/supabase-js';
import { allowedEmails, config } from '../lib/config.js';
import { pool } from '../lib/database.js';
import { authentication } from './authorization.js';
import { supabaseIdentity } from '../lib/supabaseIdentity.js';
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
export const requireAuth = authentication(pool, supabaseIdentity(supabase), allowedEmails, config.MVP_ORGANIZATION_ID, config.MVP_STORE_ID);
