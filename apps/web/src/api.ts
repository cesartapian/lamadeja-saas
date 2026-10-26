export interface Conversation {
  id: string; contact_id: string; contact_name: string | null; contact_phone: string | null;
  status: string; updated_at: string; last_message: string | null; last_message_type: string | null;
}
export interface Message { id: string; direction: 'in' | 'out'; body: string | null; message_type: string; created_at: string; sent_at: string | null }
export interface Contact { id: string; display_name: string | null; external_contact_id: string | null; created_at: string; updated_at: string }
export interface OutboxItem { id: string; conversation_id: string; body: string; origin?: 'manual' | 'nadia'; status: 'pending' | 'processing' | 'retrying' | 'failed' | 'simulated' | 'cancelled'; attempt_count: number; max_attempts: number; created_at: string; completed_at: string | null }
export interface NadiaState { available: boolean; active?: boolean; canManage?: boolean; runs?: { id: string; state: string; attempt_count: number; error_category: string | null }[] }
export interface Page<T> { items: T[]; hasMore: boolean; nextOffset: number }
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export function createApi(token: string, denied: (status: number) => void) {
  async function request<T>(path: string, signal: AbortSignal, body?: object, sessionDenied = true): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${import.meta.env.VITE_API_URL.trim().replace(/\/+$/, '')}${path}`, {
        method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error('No pudimos conectar con el servicio. Comprueba tu conexión e inténtalo de nuevo.');
    }
    if (response.status === 401 || (response.status === 403 && sessionDenied)) denied(response.status);
    if (!response.ok) throw new ApiError(response.status, response.status === 404
      ? 'Esta conversación o contacto ya no está disponible.' : 'No pudimos cargar la información. Inténtalo de nuevo.');
    return response.json();
  }
  return {
    async conversations(offset: number, signal: AbortSignal): Promise<Page<Conversation>> {
      const data = await request<{ conversations: Conversation[]; hasMore: boolean; nextOffset: number }>(`/api/conversations?limit=25&offset=${offset}`, signal);
      return { items: data.conversations, hasMore: data.hasMore, nextOffset: data.nextOffset };
    },
    async messages(id: string, offset: number, signal: AbortSignal): Promise<Page<Message>> {
      const data = await request<{ messages: Message[]; hasMore: boolean; nextOffset: number }>(`/api/conversations/${encodeURIComponent(id)}/messages?limit=50&order=desc&offset=${offset}`, signal);
      return { items: data.messages, hasMore: data.hasMore, nextOffset: data.nextOffset };
    },
    capabilities: (signal: AbortSignal) => request<{ mode: 'simulated' | 'disabled'; nadia?: boolean }>('/api/outbox/capabilities', signal),
    nadia: (id: string, signal: AbortSignal) => request<NadiaState>(`/api/conversations/${encodeURIComponent(id)}/nadia`, signal),
    setNadia: (id: string, enabled: boolean, signal: AbortSignal) => request<{ enabled: boolean }>(`/api/conversations/${encodeURIComponent(id)}/nadia`, signal, { enabled }, false),
    outbox: (id: string, offset: number, signal: AbortSignal) => request<Page<OutboxItem>>(`/api/conversations/${encodeURIComponent(id)}/outbox?offset=${offset}`, signal),
    enqueue: (id: string, body: string, idempotencyKey: string, signal: AbortSignal) => request<{ item: OutboxItem }>(`/api/conversations/${encodeURIComponent(id)}/outbox`, signal, { body, idempotencyKey }),
    contact: (id: string, signal: AbortSignal) => request<{ contact: Contact }>(`/api/contacts/${encodeURIComponent(id)}`, signal),
  };
}
export type Api = ReturnType<typeof createApi>;
