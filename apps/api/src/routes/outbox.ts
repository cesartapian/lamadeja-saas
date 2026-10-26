import { Router, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

const submission = z.object({ body: z.string().trim().min(1).max(4096), idempotencyKey: z.string().uuid() }).strict();
const columns = 'id,conversation_id,body,status,attempt_count,max_attempts,created_at,updated_at,completed_at,origin';
export function outboxRouter(database: Pool, auth: RequestHandler, options: { enabled: boolean; maxAttempts: number; nadiaEnabled?: boolean }) {
  const router = Router();
  router.use(['/outbox/capabilities', '/conversations/:id/outbox'], auth);
  router.get('/outbox/capabilities', (_req, res) => res.json({ mode: options.enabled ? 'simulated' : 'disabled', nadia: options.nadiaEnabled ?? false }));
  router.get('/conversations/:id/outbox', async (req, res, next) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const offset = z.coerce.number().int().min(0).max(100000).safeParse(req.query.offset ?? 0);
    if (!id.success || !offset.success) { res.status(400).json({ error: 'Invalid request' }); return; }
    const { organizationId, storeId } = res.locals.auth;
    try {
      const conversation = await database.query('select id from conversations where id=$1 and organization_id=$2 and store_id=$3', [id.data, organizationId, storeId]);
      if (!conversation.rowCount) { res.sendStatus(404); return; }
      const result = await database.query(`select ${columns} from message_outbox where conversation_id=$1 and organization_id=$2 and store_id=$3 order by created_at desc,id desc limit 26 offset $4`, [id.data, organizationId, storeId, offset.data]);
      res.json({ items: result.rows.slice(0, 25), hasMore: result.rows.length > 25, nextOffset: offset.data + 25 });
    } catch (error) { next(error); }
  });
  router.post('/conversations/:id/outbox', async (req, res, next) => {
    if (!options.enabled) { res.status(503).json({ error: 'Outbox simulation is disabled' }); return; }
    const id = z.string().uuid().safeParse(req.params.id);
    const input = submission.safeParse(req.body);
    if (!id.success || !input.success) { res.status(400).json({ error: 'Invalid message' }); return; }
    const { organizationId, storeId, userId } = res.locals.auth;
    const client = await database.connect().catch(error => { next(error); return null; });
    if (!client) return;
    try {
      await client.query('begin');
      const conversation = await client.query('select id from conversations where id=$1 and organization_id=$2 and store_id=$3', [id.data, organizationId, storeId]);
      if (!conversation.rowCount) { await client.query('rollback'); res.sendStatus(404); return; }
      const inserted = await client.query(`insert into message_outbox(organization_id,store_id,conversation_id,requested_by,idempotency_key,body,max_attempts)
        values($1,$2,$3,$4,$5,$6,$7) on conflict(organization_id,store_id,idempotency_key) do nothing returning ${columns}`,
      [organizationId, storeId, id.data, userId, input.data.idempotencyKey, input.data.body, options.maxAttempts]);
      const row = inserted.rows[0] ?? (await client.query(`select ${columns} from message_outbox where organization_id=$1 and store_id=$2 and idempotency_key=$3`, [organizationId, storeId, input.data.idempotencyKey])).rows[0];
      if (!row || row.conversation_id !== id.data || row.body !== input.data.body) {
        await client.query('rollback'); res.status(409).json({ error: 'Idempotency key already used for another message' }); return;
      }
      await client.query('commit');
      res.status(inserted.rowCount ? 202 : 200).json({ item: row });
    } catch (error) { await client.query('rollback').catch(() => {}); next(error); }
    finally { client.release(); }
  });
  return router;
}
