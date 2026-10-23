import { Router, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

// Authenticated scope is supplied by backend middleware only.
export function conversationRouter(database: Pool, auth: RequestHandler) {
  const router = Router();
  router.use(auth);
  router.get('/conversations', async (req, res, next) => {
    const page = z.coerce.number().int().min(0).max(100000).safeParse(req.query.offset ?? 0);
    if (!page.success) { res.status(400).json({ error: 'Invalid offset' }); return; }
    const { organizationId, storeId } = res.locals.auth;
    try {
      const result = await database.query('select * from conversations where organization_id=$1 and store_id=$2 order by updated_at desc,id limit 100 offset $3', [organizationId, storeId, page.data]);
      res.json({ conversations: result.rows });
    } catch (error) { next(error); }
  });
  router.get('/conversations/:id/messages', async (req, res, next) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const page = z.coerce.number().int().min(0).max(100000).safeParse(req.query.offset ?? 0);
    if (!id.success || !page.success) { res.status(400).json({ error: 'Invalid request' }); return; }
    const { organizationId, storeId } = res.locals.auth;
    try {
      const conversation = await database.query('select id from conversations where id=$1 and organization_id=$2 and store_id=$3', [id.data, organizationId, storeId]);
      if (!conversation.rowCount) { res.sendStatus(404); return; }
      const messages = await database.query('select * from messages where conversation_id=$1 and organization_id=$2 order by created_at,id limit 100 offset $3', [id.data, organizationId, page.data]);
      res.json({ messages: messages.rows });
    } catch (error) { next(error); }
  });
  router.get('/contacts/:id', async (req, res, next) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) { res.status(400).json({ error: 'Invalid contact' }); return; }
    const { organizationId, storeId } = res.locals.auth;
    try {
      const result = await database.query('select * from contacts where id=$1 and organization_id=$2 and store_id=$3', [id.data, organizationId, storeId]);
      if (!result.rowCount) { res.sendStatus(404); return; }
      res.json({ contact: result.rows[0] });
    } catch (error) { next(error); }
  });
  return router;
}
