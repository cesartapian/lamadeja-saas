// Runs only from the trusted default branch, never from the PR checkout.
const requiredChecks = ['test', 'container-runtime', 'revisar'];
function authorize({ owner, actor, triggeringActor, attempt, confirmation, sha, pr, comments, checks, statuses, ciRuns }) {
  const deny = reason => { throw new Error(`Merge blocked: ${reason}`); };
  if (actor !== owner || triggeringActor !== owner || attempt !== 1) deny('owner dispatch required; reruns are not authorization');
  if (!/^[a-f0-9]{40}$/.test(sha) || confirmation !== `MERGE ${sha}`) deny('explicit confirmation for full SHA required');
  if (pr.state !== 'open' || pr.draft || pr.base.ref !== 'main' || pr.head.sha !== sha) deny('PR is not an open ready main PR at the authorized SHA');
  const latest = comments.filter(c => c.user.login === 'claude[bot]' && c.user.type === 'Bot').at(-1);
  if (!latest?.body.startsWith('✅ Aprobado') || !latest.body.split('\n').includes(`HEAD_SHA: ${sha}`)) deny('current SHA technical approval required');
  // GitHub can return runs from multiple suites for one SHA (draft -> ready).
  // Only a strictly newer run from the same app/name supersedes an older one.
  // Preserve ambiguous/missing IDs rather than hiding an unsuccessful check.
  const currentChecks = checks.filter(check => !checks.some(other =>
    other !== check && other.name === check.name && other.app?.slug === check.app?.slug &&
    Number.isSafeInteger(check.id) && Number.isSafeInteger(other.id) && other.id > check.id));
  for (const name of requiredChecks) {
    if (!currentChecks.some(c => c.name === name && c.app?.slug === 'github-actions' && c.head_sha === sha && c.status === 'completed' && c.conclusion === 'success')) deny(`missing successful ${name}`);
  }
  if (currentChecks.some(c => c.name !== 'owner-authorized-merge' && (c.status !== 'completed' || c.conclusion !== 'success'))) deny('checks pending, skipped or unsuccessful');
  if (statuses.some(s => s.state !== 'success')) deny('commit status pending or unsuccessful');
  if (!ciRuns.some(r => r.path === '.github/workflows/ci.yml' && r.head_sha === sha && r.status === 'completed' && r.conclusion === 'success')) deny('successful trusted CI workflow required');
  return true;
}
async function run({ github, context, core }) {
  const { owner, repo } = context.repo;
  const inputs = context.payload.inputs ?? {};
  const number = Number(inputs.pr);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid PR number');
  const sha = inputs.sha;
  const args = { owner, repo };
  const pr = (await github.rest.pulls.get({ ...args, pull_number: number })).data;
  const comments = await github.paginate(github.rest.issues.listComments, { ...args, issue_number: number, per_page: 100 });
  const checks = await github.paginate(github.rest.checks.listForRef, { ...args, ref: sha, filter: 'latest', per_page: 100 });
  const allStatuses = await github.paginate(github.rest.repos.listCommitStatusesForRef, { ...args, ref: sha, per_page: 100 });
  // REST returns newest first; superseded failures do not block a recovered context.
  const statuses = [...new Map(allStatuses.toReversed().map(s => [s.context, s])).values()];
  const ciRuns = await github.paginate(github.rest.actions.listWorkflowRunsForRepo, { ...args, head_sha: sha, per_page: 100 });
  authorize({ owner, actor: context.actor, triggeringActor: process.env.TRIGGERING_ACTOR, attempt: Number(process.env.RUN_ATTEMPT), confirmation: inputs.confirmation, sha, pr, comments, checks, statuses, ciRuns });
  // GitHub atomically compares sha at merge time, closing the synchronize race.
  const result = await github.rest.pulls.merge({ ...args, pull_number: number, sha, merge_method: 'merge' });
  if (!result.data.merged) throw new Error(`GitHub refused merge: ${result.data.message}`);
  await core.summary.addHeading('Owner-authorized merge').addRaw(`PR #${number}, SHA ${sha}, authorized by ${context.actor}. Run ${context.runId}; attempt 1.`).write();
}
module.exports = { authorize, run };
