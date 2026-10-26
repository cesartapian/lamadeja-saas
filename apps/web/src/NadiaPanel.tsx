import { useEffect, useRef, useState } from 'react';
import type { Api, NadiaState } from './api';

export function NadiaPanel({ api, conversationId }: { api: Api; conversationId: string }) {
  const [state, setState] = useState<NadiaState | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController(); request.current = abort;
    api.nadia(conversationId, abort.signal).then(data => { if (!abort.signal.aborted) { setState(data); setError(''); } })
      .catch(() => { if (!abort.signal.aborted) setError('No pudimos comprobar el estado de Nadia.'); });
    return () => abort.abort();
  }, [api, conversationId, attempt]);
  async function toggle(enabled: boolean) {
    if (busy) return;
    setBusy(true); setError('');
    const abort = new AbortController(); request.current = abort;
    try { await api.setNadia(conversationId, enabled, abort.signal); if (!abort.signal.aborted) setAttempt(value => value + 1); }
    catch { if (!abort.signal.aborted) setError('No pudimos cambiar la pausa de Nadia. Tu sesión sigue abierta.'); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!state?.available || busy || error) return;
    const timer = setTimeout(() => setAttempt(value => value + 1), 3000);
    return () => clearTimeout(timer);
  }, [state, busy, error]);
  if (state && !state.available) return null;
  return <section className="nadia-panel" aria-label="Control de Nadia">
    <strong>Nadia · Asistente virtual con IA</strong>
    <p>{state ? state.active ? 'Activa · respuestas simuladas' : 'Pausada · no se generan respuestas automáticas' : 'Comprobando Nadia…'}</p>
    <p className="muted">Solo pruebas. Las respuestas no se envían a WhatsApp.</p>
    {state?.canManage && <div className="nadia-controls">
      <button className="button secondary" role="switch" aria-checked={Boolean(state.active)} disabled={busy} onClick={() => void toggle(!state.active)}>Nadia en esta conversación</button>
    </div>}
    {state && !state.canManage && <p className="muted">Un administrador puede cambiar la pausa de Nadia.</p>}
    {state?.runs?.some(run => run.state === 'failed') && <p role="status">Nadia no pudo generar una respuesta. No se creó una respuesta de reemplazo.</p>}
    {error && <p role="alert">{error} <button className="button secondary" onClick={() => setAttempt(value => value + 1)}>Comprobar Nadia</button></p>}
  </section>;
}
