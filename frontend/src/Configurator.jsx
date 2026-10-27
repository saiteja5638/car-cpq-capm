import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { inr, num, FAMILY, fits, pipes } from './util';
import HeadArt, { HeadIcon } from './HeadArt';
import { downloadQuotePdf } from './pdf';

function useCountUp(target) {
  const [v, setV] = useState(target); const from = useRef(target);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { from.current = target; setV(target); return; }
    const t0 = performance.now(), start = from.current; let raf;
    const tick = t => {
      const k = Math.min(1, (t - t0) / 450), val = start + (target - start) * (1 - Math.pow(1 - k, 3));
      from.current = val; setV(val); if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

const STEPS = ['Head and size', 'Material and thickness', 'Finish and processing', 'Delivery and quote'];
const NUMERIC = ['diameter', 'thickness', 'outletDia', 'qty', 'coneAngle', 'sf'];

export function defaultConfig(cat) {
  const first = (list, id) => (list.find(x => x.ID === id && x.active !== false) || list.find(x => x.active !== false) || list[0]).ID;
  const sfs = pipes(cat.setting.sfOptions);
  return {
    headTypeId: first(cat.headTypes, 'se21'), materialId: first(cat.materials, 'ss304l'), codeId: first(cat.codes, 'asme'),
    diaBasis: 'ID', diameter: 1500, thkBasis: 'MIN', thickness: 6, sf: sfs.includes(50) ? 50 : sfs[0],
    coneAngle: 30, outletDia: 0, qty: 1,
    edgeId: first(cat.edges, 'bevel30'), finishId: first(cat.finishes, 'mill'), colourId: null, htId: first(cat.heatTreatments, 'none'),
    extraIds: [], zoneId: first(cat.zones, 'telangana'), termsId: cat.terms[0].ID
  };
}

// Empty number inputs go to the server as null, so it can say what is missing
const clean = cfg => Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, NUMERIC.includes(k) && (v === '' || v == null) ? null : v]));

