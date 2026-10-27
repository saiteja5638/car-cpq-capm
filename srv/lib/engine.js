// Configure-price-quote engine for formed heads. Pure functions: the service loads the catalogue
// and settings from the database and passes them in, so this file can be unit tested on its own.
const { profile, measure, formingRadius, fibreElongation, thin } = require('./geometry');

class ConfigError extends Error {}   // unknown IDs: a broken request, not a customer mistake

const fits = (item, mat) => !item.families || item.families.split('|').includes(mat.family);
const r0 = n => Math.round(n);
const r1 = n => Math.round(n * 10) / 10;
const fmt = n => Math.round(n).toLocaleString('en-IN');
const FAMILY = { CS: 'carbon steel', SS: 'stainless steel', DUPLEX: 'duplex', AL: 'aluminium' };

function readSettings(rows) {
  const m = Object.fromEntries(rows.map(r => [r.ID, r.value]));
  return {
    num: k => Number(m[k]),
    str: k => m[k],
    nums: k => String(m[k] || '').split('|').map(Number).filter(Number.isFinite).sort((a, b) => a - b),
    tiers: k => String(m[k] || '').split('|').map(s => s.split(':').map(Number)).filter(t => t.length === 2).sort((a, b) => a[0] - b[0])
  };
}

/**
 * cfg: { headTypeId, materialId, codeId, diaBasis 'ID'|'OD', diameter, thkBasis 'MIN'|'NOM', thickness,
 *        sf, coneAngle, outletDia, qty, edgeId, finishId, colourId, htId, extraIds[], zoneId, termsId }
 * cat: { headTypes, materials, codes, edges, finishes, colours, heatTreatments, extras, rules, zones, terms, settings }
 */
