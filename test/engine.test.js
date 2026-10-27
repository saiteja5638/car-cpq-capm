// Run with: npm test   (Node's built-in test runner, no extra packages)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { profile, measure } = require('../srv/lib/geometry');
const { evaluate, ConfigError } = require('../srv/lib/engine');

// ---- Load the seed CSVs as the engine's catalogue ----
const parseCsv = text => {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...data] = rows.filter(r => r.join('') !== '');
  const val = v => (v === '' ? null : v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
  return data.map(r => Object.fromEntries(head.map((h, i) => [h, val(r[i] ?? '')])));
};
const load = n => parseCsv(fs.readFileSync(path.join(__dirname, '../db/data', `cpq-${n}.csv`), 'utf8'));
const cat = {
  headTypes: load('HeadTypes'), materials: load('Materials'), codes: load('DesignCodes'), edges: load('EdgePreps'),
  finishes: load('Finishes'), colours: load('Colours'), heatTreatments: load('HeatTreatments'), extras: load('Extras'),
  rules: load('ExtraRules'), zones: load('Zones'), terms: load('PaymentTerms'),
  settings: load('Settings').map(s => ({ ...s, value: String(s.value) }))
};
const base = {
  headTypeId: 'se21', materialId: 'ss316l', codeId: 'asme', diaBasis: 'ID', diameter: 1500, thkBasis: 'MIN', thickness: 6,
  sf: 50, coneAngle: 30, outletDia: 0, qty: 1, edgeId: 'bevel30', finishId: 'mill', colourId: null, htId: 'none',
  extraIds: [], zoneId: 'telangana', termsId: 'adv30'
};
const run = (patch, opts) => evaluate({ ...base, ...patch }, cat, opts);
const messages = r => r.issues.map(i => i.message).join(' | ');

test('geometry matches textbook formulas', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) / b < 0.005, `${a} vs ${b}`);
  near(measure(profile('HEMI', 1000)).area, 2 * Math.PI * 500 ** 2);
  near(measure(profile('ELLIPSE', 1000, { ellipseRatio: 2 })).volume, Math.PI * 1000 ** 3 / 24);
  near(measure(profile('ELLIPSE', 1000, { ellipseRatio: 2 })).depth, 250);
  near(measure(profile('TORI', 1000, { crownRatio: 1, knuckleRatio: 0.06 })).depth, 1000 - Math.sqrt(940 ** 2 - 440 ** 2));
  near(measure(profile('CONE', 1000, { coneAngle: 30 })).depth, 500 / Math.tan(Math.PI / 6));
});

test('picks the next stock plate to cover forming thinning', () => {
  const r = run({});
  assert.equal(r.valid, true, messages(r));
  assert.equal(r.spec.plateThk, 8);                        // 6 / (1 - 12%) = 6.8 -> 8 mm
  assert.ok(r.spec.minAfterForming >= 6);
});

test('pressure-vessel codes need a code-approved material', () => {
  const r = run({ materialId: 'is2062' });
  assert.match(messages(r), /not certified for ASME/);
  assert.equal(run({ materialId: 'is2062', codeId: 'noncode' }).valid, true);
});

test('finishes and heat treatments must suit the material', () => {
  assert.match(messages(run({ materialId: 'sa516', finishId: 'polish320' })), /not offered on carbon steel/);
  assert.match(messages(run({ htId: 'normalize' })), /not used for stainless steel/);
  assert.match(messages(run({ materialId: 'sa516', finishId: 'epoxy' })), /Pick a paint colour/);
});

test('carbon steel over the fibre elongation limit gets heat treatment added', () => {
  const r = run({ materialId: 'sa516', headTypeId: 'fd', diameter: 1200, thickness: 20 });
  assert.ok(r.spec.elongationPct > 5);
  assert.equal(r.autoHeatTreatment, 'sr');
  assert.ok(r.lines.some(l => l.name.startsWith('Stress relieving')));
});

test('welded blanks add radiography for code work only', () => {
  const coded = run({ materialId: 'sa516', headTypeId: 'fd', diaBasis: 'OD', diameter: 3400, thickness: 20 });
  assert.ok(coded.spec.seams >= 1);
  assert.deepEqual(coded.autoExtras, ['rt']);
  const noncode = run({ materialId: 'is2062', codeId: 'noncode', headTypeId: 'fd', diaBasis: 'OD', diameter: 3400, thickness: 20 });
  assert.deepEqual(noncode.autoExtras, []);
});

test('extra rules: needs, cannot combine and package savings', () => {
  assert.match(messages(run({ extraIds: ['mtc32'] })), /needs a third-party inspector/);
  assert.match(messages(run({ extraIds: ['export', 'saddle'] })), /already includes saddles/);
  const r = run({ extraIds: ['ut', 'dpt'] });
  assert.ok(r.lines.some(l => l.amount === -2500));
});

test('size, thickness and cone limits are explained', () => {
  assert.match(messages(run({ diameter: 6000 })), /made from 300 to 5,000 mm/);
  assert.match(messages(run({ headTypeId: 'hemi', diameter: 3000, thkBasis: 'NOM', thickness: 4 })), /would wrinkle/);
  const cone = run({ headTypeId: 'cone', coneAngle: 60, outletDia: 200 });
  assert.equal(cone.valid, true, messages(cone));
  assert.ok(cone.spec.knuckle > 0);
  assert.match(messages(run({ headTypeId: 'cone', coneAngle: 50 })), /Cone angle must be one of/);
});

test('GST split, quantity tiers and payment terms', () => {
  const local = run({});
  assert.equal(local.gstMode, 'CGST_SGST');
  assert.equal(local.cgst + local.sgst, local.gst);
  assert.equal(run({ zoneId: 'gujarat' }).gstMode, 'IGST');
  const ten = run({ qty: 10 });
  assert.equal(ten.qtyDiscountPct, 7);
  assert.ok(ten.discount > 0);
  assert.ok(run({ termsId: 'adv100' }).paymentAdjust < 0);
  assert.equal(run({ zoneId: 'exworks' }).freight, 0);
});

test('cost and margin are only returned for admins', () => {
  assert.equal(run({}).cost, null);
  const a = run({}, { admin: true });
  assert.ok(a.cost > 0 && a.marginPct > 0);
});

test('unknown IDs are rejected as a bad request', () => {
  assert.throws(() => run({ materialId: 'unobtainium' }), ConfigError);
});
