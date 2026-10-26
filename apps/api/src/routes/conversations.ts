import { Router, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

// Authenticated scope is supplied by backend middleware only.
export function conversationRouter(database: Pool, auth: RequestHandler) {
  const router = Router();
  router.use(auth);
  router.get('/conversations', async (req, res, next) => {
    const page = z.coerce.number().int().min(0).max(100000).safeParse(req.query.offset ?? 0);
    const limit = z.coerce.number().int().min(1).max(100).safeParse(req.query.limit ?? 100);
    if (!page.success || !limit.success) { res.status(400).json({ error: 'Invalid pagination' }); return; }
    const { organizationId, storeId } = res.locals.auth;
    try {
      const result = await database.query(`select c.*, ct.display_name as contact_name, ct.external_contact_id as contact_phone,
        latest.body as last_message, latest.message_type as last_message_type, latest.message_at as last_message_at
        from conversations c join contacts ct on ct.id=c.contact_id and ct.organization_id=c.organization_id and ct.store_id=c.store_id
        left join lateral (select body,message_type,coalesce(sent_at,created_at) as message_at from messages m where m.conversation_id=c.id and m.organization_id=c.organization_id order by coalesce(sent_at,created_at) desc,id desc limit 1) latest on true
        where c.organization_id=$1 and c.store_id=$2 order by c.updated_at desc,c.id limit $3 offset $4`, [organizationId, storeId, limit.data + 1, page.data]);
      res.json({ conversations: result.rows.slice(0, limit.data), hasMore: result.rows.length > limit.data, nextOffset: page.data + limit.data });
    } catch (error) { next(error); }
  });
  router.get('/conversations/:id/messages', async (req, res, next) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const page = z.coerce.number().int().min(0).max(100000).safeParse(req.query.offset ?? 0);
    const limit = z.coerce.number().int().min(1).max(100).safeParse(req.query.limit ?? 100);
    const order = z.enum(['asc', 'desc']).safeParse(req.query.order ?? 'asc');
    if (!id.success || !page.success || !limit.success || !order.success) { res.status(400).json({ error: 'Invalid request' }); return; }
    const { organizationId, storeId } = res.locals.auth;
    try {
      const conversation = await database.query('select id from conversations where id=$1 and organization_id=$2 and store_id=$3', [id.data, organizationId, storeId]);
      if (!conversation.rowCount) { res.sendStatus(404); return; }
      const direction = order.data === 'desc' ? 'desc' : 'asc';
      const messages = await database.query(`select * from messages where conversation_id=$1 and organization_id=$2 order by coalesce(sent_at,created_at) ${direction},id ${direction} limit $3 offset $4`, [id.data, organizationId, limit.data + 1, page.data]);
      res.json({ messages: messages.rows.slice(0, limit.data), hasMore: messages.rows.length > limit.data, nextOffset: page.data + limit.data });
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
