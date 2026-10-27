import { useEffect, useState } from 'react';
import { api, hasAuth, setAuth, clearAuth } from './api';
import { HeadIcon } from './HeadArt';
import Configurator from './Configurator';
import Quotes from './Quotes';
import Admin from './Admin';

// Demo accounts only exist on the local dev server (npm run frontend); the deployed app has real passwords
const DEMO = import.meta.env.DEV;

function Login({ onLogin }) {
  const [u, setU] = useState(DEMO ? 'user' : ''), [p, setP] = useState(DEMO ? 'user' : ''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const go = async e => {
    e?.preventDefault(); setBusy(true); setErr('');
    try { setAuth(u, p); await onLogin(); }
    catch (ex) { clearAuth(); setErr(ex.message.includes('fetch') ? 'Cannot reach the server. Is "npm start" running?' : ex.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="login">
      <section className="login-hero">
        <h1>Specify the head.<br />See the price<br />as you go.</h1>
        <p>Dished, hemispherical and conical heads in carbon steel, stainless, duplex and aluminium. Engineering checks and a delivered price in minutes.</p>
        <div className="hero-heads"><HeadIcon kind="ELLIPSE" /><HeadIcon kind="HEMI" /><HeadIcon kind="CONE" /></div>
      </section>
      <form className="login-card" onSubmit={go}>
        <h2>Sign in</h2>
        <label>Username<input value={u} onChange={e => setU(e.target.value)} autoComplete="username" required autoFocus={!DEMO} /></label>
        <label>Password<input type="password" value={p} onChange={e => setP(e.target.value)} autoComplete="current-password" required /></label>
        {err && <div className="alert" role="alert">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {DEMO ? (
          <div className="demo">
            <span>Try a demo account</span>
            <button type="button" className="chip" onClick={() => { setU('user'); setP('user'); }}>Customer</button>
            <button type="button" className="chip" onClick={() => { setU('admin'); setP('admin'); }}>Admin</button>
          </div>
        ) : <p className="demo">Use the account details you were given. Ask your administrator if you need access.</p>}
      </form>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [cat, setCat] = useState(null);
  const [tab, setTab] = useState('configure');
  const [booting, setBooting] = useState(hasAuth());
  const [draft, setDraft] = useState(null);   // a quote being revised: { config, company, reference, notes }
  const revise = d => { setDraft({ ...d, at: Date.now() }); setTab('configure'); };

  const load = async () => {
    const who = await api.whoami();
    const catalog = await api.catalog();
    setMe(who); setCat(catalog);
    // Read the flag now: the updater below runs later, after the flag is already set
    const firstVisit = !sessionStorage.getItem('cpq-seen');
    setTab(t => (who.admin && t === 'configure' && firstVisit) ? 'admin' : t);
    sessionStorage.setItem('cpq-seen', '1');
  };
  const reloadCatalog = async () => setCat(await api.catalog());
  useEffect(() => { if (hasAuth()) load().catch(() => clearAuth()).finally(() => setBooting(false)); }, []);
  const logout = () => { clearAuth(); sessionStorage.removeItem('cpq-seen'); setMe(null); setCat(null); setDraft(null); setTab('configure'); };

  if (booting) return <div className="boot">Loading…</div>;
  if (!me || !cat) return <Login onLogin={load} />;

  const tabs = me.admin
    ? [['admin', 'Dashboard'], ['configure', 'Configure'], ['quotes', 'All quotes']]
    : [['configure', 'Configure'], ['quotes', 'My quotes']];
  return (
    <>
      <header className="top">
        <div className="brand"><span className="dot" />HeadQuote CPQ</div>
        <nav>{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>
        <div className="who"><span>{me.user}<em>{me.admin ? 'Admin' : 'Customer'}</em></span><button className="btn ghost" onClick={logout}>Sign out</button></div>
      </header>
      <main>
        {/* the key remounts the configurator when a quote is opened for revision */}
        {tab === 'configure' && <Configurator key={draft?.at || 0} cat={cat} me={me} draft={draft} goQuotes={() => setTab('quotes')} />}
        {tab === 'quotes' && <Quotes me={me} onRevise={revise} />}
        {tab === 'admin' && me.admin && <Admin cat={cat} reload={reloadCatalog} />}
      </main>
    </>
  );
}
