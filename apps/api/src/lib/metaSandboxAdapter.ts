import { sandboxTextAllowed, type DispatchOutcome, type SandboxTextPolicy } from './sandboxDispatch.js';
import type { StoredSandboxJob, SandboxScope } from './sandboxRepository.js';

const unknown: DispatchOutcome = { kind: 'unknown' };
const notSent: DispatchOutcome = { kind: 'definitely_not_sent', retryable: false };
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Missing provider response');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 16384) { await reader.cancel(); throw new Error('Provider response too large'); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

// Not connected to API/worker configuration. Transport is injected explicitly;
// constructing this adapter cannot initiate an external request.
export function metaSandboxAdapter(settings: {
  token: string; phoneNumberId: string; graphVersion: string; timeoutMs: number;
  policy: SandboxTextPolicy; transport: typeof fetch;
}) {
  if (!settings.token || /\s/.test(settings.token) || !/^\d{5,30}$/.test(settings.phoneNumberId)
    || !/^v[1-9]\d?\.0$/.test(settings.graphVersion) || !Number.isInteger(settings.timeoutMs)
    || settings.timeoutMs < 10 || settings.timeoutMs > 60000) throw new Error('Invalid sandbox transport configuration');
  // Copy configuration so later mutations cannot expand the recipient list.
  const { token, phoneNumberId, graphVersion, timeoutMs, transport } = settings;
  const policy = { ...settings.policy, allowedRecipients: new Set(settings.policy.allowedRecipients) };
  const endpoint = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
  return {
    async send(job: StoredSandboxJob, context: SandboxScope & { lastInboundAt: number | null }, signal?: AbortSignal): Promise<DispatchOutcome> {
      const now = Date.now();
      if (signal?.aborted || job.state !== 'dispatching' || !Number.isInteger(job.attempts) || job.attempts < 1 || !job.claimToken || job.leaseUntil === null || !Number.isSafeInteger(job.leaseUntil)
        || job.leaseUntil <= now + timeoutMs
        || !sandboxTextAllowed(policy, { ...context, recipient: job.recipient, body: job.body }, now)) return notSent;
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      let onAbort: (() => void) | undefined;
      const deadline = new Promise<DispatchOutcome>(resolve => {
        onAbort = () => resolve(unknown);
        controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      const timer = setTimeout(cancel, timeoutMs);
      try {
        const attempt = async (): Promise<DispatchOutcome> => {
          const response = await transport(endpoint, { method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: job.recipient.slice(1),
              type: 'text', text: { preview_url: false, body: job.body } }),
          });
          // A network/HTTP error alone does not prove absence of provider effect.
          if (!response.ok) { await response.body?.cancel(); return unknown; }
          const body = await boundedJson(response) as { error?: unknown; messages?: { id?: unknown }[] } | null;
          const id = body?.messages?.[0]?.id;
          if (body?.error || !Array.isArray(body?.messages) || body.messages.length !== 1 || typeof id !== 'string'
            || !/^wamid\.[A-Za-z0-9_+=\/-]{1,500}$/.test(id)) return unknown;
          return { kind: 'accepted', providerMessageId: id };
        };
        return await Promise.race([attempt().catch(() => unknown), deadline]);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        if (onAbort) controller.signal.removeEventListener('abort', onAbort);
        controller.abort();
      }
    },
  };
}