function evaluate(cfg, cat, { admin = false } = {}) {
  const S = readSettings(cat.settings);
  const need = (list, id, what) => {
    const x = list.find(i => i.ID === id);
    if (!x) throw new ConfigError(`Unknown ${what}`);
    return x;
  };
  const type = need(cat.headTypes, cfg.headTypeId, 'head type');
  const mat = need(cat.materials, cfg.materialId, 'material');
  const code = need(cat.codes, cfg.codeId, 'design code');
  const edge = need(cat.edges, cfg.edgeId, 'edge preparation');
  const finish = need(cat.finishes, cfg.finishId, 'finish');
  let ht = need(cat.heatTreatments, cfg.htId, 'heat treatment');
  const zone = need(cat.zones, cfg.zoneId, 'delivery zone');
  const terms = need(cat.terms, cfg.termsId, 'payment terms');
  const colour = finish.needsColour && cfg.colourId ? need(cat.colours, cfg.colourId, 'colour') : null;
  let extraIds = [...new Set(cfg.extraIds || [])];
  extraIds.forEach(id => need(cat.extras, id, 'extra'));

  const issues = [], warnings = [], notices = [];
  const issue = (field, message) => issues.push({ field, message });

  // ---- Basic inputs ----
  const qty = Number(cfg.qty), maxQty = S.num('maxQty');
  if (!Number.isInteger(qty) || qty < 1 || qty > maxQty) issue('qty', `Quantity must be a whole number from 1 to ${maxQty}`);
  if (!type.active) issue('type', `${type.name} heads are not being offered right now`);
  if (!mat.active) issue('material', `${mat.name} is not available right now`);

  const D = Number(cfg.diameter), basis = cfg.diaBasis === 'OD' ? 'OD' : 'ID';
  if (!(D > 0)) issue('diameter', 'Enter the diameter in mm');
  else if (D < type.minDia || D > type.maxDia) issue('diameter', `${type.name} heads are made from ${fmt(type.minDia)} to ${fmt(type.maxDia)} mm diameter`);

  // Thickness: buyers usually specify the minimum after forming; forming thins the plate, so a thicker stock plate is picked
  const plates = S.nums('plateThicknesses'), thinF = type.thinningPct / 100;
  const tIn = Number(cfg.thickness), thkBasis = cfg.thkBasis === 'NOM' ? 'NOM' : 'MIN';
  let plate = null;
  if (!(tIn > 0)) issue('thickness', 'Enter the thickness in mm');
  else if (thkBasis === 'MIN') {
    const needed = tIn / (1 - thinF);
    plate = plates.find(p => p >= needed - 1e-9) ?? null;
    if (!plate) issue('thickness', `${tIn} mm after forming needs a ${r1(needed)} mm plate, thicker than our stock (max ${plates.at(-1)} mm)`);
  } else {
    plate = plates.includes(tIn) ? tIn : null;
    if (!plate) issue('thickness', `Pick a stock plate thickness: ${plates.join(', ')} mm`);
  }
  if (plate && (plate < mat.minThk || plate > mat.maxThk)) issue('thickness', `${mat.name} is stocked from ${mat.minThk} to ${mat.maxThk} mm (this needs a ${plate} mm plate)`);

  const sfs = S.nums('sfOptions'), sf = Number(cfg.sf);
  if (!sfs.includes(sf)) issue('sf', `Straight flange must be one of ${sfs.join(', ')} mm`);
  else if (plate && sf < 3 * plate) warnings.push(`Straight flange ${sf} mm is under 3 × thickness (${3 * plate} mm). A longer flange keeps the shell weld clear of the knuckle.`);

  // Cone: half-apex angle ("bending angle") and optional outlet
  let coneAngle = null, knuckleMm = 0, outlet = 0;
  if (type.kind === 'CONE') {
    const angles = String(type.coneAngles || '').split('|').map(Number);
    coneAngle = Number(cfg.coneAngle);
    if (!angles.includes(coneAngle)) issue('cone', `Cone angle must be one of ${angles.join(', ')}°`);
    outlet = Math.max(0, Number(cfg.outletDia) || 0);
  }

  // ---- Compatibility rules ----
  if (code.requiresCodeMaterial && !mat.codeApproved) issue('code', `${mat.name} is not certified for ${code.name}. Choose a pressure-vessel grade such as SA-516 Gr. 70.`);
  if (!fits(finish, mat) || !finish.active) issue('finish', `${finish.name} is not offered on ${FAMILY[mat.family]}`);
  if (finish.needsColour && !colour) issue('colour', 'Pick a paint colour');
  if (!fits(ht, mat)) issue('ht', `${ht.name} is not used for ${FAMILY[mat.family]}`);
  if (plate && plate < edge.minThk) issue('edge', `${edge.name} needs at least ${edge.minThk} mm thickness`);

  const result = {
    valid: false, issues, warnings, notices, summary: '', spec: null, profile: null, lines: [],
    autoExtras: [], autoHeatTreatment: null, plateThk: plate
  };
  if (issues.some(i => ['diameter', 'thickness', 'cone', 'sf', 'qty'].includes(i.field)) || !plate) return result;

  // ---- Geometry ----
  const t = plate;
  const Di = basis === 'ID' ? D : D - 2 * t, Do = Di + 2 * t, Dm = Di + t;
  if (Di <= 0) { issue('diameter', 'The diameter is too small for this thickness'); return result; }
  const kp = { crownRatio: type.crownRatio, knuckleRatio: type.knuckleRatio, ellipseRatio: type.ellipseRatio, coneAngle };
  const coneKnuckle = type.kind === 'CONE' && coneAngle > S.num('coneKnuckleAbove');
  const pFor = d => (type.kind === 'CONE' ? { ...kp, knuckle: coneKnuckle ? type.knuckleRatio * d : 0, outlet } : kp);
  if (type.kind === 'CONE') {
    knuckleMm = coneKnuckle ? type.knuckleRatio * Di : 0;
    const al = coneAngle * Math.PI / 180;
    const maxOutlet = 2 * (knuckleMm ? Di / 2 - knuckleMm + knuckleMm * Math.cos(al) : Di / 2) - 50;
    if (outlet >= maxOutlet) { issue('cone', `Outlet must be smaller than ${fmt(maxOutlet)} mm`); return result; }
    if (coneKnuckle) notices.push(`A ${fmt(knuckleMm)} mm knuckle is formed because cones over ${S.num('coneKnuckleAbove')}° need one`);
  }

  const inner = profile(type.kind, Di, pFor(Di)), outer = profile(type.kind, Do, pFor(Do));
  const mi = measure(inner), mm = measure(profile(type.kind, Dm, pFor(Dm)));
  const areaMm2 = mm.area + Math.PI * Dm * sf;                       // mean surface incl. straight flange
  const kg = areaMm2 * t * mat.density * 1e-9;
  const trim = Math.max(15, t);
  const blankDia = Math.sqrt(4 * areaMm2 / Math.PI) + 2 * trim;     // equal-area blank plus trimming allowance
  const blankKg = Math.PI / 4 * blankDia ** 2 * t * mat.density * 1e-9;
  const capacityL = (mi.volume + Math.PI / 4 * Di * Di * sf) / 1e6;
  const elong = fibreElongation(t, formingRadius(type.kind, Dm, pFor(Dm)));
  const dt = Dm / t;

  if (dt < S.num('minDt')) issue('thickness', `Too thick to form at this diameter (D/t ${r1(dt)}, minimum ${S.num('minDt')}). Use a thinner plate or a larger diameter.`);
  if (dt > S.num('maxDt')) {
    const minT = plates.find(p => Dm / p <= S.num('maxDt'));
    issue('thickness', `Too thin: the head would wrinkle (D/t ${fmt(dt)}, maximum ${S.num('maxDt')}). Use at least a ${minT ?? '-'} mm plate.`);
  }

  // Blank wider than the plate mill width: weld it from several plates
  const seams = blankDia > mat.maxPlateWidth ? Math.ceil(blankDia / mat.maxPlateWidth) - 1 : 0;
  const weldM = seams * blankDia * 0.92 / 1000;
  if (seams) notices.push(`Blank Ø${fmt(blankDia)} mm is wider than the ${fmt(mat.maxPlateWidth)} mm ${mat.name} plate, so it is welded from ${seams + 1} plates`);

  // Heat treatment rules: cold forming strains the steel
  const csLimit = S.num('csElongationLimit'), ssLimit = S.num('ssElongationLimit');
  if (mat.family === 'CS' && elong > csLimit && ht.ID === 'none') {
    ht = cat.heatTreatments.filter(h => h.ID !== 'none' && fits(h, mat)).sort((a, b) => a.sort - b.sort)[0];
    result.autoHeatTreatment = ht.ID;
    notices.push(`${ht.name} added: fibre elongation is ${r1(elong)}%, above the ${csLimit}% carbon steel limit (ASME UCS-79)`);
  }
  if ((mat.family === 'SS' || mat.family === 'DUPLEX') && elong > ssLimit && ht.ID === 'none')
    warnings.push(`Fibre elongation is ${r1(elong)}%. Solution annealing is recommended above ${ssLimit}% for ${FAMILY[mat.family]}.`);

  // Extras: availability and rules. RT is mandatory on welded blanks for code work.
  const rtExtra = cat.extras.find(e => e.weldedOnly && e.active);
  if (rtExtra) {
    if (!seams && extraIds.includes(rtExtra.ID)) { extraIds = extraIds.filter(id => id !== rtExtra.ID); notices.push(`${rtExtra.name} removed: the blank is a single plate`); }
    if (seams && code.rtOnWelds && !extraIds.includes(rtExtra.ID)) {
      extraIds.push(rtExtra.ID); result.autoExtras.push(rtExtra.ID);
      notices.push(`${rtExtra.name} added: ${code.name} requires it on welded blanks`);
    }
  }
  const extras = extraIds.map(id => cat.extras.find(e => e.ID === id));
  for (const e of extras) {
    if (!e.active) issue('extras', `${e.name} is not available right now`);
    else if (!fits(e, mat)) issue('extras', `${e.name} does not apply to ${FAMILY[mat.family]}`);
  }
  const has = id => extraIds.includes(id);
  for (const r of cat.rules) {
    if (r.ruleType === 'REQUIRES' && has(r.extra_ID) && !has(r.target_ID)) issue('extras', r.reason);
    if (r.ruleType === 'EXCLUDES' && has(r.extra_ID) && has(r.target_ID)) issue('extras', r.reason);
  }

  // ---- Costing (order totals). Customer prices = cost x (1 + margin). ----
  const m = S.num('marginPct') / 100, thkF = Math.max(1, t / 10);
  const circM = Math.PI * Do / 1000, areaM2 = areaMm2 / 1e6, totalKg = kg * qty;
  const lines = [];
  const add = (group, name, detail, cost, raw = false) => {
    if (!cost) return;
    lines.push({ group, name, detail, cost: r0(cost), amount: r0(raw ? cost : cost * (1 + m)) });
  };
  const wastage = S.num('wastagePct');
  add('Material', `${mat.name} plate`, `${qty} × ${r1(blankKg)} kg blank, ${t} mm, +${wastage}% wastage`, blankKg * (1 + wastage / 100) * mat.ratePerKg * qty);
  add('Forming', `${type.name} forming`, `${qty} × ${r1(kg)} kg finished`, Math.max(type.minCharge, kg * type.formingRate * mat.formingFactor) * qty);
  add('Forming', 'Blank seam welding', `${qty} × ${r1(weldM)} m of seam`, weldM * S.num('weldRatePerM') * thkF * mat.formingFactor * qty);
  add('Forming', 'Die setting and trials', 'Per order', type.setupCharge);
  add('Processing', edge.name, `${qty} × ${r1(circM)} m edge`, circM * edge.ratePerM * thkF * qty);
  add('Processing', finish.name + (colour ? ` (${colour.ID} ${colour.name})` : ''), `${qty} × ${r1(areaM2 * finish.sides)} m²`, areaM2 * finish.sides * finish.ratePerM2 * qty);
  if (ht.ID !== 'none') add('Processing', ht.name, `${r1(totalKg)} kg furnace load`, Math.max(ht.minCharge, totalKg * ht.ratePerKg));
  add('Testing & documents', `${code.name} documentation`, 'Per order', code.docCharge);
  const blankM2 = Math.PI / 4 * blankDia ** 2 / 1e6;
  for (const e of extras) {
    const q = { PER_HEAD: [qty, `${qty} heads`], PER_ORDER: [1, 'Per order'], PER_KG: [totalKg, `${r1(totalKg)} kg`],
      PER_M2: [blankM2 * qty, `${r1(blankM2 * qty)} m² plate`], PER_M: [circM * qty, `${r1(circM * qty)} m`],
      PER_WELD: [weldM * qty, `${r1(weldM * qty)} m seam`] }[e.basis] || [0, ''];
    add(e.groupName === 'Testing' || e.groupName === 'Documents' ? 'Testing & documents' : e.groupName, e.name, q[1], q[0] * e.rate);
  }
  for (const r of cat.rules)
    if (r.ruleType === 'DISCOUNT' && has(r.extra_ID) && has(r.target_ID) && r.amount > 0) add('Testing & documents', r.reason, 'Package saving', -r.amount, true);

  const linesTotal = lines.reduce((s, l) => s + l.amount, 0);
  const conversion = lines.filter(l => l.group !== 'Material').reduce((s, l) => s + l.amount, 0);
  const tier = S.tiers('qtyTiers').filter(([q]) => qty >= q).at(-1) || [1, 0];
  const discount = r0(conversion * tier[1] / 100);
  const payAdjust = r0((linesTotal - discount) * terms.adjustPct / 100);
  const subtotal = linesTotal - discount + payAdjust;

  // Freight with over-dimension handling (heads travel flat, so the OD is the load width)
  let freight = 0, freightDetail = 'Collected from our works';
  if (zone.freightPerKg > 0) {
    freight = Math.max(zone.minFreight, totalKg * zone.freightPerKg);
    freightDetail = `${r1(totalKg)} kg to ${zone.name}`;
    if (Do > S.num('odcDiaMm')) {
      freight += freight * S.num('odcFreightPct') / 100 + S.num('odcCharge');
      freightDetail += ', over-dimension load';
      notices.push(`Over-dimension load: OD ${fmt(Do)} mm is wider than ${fmt(S.num('odcDiaMm'))} mm, so freight includes a permit and escort`);
    }
    freight = r0(freight);
  }
  const gstPct = S.num('gstPct'), intra = zone.state === S.str('factoryState');
  const gst = r0((subtotal + freight) * gstPct / 100);
  const total = subtotal + freight + gst;

  const extraDays = Math.ceil(qty / 4) * 2 - 2;
  const dispatchDays = mat.leadDays + type.leadDays + extraDays + finish.leadDays + ht.leadDays + (seams ? 2 : 0) + (extraIds.includes('tpi') ? 2 : 0);
  const costTotal = lines.reduce((s, l) => s + l.cost, 0);

  const dims = `${basis} ${fmt(D)} × ${t} mm`;
  Object.assign(result, {
    valid: issues.length === 0,
    summary: `${type.code} · ${mat.name} · ${dims}${coneAngle ? ` · ${coneAngle}°` : ''} · Qty ${qty}`,
    spec: {
      headType: type.name, headCode: type.code, kind: type.kind, material: mat.name, family: mat.family, designCode: code.name,
      diaBasis: basis, diameter: D, di: r1(Di), do: r1(Do), plateThk: t, thkBasis, thkInput: tIn,
      minAfterForming: r1(t * (1 - thinF)), sf, depth: r1(mi.depth), height: r1(mi.depth + sf + t),
      coneAngle, knuckle: r1(knuckleMm), outlet,
      blankDia: r0(blankDia), seams, weldM: r1(weldM), unitKg: r1(kg), blankKg: r1(blankKg), totalKg: r1(totalKg),
      areaM2: r1(areaM2), capacityL: r0(capacityL), elongationPct: r1(elong), dt: r1(dt),
      edge: edge.name, bevel: edge.angle, finish: finish.name, look: finish.look, colour: colour ? `${colour.ID} ${colour.name}` : null,
      colourHex: colour?.hex || null, heatTreatment: ht.name, qty
    },
    profile: { inner: thin(inner), outer: thin(outer) },
    lines: lines.map(({ cost, ...l }) => l),
    conversion, qtyDiscountPct: tier[1], discount, paymentAdjust: payAdjust, paymentAdjustPct: terms.adjustPct,
    subtotal, unitPrice: r0(subtotal / qty), freight, freightDetail,
    gstPct, gstMode: intra ? 'CGST_SGST' : 'IGST', gst, cgst: intra ? r0(gst / 2) : 0, sgst: intra ? gst - r0(gst / 2) : 0, igst: intra ? 0 : gst,
    total, advancePct: terms.advancePct, advance: r0(total * terms.advancePct / 100),
    dispatchDays, deliveryDays: dispatchDays + zone.transitDays,
    zone: zone.name, terms: terms.name, appliedExtras: extraIds, heatTreatmentId: ht.ID,
    cost: admin ? costTotal + freight : null,
    marginPct: admin && subtotal ? r1(100 * (subtotal - costTotal) / subtotal) : null,
    _cost: costTotal + freight
  });
  return result;
}

module.exports = { evaluate, ConfigError, readSettings };
