import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import { processNextNadia } from '../src/lib/processNadia.js';
import { setNadiaPaused } from '../src/lib/nadiaStore.js';

test('008: additive migration, tenant constraints, attribution and Nadia compatibility', { skip: !process.env.TEST_DATABASE_URL, timeout: 60000 }, async t => {
  const schema = `e1_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const db = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
  const org = randomUUID(), foreignOrg = randomUUID(), store = randomUUID(), sibling = randomUUID(), foreignStore = randomUUID(), user = randomUUID();
  const migrationDir = new URL('../../../packages/database/migrations/', import.meta.url);
  const migration = await readFile(new URL('008_agent_qualification.sql', migrationDir), 'utf8');
  async function conversation(o: string, s: string) {
    const contact = randomUUID(), channel = randomUUID(), id = randomUUID();
    await db.query("insert into contacts(id,organization_id,store_id) values($1,$2,$3)", [contact,o,s]);
    await db.query("insert into channel_connections(id,organization_id,store_id,provider,external_account_id) values($1::uuid,$2,$3,'whatsapp',$1::text)", [channel,o,s]);
    await db.query('insert into conversations(id,organization_id,store_id,contact_id,channel_connection_id) values($1,$2,$3,$4,$5)', [id,o,s,contact,channel]);
    return id;
  }
  async function rejected(sql: string, values: unknown[], code: string) {
    await assert.rejects(db.query(sql,values), (e: {code?: string}) => e.code===code);
  }
  try {
    await admin.query(`create schema ${schema}`);
    for(const file of (await readdir(migrationDir)).filter(f=>/^00[1-7]_/.test(f)).sort()) await db.query(await readFile(new URL(file,migrationDir),'utf8'));
    await db.query("insert into organizations(id,name) values($1,'Owned'),($2,'Other')",[org,foreignOrg]);
    await db.query("insert into stores(id,organization_id,name) values($1,$2,'One'),($3,$2,'Sibling'),($4,$5,'Foreign')",[store,org,sibling,foreignStore,foreignOrg]);
    await db.query("insert into organization_members values($1,$2,'admin')",[org,user]);
    const conv=await conversation(org,store), otherConv=await conversation(org,sibling), foreignConv=await conversation(foreignOrg,foreignStore);
    const inbound=randomUUID(), oldOut=randomUUID();
    await db.query("insert into messages(id,organization_id,conversation_id,direction,body) values($1,$2,$3,'in','Hello'),($4,$2,$3,'out','Historical unknown')",[inbound,org,conv,oldOut]);
    await db.query('insert into nadia_settings(organization_id,store_id) values($1,$2)',[org,store]);
    await db.query('insert into nadia_conversations(organization_id,store_id,conversation_id) values($1,$2,$3)',[org,store,conv]);
    await db.query('insert into nadia_runs(organization_id,store_id,conversation_id,source_message_id) values($1,$2,$3,$4)',[org,store,conv,inbound]);
    const before=(await db.query('select id,body,direction,created_at from messages order by id')).rows;
    // DDL can be rolled back without touching baseline data or Nadia jobs.
    const withoutTransaction=migration.replace(/^begin;$/m,'').replace(/^commit;$/m,'');
    await db.query('begin'); await db.query(withoutTransaction); await db.query('rollback');
    assert.equal((await db.query("select to_regclass('agent_definitions') as t")).rows[0].t,null);
    await db.query(migration);
    const agent=(await db.query("select id from agent_definitions where organization_id=$1 and store_id=$2 and key='nadia'",[org,store])).rows[0].id;
    const otherAgent=(await db.query('select id from agent_definitions where store_id=$1',[sibling])).rows[0].id;
    await t.test('backfill preserves messages, no active assignments or runtime activation',async()=>{
      assert.deepEqual((await db.query('select id,body,direction,created_at from messages order by id')).rows,before);
      assert.deepEqual((await db.query('select author_type from messages order by direction')).rows.map(r=>r.author_type),['customer','legacy_unknown']);
      assert.equal((await db.query('select count(*)::int n from conversation_assignments')).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from agent_definitions where enabled')).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from agent_definitions')).rows[0].n,3);
      await assert.rejects(db.query(migration)); await db.query('rollback');
      assert.deepEqual((await db.query('select id,body,direction,created_at from messages order by id')).rows,before);
    });
    const assignSQL='insert into conversation_assignments(organization_id,store_id,conversation_id,agent_id,idempotency_key,reason) values($1,$2,$3,$4,$5,$6)';
    await t.test('compound FKs reject foreign tenant and sibling store; unique live assignment',async()=>{
      for(const [c,a] of [[conv,otherAgent],[otherConv,agent],[foreignConv,agent]]) await rejected(assignSQL,[org,store,c,a,randomUUID(),'test'],'23503');
      const key=randomUUID(); await db.query(assignSQL,[org,store,conv,agent,key,'initial']);
      await rejected(assignSQL,[org,store,conv,agent,randomUUID(),'duplicate active'],'23505');
      await db.query('update conversation_assignments set ended_at=now()');
      await rejected(assignSQL,[org,store,conv,agent,key,'duplicate key'],'23505');
      await db.query(assignSQL,[org,store,conv,agent,randomUUID(),'transfer']);
    });
    await t.test('two independent connections cannot assign two active agents',async()=>{
      const results=await Promise.allSettled([
        db.query(assignSQL,[org,sibling,otherConv,otherAgent,randomUUID(),'concurrent A']),
        db.query(assignSQL,[org,sibling,otherConv,otherAgent,randomUUID(),'concurrent B']),
      ]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      const failure=results.find(r=>r.status==='rejected');
      assert(failure?.status==='rejected'); assert.equal(failure.reason.code,'23505');
    });
    await t.test('attribution enforces author shape and store; legacy inbox insert remains compatible',async()=>{
      const sql='insert into messages(organization_id,store_id,conversation_id,direction,author_type,agent_id,author_user_id,author_model) values($1,$2,$3,$4,$5,$6,$7,$8)';
      await db.query(sql,[org,store,conv,'out','agent_ai',agent,null,'synthetic-model']);
      await db.query(sql,[org,store,conv,'out','human',null,user,null]);
      await rejected(sql,[org,store,conv,'out','agent_ai',otherAgent,null,'model'],'23503');
      await rejected(sql,[org,sibling,conv,'in','customer',null,null,null],'23503');
      await rejected(sql,[org,store,conv,'out','human',null,randomUUID(),null],'23503');
      for(const row of [ ['in','human',null,user,null], ['out','agent_ai',agent,null,null], ['out','customer',null,null,null], ['out','agent_ai',agent,user,'model'] ]) await rejected(sql,[org,store,conv,...row],'23514');
      const row=(await db.query("insert into messages(organization_id,conversation_id,direction,body) values($1,$2,'in','Compatible inbox') returning store_id,author_type",[org,conv])).rows[0];
      assert.deepEqual(row,{store_id:store,author_type:'customer'});
    });
    await t.test('qualification and transitions are scoped, validated, idempotent and append-only',async()=>{
      const q='insert into qualification_events(organization_id,store_id,conversation_id,idempotency_key,agent_id,stage,attention_state,intent,confidence,reason,source_message_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)';
      const values=[org,store,conv,randomUUID(),agent,'sin_calificar','ia_atendiendo','greeting',0.5,'Insufficient information',inbound];
      await db.query(q,values); await rejected(q,values,'23505');
      await rejected(q,[org,store,conv,randomUUID(),otherAgent,...values.slice(5)],'23503');
      await rejected(q,[...values.slice(0,3),randomUUID(),...values.slice(4,8),1.1,...values.slice(9)],'23514');
      await rejected('update qualification_events set reason=$1',['changed'],'23514');
      const s='insert into stage_transitions(organization_id,store_id,conversation_id,idempotency_key,actor_user_id,from_stage,to_stage,reason,conversation_version) values($1,$2,$3,$4,$5,$6,$7,$8,1)';
      const transition=[org,store,conv,randomUUID(),user,'sin_calificar','soporte','Manual correction'];
      await db.query(s,transition); await rejected(s,transition,'23505');
      await rejected(s,[org,store,foreignConv,randomUUID(),...transition.slice(4)],'23503');
      await rejected('delete from stage_transitions',[],'23514');
      await db.query("update agent_definitions set objective='Reviewed objective',version=version+1 where id=$1",[agent]);
      assert.equal((await db.query("select count(*)::int n from agent_definition_events where operation='UPDATE'")).rows[0].n,1);
      await rejected('delete from agent_definition_events',[],'23514');
    });
    await t.test('new tables fail closed under RLS without browser policies',async()=>{
      const tables=['agent_definitions','conversation_assignments','qualification_events','stage_transitions','agent_definition_events'];
      const rows=(await db.query('select relname,relrowsecurity from pg_class where relnamespace=$1::regnamespace and relname=any($2)',[schema,tables])).rows;
      assert.equal(rows.length,5); assert(rows.every(r=>r.relrowsecurity));
      assert.equal((await db.query('select count(*)::int n from pg_policies where schemaname=$1 and tablename=any($2)',[schema,tables])).rows[0].n,0);
    });
    await t.test('existing Nadia claims, pause and simulated outbox work after migration',async()=>{
      assert.equal(await processNextNadia(db,{organizationId:org,storeId:store,apiKey:'synthetic',model:'synthetic',timeoutMs:100,minIntervalMs:1000,infer:async()=>({text:'Synthetic reply',model:'synthetic'})}),true);
      assert.equal((await db.query("select count(*)::int n from message_outbox where origin='nadia' and status='pending'")).rows[0].n,1);
      const client=await db.connect(); try {await client.query('begin'); await setNadiaPaused(client,org,store,false,conv); await client.query('commit');}finally{client.release();}
      assert.equal((await db.query("select status from message_outbox where origin='nadia'")).rows[0].status,'cancelled');
    });
  } finally { await db.end(); await admin.query(`drop schema if exists ${schema} cascade`); await admin.end(); }
});
