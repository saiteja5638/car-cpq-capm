const cds = require('@sap/cds');
const { evaluate, ConfigError, readSettings } = require('./lib/engine');

// Internal cost fields, removed from catalogue reads for customers
const COST_FIELDS = {
  HeadTypes: ['formingRate', 'minCharge', 'setupCharge'],
  Materials: ['ratePerKg', 'formingFactor'],
  DesignCodes: ['docCharge'],
  EdgePreps: ['ratePerM'],
  Finishes: ['ratePerM2'],
  HeatTreatments: ['ratePerKg', 'minCharge'],
  Extras: ['rate'],
  Zones: ['freightPerKg', 'minFreight']
};
const INTERNAL_SETTINGS = ['marginPct', 'weldRatePerM', 'wastagePct'];
const RULE_TYPES = ['REQUIRES', 'EXCLUDES', 'DISCOUNT'];

module.exports = class CPQService extends cds.ApplicationService {
  init() {
    const db = cds.entities('cpq');
    const { Quotes } = db;

    // ---- Customers never see cost rates ----
    for (const [entity, fields] of Object.entries(COST_FIELDS))
      this.after('READ', entity, (rows, req) => {
        if (req.user.is('ADMIN')) return;
        for (const r of [].concat(rows || [])) fields.forEach(f => delete r[f]);
      });
    this.after('READ', 'Settings', (rows, req) => {
      if (req.user.is('ADMIN') || !Array.isArray(rows)) return;
      for (let i = rows.length - 1; i >= 0; i--) if (INTERNAL_SETTINGS.includes(rows[i].ID)) rows.splice(i, 1);
    });

    const loadCatalog = async () => {
      const [headTypes, materials, codes, edges, finishes, colours, heatTreatments, extras, rules, zones, terms, settings] = await Promise.all(
        ['HeadTypes', 'Materials', 'DesignCodes', 'EdgePreps', 'Finishes', 'Colours', 'HeatTreatments', 'Extras', 'ExtraRules', 'Zones', 'PaymentTerms', 'Settings']
          .map(n => SELECT.from(db[n])));
      return { headTypes, materials, codes, edges, finishes, colours, heatTreatments, extras, rules, zones, terms, settings };
    };

    // OData wants objects, the engine works with [x, z] pairs
    const forOData = b => b.profile
      ? { ...b, profile: { inner: b.profile.inner.map(([x, z]) => ({ x, z })), outer: b.profile.outer.map(([x, z]) => ({ x, z })) } }
      : b;

    const run = async (req, admin) => {
      try { return evaluate(req.data.config || {}, await loadCatalog(), { admin }); }
      catch (e) { if (e instanceof ConfigError) return req.reject(400, e.message); throw e; }
    };

    this.on('calculate', async req => {
      const b = await run(req, req.user.is('ADMIN'));
      if (!b) return;
      const { _cost, ...out } = b;
      return forOData(out);
    });

    this.on('saveQuote', async req => {
      const b = await run(req, true);
      if (!b) return;
      if (!b.valid) return req.reject(400, b.issues.map(i => i.message).join(' · ') || 'This configuration cannot be quoted');
      const { company = '', reference = '', notes = '' } = req.data;
      const S = readSettings(await SELECT.from(db.Settings));
      const year = new Date().getFullYear();
      const { n } = await SELECT.one.from(Quotes).columns('count(*) as n').where({ quoteNo: { like: `QH-${year}-%` } });
      const ID = cds.utils.uuid();
      const quoteNo = `QH-${year}-${String(n + 1).padStart(5, '0')}`;
      const validUntil = new Date(Date.now() + S.num('validityDays') * 864e5).toISOString().slice(0, 10);
      const s = b.spec;
      await INSERT.into(Quotes).entries({
        ID, quoteNo, customer: req.user.id, company: String(company).slice(0, 80), reference: String(reference).slice(0, 60),
        notes: String(notes).slice(0, 300), status: 'ISSUED', summary: b.summary,
        headType: s.headType, material: s.material, designCode: s.designCode, diameter: s.diameter, diaBasis: s.diaBasis,
        plateThk: s.plateThk, qty: s.qty, zone: b.zone, paymentTerms: b.terms,
        unitWeight: s.unitKg, totalWeight: s.totalKg, unitPrice: b.unitPrice, subtotal: b.subtotal, discount: b.discount,
        freight: b.freight, gst: b.gst, total: b.total, advance: b.advance, cost: b._cost,
        dispatchDays: b.dispatchDays, validUntil,
        // Store the effective selection (auto-added items included) so a revision starts from what was quoted
        configJson: JSON.stringify({ ...req.data.config, extraIds: b.appliedExtras, htId: b.heatTreatmentId }),
        specJson: JSON.stringify(s),
        linesJson: JSON.stringify({ lines: b.lines, discount: b.discount, qtyDiscountPct: b.qtyDiscountPct, paymentAdjust: b.paymentAdjust,
          paymentAdjustPct: b.paymentAdjustPct, subtotal: b.subtotal, freight: b.freight, freightDetail: b.freightDetail, gstMode: b.gstMode,
          gstPct: b.gstPct, cgst: b.cgst, sgst: b.sgst, igst: b.igst, advancePct: b.advancePct, deliveryDays: b.deliveryDays,
          notices: b.notices, warnings: b.warnings, profile: b.profile })
      });
      return { ID, quoteNo, validUntil };
    });

    this.on('respondQuote', async req => {
      const q = await SELECT.one.from(Quotes).where({ ID: req.data.ID });
      if (!q || q.customer !== req.user.id) return req.reject(404, 'Quote not found');
      if (q.status !== 'ISSUED') return req.reject(400, `This quote is already ${q.status.toLowerCase()}`);
      if (req.data.accept && q.validUntil < new Date().toISOString().slice(0, 10))
        return req.reject(400, 'This quote has expired. Revise it to get current prices.');
      const status = req.data.accept ? 'ACCEPTED' : 'DECLINED';
      await UPDATE(Quotes, q.ID).with({ status });
      return { status };
    });

    // ---- Admin input checks, so a bad edit cannot break quoting ----
    const positive = (req, keys) => keys.forEach(k => {
      if (req.data[k] !== undefined && req.data[k] !== null && !(Number(req.data[k]) >= 0)) req.error(400, `${k} cannot be negative`);
    });
    this.before(['CREATE', 'UPDATE'], 'HeadTypes', req => {
      positive(req, ['formingRate', 'minCharge', 'setupCharge', 'minDia', 'maxDia', 'leadDays']);
      if (req.data.thinningPct !== undefined && !(req.data.thinningPct >= 0 && req.data.thinningPct < 50)) req.error(400, 'Thinning must be between 0 and 50%');
    });
    this.before(['CREATE', 'UPDATE'], 'Materials', req => {
      positive(req, ['ratePerKg', 'density', 'minThk', 'maxThk', 'maxPlateWidth', 'leadDays']);
      if (req.data.density !== undefined && !(req.data.density > 0)) req.error(400, 'Density must be above zero');
    });
    for (const e of ['EdgePreps', 'Finishes', 'HeatTreatments', 'Extras', 'Zones', 'DesignCodes'])
      this.before(['CREATE', 'UPDATE'], e, req => positive(req, ['ratePerM', 'ratePerM2', 'ratePerKg', 'minCharge', 'rate', 'freightPerKg', 'minFreight', 'docCharge']));
    this.before('UPDATE', 'Settings', async req => {
      const row = await SELECT.one.from(db.Settings).where({ ID: req.data.ID });
      const v = String(req.data.value ?? '').trim();
      if (!v) return req.reject(400, 'A value is required');
      if (row && !/[|:]/.test(row.value) && Number.isFinite(Number(row.value)) && !Number.isFinite(Number(v))) return req.reject(400, `${row.label} must be a number`);
      req.data.value = v;
    });
    this.before('CREATE', 'ExtraRules', async req => {
      const r = req.data;
      if (!RULE_TYPES.includes(r.ruleType)) return req.reject(400, `Rule type must be one of ${RULE_TYPES.join(', ')}`);
      if (!r.extra_ID || r.extra_ID === r.target_ID) return req.reject(400, 'Pick two different extras');
      const found = await SELECT.from(db.Extras).columns('ID').where({ ID: { in: [r.extra_ID, r.target_ID] } });
      if (found.length !== 2) return req.reject(400, 'Unknown extra in rule');
      if (r.ruleType === 'DISCOUNT' && !(r.amount > 0)) return req.reject(400, 'A package saving needs an amount');
      if (r.ruleType !== 'DISCOUNT') r.amount = 0;
      if (await SELECT.one.from(db.ExtraRules).where({ ruleType: r.ruleType, extra_ID: r.extra_ID, target_ID: r.target_ID }))
        return req.reject(400, 'This rule already exists');
    });

    this.on('whoami', req => ({ user: req.user.id, admin: !!req.user.is('ADMIN') }));

    this.on('analytics', async () => {
      const quotes = await SELECT.from(Quotes);
      const tally = (rows, key, val = () => 1) => {
        const m = {};
        rows.forEach(r => { m[key(r)] = (m[key(r)] || 0) + val(r); });
        return Object.entries(m).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value);
      };
      const accepted = quotes.filter(q => q.status === 'ACCEPTED');
      const sub = quotes.reduce((s, q) => s + q.subtotal, 0);
      const costEx = quotes.reduce((s, q) => s + (q.cost - q.freight), 0);
      return {
        totalQuotes: quotes.length,
        totalValue: quotes.reduce((s, q) => s + q.total, 0),
        totalTonnes: Math.round(quotes.reduce((s, q) => s + q.totalWeight, 0) / 100) / 10,
        accepted: accepted.length,
        acceptedValue: accepted.reduce((s, q) => s + q.total, 0),
        avgMarginPct: sub ? Math.round(1000 * (sub - costEx) / sub) / 10 : 0,
        headTypes: tally(quotes, q => q.headType, q => q.qty),
        materials: tally(quotes, q => q.material, q => q.totalWeight),
        zones: tally(quotes, q => q.zone, q => q.total),
        status: tally(quotes, q => q.status === 'ISSUED' && q.validUntil < new Date().toISOString().slice(0, 10) ? 'EXPIRED' : q.status)
      };
    });

    return super.init();
  }
};
