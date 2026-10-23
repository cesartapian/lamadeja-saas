import type { RequestHandler } from 'express';
import { createClient } from '@supabase/supabase-js';
import { allowedEmails, config } from '../lib/config.js';

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) { res.status(401).json({ error: 'Missing bearer token' }); return; }
  try {
    const { data, error } = await supabase.auth.getUser(header.slice(7));
    const email = data.user?.email?.toLowerCase();
    if (error || !data.user) { res.status(401).json({ error: 'Invalid session' }); return; }
    if (!email || !allowedEmails.has(email)) { res.status(403).json({ error: 'Not authorized for MVP' }); return; }
    res.locals.auth = { userId: data.user.id, email, organizationId: config.MVP_ORGANIZATION_ID, storeId: config.MVP_STORE_ID };
    next();
  } catch { res.status(401).json({ error: 'Authentication unavailable' }); }
};
