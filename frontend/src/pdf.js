import { jsPDF } from 'jspdf';
const rs = n => (n < 0 ? '- ' : '') + 'Rs ' + Math.abs(Math.round(n || 0)).toLocaleString('en-IN');
const n0 = (n, d = 0) => (n == null ? '-' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d }));
// jsPDF's built-in fonts have no Unicode symbols, so swap the common ones
const ascii = s => String(s ?? '').replace(/Ø/g, 'dia ').replace(/°/g, ' deg').replace(/≤/g, '<=').replace(/µ/g, 'u').replace(/ö/g, 'oe').replace(/Ü/g, 'UE').replace(/²/g, '2').replace(/[·•]/g, '-').replace(/−/g, '-').replace(/×/g, 'x');

// q: a calculate() result plus { quoteNo, createdAt, validUntil, customer, company, reference, notes }
export function downloadQuotePdf(q) {
  const d = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = d.internal.pageSize.getWidth(), H = d.internal.pageSize.getHeight(), L = 40, R = W - 40;
  const s = q.spec || {};
  const ink = () => d.setTextColor(20, 35, 59);

  d.setFillColor(13, 34, 64); d.rect(0, 0, W, 100, 'F');
  d.setTextColor(255); d.setFont('helvetica', 'bold'); d.setFontSize(22); d.text('Quotation', L, 52);
  d.setFont('helvetica', 'normal'); d.setFontSize(11); d.text(q.quoteNo || 'Draft', L, 76);
  const date = new Date(q.createdAt || Date.now());
  d.text(`Issued ${date.toDateString()}`, R, 52, { align: 'right' });
  if (q.validUntil) d.text(`Valid until ${new Date(q.validUntil).toDateString()}`, R, 76, { align: 'right' });

  let y = 128;
  const room = h => { if (y + h > H - 46) { d.addPage(); y = 56; } };
  ink(); d.setFontSize(10);
  d.text(ascii(`Prepared for ${q.company ? `${q.company} (${q.customer})` : q.customer}`), L, y);
  if (q.reference) d.text(ascii(`Your reference: ${q.reference}`), L, y + 15);
  d.setFont('helvetica', 'bold'); d.setFontSize(15); y += q.reference ? 44 : 30;
  d.text(ascii(`${s.headType} (${s.headCode})`), L, y); y += 16;
  d.setFont('helvetica', 'normal'); d.setFontSize(10); d.setTextColor(90);
  d.text(ascii(q.summary), L, y); y += 22;

  // Profile sketch, to scale, at the right of the spec table
  const outer = (q.profile?.outer || []).map(p => (Array.isArray(p) ? p : [p.x, p.z]));
  const section = (title) => { room(40); d.setFont('helvetica', 'bold'); d.setFontSize(12); ink(); d.text(title, L, y); y += 16; };
  section('Technical specification');
  const specTop = y;
  if (outer.length) {
    const rim = s.do / 2, top = Math.max(...outer.map(p => p[1])), bw = 150, bh = 80;
    const k = Math.min(bw / (2 * rim), bh / (top + s.sf));
    const cx = R - bw / 2, base = specTop + 8 + top * k;
    const pts = [...outer].reverse().map(([x, z]) => [cx - x * k, base - z * k]).concat(outer.map(([x, z]) => [cx + x * k, base - z * k]));
    d.setDrawColor(51, 64, 79); d.setLineWidth(1.2);
    d.line(cx - rim * k, base + s.sf * k, cx - rim * k, base);
    for (let i = 1; i < pts.length; i++) d.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    d.line(cx + rim * k, base, cx + rim * k, base + s.sf * k);
    d.line(cx - rim * k, base + s.sf * k, cx + rim * k, base + s.sf * k);
    d.setLineWidth(0.5); d.setFontSize(8); d.setTextColor(110);
    d.text(ascii(`${s.diaBasis} Ø${n0(s.diameter)} · height ${n0(s.height)} mm`), cx, base + s.sf * k + 12, { align: 'center' });
  }
  const specRows = [
    ['Head type', `${s.headType} (${s.headCode})`],
    ['Design code', s.designCode],
    ['Material', s.material],
    ['Diameter', `${s.diaBasis} ${n0(s.diameter)} mm (ID ${n0(s.di, 1)} / OD ${n0(s.do, 1)})`],
    ['Thickness', `${s.plateThk} mm plate, ${s.minAfterForming} mm minimum after forming`],
    ['Straight flange', `${s.sf} mm`],
    ['Inside depth / overall height', `${n0(s.depth, 1)} / ${n0(s.height, 1)} mm`],
    ...(s.kind === 'CONE' ? [['Cone', `${s.coneAngle} deg half apex${s.knuckle ? `, knuckle ${n0(s.knuckle)} mm` : ''}${s.outlet ? `, outlet ${n0(s.outlet)} mm` : ', closed apex'}`]] : []),
    ['Blank', `dia ${n0(s.blankDia)} mm${s.seams ? `, welded from ${s.seams + 1} plates` : ', single plate'}`],
    ['Weight (theoretical)', `${n0(s.unitKg, 1)} kg per head, ${n0(s.totalKg, 1)} kg total`],
    ['Capacity', `${n0(s.capacityL)} litres incl. straight flange`],
    ['Edge preparation', s.edge],
    ['Surface finish', s.colour ? `${s.finish}, ${s.colour}` : s.finish],
    ['Heat treatment', s.heatTreatment],
    ['Quantity', `${s.qty} heads`]
  ];
  d.setFont('helvetica', 'normal'); d.setFontSize(9.5);
  for (const [k, v] of specRows) {
    room(16); d.setTextColor(110); d.text(k, L, y); ink();
    const lines = d.splitTextToSize(ascii(v), (y < specTop + 110 ? R - 170 : R) - (L + 150));
    d.text(lines, L + 150, y); y += 14 * lines.length;
  }
  y += 14;

  section('Price');
  const row = (l, v, bold) => {
    room(20);
    d.setFont('helvetica', bold ? 'bold' : 'normal'); d.setFontSize(10); ink();
    d.text(ascii(l), L, y); d.text(v, R, y, { align: 'right' });
    d.setDrawColor(222, 228, 236); d.line(L, y + 6, R, y + 6); y += 19;
  };
  (q.lines || []).forEach(l => row(`${l.name}  (${l.detail})`, rs(l.amount)));
  if (q.discount > 0) row(`Quantity discount (${q.qtyDiscountPct}% on conversion)`, rs(-q.discount));
  if (q.paymentAdjust) row(`${q.paymentAdjust < 0 ? 'Early payment discount' : 'Finance charge'} (${Math.abs(q.paymentAdjustPct)}%)`, rs(q.paymentAdjust));
  row(`Price ex-GST (${rs(q.unitPrice)} per head)`, rs(q.subtotal), true);
  row(`Freight: ${q.freightDetail || ''}`, q.freight ? rs(q.freight) : 'Ex-works');
  if (q.gstMode === 'IGST') row(`IGST (${q.gstPct}%)`, rs(q.igst));
  else { row(`CGST (${q.gstPct / 2}%)`, rs(q.cgst)); row(`SGST (${q.gstPct / 2}%)`, rs(q.sgst)); }
  room(50); y += 6; d.setFillColor(236, 240, 245); d.rect(L, y - 16, R - L, 36, 'F');
  d.setFont('helvetica', 'bold'); d.setFontSize(13); ink();
  d.text('Quotation total', L + 12, y + 6); d.text(rs(q.total), R - 12, y + 6, { align: 'right' }); y += 42;

  section('Commercial terms');
  d.setFont('helvetica', 'normal'); d.setFontSize(9.5); ink();
  const terms = [
    `Payment: ${q.terms}${q.advancePct ? ` (advance ${rs(q.advance)})` : ''}.`,
    `Dispatch about ${q.dispatchDays} working days after order and advance; delivery about ${q.deliveryDays} working days.`,
    `Delivery: ${q.zone}.`,
    `Prices are valid until the date above; plate prices are re-confirmed after that.`,
    'Weights are theoretical. Dimensions and tolerances as per the design code; thickness is checked by ultrasonic gauge.',
    ...(q.notices || []), ...(q.warnings || []),
    ...(q.notes ? [`Your notes: ${q.notes}`] : [])
  ];
  for (const t of terms) {
    const lines = d.splitTextToSize(ascii('- ' + t), R - L);
    room(13 * lines.length); d.text(lines, L, y); y += 13 * lines.length + 2;
  }
  d.save(`${q.quoteNo || 'quotation'}.pdf`);
}
