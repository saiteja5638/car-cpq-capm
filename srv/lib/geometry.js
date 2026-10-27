// Head geometry. Every head is described by its meridian profile: points [x, z] from the
// crown (x = 0, or the cone outlet) out to the tangent line (x = D/2, z = 0). Area, volume and
// depth are integrated from that profile, so all head types share one calculation.
const { PI, sin, cos, tan, sqrt, asin, abs } = Math;
const rad = d => d * PI / 180;

/**
 * @param kind  HEMI | ELLIPSE | TORI | FLAT | CONE
 * @param D     diameter of the surface being described (inside, mean or outside), mm
 * @param p     { crownRatio, knuckleRatio, ellipseRatio, coneAngle, knuckle (mm, cones), outlet (mm, cones) }
 */
function profile(kind, D, p = {}, n = 240) {
  const a = D / 2, pts = [];
  const arc = (cx, cz, r, t0, t1, k) => {
    for (let i = 0; i <= k; i++) { const t = t0 + (t1 - t0) * i / k; pts.push([cx + r * sin(t), cz + r * cos(t)]); }
  };
  const line = (x0, z0, x1, z1, k) => { for (let i = 0; i <= k; i++) pts.push([x0 + (x1 - x0) * i / k, z0 + (z1 - z0) * i / k]); };

  switch (kind) {
    case 'HEMI': arc(0, 0, a, 0, PI / 2, n); break;
    case 'ELLIPSE': {
      const b = a / p.ellipseRatio;
      for (let i = 0; i <= n; i++) { const t = (PI / 2) * i / n; pts.push([a * sin(t), b * cos(t)]); }
      break;
    }
    case 'TORI': {
      // Crown sphere (radius R, centre on the axis) blends into a knuckle torus (radius r)
      const R = p.crownRatio * D, r = p.knuckleRatio * D;
      const c = sqrt((R - r) ** 2 - (a - r) ** 2);
      const phi = asin((a - r) / (R - r));
      arc(0, -c, R, 0, phi, n / 2);
      pts.pop();
      arc(a - r, 0, r, phi, PI / 2, n / 2);
      break;
    }
    case 'FLAT': {
      const r = p.knuckleRatio * D;
      line(0, r, a - r, r, 20); pts.pop();
      arc(a - r, 0, r, 0, PI / 2, n / 2);
      break;
    }
    case 'CONE': {
      const al = rad(p.coneAngle), r = p.knuckle || 0, ro = (p.outlet || 0) / 2;
      // Tangent point where the knuckle meets the cone (the rim itself without a knuckle)
      const px = r ? a - r + r * cos(al) : a, pz = r ? r * sin(al) : 0;
      const topZ = pz + (px - ro) / tan(al);
      line(ro, topZ, px, pz, n / 2);
      if (r) { pts.pop(); arc(a - r, 0, r, PI / 2 - al, PI / 2, n / 2); }
      break;
    }
    default: throw new Error('Unknown head kind ' + kind);
  }
  return pts;
}

// Surface area (mm2), enclosed volume (mm3) down to the tangent line, and depth (mm)
function measure(pts) {
  let area = 0, volume = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
    const xm = (x0 + x1) / 2, ds = sqrt((x1 - x0) ** 2 + (z1 - z0) ** 2);
    area += 2 * PI * xm * ds;
    // frustum slice, exact for straight segments
    volume += PI * abs(z0 - z1) * (x0 * x0 + x0 * x1 + x1 * x1) / 3;
  }
  return { area, volume, depth: pts[0][1] };
}

// Smallest forming radius of the mean surface and whether the shape is double curved.
// Used for the extreme fibre elongation check (ASME UG-79 / UCS-79).
function formingRadius(kind, Dm, p = {}) {
  const a = Dm / 2;
  switch (kind) {
    case 'HEMI': return { rf: a, double: true };
    case 'ELLIPSE': { const b = a / p.ellipseRatio; return { rf: b * b / a, double: true }; }
    case 'TORI': case 'FLAT': return { rf: p.knuckleRatio * Dm, double: true };
    case 'CONE': return p.knuckle ? { rf: p.knuckle, double: true } : { rf: a, double: false };
  }
}

// Extreme fibre elongation in %, for forming from flat plate
const fibreElongation = (t, { rf, double }) => (double ? 75 : 50) * t / rf;

// Keep roughly n points, for drawing
const thin = (pts, n = 48) => {
  const step = Math.max(1, Math.floor(pts.length / n));
  const out = pts.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
};

module.exports = { profile, measure, formingRadius, fibreElongation, thin };
