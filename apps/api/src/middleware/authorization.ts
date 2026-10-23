import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
export interface Identity { id: string; email?: string }
export function authentication(database: Pool, getUser: (token: string) => Promise<Identity | null>, emails: Set<string>, organizationId: string, storeId: string): RequestHandler {
  return async (req, res, next) => {
    const header = req.get('authorization');
    if (!header?.startsWith('Bearer ') || !header.slice(7).trim()) { res.sendStatus(401); return; }
    let user: Identity | null;
    try { user = await getUser(header.slice(7)); }
    catch { res.status(503).json({ error: 'Authentication unavailable' }); return; }
    if (!user) { res.sendStatus(401); return; }
    const email = user.email?.toLowerCase();
    if (!email || !emails.has(email)) { res.sendStatus(403); return; }
    try {
      const membership = await database.query('select 1 from organization_members where organization_id=$1 and user_id=$2', [organizationId, user.id]);
      if (!membership.rowCount) { res.sendStatus(403); return; }
      res.locals.auth = { userId: user.id, email, organizationId, storeId };
      next();
    } catch { res.status(503).json({ error: 'Authorization unavailable' }); }
  };
}
