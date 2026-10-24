import { createClient, type Session } from '@supabase/supabase-js';
import { readWebConfig } from './webConfig';

const configuration = readWebConfig(import.meta.env);
export const configured = configuration !== null;
const callbackFailure = 'No pudimos completar el acceso. El enlace puede haber caducado. Vuelve a entrar con Google desde este navegador.';
const authParameters = ['code', 'sb_flow_id', 'error', 'error_code', 'error_description', 'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token', 'expires_in', 'expires_at', 'token_type'];

// Capture the one-use code once, before React StrictMode can replay effects.
// Never reflect provider descriptions or credentials into rendered errors/logs.
function captureCallback() {
  const url = new URL(window.location.href), fragment = new URLSearchParams(url.hash.slice(1));
  const isCallback = url.pathname === '/auth/callback';
  const code = url.searchParams.get('code'), flowId = url.searchParams.get('sb_flow_id');
  const providerError = url.searchParams.get('error') || fragment.get('error');
  const hasError = ['error', 'error_description', 'error_code'].some(key => url.searchParams.has(key) || fragment.has(key));
  const hasLegacyTokens = ['access_token', 'refresh_token'].some(key => fragment.has(key) || url.searchParams.has(key));
  const hasAuthParameters = authParameters.some(key => url.searchParams.has(key) || fragment.has(key));
  if (isCallback || hasAuthParameters) {
    for (const key of authParameters) url.searchParams.delete(key);
    if (authParameters.some(key => fragment.has(key))) url.hash = '';
    if (isCallback) url.pathname = '/';
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  const error = hasError ? providerError === 'access_denied'
    ? 'El acceso con Google se canceló. Puedes volver a intentarlo.' : callbackFailure
    : hasLegacyTokens ? 'Este enlace de acceso ya no es compatible. Vuelve a entrar con Google.'
      : isCallback && !code ? callbackFailure : '';
  return { code, flowId, error };
}
const callback = captureCallback();
export const supabase = configuration ? createClient(configuration.supabaseUrl, configuration.publicKey, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
}) : null;

interface RestoredSession { session: Session | null; error: string }
let restoring: Promise<RestoredSession> | undefined;
export function restoreSession(): Promise<RestoredSession> {
  return restoring ??= (async () => {
    if (!supabase) return { session: null, error: '' };
    if (callback.error) return { session: null, error: callback.error };
    try {
      const result = callback.code
        ? await supabase.auth.exchangeCodeForSession(callback.code, callback.flowId ? { flowId: callback.flowId } : undefined)
        : await supabase.auth.getSession();
      if (result.error) return { session: null, error: callback.code ? callbackFailure : 'No pudimos recuperar tu sesión. Vuelve a iniciar sesión.' };
      return { session: result.data.session, error: '' };
    } catch { return { session: null, error: callback.code ? callbackFailure : 'No pudimos recuperar tu sesión. Vuelve a iniciar sesión.' }; }
  })();
}
export async function beginGoogleLogin() {
  if (!supabase) throw new Error('Application is not configured');
  return supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: new URL('/auth/callback', window.location.origin).href } });
}