function Seg({ value, options, onChange, label }) {
  return <div className="seg" role="radiogroup" aria-label={label}>
    {options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
  </div>;
}

export default function Configurator({ cat, me, draft, goQuotes }) {
  const byId = (list, id) => list.find(x => x.ID === id);
  const extraById = useMemo(() => Object.fromEntries(cat.extras.map(e => [e.ID, e])), [cat.extras]);

  const [step, setStep] = useState(0);
  const [cfg, setCfg] = useState(() => ({ ...defaultConfig(cat), ...(draft?.config || {}) }));
  const [party, setParty] = useState(() => ({ company: draft?.company || '', reference: draft?.reference || '', notes: draft?.notes || '' }));
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);

  const type = byId(cat.headTypes, cfg.headTypeId), mat = byId(cat.materials, cfg.materialId);
  const code = byId(cat.codes, cfg.codeId), finish = byId(cat.finishes, cfg.finishId);

  // Keep the selection consistent when the material or finish changes, and say what changed
  const settle = c => {
    const m = byId(cat.materials, c.materialId), msgs = [];
    const f = byId(cat.finishes, c.finishId);
    if (!fits(f, m.family)) {
      const nf = cat.finishes.find(x => x.active && fits(x, m.family));
      msgs.push(`${f.name} is not offered on ${FAMILY[m.family].toLowerCase()}, so the finish is now ${nf.name}`);
      c.finishId = nf.ID;
    }
    const h = byId(cat.heatTreatments, c.htId);
    if (!fits(h, m.family)) { c.htId = cat.heatTreatments.find(x => fits(x, m.family)).ID; msgs.push(`${h.name} removed (not used for ${FAMILY[m.family].toLowerCase()})`); }
    const cd = byId(cat.codes, c.codeId);
    if (cd.requiresCodeMaterial && !m.codeApproved) {
      const nc = cat.codes.find(x => !x.requiresCodeMaterial);
      msgs.push(`${m.name} is not a pressure-vessel grade, so the design code is now ${nc.name}`); c.codeId = nc.ID;
    }
    const gone = c.extraIds.filter(id => !extraById[id] || !fits(extraById[id], m.family));
    if (gone.length) { c.extraIds = c.extraIds.filter(id => !gone.includes(id)); msgs.push(`Removed ${gone.map(id => extraById[id]?.name).join(', ')} (does not apply)`); }
    const nf = byId(cat.finishes, c.finishId);
    if (nf.needsColour && !c.colourId) c.colourId = (cat.colours.find(x => x.ID === 'RAL7035') || cat.colours[0])?.ID || null;   // light grey, the usual shop primer colour
    if (!nf.needsColour) c.colourId = null;
    return [c, msgs];
  };
  const set = patch => {
    const [next, msgs] = settle({ ...cfg, ...patch });
    setCfg(next); if (msgs.length) setNote(msgs.join('. '));
  };

  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(''), 5000); return () => clearTimeout(t); }, [note]);

  // The backend does all engineering and pricing; it answers with issues instead of failing
  const key = JSON.stringify(cfg);
  useEffect(() => {
    let live = true; setSaved(null);
    const t = setTimeout(() => api.calculate(clean(cfg))
      .then(b => { if (live) { setRes(b); setErr(''); } })
      .catch(e => live && setErr(e.message)), 250);
    return () => { live = false; clearTimeout(t); };
  }, [key]);

  const spec = res?.spec;
  const issuesFor = f => (res?.issues || []).filter(i => i.field === f);
  const Issues = ({ f }) => issuesFor(f).map(i => <p key={i.message} className="field-issue" role="alert">{i.message}</p>);
  const shown = useCountUp(res?.total ?? 0);

  // ---- Extras and their rules ----
  const auto = new Set(res?.autoExtras || []);
  const welded = !!spec?.seams;
  const picked = id => cfg.extraIds.includes(id) || auto.has(id);
  const other = (r, id) => (r.extra_ID === id ? r.target_ID : r.extra_ID);
  const extraStatus = e => {
    if (auto.has(e.ID)) return { state: 'auto', why: `Required by ${code.name} because the blank is welded` };
    if (cfg.extraIds.includes(e.ID)) return { state: 'on' };
    if (e.weldedOnly && !welded) return { state: 'blocked', why: 'Only needed when the blank is welded from plates' };
    const clash = cat.rules.find(r => r.ruleType === 'EXCLUDES' && (r.extra_ID === e.ID || r.target_ID === e.ID) && picked(other(r, e.ID)));
    if (clash) return { state: 'blocked', why: clash.reason };
    const needs = cat.rules.filter(r => r.ruleType === 'REQUIRES' && r.extra_ID === e.ID && !picked(r.target_ID)).map(r => extraById[r.target_ID]).filter(Boolean);
    return needs.length ? { state: 'needs', needs } : { state: 'ok' };
  };
  const deal = e => {
    const r = cat.rules.find(r => r.ruleType === 'DISCOUNT' && (r.extra_ID === e.ID || r.target_ID === e.ID));
    if (!r) return '';
    const p = extraById[other(r, e.ID)];
    return picked(e.ID) && picked(p.ID) ? `Package saving of ${inr(r.amount)} applied` : `Save ${inr(r.amount)} with ${p.name}`;
  };
  const toggleExtra = e => {
    const st = extraStatus(e);
    if (st.state === 'blocked' || st.state === 'auto') return;
    let ids = [...cfg.extraIds], msg = '';
    if (st.state === 'on') {
      ids = ids.filter(id => id !== e.ID);
      const dependents = cat.rules.filter(r => r.ruleType === 'REQUIRES' && r.target_ID === e.ID && ids.includes(r.extra_ID)).map(r => r.extra_ID);
      if (dependents.length) { ids = ids.filter(id => !dependents.includes(id)); msg = `Also removed ${dependents.map(id => extraById[id].name).join(', ')} because it needs ${e.name}`; }
    } else {
      if (st.state === 'needs') { st.needs.forEach(n => ids.push(n.ID)); msg = `Added ${st.needs.map(n => n.name).join(' and ')} because ${e.name} needs it`; }
      ids.push(e.ID);
    }
    set({ extraIds: [...new Set(ids)] }); if (msg) setNote(msg);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.saveQuote({ config: clean(cfg), ...party });
      setSaved({ ...res, ...party, quoteNo: r.quoteNo, validUntil: r.validUntil, customer: me.user, createdAt: new Date().toISOString() });
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const plates = pipes(cat.setting.plateThicknesses).filter(p => p >= mat.minThk && p <= mat.maxThk);
  const groups = [...new Set(cat.extras.filter(e => e.active && fits(e, mat.family)).map(e => e.groupName))];
  const families = cat.heatTreatments.filter(h => fits(h, mat.family));
  const autoHt = res?.autoHeatTreatment;
  const knuckleAbove = Number(cat.setting.coneKnuckleAbove);

  return (
    <div className="cfg">
      <div className="cfg-main">
        <section className="stage">
          <div className="stage-head">
            <div><h2>{type.name}</h2><p>{type.code} · {mat.name} · {code.name}</p></div>
            {note && <div className="note" role="status">{note}</div>}
          </div>
          <HeadArt outer={res?.profile?.outer} spec={spec} look={finish.look} family={mat.family} hex={spec?.colourHex} />
          {spec && <div className="figures">
            <div><span>Weight / head</span><b>{num(spec.unitKg, 1)} kg</b></div>
            <div><span>Plate</span><b>{spec.plateThk} mm</b></div>
            <div><span>Inside depth</span><b>{num(spec.depth)} mm</b></div>
            <div><span>Blank</span><b>Ø{num(spec.blankDia)}{spec.seams ? ` · ${spec.seams + 1} pcs` : ''}</b></div>
            <div><span>Capacity</span><b>{num(spec.capacityL)} L</b></div>
            <div><span>Fibre elongation</span><b>{spec.elongationPct}%</b></div>
          </div>}
        </section>

        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s}><button className={step === i ? 'on' : i < step ? 'done' : ''} onClick={() => setStep(i)}><b>{i + 1}</b>{s}</button></li>
          ))}
        </ol>

        {step === 0 && (
          <section className="panel">
            <h3>Head type</h3>
            <div className="cards">
              {cat.headTypes.filter(h => h.active).map(h => (
                <button key={h.ID} className={'card-opt' + (h.ID === cfg.headTypeId ? ' on' : '')} onClick={() => set({ headTypeId: h.ID })} aria-pressed={h.ID === cfg.headTypeId}>
                  <HeadIcon kind={h.kind} /><strong>{h.name}</strong><span className="code">{h.code}</span>
                  <em>{h.description}</em><small>Ø{num(h.minDia)} to {num(h.maxDia)} mm</small>
                </button>
              ))}
            </div>
            <div className="fields">
              <label className="field wide">Diameter (mm)
                <span className="row">
                  <Seg label="Diameter basis" value={cfg.diaBasis} options={[['ID', 'Inside (ID)'], ['OD', 'Outside (OD)']]} onChange={v => set({ diaBasis: v })} />
                  <input type="number" min={type.minDia} max={type.maxDia} step="10" value={cfg.diameter ?? ''} onChange={e => set({ diameter: e.target.value === '' ? '' : +e.target.value })} />
                </span>
                <Issues f="diameter" />
              </label>
              <label className="field">Straight flange (mm)
                <select value={cfg.sf} onChange={e => set({ sf: +e.target.value })}>{pipes(cat.setting.sfOptions).map(s => <option key={s} value={s}>{s} mm</option>)}</select>
                <Issues f="sf" />
              </label>
              <label className="field">Quantity (heads)
                <input type="number" min="1" max={cat.setting.maxQty} value={cfg.qty ?? ''} onChange={e => set({ qty: e.target.value === '' ? '' : Math.round(+e.target.value) })} />
                <Issues f="qty" />
              </label>
              {type.kind === 'CONE' && <>
                <div className="field wide">Cone angle (half apex)
                  <span className="row chips">
                    {pipes(type.coneAngles).map(a => <button key={a} type="button" className={'chip' + (cfg.coneAngle === a ? ' on' : '')} aria-pressed={cfg.coneAngle === a} onClick={() => set({ coneAngle: a })}>{a}°</button>)}
                  </span>
                  <small className="muted">Steeper angles empty hoppers better. Above {knuckleAbove}° a knuckle is formed at the rim.</small>
                </div>
                <label className="field">Outlet diameter (mm)
                  <input type="number" min="0" step="10" value={cfg.outletDia ?? ''} onChange={e => set({ outletDia: e.target.value === '' ? '' : +e.target.value })} />
                  <small className="muted">0 = closed apex</small>
                </label>
                <div className="field wide"><Issues f="cone" /></div>
              </>}
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="panel">
            <h3>Material</h3>
            <div className="cards">
              {cat.materials.filter(m => m.active).map(m => (
                <button key={m.ID} className={'card-opt' + (m.ID === cfg.materialId ? ' on' : '')} onClick={() => set({ materialId: m.ID })} aria-pressed={m.ID === cfg.materialId}>
                  <i className={'swatch-mat ' + m.family} /><strong>{m.name}</strong><span className="code">{FAMILY[m.family]}</span>
                  <em>{m.description}</em>
                  <small>{m.minThk} to {m.maxThk} mm · {m.codeApproved ? 'Pressure-vessel grade' : 'Non-pressure only'} · about {m.leadDays} days to procure</small>
                </button>
              ))}
            </div>
            <h3>Design code</h3>
            <div className="cards small">
              {cat.codes.map(c => {
                const blocked = c.requiresCodeMaterial && !mat.codeApproved;
                return (
                  <button key={c.ID} className={'card-opt' + (c.ID === cfg.codeId ? ' on' : '')} disabled={blocked} onClick={() => set({ codeId: c.ID })} aria-pressed={c.ID === cfg.codeId}>
                    <strong>{c.name}</strong><em className={blocked ? 'why' : ''}>{blocked ? `Needs a pressure-vessel grade, not ${mat.name}` : c.rtOnWelds ? 'Radiography on welded blanks, code documentation' : 'No code documentation'}</em>
                  </button>
                );
              })}
            </div>
            <Issues f="code" />
            <h3>Thickness</h3>
            <div className="fields">
              <div className="field wide">
                <Seg label="Thickness basis" value={cfg.thkBasis} options={[['MIN', 'Minimum after forming'], ['NOM', 'Nominal plate']]}
                  onChange={v => set({ thkBasis: v, thickness: v === 'NOM' ? (res?.plateThk || plates.find(p => p >= cfg.thickness) || plates[0]) : cfg.thickness })} />
                <span className="row">
                  {cfg.thkBasis === 'MIN'
                    ? <input type="number" min="1" step="0.5" value={cfg.thickness ?? ''} aria-label="Minimum thickness after forming (mm)" onChange={e => set({ thickness: e.target.value === '' ? '' : +e.target.value })} />
                    : <select value={cfg.thickness} aria-label="Plate thickness" onChange={e => set({ thickness: +e.target.value })}>{plates.map(p => <option key={p} value={p}>{p} mm</option>)}</select>}
                  <span className="muted">mm</span>
                </span>
                {spec && <p className="calc">
                  {cfg.thkBasis === 'MIN' ? `Forming thins this head by about ${type.thinningPct}%, so it is formed from a ` : 'Formed from a '}
                  <b>{spec.plateThk} mm plate</b>, about <b>{spec.minAfterForming} mm</b> after forming · D/t {spec.dt}
                </p>}
                <Issues f="thickness" />
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="panel">
            <h3>Edge preparation</h3>
            <div className="cards small">
              {cat.edges.map(e => {
                const blocked = res?.plateThk && res.plateThk < e.minThk;
                return (
                  <button key={e.ID} className={'card-opt' + (e.ID === cfg.edgeId ? ' on' : '')} disabled={blocked} onClick={() => set({ edgeId: e.ID })} aria-pressed={e.ID === cfg.edgeId}>
                    <strong>{e.name}</strong><em className={blocked ? 'why' : ''}>{blocked ? `Needs ${e.minThk} mm or thicker` : e.angle ? `Ready for the shell weld, ${e.angle}°` : 'Plain edge'}</em>
                  </button>
                );
              })}
            </div>
            <Issues f="edge" />
            <h3>Surface finish</h3>
            <div className="cards small">
              {cat.finishes.filter(f => f.active && fits(f, mat.family)).map(f => (
                <button key={f.ID} className={'card-opt' + (f.ID === cfg.finishId ? ' on' : '')} onClick={() => set({ finishId: f.ID })} aria-pressed={f.ID === cfg.finishId}>
                  <strong>{f.name}</strong><em>{f.description}</em>
                </button>
              ))}
            </div>
            {finish.needsColour && <>
              <h3>Paint colour</h3>
              <div className="colours">
                {cat.colours.map(c => (
                  <button key={c.ID} className={'colour' + (c.ID === cfg.colourId ? ' on' : '')} onClick={() => set({ colourId: c.ID })} aria-pressed={c.ID === cfg.colourId}>
                    <i style={{ background: c.hex }} /><strong>{c.ID.replace('RAL', 'RAL ')}</strong><span>{c.name}</span>
                  </button>
                ))}
              </div>
              <Issues f="colour" />
            </>}
            <Issues f="finish" />
            <h3>Heat treatment</h3>
            {spec && <p className="calc">Fibre elongation from forming: <b>{spec.elongationPct}%</b>{mat.family === 'CS' ? ` (limit ${cat.setting.csElongationLimit}% for carbon steel)` : ''}</p>}
            <div className="cards small">
              {families.map(h => {
                // The server adds a treatment when forming strain needs one; show that as the selection
                const isAuto = autoHt === h.ID, on = autoHt ? isAuto : h.ID === cfg.htId;
                const blocked = autoHt && h.ID === 'none';
                return (
                  <button key={h.ID} className={'card-opt' + (on ? ' on' : '')} disabled={blocked} onClick={() => set({ htId: h.ID })} aria-pressed={on}>
                    <strong>{h.name}{isAuto && <span className="req">Required</span>}</strong>
                    <em className={blocked ? 'why' : ''}>{blocked ? 'Not allowed: forming strain is above the code limit' : h.description}</em>
                  </button>
                );
              })}
            </div>
            <Issues f="ht" />
            {groups.map(g => (
              <div key={g} className="group">
                <h3>{g}</h3>
                <div className="optlist">
                  {cat.extras.filter(e => e.active && e.groupName === g && fits(e, mat.family)).map(e => {
                    const st = extraStatus(e), on = st.state === 'on' || st.state === 'auto', blocked = st.state === 'blocked';
                    const hint = st.state === 'auto' || blocked ? st.why : st.state === 'needs' ? `Also adds ${st.needs.map(n => n.name).join(', ')}` : e.description;
                    const d = !blocked && deal(e);
                    return (
                      <button key={e.ID} className={'opt' + (on ? ' on' : '') + (blocked ? ' blocked' : '') + (st.state === 'auto' ? ' std' : '')} disabled={blocked || st.state === 'auto'}
                        onClick={() => toggleExtra(e)} role="switch" aria-checked={on}>
                        <span className="sw"><span /></span>
                        <span className="txt"><strong>{e.name}</strong><em className={blocked ? 'why' : ''}>{hint}</em>{d && <em className="deal">{d}</em>}</span>
                        <span className="pr">{st.state === 'auto' ? 'Required' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <Issues f="extras" />
          </section>
        )}

        {step === 3 && (
          <section className="panel">
            <h3>Delivery</h3>
            <div className="cards small">
              {cat.zones.map(z => (
                <button key={z.ID} className={'card-opt' + (z.ID === cfg.zoneId ? ' on' : '')} onClick={() => set({ zoneId: z.ID })} aria-pressed={z.ID === cfg.zoneId}>
                  <strong>{z.name}</strong><em>{z.transitDays ? `About ${z.transitDays} day${z.transitDays > 1 ? 's' : ''} in transit` : 'No freight charge'}</em>
                </button>
              ))}
            </div>
            <h3>Payment terms</h3>
            <div className="cards small">
              {cat.terms.map(t => (
                <button key={t.ID} className={'card-opt' + (t.ID === cfg.termsId ? ' on' : '')} onClick={() => set({ termsId: t.ID })} aria-pressed={t.ID === cfg.termsId}>
                  <strong>{t.name}</strong><em>{t.adjustPct < 0 ? `${-t.adjustPct}% off the price` : t.adjustPct > 0 ? `${t.adjustPct}% finance charge` : 'Standard price'}</em>
                </button>
              ))}
            </div>
            <h3>Your details</h3>
            <div className="fields">
              <label className="field">Company<input value={party.company} maxLength="80" onChange={e => setParty({ ...party, company: e.target.value })} placeholder="Company name" /></label>
              <label className="field">Your reference<input value={party.reference} maxLength="60" onChange={e => setParty({ ...party, reference: e.target.value })} placeholder="Enquiry or tag no." /></label>
              <label className="field wide">Notes for our team<textarea value={party.notes} maxLength="300" rows="3" onChange={e => setParty({ ...party, notes: e.target.value })} placeholder="Drawing number, nozzle positions, delivery window…" /></label>
            </div>
            {res?.spec && <div className="lead">
              <div><span>Ready to dispatch</span><b>about {res.dispatchDays} working days</b><small>after order and advance</small></div>
              <div><span>Delivered</span><b>about {res.deliveryDays} working days</b><small>{res.freightDetail}</small></div>
            </div>}
          </section>
        )}

        <div className="nav">
          <button className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {step < 3 && <button className="btn primary" onClick={() => setStep(step + 1)}>Continue</button>}
        </div>
      </div>

      <aside className="sheet">
        {res ? <>
          <h3>{res.spec ? `${res.spec.headCode} · ${res.spec.material}` : type.name}</h3>
          <p className="sub">{res.spec ? `${res.spec.diaBasis} ${num(res.spec.diameter)} × ${res.spec.plateThk} mm · Qty ${res.spec.qty} · ${num(res.spec.totalKg)} kg` : 'Fix the items below to see a price'}</p>
          {res.spec && <>
            <dl>
              {Object.entries(res.lines.reduce((g, l) => ({ ...g, [l.group]: [...(g[l.group] || []), l] }), {})).map(([g, ls]) => (
                <div key={g} className="grp">
                  <div className="sep"><dt>{g}</dt></div>
                  {ls.map(l => <div key={l.name} className={'opt-line' + (l.amount < 0 ? ' deal' : '')}><dt title={l.detail}>{l.name}</dt><dd>{l.amount < 0 ? '−' + inr(-l.amount) : inr(l.amount)}</dd></div>)}
                </div>
              ))}
              {res.discount > 0 && <div className="opt-line deal"><dt>Quantity discount ({res.qtyDiscountPct}% on conversion)</dt><dd>−{inr(res.discount)}</dd></div>}
              {res.paymentAdjust !== 0 && <div className={'opt-line' + (res.paymentAdjust < 0 ? ' deal' : '')}><dt>{res.paymentAdjust < 0 ? 'Early payment discount' : 'Finance charge'} ({Math.abs(res.paymentAdjustPct)}%)</dt><dd>{res.paymentAdjust < 0 ? '−' + inr(-res.paymentAdjust) : inr(res.paymentAdjust)}</dd></div>}
              <div className="sum"><dt>Price ex-GST · {inr(res.unitPrice)} per head</dt><dd>{inr(res.subtotal)}</dd></div>
              <div><dt>Freight</dt><dd>{res.freight ? inr(res.freight) : 'Ex-works'}</dd></div>
              {res.gstMode === 'IGST'
                ? <div><dt>IGST ({res.gstPct}%)</dt><dd>{inr(res.igst)}</dd></div>
                : <><div><dt>CGST ({res.gstPct / 2}%)</dt><dd>{inr(res.cgst)}</dd></div><div><dt>SGST ({res.gstPct / 2}%)</dt><dd>{inr(res.sgst)}</dd></div></>}
            </dl>
            <div className="total"><span>Quotation total</span><strong>{inr(shown)}</strong></div>
            {res.advancePct > 0 && <p className="adv">Advance {res.advancePct}%: <b>{inr(res.advance)}</b> · dispatch in about {res.dispatchDays} working days</p>}
            {me.admin && res.cost != null && <p className="adv internal">Internal: cost {inr(res.cost)} · margin {res.marginPct}% of price</p>}
          </>}
          {res.issues.length > 0 && <ul className="msgs bad">{res.issues.map(i => <li key={i.message}>{i.message}</li>)}</ul>}
          {res.notices.length > 0 && <ul className="msgs info">{res.notices.map(n => <li key={n}>{n}</li>)}</ul>}
          {res.warnings.length > 0 && <ul className="msgs warn">{res.warnings.map(n => <li key={n}>{n}</li>)}</ul>}
          {err && <div className="alert dark" role="alert">{err}</div>}
          {!saved ? (
            step === 3
              ? <button className="btn accent" onClick={save} disabled={saving || !res.valid || !!err}>{saving ? 'Saving…' : 'Get quotation'}</button>
              : <button className="btn accent" onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1]}</button>
          ) : (
            <div className="saved">
              <p>Quotation <b>{saved.quoteNo}</b> · valid until {new Date(saved.validUntil).toLocaleDateString('en-IN')}</p>
              <button className="btn accent" onClick={() => downloadQuotePdf(saved)}>Download PDF</button>
              <button className="btn outline" onClick={goQuotes}>View my quotes</button>
            </div>
          )}
        </> : <p className="sub">{err || 'Calculating…'}</p>}
      </aside>
    </div>
  );
}
