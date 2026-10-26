import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createApi, type Api, type Contact, type Conversation } from './api';
import { OutboxComposer } from './OutboxComposer';
import { NadiaPanel } from './NadiaPanel';
import { usePaged } from './usePaged';

const date = (value: string, full = false) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Sin fecha' : new Intl.DateTimeFormat('es-CL', full
    ? { dateStyle: 'medium', timeStyle: 'short' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(parsed);
};
const name = (c: Conversation) => c.contact_name || c.contact_phone || 'Contacto sin nombre';
const initials = (label: string) => label.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
function Icon({ kind }: { kind: 'inbox' | 'refresh' | 'back' | 'contact' }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'inbox' ? <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 13h5l2 3h4l2-3h5M8 8h8"/></>
      : kind === 'refresh' ? <><path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3"/></>
      : kind === 'back' ? <path d="m14 5-7 7 7 7"/>
      : <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>}
  </svg>;
}
function Failure({ message, retry }: { message: string; retry: () => void }) {
  return <div className="failure" role="alert"><p>{message}</p><button className="button secondary" onClick={retry}>Reintentar</button></div>;
}
function Loading({ label }: { label: string }) {
  return <div className="loading" role="status"><span>{label}</span><div className="skeleton"/><div className="skeleton short"/><div className="skeleton"/></div>;
}
function ContactInfo({ api, conversation }: { api: Api; conversation: Conversation }) {
  const [expanded, setExpanded] = useState(() => window.matchMedia('(min-width: 1200px)').matches);
  const [contact, setContact] = useState<Contact | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const request = new AbortController(); setError(''); setContact(null);
    api.contact(conversation.contact_id, request.signal).then(data => { if (!request.signal.aborted) setContact(data.contact); })
      .catch(err => { if (!request.signal.aborted) setError(err.message); });
    return () => request.abort();
  }, [api, conversation.contact_id, attempt]);
  return <details className="contact-details" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary><Icon kind="contact"/> Ficha del contacto</summary>
    {error ? <Failure message={error} retry={() => setAttempt(value => value + 1)}/>
      : !contact ? <Loading label="Cargando contacto…"/>
      : <div className="contact-content"><div className="avatar large" aria-hidden="true">{initials(contact.display_name || contact.external_contact_id || '?')}</div>
        <h3>{contact.display_name || 'Contacto sin nombre'}</h3><p className="muted">WhatsApp</p>
        <dl><dt>Teléfono / WhatsApp ID</dt><dd>{contact.external_contact_id ? `+${contact.external_contact_id}` : 'Sin teléfono registrado'}</dd>
          <dt>Primer registro</dt><dd>{date(contact.created_at, true)}</dd><dt>Última actualización</dt><dd>{date(contact.updated_at, true)}</dd></dl>
      </div>}
  </details>;
}
function ConversationPane({ api, conversation, back }: { api: Api; conversation: Conversation; back: () => void }) {
  const fetchMessages = useCallback((offset: number, signal: AbortSignal) => api.messages(conversation.id, offset, signal), [api, conversation.id]);
  const messages = usePaged(fetchMessages);
  const heading = useRef<HTMLHeadingElement>(null);
  const history = useRef<HTMLDivElement>(null), previousCount = useRef(0);
  const scrollAnchor = useRef<{ height: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const element = history.current;
    if (!element || !messages.items.length) return;
    if (scrollAnchor.current) {
      element.scrollTop = scrollAnchor.current.top + element.scrollHeight - scrollAnchor.current.height;
      scrollAnchor.current = null;
    } else if (!previousCount.current) element.scrollTop = element.scrollHeight;
    previousCount.current = messages.items.length;
  }, [messages.items]);
  useEffect(() => { heading.current?.focus(); }, []);
  // API pages newest-first; reverse the accumulated pages for chronological reading.
  const chronological = useMemo(() => [...messages.items].reverse(), [messages.items]);
  return <>
    <section className="thread" aria-label={`Conversación con ${name(conversation)}`}>
      <header className="thread-header"><button className="icon-button mobile-back" onClick={back} aria-label="Volver a conversaciones"><Icon kind="back"/></button>
        <div className="avatar" aria-hidden="true">{initials(name(conversation))}</div><div className="thread-title"><h2 ref={heading} tabIndex={-1}>{name(conversation)}</h2><p>WhatsApp <span aria-hidden="true">·</span> {conversation.status === 'open' ? 'Conversación abierta' : conversation.status === 'closed' ? 'Conversación cerrada' : conversation.status}</p></div>
        <button className="icon-button" onClick={() => void messages.refresh()} disabled={messages.loading} aria-label="Actualizar mensajes"><Icon kind="refresh"/></button>
      </header>
      <div className="history" ref={history} aria-busy={messages.loading} role="region" aria-label="Historial de mensajes" tabIndex={0} onKeyDown={event => {
        if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault(); event.currentTarget.scrollTop = event.key === 'Home' ? 0 : event.currentTarget.scrollHeight;
        }
      }}>
        {messages.hasMore && !messages.error && <button className="button secondary history-more" disabled={messages.loading} onClick={() => {
          if (history.current) scrollAnchor.current = { height: history.current.scrollHeight, top: history.current.scrollTop };
          void messages.more();
        }}>Cargar mensajes anteriores</button>}
        {messages.error && <Failure message={messages.error} retry={() => void messages.retry()}/>}
        {messages.loading && <Loading label="Cargando mensajes…"/>}
        {!messages.loading && !messages.error && !messages.items.length && <div className="empty"><h3>Aún no hay mensajes</h3><p>Los mensajes recibidos aparecerán aquí cuando se procesen.</p></div>}
        <ol className="message-list">{chronological.map(message => <li key={message.id} className={`message ${message.direction === 'out' ? 'outgoing' : 'incoming'}`}>
          <span className="message-direction">{message.direction === 'in' ? 'Recibido' : 'Enviado'}</span>
          <p>{message.message_type === 'text' ? message.body || 'Mensaje sin contenido' : `Mensaje de tipo ${message.message_type}. Su contenido no está disponible en esta bandeja.`}</p>
          <time dateTime={message.sent_at || message.created_at}>{date(message.sent_at || message.created_at, true)}</time>
        </li>)}</ol>
      </div>
      <NadiaPanel api={api} conversationId={conversation.id}/>
      <OutboxComposer api={api} conversationId={conversation.id}/>
    </section>
    <aside className="contact-panel" aria-label="Información del contacto" tabIndex={0}><ContactInfo api={api} conversation={conversation}/></aside>
  </>;
}
export function Inbox({ token, onDenied }: { token: string; onDenied: (status: number) => void }) {
  const api = useMemo(() => createApi(token, onDenied), [token, onDenied]);
  const fetchConversations = useCallback((offset: number, signal: AbortSignal) => api.conversations(offset, signal), [api]);
  const list = usePaged(fetchConversations);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  return <main className={`workspace ${selected ? 'has-selection' : ''}`}>
    <section className="conversation-panel" aria-labelledby="inbox-title">
      <header className="list-header"><div><h1 id="inbox-title">Conversaciones</h1><p>Tu bandeja de WhatsApp</p></div><button className="icon-button" aria-label="Actualizar conversaciones" disabled={list.loading} onClick={() => void list.refresh()}><Icon kind="refresh"/></button></header>
      <div className="channel-label"><span className="channel-dot"/> WhatsApp <span className="muted">Solo lectura</span></div>
      <div className="conversation-scroll" aria-busy={list.loading}>
        {list.error && <Failure message={list.error} retry={() => void list.retry()}/>}
        {!list.loading && !list.error && !list.items.length && <div className="empty"><Icon kind="inbox"/><h2>Tu bandeja está al día</h2><p>Cuando llegue el primer mensaje, encontrarás aquí su conversación.</p></div>}
        <ul className="conversation-list">{list.items.map(conversation => <li key={conversation.id}><button className={`conversation-row ${selected?.id === conversation.id ? 'selected' : ''}`} aria-current={selected?.id === conversation.id ? 'true' : undefined}
          onClick={event => { selectedButton.current = event.currentTarget; setSelected(conversation); }}>
          <span className="avatar" aria-hidden="true">{initials(name(conversation))}</span><span className="conversation-copy"><span className="row-heading"><strong>{name(conversation)}</strong><time dateTime={conversation.updated_at}>{date(conversation.updated_at)}</time></span>
            <span className="preview">{conversation.last_message || (conversation.last_message_type && conversation.last_message_type !== 'text' ? `Mensaje de tipo ${conversation.last_message_type}` : 'Sin mensajes todavía')}</span>
            <span className="row-status">{conversation.status === 'open' ? 'Abierta' : conversation.status === 'closed' ? 'Cerrada' : conversation.status}</span></span>
        </button></li>)}</ul>
        {list.loading && <Loading label="Cargando conversaciones…"/>}
        {list.hasMore && !list.error && <button className="button secondary list-more" disabled={list.loading} onClick={() => void list.more()}>Cargar más conversaciones</button>}
      </div>
    </section>
    {selected ? <ConversationPane key={selected.id} api={api} conversation={selected} back={() => { setSelected(null); requestAnimationFrame(() => selectedButton.current?.focus()); }}/>
      : <section className="welcome"><div className="welcome-icon"><Icon kind="inbox"/></div><h2>Cada conversación, en su lugar.</h2><p>Selecciona un contacto para revisar sus mensajes y continuar el seguimiento de tu equipo.</p><span className="muted">WhatsApp · La Madeja</span></section>}
  </main>;
}
