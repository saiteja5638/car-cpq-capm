import { useEffect, useState } from 'react';
import { api } from './api';
import { inr, num, today } from './util';
import { downloadQuotePdf } from './pdf';

const parse = (s, fallback) => { try { return JSON.parse(s) ?? fallback; } catch { return fallback; } };
// Rebuild the calculate() shape from the snapshot stored on the quote
const toDoc = q => ({
  ...parse(q.linesJson, {}), spec: parse(q.specJson, {}),
  quoteNo: q.quoteNo, createdAt: q.createdAt, validUntil: q.validUntil, customer: q.customer, company: q.company,
  reference: q.reference, notes: q.notes, summary: q.summary, terms: q.paymentTerms, zone: q.zone,
  unitPrice: q.unitPrice, total: q.total, advance: q.advance, dispatchDays: q.dispatchDays
});
const stateOf = q => (q.status === 'ISSUED' && q.validUntil < today() ? 'EXPIRED' : q.status);
const LABEL = { ISSUED: 'Open', ACCEPTED: 'Accepted', DECLINED: 'Declined', EXPIRED: 'Expired' };

export default function Quotes({ me, onRevise }) {
  const [rows, setRows] = useState(null), [err, setErr] = useState(''), [show, setShow] = useState('all'), [busy, setBusy] = useState('');
  const load = () => api.quotes().then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  if (err) return <div className="alert page">{err}</div>;
  if (!rows) return <div className="boot">Loading quotes…</div>;

  const respond = async (q, accept) => {
    setBusy(q.ID);
    try { await api.respondQuote(q.ID, accept); await load(); } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  const list = rows.filter(q => show === 'all' || stateOf(q) === show);
  return (
    <section className="page">
      <div className="page-head">
        <h2>{me.admin ? 'All quotes' : 'My quotes'}</h2>
        {rows.length > 0 && <div className="tabs inline">
          {[['all', 'All'], ['ISSUED', 'Open'], ['ACCEPTED', 'Accepted'], ['EXPIRED', 'Expired'], ['DECLINED', 'Declined']].map(([k, l]) =>
            <button key={k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>)}
        </div>}
      </div>
      {rows.length === 0 ? <div className="empty"><b>No quotes yet</b><p>Configure a head and request a quotation to see it here.</p></div> : (
        <div className="qlist">
          {list.length === 0 && <p className="muted">No quotes match this filter.</p>}
          {list.map(q => {
            const st = stateOf(q), mine = q.customer === me.user;
            return (
              <article key={q.ID} className="qcard">
                <div>
                  <strong>{q.summary}</strong>
                  <span>{q.quoteNo} · {new Date(q.createdAt).toLocaleDateString('en-IN')}{q.company ? ` · ${q.company}` : ''}{me.admin ? ` · ${q.customer}` : ''}{q.reference ? ` · Ref ${q.reference}` : ''}</span>
                </div>
                <div className="qmeta">
                  <span className={'status ' + st.toLowerCase()}>{LABEL[st]}</span>
                  <span>{st === 'ISSUED' ? `Valid until ${new Date(q.validUntil).toLocaleDateString('en-IN')}` : `${num(q.totalWeight)} kg · ${q.zone}`}</span>
                </div>
                <div className="qtotal">{inr(q.total)}<small>{inr(q.unitPrice)} per head ex-GST · dispatch ~{q.dispatchDays} days</small></div>
                <div className="qact">
                  <button className="btn outline sm" onClick={() => downloadQuotePdf(toDoc(q))}>PDF</button>
                  <button className="btn outline sm" onClick={() => onRevise({ config: parse(q.configJson, {}), company: q.company, reference: q.reference, notes: q.notes })}>Revise</button>
                  {mine && st === 'ISSUED' && <>
                    <button className="btn primary sm" disabled={busy === q.ID} onClick={() => respond(q, true)}>Accept</button>
                    <button className="btn ghost sm" disabled={busy === q.ID} onClick={() => respond(q, false)}>Decline</button>
                  </>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
