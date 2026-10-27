export const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
export const compact = n => n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : inr(n);
export const num = (n, d = 0) => (n == null ? '–' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d }));
export const FAMILY = { CS: 'Carbon steel', SS: 'Stainless steel', DUPLEX: 'Duplex stainless', AL: 'Aluminium' };
export const fits = (item, family) => !item.families || item.families.split('|').includes(family);
export const pipes = s => String(s || '').split('|').map(Number).filter(Number.isFinite);
export const today = () => new Date().toISOString().slice(0, 10);
