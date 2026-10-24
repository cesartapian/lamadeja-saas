import { useCallback, useEffect, useRef, useState } from 'react';
import type { Api, OutboxItem } from './api';
import { usePaged } from './usePaged';

const labels: Record<OutboxItem['status'], string> = {
  pending: 'Pendiente', processing: 'Procesando simulación', retrying: 'Reintentando', failed: 'Falló la simulación', simulated: 'Simulado · sin envío real',
};
function Simulation({ api, conversationId }: { api: Api; conversationId: string }) {
  const fetchItems = useCallback((offset: number, signal: AbortSignal) => api.outbox(conversationId, offset, signal), [api, conversationId]);
  const list = usePaged(fetchItems);
  const [body, setBody] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const key = useRef<string | null>(null), submission = useRef<AbortController | null>(null);
  useEffect(() => () => submission.current?.abort(), []);
  useEffect(() => {
    if (!list.items.some(item => ['pending', 'processing', 'retrying'].includes(item.status)) || list.loading || list.error) return;
    const timer = setTimeout(() => { void list.refresh(); }, 3000);
    return () => clearTimeout(timer);
  }, [list.items, list.loading, list.error, list.refresh]);
  async function enqueue() {
    if (busy || !body.trim()) return;
    setBusy(true); setError('');
    key.current ??= crypto.randomUUID();
    const request = new AbortController(); submission.current = request;
    try {
      await api.enqueue(conversationId, body.trim(), key.current, request.signal);
      if (request.signal.aborted) return;
      setBody(''); key.current = null;
      await list.refresh();
    } catch { if (!request.signal.aborted) setError('No pudimos confirmar la simulación. Reintentar conserva la misma solicitud para evitar duplicados.'); }
    finally { if (!request.signal.aborted) setBusy(false); }
  }
  return <section className="outbox-composer" aria-label="Bandeja de salida simulada">
    <div className="outbox-heading"><strong>Simulación de respuesta</strong><button className="button secondary" disabled={list.loading} onClick={() => void list.refresh()}>Actualizar simulaciones</button></div>
    <p className="muted">Solo pruebas: ningún mensaje se envía a WhatsApp.</p>
    <form onSubmit={event => { event.preventDefault(); void enqueue(); }}>
      <label htmlFor="simulation-body">Mensaje de prueba</label>
      <textarea id="simulation-body" value={body} maxLength={4096} rows={2} disabled={busy} onChange={event => { setBody(event.target.value); key.current = null; setError(''); }}/>
      <button className="button primary" disabled={busy || !body.trim()}>{busy ? 'Guardando…' : 'Simular envío'}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {list.error && <p role="alert">No pudimos cargar las simulaciones. Usa Actualizar simulaciones para reintentar.</p>}
    <div className="outbox-statuses" aria-live="polite"><ul>{list.items.map(item => <li key={item.id}><p>{item.body}</p><span>{labels[item.status]} · Intentos {item.attempt_count}/{item.max_attempts}</span></li>)}</ul></div>
    {list.hasMore && <button className="button secondary" disabled={list.loading} onClick={() => void list.more()}>Ver simulaciones anteriores</button>}
  </section>;
}
export function OutboxComposer({ api, conversationId }: { api: Api; conversationId: string }) {
  const [mode, setMode] = useState('loading'), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    api.capabilities(request.signal).then(data => { if (!request.signal.aborted) setMode(data.mode === 'simulated' ? 'simulated' : 'disabled'); })
      .catch(() => { if (!request.signal.aborted) setMode('error'); });
    return () => request.abort();
  }, [api, attempt]);
  if (mode === 'simulated') return <Simulation api={api} conversationId={conversationId}/>;
  return <footer className="thread-footer">{mode === 'error' ? <>No pudimos comprobar la disponibilidad de la simulación. <button className="button secondary" onClick={() => setAttempt(value => value + 1)}>Comprobar simulación</button></> : mode === 'loading' ? 'Comprobando disponibilidad…' : 'Bandeja de solo lectura. La simulación está deshabilitada.'}</footer>;
}
