import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { authorize } = createRequire(import.meta.url)('../github/owner-merge-gate.cjs');
const sha = 'a'.repeat(40);
function valid() {
  return { owner: 'owner', actor: 'owner', triggeringActor: 'owner', attempt: 1, confirmation: `MERGE ${sha}`, sha,
    pr: { state: 'open', draft: false, base: { ref: 'main' }, head: { sha } },
    comments: [{ user: { login: 'claude[bot]', type: 'Bot' }, body: `✅ Aprobado\nHEAD_SHA: ${sha}` }],
    checks: ['test', 'container-runtime', 'revisar'].map(name => ({ name, app: { slug: 'github-actions' }, head_sha: sha, status: 'completed', conclusion: 'success' })),
    statuses: [], ciRuns: [{ path: '.github/workflows/ci.yml', head_sha: sha, status: 'completed', conclusion: 'success' }] };
}
test('plan and code PRs require explicit owner dispatch, independently of technical approval', () => {
  for (const type of ['plan', 'code']) {
    const v = valid(); v.pr.title = type; v.actor = 'claude[bot]';
    assert.throws(() => authorize(v), /owner dispatch/);
  }
});
test('generic text, bot comments and labels never grant merge authorization', () => {
  for (const confirmation of ['', 'ok', 'approved', 'MERGE']) {
    const v = valid(); v.confirmation = confirmation; v.pr.labels = ['approved'];
    assert.throws(() => authorize(v), /explicit confirmation/);
  }
});
test('old SHA authorization cannot merge updated head or use old technical approval', () => {
  const v = valid(); v.pr.head.sha = 'b'.repeat(40); assert.throws(() => authorize(v), /authorized SHA/);
  const w = valid(); w.comments[0].body = `✅ Aprobado\nHEAD_SHA: ${'b'.repeat(40)}`; assert.throws(() => authorize(w), /technical approval/);
});
test('reruns and non-owner triggering actors are denied', () => {
  for (const change of [{ attempt: 2 }, { triggeringActor: 'other' }]) assert.throws(() => authorize({ ...valid(), ...change }), /owner dispatch/);
});
test('latest changes requested and missing technical approval block merge', () => {
  const v = valid(); v.comments.push({ user: { login: 'claude[bot]', type: 'Bot' }, body: '❌ Requiere cambios' });
  assert.throws(() => authorize(v), /technical approval/);
  const w = valid(); w.comments = []; assert.throws(() => authorize(w), /technical approval/);
});
test('fail closed on pending, failed, skipped, missing and untrusted CI', () => {
  for (const conclusion of ['failure', 'skipped', null]) {
    const v = valid(); v.checks[0].conclusion = conclusion; assert.throws(() => authorize(v));
  }
  for (const change of [{ checks: [] }, { ciRuns: [] }, { statuses: [{ state: 'pending' }] }]) assert.throws(() => authorize({ ...valid(), ...change }));
});
test('drafts, closed PRs and other target branches are denied', () => {
  for (const change of [{ draft: true }, { state: 'closed' }, { base: { ref: 'other' } }]) {
    const v = valid(); Object.assign(v.pr, change); assert.throws(() => authorize(v));
  }
});
test('valid owner exact SHA authorization plus technical approval and checks permits merge', () => assert.equal(authorize(valid()), true));

test('review automation cannot merge and merge execution uses trusted main with atomic SHA', async () => {
  const { readFile } = await import('node:fs/promises');
  const revision = await readFile(new URL('../../.github/workflows/revision-claude.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(revision, /gh pr merge|contents: write/);
  const workflow = await readFile(new URL('../../.github/workflows/owner-authorized-merge.yml', import.meta.url), 'utf8');
  assert.match(workflow, /ref: main/); assert.match(workflow, /github.run_attempt == 1/);
  const script = await readFile(new URL('../github/owner-merge-gate.cjs', import.meta.url), 'utf8');
  assert.match(script, /pulls.merge\(\{ .*sha, merge_method/);
});
