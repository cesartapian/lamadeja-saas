import type { SupabaseClient } from '@supabase/supabase-js';

// Session validity comes from Supabase's getUser endpoint, not decoded client claims.
export function supabaseIdentity(client: Pick<SupabaseClient, 'auth'>) {
  return async (token: string) => {
    const { data, error } = await client.auth.getUser(token);
    if (error) {
      if ([400, 401, 403].includes(error.status ?? 0)) return null;
      // Outages, throttling and transport errors must not masquerade as bad sessions.
      throw new Error('Identity provider unavailable');
    }
    return data.user;
  };
}
