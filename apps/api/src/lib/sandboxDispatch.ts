// Preparatory contract only: no network, persistence or runtime activation.
// Callers must persist transitions atomically with a version/token comparison.
export type DispatchState = 'queued' | 'claimed' | 'dispatching' | 'retry_wait' | 'accepted' | 'unknown' | 'failed';
export interface SandboxJob {
  state: DispatchState;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
  claimToken: string | null;
  leaseUntil: number | null;
  providerMessageId: string | null;
}
export type DispatchOutcome =
  | { kind: 'accepted'; providerMessageId: string }
  // Only a trusted adapter may assert that no provider side effect occurred.
  | { kind: 'definitely_not_sent'; retryable: boolean; retryAfterMs?: number }
  | { kind: 'unknown' };

function validTime(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid dispatch time');
}
function validate(job: SandboxJob) {
  if (!Number.isInteger(job.maxAttempts) || job.maxAttempts < 1 || job.maxAttempts > 100
    || !Number.isInteger(job.attempts) || job.attempts < 0 || job.attempts > job.maxAttempts) throw new Error('Invalid attempt limits');
  validTime(job.nextAttemptAt);
  if (job.leaseUntil !== null) validTime(job.leaseUntil);
  const active = job.state === 'claimed' || job.state === 'dispatching';
  if (active && (!job.claimToken || job.leaseUntil === null)) throw new Error('Active job lacks a claim');
  if (!active && (job.claimToken !== null || job.leaseUntil !== null)) throw new Error('Inactive job retains a claim');
}
function owned(job: SandboxJob, token: string, now: number) {
  validate(job); validTime(now);
  if (!token || job.claimToken !== token || job.leaseUntil === null || job.leaseUntil <= now) throw new Error('Expired or stale dispatch claim');
}
function released(job: SandboxJob, state: DispatchState): SandboxJob {
  return { ...job, state, claimToken: null, leaseUntil: null };
}

export function claimSandboxJob(job: SandboxJob, token: string, now: number, leaseMs: number): SandboxJob {
  validate(job); validTime(now);
  if (!token || !Number.isSafeInteger(leaseMs) || leaseMs < 1 || !Number.isSafeInteger(now + leaseMs)) throw new Error('Invalid dispatch lease');
  if (!['queued', 'retry_wait'].includes(job.state) || job.nextAttemptAt > now || job.attempts >= job.maxAttempts) throw new Error('Job is not eligible for dispatch');
  return { ...job, state: 'claimed', claimToken: token, leaseUntil: now + leaseMs };
}

export function beginSandboxDispatch(job: SandboxJob, token: string, now: number): SandboxJob {
  owned(job, token, now);
  if (job.state !== 'claimed' || job.attempts >= job.maxAttempts) throw new Error('Job is not claimed');
  // Commit this transition BEFORE calling the provider. Never hold a DB lock over HTTP.
  return { ...job, state: 'dispatching', attempts: job.attempts + 1 };
}

export function completeSandboxDispatch(job: SandboxJob, token: string, now: number, outcome: DispatchOutcome, retryBaseMs: number): SandboxJob {
  owned(job, token, now);
  if (job.state !== 'dispatching') throw new Error('Job is not dispatching');
  if (outcome.kind === 'accepted') {
    if (!/^wamid\.[A-Za-z0-9_+=\/-]{1,500}$/.test(outcome.providerMessageId)) throw new Error('Invalid provider acknowledgement');
    return { ...released(job, 'accepted'), providerMessageId: outcome.providerMessageId };
  }
  if (outcome.kind === 'unknown') return released(job, 'unknown');
  if (!outcome.retryable || job.attempts >= job.maxAttempts) return released(job, 'failed');
  if (!Number.isSafeInteger(retryBaseMs) || retryBaseMs < 1 || retryBaseMs > 3600000) throw new Error('Invalid retry delay');
  const backoff = Math.min(retryBaseMs * 2 ** Math.min(job.attempts - 1, 10), 3600000);
  const retryAfter = outcome.retryAfterMs ?? 0;
  validTime(retryAfter);
  const nextAttemptAt = now + Math.max(backoff, retryAfter);
  validTime(nextAttemptAt);
  return { ...released(job, 'retry_wait'), nextAttemptAt };
}

export function recoverSandboxClaim(job: SandboxJob, now: number): SandboxJob {
  validate(job); validTime(now);
  if (job.leaseUntil === null || job.leaseUntil > now) return job;
  if (job.state === 'claimed') return released(job, 'queued');
  // Crash after durable dispatch start is ambiguous even if HTTP never began.
  if (job.state === 'dispatching') return released(job, 'unknown');
  return job;
}

export interface SandboxTextPolicy {
  enabled: boolean;
  organizationId: string;
  storeId: string;
  channelId: string;
  allowedRecipients: ReadonlySet<string>;
}
export function sandboxTextAllowed(policy: SandboxTextPolicy, request: {
  organizationId: string; storeId: string; channelId: string;
  recipient: string; body: string; lastInboundAt: number | null;
}, now: number): boolean {
  validTime(now);
  return policy.enabled && Boolean(policy.organizationId && policy.storeId && policy.channelId)
    && request.organizationId === policy.organizationId && request.storeId === policy.storeId && request.channelId === policy.channelId
    && /^\+[1-9][0-9]{7,14}$/.test(request.recipient) && policy.allowedRecipients.has(request.recipient)
    && request.body.trim().length > 0 && request.body.length <= 4096
    && request.lastInboundAt !== null && Number.isSafeInteger(request.lastInboundAt) && request.lastInboundAt >= 0
    && request.lastInboundAt <= now && now - request.lastInboundAt < 24 * 60 * 60 * 1000;
}
