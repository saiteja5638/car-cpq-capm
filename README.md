# HeadQuote CPQ (SAP CAP + SQLite + React)

Configure, Price, Quote for a manufacturer of **formed heads** (dished ends) for pressure vessels,
tanks and hoppers. Customers specify a head and get an engineering-checked, delivered price and a PDF
quotation. The business rules, pricing model, assumptions and open questions are in
[docs/business-analysis.md](docs/business-analysis.md).

| Role | Local login | Can do |
| --- | --- | --- |
| Customer | `user` / `user` | Configure a head, see weight and price live, request a quotation, download the PDF, accept, decline or revise quotes |
| Admin | `admin` / `admin` | Maintain plate, forming, processing, freight and payment rates, rules and settings; see all quotes, win rate, tonnage and margin |

On Cloud Foundry the passwords come from `secrets.mtaext` instead (see Deploy below).

## Run locally (Node 20+)

    npm run setup          # installs backend and frontend dependencies
    npm run watch          # CAP backend on http://localhost:4004, restarts on changes
    npm test               # engine tests (geometry, rules, pricing)

    # second terminal
    npm run frontend       # React app with hot reload on http://localhost:5173  (open this one)

Or as one app, the way Cloud Foundry runs it: `npm run build:ui && npm start`, then open http://localhost:4004.
`srv/server.js` serves the built React app at `/` and the API at `/cpq`.

Locally CAP uses an in-memory SQLite database seeded from `db/data/*.csv`, so data resets on restart.
All rates in the seed data are indicative placeholders; replace them with real figures.

## Deploy to SAP BTP Cloud Foundry

One MTA with two modules and one service:

| Part | What it is |
| --- | --- |
| `car-cpq-cap-srv` | Node.js app: the CAP service at `/cpq` plus the React app at `/`, served by `srv/server.js`; health check `/health` |
| `car-cpq-cap-db-deployer` | Deploys tables, views and seed data into HANA, then stops |
| `car-cpq-cap-db` | HDI container (`hana` / `hdi-shared`) on your SAP HANA Cloud instance |

Steps (in Business Application Studio, or anywhere with `cf`, the MultiApps plugin and `mbt`):

1. Make sure your **SAP HANA Cloud instance is running**. Trial instances stop every night; start them in HANA Cloud Central.
2. `cf login` to the target org and space.
3. Set the passwords: `cp secrets.mtaext.example secrets.mtaext` and replace both `CHANGE-ME` values.
   `secrets.mtaext` is git-ignored. **The app refuses to start without passwords.**
4. Build: `npm run mta` (creates `mta_archives/car-cpq-cap_3.0.0.mtar`).
5. Deploy: `cf deploy mta_archives/car-cpq-cap_3.0.0.mtar -e secrets.mtaext`
6. Open the route of `car-cpq-cap-srv` (`cf app car-cpq-cap-srv`), for example
   `https://<org>-<space>-car-cpq-cap-srv.cfapps.<region>.hana.ondemand.com/`.

Production differences (see `cds.requires` in `package.json`):

- **Database:** SAP HANA Cloud instead of SQLite, so quotes survive restarts.
- **Users:** only `admin` and `user`, with the passwords from `secrets.mtaext`. CAP's demo users and
  wildcard login are switched off. To change a password later, edit `secrets.mtaext` and deploy again.
- **Seed data:** every deployment reloads the catalogue tables from `db/data/*.csv`, so admin edits to
  rates and settings are overwritten. Make permanent rate changes in the CSV files, or stop shipping the
  CSVs once the real data is maintained in the app. Quotes are never touched.

This login (HTTP basic authentication with two shared accounts) suits a pilot. For real customers, switch
to SAP Authorization and Trust Management (XSUAA) or SAP Cloud Identity Services with an approuter, so
each person has their own login.

## Structure

    db/schema.cds            data model: head types, materials, codes, finishes, extras, rules, zones, terms, settings, quotes
    db/data/*.csv            seed catalogue: 7 head types, 6 materials, 7 finishes, 4 heat treatments, 12 extras, 8 zones
    srv/cpq-service.cds      OData service /cpq, roles via @restrict, typed calculate / saveQuote / respondQuote
    srv/cpq-service.js       loads the catalogue, hides cost from customers, saves quotes, admin checks, analytics
    srv/server.js            custom server: React app at /, /health, production password guard
    srv/lib/geometry.js      head profiles: area, volume, depth, forming radius (one method for every head type)
    srv/lib/engine.js        engineering rules, costing, margin, discounts, freight, GST, lead time (pure, unit tested)
    test/engine.test.js      tests against the seed data
    frontend/src             React app (Vite proxies /cpq to CAP; `build:ui` writes to srv/public)
    mta.yaml                 Cloud Foundry deployment: app, HANA deployer, HDI container
    secrets.mtaext.example   template for the deploy-time passwords

## How it works

- **Configurator** (4 steps): head type and size (ID/OD, straight flange, cone angle and outlet, quantity),
  material, design code and thickness (minimum after forming or nominal plate), finish with RAL colour,
  edge preparation, heat treatment and extras, then delivery zone and payment terms.
- A **to-scale drawing** of the head and key figures (weight, plate, depth, blank, capacity, fibre elongation)
  update live. The backend returns the profile, so the drawing is the real geometry.
- The **price panel** shows every cost line, quantity and payment adjustments, freight, CGST/SGST or IGST,
  the total, the advance and the dispatch time, with blocking issues, automatic additions and advisories.
- **Rules** run on the server and are explained to the customer, e.g. heat treatment added for carbon steel
  above 5% fibre elongation, radiography for welded blanks under a pressure code, no structural steel
  under ASME, paint only on carbon steel. Admins add *needs / cannot combine / package saving* rules for extras.
- **Quotes** are snapshotted with their specification, price and drawing, valid for 7 days (a setting),
  and can be accepted, declined or revised.
- Customers never see cost rates or margin; admins see the internal cost and margin while configuring.

