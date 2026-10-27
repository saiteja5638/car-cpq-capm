// Talks to the CAP OData service. Credentials are CAP "mocked auth" users (Basic auth).
let token = sessionStorage.getItem('cpq-auth') || '';
export const hasAuth = () => !!token;
export const setAuth = (u, p) => { token = btoa(`${u}:${p}`); sessionStorage.setItem('cpq-auth', token); };
export const clearAuth = () => { token = ''; sessionStorage.removeItem('cpq-auth'); };

async function call(path, { method = 'GET', body } = {}) {
  const r = await fetch('/cpq/' + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + token, 'X-Requested-With': 'XMLHttpRequest' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (r.status === 401) throw new Error('Wrong username or password');
  if (r.status === 403) throw new Error('Your role cannot do this');
  const j = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error?.message || `Request failed (${r.status})`);
  return j;
}
const list = async p => (await call(p)).value;

export const api = {
  whoami: () => call('whoami()'),
  catalog: async () => {
    const names = ['HeadTypes', 'Materials', 'DesignCodes', 'EdgePreps', 'Finishes', 'Colours', 'HeatTreatments', 'Extras', 'ExtraRules', 'Zones', 'PaymentTerms', 'Settings'];
    const keys = ['headTypes', 'materials', 'codes', 'edges', 'finishes', 'colours', 'heatTreatments', 'extras', 'rules', 'zones', 'terms', 'settings'];
    const sets = await Promise.all(names.map(list));
    const cat = Object.fromEntries(keys.map((k, i) => [k, sets[i].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))]));
    cat.setting = Object.fromEntries(cat.settings.map(s => [s.ID, s.value]));
    return cat;
  },
  calculate: config => call('calculate', { method: 'POST', body: { config } }),
  saveQuote: b => call('saveQuote', { method: 'POST', body: b }),
  respondQuote: (ID, accept) => call('respondQuote', { method: 'POST', body: { ID, accept } }),
  quotes: () => list('Quotes?$orderby=createdAt desc'),
  analytics: () => call('analytics()'),
  patch: (set, key, body) => call(`${set}('${key}')`, { method: 'PATCH', body }),
  create: (set, body) => call(set, { method: 'POST', body }),
  remove: (set, key) => call(`${set}('${key}')`, { method: 'DELETE' })
};
