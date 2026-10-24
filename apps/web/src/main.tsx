import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session, Subscription } from '@supabase/supabase-js';
import { supabase, configured, restoreSession, beginGoogleLogin } from './auth';
import { Inbox } from './Inbox';
import './styles.css';

function App() {
  const [session, setSession] = useState<Session | null>(null), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [denied, setDenied] = useState<number | null>(null), [busy, setBusy] = useState(false);
  const onDenied = useCallback((status: number) => setDenied(status), []);
  useEffect(() => {
    const client = supabase;
    if (!client) { setLoading(false); return; }
    let active = true, subscription: Subscription | undefined;
    void restoreSession().then(result => {
      if (!active) return;
      setSession(result.session); setError(result.error); setLoading(false);
      // Subscribe after bootstrap so INITIAL_SESSION cannot reveal the inbox
      // while an OAuth callback is still being exchanged.
      subscription = client.auth.onAuthStateChange((event, next) => {
        if (!active) return;
        setSession(next); setDenied(null);
        if (event === 'SIGNED_IN') setError('');
      }).data.subscription;
    });
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);
  async function login() {
    if (!supabase) return;
    setBusy(true); setError('');
    try {
      const { error: failure } = await beginGoogleLogin();
      if (failure) throw failure;
    } catch { setError('No pudimos abrir Google. Comprueba tu conexión y vuelve a intentarlo.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    if (!supabase) return;
    setBusy(true); setError('');
    try {
      const { error: failure } = await supabase.auth.signOut({ scope: 'local' });
      if (failure) throw failure;
      setSession(null); setDenied(null);
    } catch { setError('No pudimos cerrar la sesión. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }
  return <><a className="skip-link" href="#main-content">Ir al contenido</a>
    <header className="app-header"><a className="brand" href="/" aria-label="La Madeja, inicio"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="16" cy="16" r="12"/><path d="M6 10c9-1 16 6 18 14M9 6c9 2 16 9 17 15M5 17c6-5 14-5 21-2M8 24c3-7 10-12 17-13M16 4c-6 5-8 14-6 22"/></svg><span>La Madeja<span className="brand-subtitle">Conversaciones</span></span></a>
      {session && <div className="account"><span title={session.user.email}>{session.user.email}</span><button className="button secondary" disabled={busy} onClick={() => void logout()}>Cerrar sesión</button></div>}
    </header>
    {error && session && !denied && <div className="global-error" role="alert">{error}</div>}
    <div id="main-content" tabIndex={-1}>
      {configured && !loading && session && !denied ? <Inbox key={session.user.id} token={session.access_token} onDenied={onDenied}/>
        : <main className="auth-page"><section className="auth-content">
          <span className="auth-rule"/>
          <h1>{!configured ? 'Falta configurar la aplicación' : loading ? 'Recuperando tu sesión…' : denied === 403 ? 'Tu cuenta necesita acceso' : denied === 401 ? 'Tu sesión ha caducado' : 'La conversación empieza aquí.'}</h1>
          <p>{!configured ? 'Completa las variables del frontend indicadas en la guía de instalación y reinicia el servicio.' : loading ? 'En un momento tendrás tu bandeja lista.' : denied === 403 ? 'Tu sesión es válida, pero tu cuenta no tiene acceso a esta organización. Pide al administrador que revise tu correo y membresía.' : denied === 401 ? 'Vuelve a entrar con Google para consultar tus conversaciones.' : 'Revisa los mensajes de WhatsApp y la información de tus contactos en un solo lugar.'}</p>
          {error && <p className="auth-error" role="alert">{error}</p>}
          {configured && !loading && denied !== 403 && <button className="button primary" disabled={busy} onClick={() => void login()}>{busy ? 'Conectando…' : 'Entrar con Google'}</button>}
          <p className="auth-footnote">Acceso reservado a las cuentas autorizadas de tu equipo.</p>
        </section></main>}
    </div>
  </>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
