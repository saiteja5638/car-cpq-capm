import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { inr, compact, num, FAMILY } from './util';

function Num({ value, onSave, step = 1 }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  return <input className="num" type="number" step={step} value={v} onChange={e => setV(e.target.value)}
    onBlur={() => { if (v !== '' && +v !== +value) onSave(+v); else setV(value ?? ''); }} />;
}
function Text({ value, onSave, wide }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  return <input className={'txt' + (wide ? ' wide' : '')} value={v} onChange={e => setV(e.target.value)}
    onBlur={() => { if (v.trim() !== (value ?? '')) onSave(v.trim()); }} />;
}
function Toggle({ on, onClick, label }) {
  return <button className={'toggle' + (on ? ' on' : '')} role="switch" aria-checked={!!on} aria-label={label} onClick={onClick}><span /></button>;
}

function Bars({ rows, fmt = v => v }) {
  if (!rows?.length) return <p className="muted">Nothing yet. Save a quote to see data here.</p>;
  const max = Math.max(...rows.map(r => r.value), 1);
  return <ul className="bars">{rows.slice(0, 6).map(r => (
    <li key={r.label}><span>{r.label}</span><div><i style={{ width: `${(r.value / max) * 100}%` }} /></div><b>{fmt(r.value)}</b></li>
  ))}</ul>;
}

// Editable table: cols = [key, label, kind ('text' | 'num' | 'bool' | 'ro'), step]
function Table({ title, set, rows, cols, save, note }) {
  return (
    <div className="card"><h3>{title}</h3>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr>{cols.map(([k, l, kind]) => <th key={k} className={kind === 'num' || kind === 'bool' ? 'r' : ''}>{l}</th>)}</tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.ID}>{cols.map(([k, l, kind, step]) => (
            <td key={k} className={kind === 'num' || kind === 'bool' ? 'r' : kind === 'ro' ? 'muted' : ''}>
              {kind === 'num' ? <Num value={r[k]} step={step} onSave={v => save(set, r.ID, { [k]: v })} />
                : kind === 'bool' ? <Toggle on={r[k]} label={`${r.name} ${l}`} onClick={() => save(set, r.ID, { [k]: !r[k] })} />
                : kind === 'text' ? <Text value={r[k]} onSave={v => save(set, r.ID, { [k]: v })} />
                : typeof kind === 'function' ? kind(r) : r[k]}
            </td>))}</tr>
        ))}</tbody>
      </table></div>
      {note && <p className="muted">{note}</p>}
    </div>
  );
}

const RULES = { REQUIRES: 'Needs', EXCLUDES: 'Cannot combine with', DISCOUNT: 'Package saving with' };

