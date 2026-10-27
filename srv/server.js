// Custom CAP server: hosts the built React app (srv/public, from `npm run build:ui`) at "/",
// next to the OData service at /cpq. One app, one URL, no CORS.
const cds = require('@sap/cds');
const express = require('express');
const path = require('path');
const fs = require('fs');

const UI = path.join(__dirname, 'public');
const INDEX = path.join(UI, 'index.html');

cds.on('bootstrap', app => {
  // Fail closed: in production a user without a password would accept any password
  if (process.env.NODE_ENV === 'production') {
    const users = cds.env.requires.auth?.users || {};
    const open = Object.entries(users).filter(([id, u]) => id !== '*' && u && typeof u === 'object' && !u.password).map(([id]) => id);
    if (users['*'] || open.length)
      throw new Error(`Refusing to start: no password set for ${open.join(', ') || 'wildcard user'}. Pass them in CDS_CONFIG (see secrets.mtaext.example).`);
  }

  app.get('/health', (_, res) => res.json({ status: 'UP' }));

  if (fs.existsSync(INDEX)) {
    app.use(express.static(UI, {
      index: 'index.html',
      // Vite fingerprints /assets, so they never change; index.html must always be fresh
      setHeaders: (res, file) => res.setHeader('Cache-Control',
        file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache')
    }));
  } else {
    cds.log('server').warn('No built UI in srv/public. Run `npm run build:ui`; the API still works.');
  }
});

// After the services are mounted: any other browser route returns the React app
cds.on('served', () => {
  if (!fs.existsSync(INDEX)) return;
  cds.app.get(/^\/(?!cpq(\/|$)|health$|assets\/).*/, (req, res, next) =>
    req.accepts('html') ? res.set('Cache-Control', 'no-cache').sendFile(INDEX) : next());
});

module.exports = cds.server;
