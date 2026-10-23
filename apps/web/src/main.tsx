import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient, type Session } from '@supabase/supabase-js';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState('Cargando sesión…');
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) { setStatus('Inicia sesión con Google para acceder.'); return; }
    fetch(`${import.meta.env.VITE_API_URL}/api/me`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(async response => { if (!response.ok) throw new Error(`Acceso denegado (${response.status})`); return response.json(); })
      .then(user => setStatus(`Acceso autorizado: ${user.email} · tienda ${user.storeId}`))
      .catch(error => setStatus(error.message));
  }, [session]);
  return <main style={{fontFamily:'system-ui,sans-serif',maxWidth:780,margin:'10vh auto',padding:24,color:'#392b51'}}>
    <h1>La Madeja · Plataforma SaaS</h1>
    <p>Fundaciones del MVP — autenticación compartida con Live Manager</p>
    <p role="status">{status}</p>
    {!session ? <button onClick={() => supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin}})}>Entrar con Google</button>
      : <button onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>}
    <hr/><p>WhatsApp · Shopify · Agentes IA · CRM — módulos pendientes de migración</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