export default function Admin({ cat, reload }) {
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [flash, setFlash] = useState('');
  const [nr, setNr] = useState({ extra_ID: '', ruleType: 'REQUIRES', target_ID: '', amount: '', reason: '' });
  const timer = useRef();

  useEffect(() => { if (tab === 'overview') api.analytics().then(setStats).catch(e => say(e.message, true)); }, [tab]);
  const say = (m, bad = false) => { clearTimeout(timer.current); setFlash({ m, bad }); timer.current = setTimeout(() => setFlash(''), bad ? 4000 : 2200); };
  const act = async (fn, ok = 'Saved') => { try { await fn(); await reload(); say(ok); } catch (e) { say(e.message, true); } };
  const save = (set, key, body) => act(() => api.patch(set, key, body));
  const exName = id => cat.extras.find(e => e.ID === id)?.name || id;
  const fam = r => (r.families ? r.families.split('|').map(f => FAMILY[f] || f).join(', ') : 'All');

  const addRule = e => {
    e.preventDefault();
    const a = exName(nr.extra_ID), b = exName(nr.target_ID);
    const reason = nr.reason.trim() || (nr.ruleType === 'REQUIRES' ? `${a} needs ${b}` : nr.ruleType === 'EXCLUDES' ? `${a} cannot be combined with ${b}` : `Package: ${a} with ${b}`);
    act(async () => {
      await api.create('ExtraRules', { ID: 'x-' + Math.random().toString(36).slice(2, 9), extra_ID: nr.extra_ID, ruleType: nr.ruleType, target_ID: nr.target_ID, amount: +nr.amount || 0, reason });
      setNr({ ...nr, target_ID: '', amount: '', reason: '' });
    }, 'Rule added');
  };
  const extraPick = (value, onChange, label) => (
    <select value={value} onChange={e => onChange(e.target.value)} required aria-label={label}>
      <option value="">{label}</option>
      {cat.extras.map(x => <option key={x.ID} value={x.ID}>{x.name}</option>)}
    </select>
  );

  const TABS = [['overview', 'Overview'], ['products', 'Head types and materials'], ['processing', 'Processing'], ['extras', 'Extras and rules'], ['commercial', 'Delivery and payment'], ['settings', 'Settings']];
  return (
    <section className="page">
      <div className="page-head">
        <h2>Dashboard</h2>
        {flash && <span className={'flash' + (flash.bad ? ' bad' : '')} role="status">{flash.m}</span>}
      </div>
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'overview' && (stats ? <>
        <div className="kpis">
          <div><span>Quotes</span><b>{stats.totalQuotes}</b></div>
          <div><span>Quoted value</span><b>{compact(stats.totalValue)}</b></div>
          <div><span>Steel quoted</span><b>{num(stats.totalTonnes, 1)} t</b></div>
          <div><span>Won (accepted)</span><b>{stats.totalQuotes ? Math.round(100 * stats.accepted / stats.totalQuotes) : 0}%</b><small>{compact(stats.acceptedValue)}</small></div>
          <div><span>Average margin</span><b>{stats.avgMarginPct}%</b><small>of price, ex-freight</small></div>
        </div>
        <div className="cols">
          <div className="card"><h3>Heads quoted by type</h3><Bars rows={stats.headTypes} /></div>
          <div className="card"><h3>Weight by material (kg)</h3><Bars rows={stats.materials} fmt={v => num(v)} /></div>
          <div className="card"><h3>Value by delivery zone</h3><Bars rows={stats.zones} fmt={compact} /></div>
          <div className="card"><h3>Quote status</h3><Bars rows={stats.status} /></div>
        </div>
      </> : <p className="muted">Loading…</p>)}

      {tab === 'products' && <>
        <Table title="Head types" set="HeadTypes" rows={cat.headTypes} save={save}
          note="Forming cost per kg is multiplied by the material's forming factor. Thinning decides which plate is used for a given minimum thickness."
          cols={[['name', 'Head type', 'ro'], ['code', 'Code', 'ro'], ['minDia', 'Min Ø', 'num', 50], ['maxDia', 'Max Ø', 'num', 50], ['thinningPct', 'Thinning %', 'num', 0.5],
            ['formingRate', '₹/kg forming', 'num', 1], ['minCharge', 'Min ₹/head', 'num', 500], ['setupCharge', 'Setup ₹/order', 'num', 1000], ['leadDays', 'Days', 'num'], ['active', 'Offered', 'bool']]} />
        <Table title="Materials" set="Materials" rows={cat.materials} save={save}
          note="Update plate rates when the steel price changes; new quotes use them immediately, issued quotes keep their price."
          cols={[['name', 'Material', 'ro'], ['family', 'Family', r => FAMILY[r.family]], ['ratePerKg', '₹/kg plate', 'num', 1], ['formingFactor', 'Forming factor', 'num', 0.05],
            ['minThk', 'Min mm', 'num'], ['maxThk', 'Max mm', 'num'], ['maxPlateWidth', 'Plate width', 'num', 100], ['leadDays', 'Days', 'num'], ['codeApproved', 'Code grade', 'bool'], ['active', 'Stocked', 'bool']]} />
      </>}

      {tab === 'processing' && <>
        <Table title="Edge preparation" set="EdgePreps" rows={cat.edges} save={save} note="Rate per metre of circumference at 10 mm; thicker plates scale up."
          cols={[['name', 'Edge', 'ro'], ['angle', 'Angle °', 'num', 2.5], ['ratePerM', '₹/m', 'num', 10], ['minThk', 'Min mm', 'num']]} />
        <Table title="Surface finishes" set="Finishes" rows={cat.finishes} save={save}
          cols={[['name', 'Finish', 'ro'], ['families', 'For', fam], ['ratePerM2', '₹/m²', 'num', 10], ['sides', 'Sides', 'num'], ['leadDays', 'Days', 'num'], ['active', 'Offered', 'bool']]} />
        <Table title="Heat treatment" set="HeatTreatments" rows={cat.heatTreatments} save={save} note="Charged per order: one furnace cycle, with a minimum charge."
          cols={[['name', 'Treatment', 'ro'], ['families', 'For', fam], ['ratePerKg', '₹/kg', 'num', 1], ['minCharge', 'Min ₹/order', 'num', 1000], ['leadDays', 'Days', 'num']]} />
        <Table title="Design codes" set="DesignCodes" rows={cat.codes} save={save}
          cols={[['name', 'Code', 'ro'], ['docCharge', 'Documents ₹/order', 'num', 1000], ['requiresCodeMaterial', 'Needs code grade', 'bool'], ['rtOnWelds', 'RT on welded blanks', 'bool']]} />
      </>}

      {tab === 'extras' && <>
        <Table title="Testing, documents, fabrication and packing" set="Extras" rows={cat.extras} save={save}
          cols={[['name', 'Extra', 'ro'], ['groupName', 'Group', 'ro'], ['basis', 'Charged', r => ({ PER_HEAD: 'per head', PER_ORDER: 'per order', PER_KG: 'per kg', PER_M2: 'per m² plate', PER_M: 'per m edge', PER_WELD: 'per m seam' })[r.basis]],
            ['families', 'For', fam], ['rate', 'Rate ₹', 'num', 100], ['active', 'Offered', 'bool']]} />
        <div className="card"><h3>Extra rules</h3>
          <p className="muted">Needs: picking the extra adds the other one. Cannot combine: works both ways. Package saving: taking both lowers the price.
            Engineering rules (heat treatment, radiography of welded blanks, code grades, D/t limits) run automatically and are tuned under Settings.</p>
          <table className="tbl"><thead><tr><th>Extra</th><th>Rule</th><th>Other extra</th><th className="r">Saving</th><th>Shown to customer</th><th /></tr></thead>
            <tbody>{cat.rules.map(r => (
              <tr key={r.ID}><td>{exName(r.extra_ID)}</td><td><span className={'tag ' + r.ruleType.toLowerCase()}>{RULES[r.ruleType] || r.ruleType}</span></td>
                <td>{exName(r.target_ID)}</td><td className="r">{r.ruleType === 'DISCOUNT' ? inr(r.amount) : ''}</td><td className="muted">{r.reason}</td>
                <td className="r"><button className="btn ghost sm" onClick={() => act(() => api.remove('ExtraRules', r.ID), 'Rule removed')}>Remove</button></td></tr>
            ))}</tbody></table>
          <form className="addrow" onSubmit={addRule}>
            {extraPick(nr.extra_ID, v => setNr({ ...nr, extra_ID: v }), 'Extra')}
            <select value={nr.ruleType} onChange={e => setNr({ ...nr, ruleType: e.target.value })} aria-label="Rule type">{Object.entries(RULES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            {extraPick(nr.target_ID, v => setNr({ ...nr, target_ID: v }), 'Other extra')}
            {nr.ruleType === 'DISCOUNT' && <input type="number" placeholder="Saving ₹" min="1" value={nr.amount} onChange={e => setNr({ ...nr, amount: e.target.value })} required />}
            <input className="wide" placeholder="Message for the customer (optional)" value={nr.reason} onChange={e => setNr({ ...nr, reason: e.target.value })} />
            <button className="btn primary">Add rule</button>
          </form></div>
      </>}

      {tab === 'commercial' && <>
        <Table title="Delivery zones" set="Zones" rows={cat.zones} save={save} note="Freight is charged at cost (no margin). The zone's state decides CGST + SGST or IGST."
          cols={[['name', 'Zone', 'ro'], ['state', 'State', 'ro'], ['freightPerKg', '₹/kg', 'num', 0.5], ['minFreight', 'Minimum ₹', 'num', 1000], ['transitDays', 'Transit days', 'num']]} />
        <Table title="Payment terms" set="PaymentTerms" rows={cat.terms} save={save} note="Adjustment is applied to the price before GST. Negative = early payment discount."
          cols={[['name', 'Terms', 'ro'], ['advancePct', 'Advance %', 'num', 5], ['adjustPct', 'Adjustment %', 'num', 0.5]]} />
      </>}

      {tab === 'settings' && <div className="card"><h3>Pricing and engineering settings</h3>
        <table className="tbl"><tbody>{cat.settings.map(s => (
          <tr key={s.ID}><td><b>{s.label}</b><br /><span className="muted">{s.hint}</span></td>
            <td className="r"><Text wide value={s.value} onSave={v => save('Settings', s.ID, { value: v })} /></td></tr>
        ))}</tbody></table></div>}
    </section>
  );
}
