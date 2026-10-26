import { Router, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { setNadiaPaused } from '../lib/nadiaStore.js';

export function nadiaRouter(database: Pool, auth: RequestHandler, available: boolean) {
  const router = Router();
  router.use('/conversations/:id/nadia', auth);
  router.get('/conversations/:id/nadia', async (req, res, next) => {
    if (!available) { res.json({ available: false }); return; }
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) { res.sendStatus(400); return; }
    const { organizationId, storeId, userId } = res.locals.auth;
    const client = await database.connect().catch(error => { next(error); return null; }); if (!client) return;
    try {
      await client.query('begin read only');
      if (!(await client.query('select 1 from conversations where organization_id=$1 and store_id=$2 and id=$3', [organizationId, storeId, id.data])).rowCount) { await client.query('rollback'); res.sendStatus(404); return; }
      const policy = (await client.query(`select coalesce((select enabled from nadia_conversations where organization_id=$1 and store_id=$2 and conversation_id=$3),true) as enabled`, [organizationId, storeId, id.data])).rows[0];
      const member = (await client.query('select role from organization_members where organization_id=$1 and user_id=$2', [organizationId, userId])).rows[0];
      const runs = await client.query('select id,state,error_category,attempt_count,created_at from nadia_runs where organization_id=$1 and store_id=$2 and conversation_id=$3 order by created_at desc,id desc limit 10', [organizationId, storeId, id.data]);
      await client.query('commit');
      res.json({ available: true, active: policy.enabled, canManage: ['owner', 'admin'].includes(member?.role), runs: runs.rows });
    } catch (error) { await client.query('rollback').catch(() => {}); next(error); }
    finally { client.release(); }
  });
  const toggle: RequestHandler = async (req, res, next) => {
    if (!available) { res.status(503).json({ error: 'Nadia is unavailable' }); return; }
    const input = z.object({ enabled: z.boolean() }).strict().safeParse(req.body);
    const id = z.string().uuid().safeParse(req.params.id);
    if (!input.success || !id.success) { res.sendStatus(400); return; }
    const conversationId = id.data;
    const { organizationId, storeId, userId } = res.locals.auth;
    const client = await database.connect().catch(error => { next(error); return null; }); if (!client) return;
    try {
      await client.query('begin');
      const member = (await client.query('select role from organization_members where organization_id=$1 and user_id=$2 for key share', [organizationId, userId])).rows[0];
      if (!['owner', 'admin'].includes(member?.role)) { await client.query('rollback'); res.sendStatus(403); return; }
      if (conversationId && !(await client.query('select 1 from conversations where organization_id=$1 and store_id=$2 and id=$3', [organizationId, storeId, conversationId])).rowCount) { await client.query('rollback'); res.sendStatus(404); return; }
      await setNadiaPaused(client, organizationId, storeId, input.data.enabled, conversationId);
      await client.query('commit'); res.json({ enabled: input.data.enabled });
    } catch (error) { await client.query('rollback').catch(() => {}); next(error); }
    finally { client.release(); }
  };
  router.post('/conversations/:id/nadia', toggle);
  return router;
}
