export function isPublicKey(key) {
  if (typeof key !== 'string') return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role === 'anon'; }
  catch { return false; }
}
export function assertPublicBuildConfig(env) {
  if (!isPublicKey(env.VITE_SUPABASE_ANON_KEY)) throw new Error('Frontend requires a public publishable/anon key, never a privileged key.');
  for (const name of ['VITE_SUPABASE_URL', 'VITE_API_URL']) {
    let url;
    try { url = new URL(env[name]); } catch { throw new Error('Frontend URLs must be configured.'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) throw new Error('Frontend requires HTTPS or a local test URL without credentials or parameters.');
  }
}
