// Head drawings. HeadArt draws the real profile computed by the backend, to scale, with
// dimension lines. HeadIcon is a small schematic for the head-type cards.

const METAL = {
  CS: ['#9aa1a9', '#5d646c'], SS: ['#eef1f4', '#9aa3ad'], DUPLEX: ['#e6e9e4', '#99a097'], AL: ['#f2f3f5', '#b4b9c0']
};
// Surface colours by finish; MILL and POLISH depend on the material family
function surface(look, family, hex) {
  switch (look) {
    case 'PAINT': return [hex || '#cbd0cc', hex || '#cbd0cc', 0.28];
    case 'PRIMER': return ['#a4513c', '#6e2f22', 0.12];
    case 'BLAST': return ['#b4b6b6', '#7f8383', 0.06];
    case 'PICKLED': return ['#dfe2e5', '#a9b0b7', 0.1];
    case 'POLISH': return ['#ffffff', '#8e98a3', 0.6];
    default: return [...(METAL[family] || METAL.SS), family === 'CS' ? 0.1 : 0.35];
  }
}

const fmt = n => Math.round(n).toLocaleString('en-IN');

export default function HeadArt({ outer, spec, look, family, hex }) {
  if (!outer?.length || !spec) return <div className="art-empty">Enter a valid size to see the head</div>;
  const W = 520, H = 250, pad = 46;
  const rim = spec.do / 2, top = Math.max(...outer.map(p => p.z)), sf = spec.sf;
  const s = Math.min((W - pad * 2) / (2 * rim), (H - 70) / (top + sf));
  const cx = W / 2, base = 30 + top * s;                     // y of the tangent line
  const X = x => cx + x * s, Y = z => base - z * s;
  const right = outer.map(p => `${X(p.x).toFixed(1)},${Y(p.z).toFixed(1)}`);
  const left = [...outer].reverse().map(p => `${X(-p.x).toFixed(1)},${Y(p.z).toFixed(1)}`);
  const yb = Y(-sf);
  const d = `M${X(-rim)},${yb} L${left.join(' L')} L${right.join(' L')} L${X(rim)},${yb} Z`;
  const [c1, c2, shine] = surface(look, family, hex);
  const id = 'hg' + look + family;
  const dimY = yb + 22, hx = X(rim) + 24;
  const opening = outer[0].x > 0;                          // cone outlet
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="head-art" role="img" aria-label={`${spec.headType} profile drawing`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={c2} /><stop offset="0.38" stopColor={c1} /><stop offset="0.62" stopColor={c1} /><stop offset="1" stopColor={c2} />
        </linearGradient>
        <linearGradient id={id + 's'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={shine} /><stop offset="0.5" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <ellipse cx={cx} cy={yb + 4} rx={rim * s * 1.02} ry="6" fill="#0d2240" opacity="0.14" />
      <path d={d} className="paint" style={{ fill: `url(#${id})` }} stroke="#33404f" strokeWidth="1" />
      <path d={d} fill={`url(#${id}s)`} />
      <line x1={X(-rim)} x2={X(rim)} y1={Y(0)} y2={Y(0)} stroke="#33404f" strokeOpacity="0.35" strokeDasharray="4 4" />
      {opening && <ellipse cx={cx} cy={Y(outer[0].z)} rx={outer[0].x * s} ry="3" fill="#1d2733" />}
      {/* diameter */}
      <g className="dim">
        <line x1={X(-rim)} x2={X(rim)} y1={dimY} y2={dimY} />
        <line x1={X(-rim)} x2={X(-rim)} y1={yb + 4} y2={dimY + 5} /><line x1={X(rim)} x2={X(rim)} y1={yb + 4} y2={dimY + 5} />
        <text x={cx} y={dimY + 15}>{spec.diaBasis} Ø{fmt(spec.diameter)} mm</text>
        {/* overall height */}
        <line x1={hx} x2={hx} y1={Y(top)} y2={yb} />
        <line x1={hx - 5} x2={hx + 5} y1={Y(top)} y2={Y(top)} /><line x1={hx - 5} x2={hx + 5} y1={yb} y2={yb} />
        <text x={hx + 8} y={(Y(top) + yb) / 2} textAnchor="start">{fmt(spec.height)}</text>
        {/* straight flange */}
        <text x={X(-rim) - 6} y={(Y(0) + yb) / 2 + 4} textAnchor="end">SF {sf}</text>
      </g>
    </svg>
  );
}

const ICONS = {
  ELLIPSE: 'M10 44 C10 18 30 10 50 10 C70 10 90 18 90 44',
  TORI: 'M10 44 C10 34 14 30 22 28 C34 20 42 18 50 18 C58 18 66 20 78 28 C86 30 90 34 90 44',
  HEMI: 'M14 44 A36 36 0 0 1 86 44',
  CONE: 'M10 44 C10 40 12 38 16 36 L44 10 L56 10 L84 36 C88 38 90 40 90 44',
  FLAT: 'M10 44 C10 34 14 30 22 30 L78 30 C86 30 90 34 90 44'
};
export function HeadIcon({ kind }) {
  return (
    <svg viewBox="0 0 100 54" className="head-icon" aria-hidden="true">
      <path d={(ICONS[kind] || ICONS.ELLIPSE) + ' L90 52 L10 52 Z'} />
    </svg>
  );
}
