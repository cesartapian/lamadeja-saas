export interface WebConfig { supabaseUrl: string; publicKey: string; apiUrl: string }
export function readWebConfig(values: Record<string, string | undefined>): WebConfig | null {
  function httpUrl(value: string | undefined) {
    if (!value?.trim()) return null;
    try {
      const url = new URL(value.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
      return url.href.replace(/\/+$/, '');
    } catch { return null; }
  }
  const supabaseUrl = httpUrl(values.VITE_SUPABASE_URL), apiUrl = httpUrl(values.VITE_API_URL);
  const publicKey = values.VITE_SUPABASE_ANON_KEY?.trim();
  return supabaseUrl && apiUrl && publicKey ? { supabaseUrl, apiUrl, publicKey } : null;
}
