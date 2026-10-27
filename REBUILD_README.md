# HeadQuote CPQ: complete source for rebuilding

This file holds the **entire source** of HeadQuote CPQ, a Configure, Price, Quote app for a manufacturer of
formed heads (dished ends) for pressure vessels and tanks. It is built on **SAP CAP (Node.js) + React (Vite)**,
with SQLite locally and SAP HANA Cloud on SAP BTP Cloud Foundry. Every file is reproduced in full below, so the project can be rebuilt exactly as it is,
by hand or by Claude.

## How to rebuild it with Claude

Give Claude this file and paste:

> Recreate the project described in this file in a new folder. Create every file listed under
> "Source files" at the exact path shown, with the exact content of its code block. Do not change,
> shorten or "improve" anything. Then run `npm run setup` and `npm test` (all tests must pass), start
> the backend with `npm start`, start the frontend in a second terminal with `npm run frontend`, and
> confirm the app loads at http://localhost:5173.

Each file appears as a `### path/to/file` heading followed by one fenced code block with its full content.
The code blocks are fenced with four backticks, so their content can be copied as-is.

## Not included (generated automatically)

| Left out | Recreated by |
| --- | --- |
| `node_modules/`, `frontend/node_modules/` | `npm run setup` |
| `package-lock.json`, `frontend/package-lock.json` | `npm run setup` (dependency versions may be slightly newer) |
| `gen/` (CAP / HANA build output that `mta.yaml` deploys) | `npx cds build --production` |
| `srv/public/` (built React app) | `npm run build:ui` |
| `mta_archives/` | `npm run mta` |
| `secrets.mtaext` (deploy passwords) | copy `secrets.mtaext.example` and set your own |

## Running it

- Node.js 20 or later and npm.
- `npm run setup` installs the dependencies; `npm test` runs the engine tests.
- `npm run watch` runs the CAP backend on http://localhost:4004 (in-memory SQLite seeded from `db/data/*.csv`; it resets on restart).
- `npm run frontend` runs the React app on **http://localhost:5173**. Open this one.

Local demo logins: customer `user` / `user`, admin `admin` / `admin`. In production these are replaced by
the passwords in `secrets.mtaext`.

To deploy to SAP BTP Cloud Foundry, follow "Deploy to SAP BTP Cloud Foundry" in `README.md`.

`README.md` (below) explains the app. `docs/business-analysis.md` explains the business rules, the
pricing model, the assumptions and the open questions for the manufacturer.

## Source files

### package.json

````json
{
  "name": "car-cpq-cap",
  "version": "3.0.0",
  "description": "Dished heads CPQ (configure, price, quote) - SAP CAP (Node.js) + SQLite + React",
  "dependencies": {
    "@cap-js/hana": "^2.8.3",
    "@cap-js/sqlite": "^2",
    "@sap/cds": "^9",
    "express": "^4"
  },
  "devDependencies": {
    "@sap/cds-dk": "^9"
  },
  "scripts": {
    "setup": "npm install && npm --prefix frontend install",
    "start": "cds-serve",
    "watch": "cds watch",
    "frontend": "npm --prefix frontend run dev",
    "build:ui": "npm --prefix frontend run build",
    "build": "npm run build:ui && cds build --production",
    "mta": "mbt build",
    "test": "node --test"
  },
  "cds": {
    "requires": {
      "auth": {
        "[development]": {
          "kind": "mocked",
          "users": {
            "admin": {
              "password": "admin",
              "roles": [
                "ADMIN"
              ]
            },
            "user": {
              "password": "user",
              "roles": [
                "USER"
              ]
            }
          }
        },
        "[production]": {
          "kind": "basic",
          "users": {
            "*": false,
            "admin": {
              "roles": [
                "ADMIN"
              ]
            },
            "user": {
              "roles": [
                "USER"
              ]
            }
          }
        }
      },
      "db": {
        "[production]": {
          "kind": "hana"
        }
      }
    },
    "sql": {
      "native_hana_associations": false
    }
  },
  "engines": {
    "node": ">=20"
  }
}
````

### mta.yaml

````yaml
_schema-version: 3.3.0
ID: car-cpq-cap
version: 3.0.0
description: "HeadQuote CPQ - dished heads configure, price, quote (SAP CAP + HANA Cloud + React)"
parameters:
  enable-parallel-deployments: true
build-parameters:
  before-all:
    - builder: custom
      commands:
        - npm ci
        - npm ci --prefix frontend
        - npm run build --prefix frontend   # React app -> srv/public
        - npx cds build --production        # -> gen/srv (app + UI) and gen/db (HANA artefacts + seed data)
modules:
  # CAP service + React UI, served by srv/server.js at "/"
  - name: car-cpq-cap-srv
    type: nodejs
    path: gen/srv
    parameters:
      buildpack: nodejs_buildpack
      instances: 1
      memory: 256M
      disk-quota: 1024M
      health-check-type: http
      health-check-http-endpoint: /health
    build-parameters:
      builder: npm-ci
    provides:
      - name: srv-api # required by consumers of CAP services (e.g. approuter)
        properties:
          srv-url: ${default-url}
    requires:
      - name: car-cpq-cap-db

  # Deploys tables, views and seed data into the HDI container, then stops
  - name: car-cpq-cap-db-deployer
    type: hdb
    path: gen/db
    parameters:
      buildpack: nodejs_buildpack
      memory: 256M
    requires:
      - name: car-cpq-cap-db

resources:
  - name: car-cpq-cap-db
    type: com.sap.xs.hdi-container
    parameters:
      service: hana
      service-plan: hdi-shared
````

### secrets.mtaext.example

````text
# Deploy-time secrets. Copy to secrets.mtaext (git-ignored), set strong passwords, then:
#   cf deploy mta_archives/car-cpq-cap_3.0.0.mtar -e secrets.mtaext
# The app refuses to start in production if a user has no password.
_schema-version: '3.3'
ID: car-cpq-cap.secrets
extends: car-cpq-cap
modules:
  - name: car-cpq-cap-srv
    properties:
      CDS_CONFIG: >-
        {"requires":{"auth":{"users":{
          "admin":{"password":"CHANGE-ME-admin-password"},
          "user":{"password":"CHANGE-ME-customer-password"}
        }}}}
````

### .gitignore

````text
node_modules
frontend/dist
*.sqlite
# build output
gen/
srv/public/
mta_archives/
.mta/
# deploy secrets (copy secrets.mtaext.example)
*.mtaext
````

### README.md

````markdown
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

````

### docs/business-analysis.md

````markdown
# Dished heads CPQ: business analysis

**Product:** formed heads (also called dished ends or tank heads). These are the domed or conical
end caps welded onto pressure vessels, storage tanks, reactors and silos.
**Business:** a head manufacturer that buys steel plate, cuts a circular blank, presses or spins it
into shape, and finishes, tests and delivers it.
**Goal:** let a customer specify a head and get an engineering-checked, delivered price in minutes,
instead of emailing an enquiry and waiting days for an estimator.

All rates in the seed data are **indicative placeholders** (Indian market, 2026) and must be
replaced with the manufacturer's real figures. See [Open questions](#open-questions-for-the-manufacturer).

---

## 1. Who uses it

| Role | Needs |
| --- | --- |
| Customer (fabricator, EPC contractor, OEM buyer) | Specify the head, see weight, size and price, get a PDF quotation, accept or decline it, revise it later |
| Sales / estimating (admin) | Maintain plate rates, forming and processing rates, rules and settings; see all quotes, win rate, tonnage and margin |

---

## 2. What the customer configures

| Attribute | Options | Why it matters |
| --- | --- | --- |
| Head type | Ellipsoidal 2:1, ASME F&D (torispherical 6%), Klöpper (DIN 28011), Korbbogen (DIN 28013), hemispherical, conical, flat flanged | Sets the shape, depth, forming difficulty, thinning and cost |
| Diameter | Number in mm, on an **ID** (inside) or **OD** (outside) basis | Buyers state either; mixing them up is a classic costly error |
| Straight flange (SF) | 25 / 38 / 50 / 75 / 100 mm | Cylindrical lip that is welded to the shell |
| Cone angle ("bending angle") | Half-apex angle 15° / 22.5° / 30° / 45° / 60°, plus outlet diameter | Hopper and silo bottoms; steeper angles empty better |
| Material | IS 2062 E250, SA-516 Gr. 70, SA-240 304L / 316L, Duplex 2205, Aluminium 5083 | Price per kg, density, thickness range, plate width, code approval |
| Design code | Non-code, ASME VIII-1, EN 13445, IS 2825 | Decides allowed materials, documentation and testing |
| Thickness | **Minimum after forming** (usual way to order) or nominal plate | Forming thins the plate; the system picks the plate to buy |
| Edge preparation | Square cut, single V 30°, 37.5° with root face, double V | Weld preparation for the shell joint |
| Surface finish ("colour type") | Mill, shot blast, primer, **epoxy paint with RAL colour**, pickling, inside polish 180 / 320 grit | Carbon steel is painted, stainless is pickled or polished |
| Heat treatment | None, stress relieving, normalizing, solution annealing | Some forming strains require it by code |
| Extras | UT, DPT, RT, PMI, ferrite check, 3.2 certificate, third-party inspection, dimensional report, centre opening, lifting lugs, saddle or export packing | Testing, documents, fabrication and packing add-ons |
| Quantity | 1 to 200 heads | Quantity discount, lead time |
| Delivery | Ex-works or a delivery zone (state) | Freight, transit days, and CGST + SGST versus IGST |
| Payment terms | 30% advance, 100% advance (2% off), LC 60 days (+1.5%), 30-day credit (+2%) | Price adjustment and advance amount |

**Weight and size are outputs, not inputs.** The system calculates them from the configuration:
finished weight per head, blank diameter, inside depth, overall height and capacity in litres.

---

## 3. Engineering and business rules

All rules run on the server (`srv/lib/engine.js`); the screen explains each one in plain words.

| # | Rule | Effect |
| --- | --- | --- |
| R1 | Diameter must be within the head type's range | Blocking message |
| R2 | Plate thickness = smallest stock plate ≥ minimum after forming ÷ (1 − thinning %) | Plate chosen automatically |
| R3 | Plate thickness must be within the material's stocked range | Blocking |
| R4 | D/t between 12 and 600 (too thick to press / would wrinkle) | Blocking, suggests the minimum plate |
| R5 | Pressure-vessel codes need a code-approved material (e.g. no IS 2062 for ASME) | Blocking; the screen switches the code to non-code with a note |
| R6 | Finish must suit the material family (paint only on carbon steel, polish only on stainless) | Hidden or blocked |
| R7 | Epoxy paint needs a RAL colour | Blocking until picked (defaults to RAL 7035) |
| R8 | Bevels need a minimum thickness (6 mm; double V 16 mm) | Blocked |
| R9 | Heat treatment must suit the material | Blocking |
| R10 | **Carbon steel with fibre elongation above 5% gets heat treatment** (ASME UCS-79, 75·t/Rf) | Stress relieving added and priced automatically |
| R11 | Stainless or duplex above 15% elongation | Advisory: solution annealing recommended |
| R12 | Blank wider than the plate mill width is welded from several plates | Seam welding is priced and adds 2 days |
| R13 | **Welded blank under a pressure code requires radiography (RT)** | RT added automatically; removed if the blank is a single plate |
| R14 | Cones steeper than 30° get a knuckle | Knuckle formed, shown on the drawing |
| R15 | Cone outlet must fit inside the cone | Blocking |
| R16 | Straight flange under 3 × thickness | Advisory |
| R17 | Extra rules maintained by the admin: *needs*, *cannot combine* (both ways), *package saving* | Auto-add, block or discount |
| R18 | Outside diameter above 3,200 mm is an over-dimension load | Freight surcharge + permit and escort |
| R19 | Quotes are valid for 7 days (steel prices move) | Expired quotes cannot be accepted, only revised |
| R20 | Customers never see cost rates or margin | Stripped from every catalogue read |

---

## 4. How the price is built

Every line is **cost × (1 + margin)**, except freight (at cost) and package savings.

1. **Material:** blank weight × (1 + wastage 8%) × plate rate per kg. The blank uses the equal-area method plus a trimming allowance.
2. **Forming:** finished weight × forming rate per kg for the head type × material forming factor, with a minimum per head.
3. **Blank seam welding:** only if the blank is welded.
4. **Die setting and trials:** once per order.
5. **Edge preparation:** per metre of circumference, scaled by thickness.
6. **Finish:** per m² of surface × number of sides.
7. **Heat treatment:** furnace load in kg × rate, with a minimum per order.
8. **Code documentation:** per order.
9. **Extras:** per head, per order, per kg, per m², per metre of edge or per metre of weld seam.
10. **Quantity discount** on conversion (everything except material): 3+ → 2%, 5+ → 4%, 10+ → 7%, 25+ → 10%.
11. **Payment terms** adjustment.
12. **Freight** by zone (rate per kg with a minimum), plus over-dimension charges.
13. **GST 18%:** CGST + SGST when the delivery state is the factory state (Telangana), otherwise IGST.

**Lead time** = material procurement + forming + extra batches + finish + heat treatment + seam welding + inspection, then transit.

---

## 5. Quote lifecycle

`ISSUED` (valid 7 days) → customer **accepts** (an order signal for sales) or **declines**.
After the validity date the quote shows as **expired**. Any quote can be **revised**: it reopens in
the configurator with the original selection, and a new quote number is issued at current prices.
Prices, specification, drawing and terms are snapshotted on the quote, so later rate changes never alter an issued quote.

---

## 6. Assumptions

- One factory, in Telangana (Hyderabad), which also sets the GST split.
- Heads are cold formed, then heat treated where needed. Hot forming is not modelled.
- Weights are theoretical, from the mean surface × plate thickness × density.
- Ellipsoidal heads use the exact 2:1 ellipse; torispherical heads use the crown and knuckle ratios of their standard.
- Customer prices exclude design calculations (MAWP); the customer's designer is responsible for thickness.

---

## Open questions for the manufacturer

1. **Rates:** real plate prices per kg per grade and thickness band. Do thicker plates cost more per kg?
2. **Plate stock:** which thicknesses and widths are held in stock, and which are bought to order (lead time)?
3. **Press and spinning capacity:** maximum diameter × thickness per machine. Is D/t 12 to 600 right for this shop?
4. **Thinning allowances:** actual measured thinning per head type (12% for 2:1 is typical).
5. **Petal (segmented) construction** for very large hemispherical heads: needed?
6. **Hot forming:** offered for thick carbon steel? It would replace the separate heat treatment.
7. **Tolerances and inspection:** which standard tolerances go on the quote (e.g. ASME UG-81)?
8. **Discount authority:** can sales override prices or add special discounts, and is approval needed above some limit?
9. **Credit terms:** which customers may choose 30-day credit (customer master)?
10. **Taxes and HSN code:** confirm GST 18% and the HSN code to print on quotes.
11. **ERP:** should accepted quotes create a sales order in SAP (S/4HANA), and should plate rates come from SAP?
12. **Drawings:** do customers need to upload a drawing (nozzle positions)? Today they type notes.
````

### db/schema.cds

````cds
using { cuid, managed } from '@sap/cds/common';
namespace cpq;

// Product: formed (dished) heads for pressure vessels, tanks and hoppers.
// All lengths in mm, weights in kg, money in INR.

// ---- Product catalogue ----
entity HeadTypes {
  key ID        : String(20);
  name          : String(60);
  code          : String(30);      // how buyers order it, e.g. "2:1 SE", "ASME F&D"
  kind          : String(10);      // HEMI | ELLIPSE | TORI | CONE | FLAT  (drives the geometry)
  description   : String(160);
  crownRatio    : Double;          // TORI: crown radius / D
  knuckleRatio  : Double;          // TORI, FLAT, CONE: knuckle radius / D
  ellipseRatio  : Double;          // ELLIPSE: D / (2 x depth), 2 for a 2:1 head
  coneAngles    : String(40);      // CONE: allowed half-apex angles, pipe separated
  minDia        : Integer;
  maxDia        : Integer;
  thinningPct   : Double;          // thickness lost in forming, used to pick the plate
  formingRate   : Integer;         // cost per kg of finished head
  minCharge     : Integer;         // minimum forming cost per head
  setupCharge   : Integer;         // per order (die setting, trials)
  leadDays      : Integer;
  sort          : Integer;
  active        : Boolean default true;
}

entity Materials {
  key ID         : String(20);
  name           : String(60);     // e.g. SA-240 316L
  family         : String(10);     // CS | SS | DUPLEX | AL
  description    : String(120);
  density        : Integer;        // kg/m3
  ratePerKg      : Integer;        // plate buying cost
  formingFactor  : Double;         // harder materials cost more to form
  minThk         : Integer;
  maxThk         : Integer;
  maxPlateWidth  : Integer;        // wider blanks must be welded from two or more plates
  codeApproved   : Boolean;        // allowed for pressure-vessel design codes
  leadDays       : Integer;        // procurement time
  active         : Boolean default true;
}

entity DesignCodes {
  key ID              : String(20);
  name                : String(60);
  requiresCodeMaterial: Boolean;
  rtOnWelds           : Boolean;   // radiography of blank weld seams is mandatory
  docCharge           : Integer;   // per order: code documentation and stamping
  sort                : Integer;
}

entity EdgePreps {
  key ID     : String(20);
  name       : String(60);
  angle      : Double;             // bevel angle in degrees, 0 = square cut
  ratePerM   : Integer;            // per metre of circumference at 10 mm thickness
  minThk     : Integer;
  sort       : Integer;
}

entity Finishes {
  key ID       : String(20);
  name         : String(60);
  description  : String(120);
  families     : String(40);       // pipe separated material families (empty = all)
  ratePerM2    : Integer;
  sides        : Integer;          // 1 = inside only, 2 = inside and outside
  needsColour  : Boolean;
  look         : String(10);       // MILL | BLAST | PRIMER | PAINT | PICKLED | POLISH (preview)
  leadDays     : Integer;
  sort         : Integer;
  active       : Boolean default true;
}

entity Colours {
  key ID  : String(10);            // RAL number
  name    : String(40);
  hex     : String(9);
}

entity HeatTreatments {
  key ID      : String(20);
  name        : String(60);
  description : String(120);
  families    : String(40);
  ratePerKg   : Integer;
  minCharge   : Integer;           // per order (one furnace cycle)
  leadDays    : Integer;
  sort        : Integer;
}

// Testing, documents, fabrication and packing add-ons
entity Extras {
  key ID       : String(20);
  groupName    : String(30);
  name         : String(70);
  description  : String(140);
  basis        : String(10);       // PER_HEAD | PER_ORDER | PER_KG | PER_M2 | PER_M | PER_WELD
  rate         : Integer;
  families     : String(40);
  weldedOnly   : Boolean default false;
  active       : Boolean default true;
  sort         : Integer;
}

// REQUIRES = needs target, EXCLUDES = cannot combine (both directions), DISCOUNT = per-order saving
entity ExtraRules {
  key ID   : String(30);
  extra    : Association to Extras;
  ruleType : String(10);
  target   : Association to Extras;
  amount   : Integer default 0;
  reason   : String(140);
}

// ---- Commercial ----
entity Zones {
  key ID        : String(20);
  name          : String(50);
  state         : String(40);      // GST: same state as the factory = CGST + SGST, else IGST
  freightPerKg  : Double;
  minFreight    : Integer;
  transitDays   : Integer;
  sort          : Integer;
}

entity PaymentTerms {
  key ID      : String(20);
  name        : String(60);
  advancePct  : Double;
  adjustPct   : Double;            // negative = discount for early payment
  sort        : Integer;
}

// Engineering and commercial parameters the admin can tune
entity Settings {
  key ID  : String(30);
  label   : String(80);
  value   : String(200);
  hint    : String(160);
  sort    : Integer;
}

// ---- Quotes (everything snapshotted at quoting time) ----
entity Quotes : cuid, managed {
  quoteNo       : String(20);
  customer      : String(60);
  company       : String(80);
  reference     : String(60);      // customer's enquiry / tag number
  notes         : String(300);
  status        : String(10) default 'ISSUED';   // ISSUED | ACCEPTED | DECLINED
  summary       : String(160);     // e.g. "2:1 SE · SA-240 316L · ID 1500 x 8 mm"
  headType      : String(60);
  material      : String(60);
  designCode    : String(60);
  diameter      : Double;
  diaBasis      : String(2);
  plateThk      : Double;
  qty           : Integer;
  zone          : String(50);
  paymentTerms  : String(60);
  unitWeight    : Double;
  totalWeight   : Double;
  unitPrice     : Integer;
  subtotal      : Integer;
  discount      : Integer;
  freight       : Integer;
  gst           : Integer;
  total         : Integer;
  advance       : Integer;
  cost          : Integer;         // internal, never exposed to customers
  dispatchDays  : Integer;
  validUntil    : Date;
  configJson    : LargeString;     // the selection, so a quote can be revised
  specJson      : LargeString;
  linesJson     : LargeString;
}
````

### db/data/cpq-Colours.csv

````csv
ID,name,hex
RAL7035,Light grey,#cbd0cc
RAL7032,Pebble grey,#b9b9a8
RAL5012,Light blue,#0089b6
RAL5015,Sky blue,#2271b3
RAL6011,Reseda green,#587f40
RAL3000,Flame red,#a72920
RAL1023,Traffic yellow,#f0ca00
RAL9010,Pure white,#f1ece1
RAL9005,Jet black,#1b1b1d
````

### db/data/cpq-DesignCodes.csv

````csv
ID,name,requiresCodeMaterial,rtOnWelds,docCharge,sort
noncode,Non-code (atmospheric / structural),false,false,0,1
asme,ASME Sec. VIII Div. 1,true,true,15000,2
en,EN 13445 / AD 2000,true,true,15000,3
is2825,IS 2825,true,true,8000,4
````

### db/data/cpq-EdgePreps.csv

````csv
ID,name,angle,ratePerM,minThk,sort
square,Square cut (plain edge),0,0,0,1
bevel30,Single V bevel 30°,30,450,6,2
bevel375,Single V bevel 37.5° with 2 mm root face,37.5,520,6,3
doublev,Double V (X) bevel 30°,30,850,16,4
````

### db/data/cpq-ExtraRules.csv

````csv
ID,extra_ID,ruleType,target_ID,amount,reason
x01,mtc32,REQUIRES,tpi,0,A 3.2 certificate needs a third-party inspector
x02,export,EXCLUDES,saddle,0,Export packing already includes saddles
x03,ut,DISCOUNT,dpt,2500,NDT pack: UT with DPT
x04,tpi,DISCOUNT,dimrep,3000,Inspection pack: TPI with dimensional report
````

### db/data/cpq-Extras.csv

````csv
ID,groupName,name,description,basis,rate,families,weldedOnly,active,sort
ut,Testing,Ultrasonic test of plate (UT),Lamination check of the blank,PER_M2,350,,false,true,1
dpt,Testing,Dye penetrant test of knuckle (DPT),Surface crack check after forming,PER_M,600,,false,true,2
rt,Testing,Radiography of blank weld seams (RT),Needed when the blank is welded from plates,PER_WELD,1800,,true,true,3
pmi,Testing,Positive material identification (PMI),Alloy check of every head,PER_HEAD,1500,SS|DUPLEX,false,true,4
ferrite,Testing,Ferrite content check,Confirms the duplex phase balance,PER_HEAD,1200,DUPLEX,false,true,5
mtc32,Documents,Material certificate EN 10204 3.2,Countersigned by an independent inspector,PER_ORDER,18000,,false,true,6
tpi,Documents,Third-party inspection (BV / TÜV / LRS),Inspector witnesses the final dimensional check,PER_ORDER,35000,,false,true,7
dimrep,Documents,Detailed dimensional report,Profile template and thickness map of every head,PER_HEAD,1000,,false,true,8
opening,Fabrication,Centre opening cut (nozzle / manhole),Plasma or machine cut to your drawing,PER_HEAD,3500,,false,true,9
lugs,Fabrication,Lifting lugs (pair),Welded and load tested,PER_HEAD,4500,,false,true,10
saddle,Packing,Wooden saddle packing,Protects the rim during road transport,PER_HEAD,3000,,false,true,11
export,Packing,Seaworthy export packing,Crated with VCI wrap. Includes saddles.,PER_KG,14,,false,true,12
````

### db/data/cpq-Finishes.csv

````csv
ID,name,description,families,ratePerM2,sides,needsColour,look,leadDays,sort,active
mill,Mill finish (as formed),No surface treatment,,0,1,false,MILL,0,1,true
blast,Shot blasting Sa 2.5,Both sides blasted to near-white metal,CS,220,2,false,BLAST,1,2,true
primer,Blasting + red oxide primer,Both sides blasted and primed for storage,CS,380,2,false,PRIMER,2,3,true
epoxy,Blasting + epoxy paint (2 coats),Outside painted in your RAL colour and inside primed,CS,780,2,true,PAINT,3,4,true
pickle,Pickling and passivation,Removes heat tint and restores the passive layer,SS|DUPLEX,260,2,false,PICKLED,2,5,true
polish180,Inside polish 180 grit (Ra ≤ 0.8 µm),Food and beverage grade,SS|DUPLEX,950,1,false,POLISH,4,6,true
polish320,Inside polish 320 grit (Ra ≤ 0.4 µm),Pharma and hygienic grade,SS|DUPLEX,1650,1,false,POLISH,5,7,true
````

### db/data/cpq-HeadTypes.csv

````csv
ID,name,code,kind,description,crownRatio,knuckleRatio,ellipseRatio,coneAngles,minDia,maxDia,thinningPct,formingRate,minCharge,setupCharge,leadDays,sort,active
se21,Ellipsoidal 2:1,2:1 SE,ELLIPSE,Most common pressure vessel head. Depth is a quarter of the diameter.,,,2,,300,5000,12,55,4500,15000,10,1,true
fd,Torispherical ASME F&D,ASME F&D,TORI,Flanged and dished. Crown radius = D and knuckle = 6% of D. Economical for low and medium pressure.,1,0.06,,,300,6000,10,42,3500,10000,8,2,true
klopper,Torispherical Klöpper,DIN 28011,TORI,Crown radius = D and knuckle = 10% of D. European standard for tanks and vessels.,1,0.1,,,300,6000,10,45,3500,10000,8,3,true
korbbogen,Torispherical Korbbogen,DIN 28013,TORI,Crown radius = 0.8 D and knuckle = 15.4% of D. Deeper and stronger than Klöpper.,0.8,0.154,,,300,5000,11,50,4000,12000,9,4,true
hemi,Hemispherical,HEMI,HEMI,Half sphere. Highest pressure rating and the deepest draw.,,,,,400,5000,15,85,6500,25000,15,5,true
cone,Conical,CONE,CONE,Cone for hopper and silo bottoms. Angles above 30° get a knuckle.,,0.1,,15|22.5|30|45|60,300,4000,5,48,4000,12000,9,6,true
flat,Flat flanged,FLAT,FLAT,Flat disc with a formed knuckle and straight flange. For atmospheric tanks.,,0.06,,,300,6000,3,30,2500,6000,5,7,true
````

### db/data/cpq-HeatTreatments.csv

````csv
ID,name,description,families,ratePerKg,minCharge,leadDays,sort
none,None,As formed,,0,0,0,1
sr,Stress relieving (PWHT),About 620 °C. Relieves forming stresses.,CS,18,12000,3,2
normalize,Normalizing,About 900 °C. Restores the grain structure after heavy forming.,CS,22,15000,3,3
solution,Solution annealing,About 1050 °C with water quench. Restores corrosion resistance.,SS|DUPLEX,38,20000,4,4
````

### db/data/cpq-Materials.csv

````csv
ID,name,family,description,density,ratePerKg,formingFactor,minThk,maxThk,maxPlateWidth,codeApproved,leadDays,active
is2062,IS 2062 E250 BR,CS,Structural carbon steel. Non-pressure use only.,7850,68,1,3,40,2500,false,2,true
sa516,SA-516 Gr. 70,CS,Pressure vessel carbon steel plate.,7850,92,1,6,50,3000,true,5,true
ss304l,SA-240 304L,SS,Austenitic stainless steel. General process and storage.,7930,285,1.3,3,40,2000,true,7,true
ss316l,SA-240 316L,SS,Molybdenum stainless. Chemicals and pharma/food.,7980,395,1.35,3,40,2000,true,7,true
duplex,SA-240 Duplex 2205,DUPLEX,High strength and chloride resistance.,7800,620,1.8,4,30,2000,true,21,true
al5083,Aluminium 5083 H111,AL,Light weight. Cryogenic and marine service.,2660,420,0.9,4,30,2000,true,14,true
````

### db/data/cpq-PaymentTerms.csv

````csv
ID,name,advancePct,adjustPct,sort
adv30,"30% advance, balance before dispatch",30,0,1
adv100,100% advance (2% discount),100,-2,2
lc60,Letter of credit 60 days,0,1.5,3
credit30,30 days credit (approved accounts),0,2,4
````

### db/data/cpq-Settings.csv

````csv
ID,label,value,hint,sort
marginPct,Margin on cost (%),18,Added to every cost line except freight,1
gstPct,GST (%),18,Split into CGST + SGST inside the factory state,2
factoryState,Factory state,Telangana,Decides CGST + SGST versus IGST,3
validityDays,Quote validity (days),7,Steel prices move fast; keep this short,4
wastagePct,Material wastage (%),8,Added to the blank weight when buying plate,5
plateThicknesses,Stock plate thicknesses (mm),3|4|5|6|8|10|12|14|16|18|20|22|25|28|30|32|36|40|45|50,Pipe separated,6
sfOptions,Straight flange options (mm),25|38|50|75|100,Pipe separated,7
minDt,Minimum D/t ratio,12,Below this the plate is too thick to form,8
maxDt,Maximum D/t ratio,600,Above this the head wrinkles,9
csElongationLimit,Carbon steel fibre elongation limit (%),5,Above this heat treatment is added (ASME UCS-79),10
ssElongationLimit,Stainless fibre elongation advisory (%),15,Above this solution annealing is recommended,11
coneKnuckleAbove,Cone knuckle needed above (°),30,Half-apex angles above this get a knuckle,12
weldRatePerM,Blank seam welding (per m at 10 mm),1200,Scaled by thickness and material,13
qtyTiers,Quantity discount on conversion (qty:%),1:0|3:2|5:4|10:7|25:10,Applies to all lines except material,14
maxQty,Maximum heads per quote,200,,15
odcDiaMm,Over-dimension cargo above OD (mm),3200,Wider loads need a permit and escort,16
odcCharge,Over-dimension permit and escort,25000,Per order,17
odcFreightPct,Over-dimension freight surcharge (%),40,,18
````

### db/data/cpq-Zones.csv

````csv
ID,name,state,freightPerKg,minFreight,transitDays,sort
exworks,Ex-works Hyderabad (you collect),Telangana,0,0,0,1
telangana,Telangana,Telangana,3.5,6000,1,2
ap,Andhra Pradesh,Andhra Pradesh,4.5,8000,2,3
karnataka,Karnataka,Karnataka,5.5,10000,3,4
tamilnadu,Tamil Nadu,Tamil Nadu,6,12000,3,5
maharashtra,Maharashtra,Maharashtra,6,12000,3,6
gujarat,Gujarat,Gujarat,8,15000,5,7
delhi,Delhi NCR,Delhi,9.5,18000,6,8
````

### srv/cpq-service.cds

````cds
using cpq from '../db/schema';

@path: '/cpq'
service CPQService @(requires: 'authenticated-user') {

  // Catalogue: everyone reads, only ADMIN maintains.
  // Cost rates and margin are internal: cpq-service.js strips them from customer reads.
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'ADMIN' }]
  entity HeadTypes as projection on cpq.HeadTypes;
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'ADMIN' }]
  entity Materials as projection on cpq.Materials;
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'ADMIN' }]
  entity DesignCodes as projection on cpq.DesignCodes;
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'ADMIN' }]
  entity EdgePreps as projection on cpq.EdgePreps;
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'ADMIN' }]
  entity Finishes as projection on cpq.Finishes;
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'ADMIN' }]
  entity Colours as projection on cpq.Colours;
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'ADMIN' }]
  entity HeatTreatments as projection on cpq.HeatTreatments;
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'ADMIN' }]
  entity Extras as projection on cpq.Extras;
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'ADMIN' }]
  entity ExtraRules as projection on cpq.ExtraRules;
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'ADMIN' }]
  entity Zones as projection on cpq.Zones;
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'ADMIN' }]
  entity PaymentTerms as projection on cpq.PaymentTerms;
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: 'UPDATE', to: 'ADMIN' }]
  entity Settings as projection on cpq.Settings;

  // Customers see their own quotes, admins see all. Internal cost is never exposed here.
  @readonly
  @restrict: [{ grant: 'READ', to: 'USER', where: 'customer = $user' }, { grant: 'READ', to: 'ADMIN' }]
  entity Quotes as projection on cpq.Quotes excluding { cost };

  type Config {
    headTypeId: String; materialId: String; codeId: String;
    diaBasis: String; diameter: Double;
    thkBasis: String; thickness: Double;
    sf: Integer; coneAngle: Double; outletDia: Double; qty: Integer;
    edgeId: String; finishId: String; colourId: String; htId: String;
    extraIds: many String;
    zoneId: String; termsId: String;
  }
  type Issue { field: String; message: String; }
  type Line  { group: String; name: String; detail: String; amount: Integer; }
  type Point { x: Double; z: Double; }
  type Profile { inner: many Point; outer: many Point; }
  type Spec {
    headType: String; headCode: String; kind: String; material: String; family: String; designCode: String;
    diaBasis: String; diameter: Double; di: Double; do: Double; plateThk: Double; thkBasis: String; thkInput: Double;
    minAfterForming: Double; sf: Integer; depth: Double; height: Double;
    coneAngle: Double; knuckle: Double; outlet: Double;
    blankDia: Integer; seams: Integer; weldM: Double; unitKg: Double; blankKg: Double; totalKg: Double;
    areaM2: Double; capacityL: Integer; elongationPct: Double; dt: Double;
    edge: String; bevel: Double; finish: String; look: String; colour: String; colourHex: String;
    heatTreatment: String; qty: Integer;
  }
  type Breakdown {
    valid: Boolean; issues: many Issue; warnings: many String; notices: many String;
    summary: String; spec: Spec; profile: Profile;
    lines: many Line; autoExtras: many String; autoHeatTreatment: String; plateThk: Double;
    conversion: Integer; qtyDiscountPct: Double; discount: Integer;
    paymentAdjust: Integer; paymentAdjustPct: Double; subtotal: Integer; unitPrice: Integer;
    freight: Integer; freightDetail: String;
    gstPct: Double; gstMode: String; gst: Integer; cgst: Integer; sgst: Integer; igst: Integer;
    total: Integer; advancePct: Double; advance: Integer;
    dispatchDays: Integer; deliveryDays: Integer; zone: String; terms: String;
    appliedExtras: many String; heatTreatmentId: String;
    cost: Integer; marginPct: Double;          // admin only, null for customers
  }
  type Stat      { label: String; value: Integer; }
  type Analytics {
    totalQuotes: Integer; totalValue: Integer; totalTonnes: Double;
    accepted: Integer; acceptedValue: Integer; avgMarginPct: Double;
    headTypes: many Stat; materials: many Stat; zones: many Stat; status: many Stat;
  }
  type Me { user: String; admin: Boolean; }

  action calculate(config: Config) returns Breakdown;
  action saveQuote(config: Config, company: String, reference: String, notes: String) returns { ID: String; quoteNo: String; validUntil: Date; };
  // Customer response to an issued quote
  action respondQuote(ID: String, accept: Boolean) returns { status: String; };
  function whoami() returns Me;
  @requires: 'ADMIN'
  function analytics() returns Analytics;
}
````

### srv/cpq-service.js

````js
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
````

### srv/server.js

````js
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
````

### srv/lib/engine.js

````js
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
````

### srv/lib/geometry.js

````js
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
````

### test/engine.test.js

````js
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
````

### frontend/index.html

````html
<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>HeadQuote CPQ</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
</head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>
````

### frontend/package.json

````json
{
  "name": "car-cpq-frontend",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": { "jspdf": "^2.5.1", "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.1", "vite": "^5.4.0" }
}
````

### frontend/vite.config.js

````js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Dev: /cpq calls are proxied to the CAP server, so no CORS setup is needed.
// Build: output goes to srv/public, where srv/server.js serves it at "/" (and cds build ships it to Cloud Foundry).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/cpq': 'http://localhost:4004' } },
  build: { outDir: '../srv/public', emptyOutDir: true }
});
````

### frontend/src/Admin.jsx

````jsx
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { inr, compact, num, FAMILY } from './util';

function Num({ value, onSave, step = 1 }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  return <input className="num" type="number" step={step} value={v} onChange={e => setV(e.target.value)}
    onBlur={() => { if (v !== '' && +v !== +value) onSave(+v); else setV(value ?? ''); }} />;
}
function Text({ value, onSave, wide }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  return <input className={'txt' + (wide ? ' wide' : '')} value={v} onChange={e => setV(e.target.value)}
    onBlur={() => { if (v.trim() !== (value ?? '')) onSave(v.trim()); }} />;
}
function Toggle({ on, onClick, label }) {
  return <button className={'toggle' + (on ? ' on' : '')} role="switch" aria-checked={!!on} aria-label={label} onClick={onClick}><span /></button>;
}

function Bars({ rows, fmt = v => v }) {
  if (!rows?.length) return <p className="muted">Nothing yet. Save a quote to see data here.</p>;
  const max = Math.max(...rows.map(r => r.value), 1);
  return <ul className="bars">{rows.slice(0, 6).map(r => (
    <li key={r.label}><span>{r.label}</span><div><i style={{ width: `${(r.value / max) * 100}%` }} /></div><b>{fmt(r.value)}</b></li>
  ))}</ul>;
}

// Editable table: cols = [key, label, kind ('text' | 'num' | 'bool' | 'ro'), step]
function Table({ title, set, rows, cols, save, note }) {
  return (
    <div className="card"><h3>{title}</h3>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr>{cols.map(([k, l, kind]) => <th key={k} className={kind === 'num' || kind === 'bool' ? 'r' : ''}>{l}</th>)}</tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.ID}>{cols.map(([k, l, kind, step]) => (
            <td key={k} className={kind === 'num' || kind === 'bool' ? 'r' : kind === 'ro' ? 'muted' : ''}>
              {kind === 'num' ? <Num value={r[k]} step={step} onSave={v => save(set, r.ID, { [k]: v })} />
                : kind === 'bool' ? <Toggle on={r[k]} label={`${r.name} ${l}`} onClick={() => save(set, r.ID, { [k]: !r[k] })} />
                : kind === 'text' ? <Text value={r[k]} onSave={v => save(set, r.ID, { [k]: v })} />
                : typeof kind === 'function' ? kind(r) : r[k]}
            </td>))}</tr>
        ))}</tbody>
      </table></div>
      {note && <p className="muted">{note}</p>}
    </div>
  );
}

const RULES = { REQUIRES: 'Needs', EXCLUDES: 'Cannot combine with', DISCOUNT: 'Package saving with' };

export default function Admin({ cat, reload }) {
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [flash, setFlash] = useState('');
  const [nr, setNr] = useState({ extra_ID: '', ruleType: 'REQUIRES', target_ID: '', amount: '', reason: '' });
  const timer = useRef();

  useEffect(() => { if (tab === 'overview') api.analytics().then(setStats).catch(e => say(e.message, true)); }, [tab]);
  const say = (m, bad = false) => { clearTimeout(timer.current); setFlash({ m, bad }); timer.current = setTimeout(() => setFlash(''), bad ? 4000 : 2200); };
  const act = async (fn, ok = 'Saved') => { try { await fn(); await reload(); say(ok); } catch (e) { say(e.message, true); } };
  const save = (set, key, body) => act(() => api.patch(set, key, body));
  const exName = id => cat.extras.find(e => e.ID === id)?.name || id;
  const fam = r => (r.families ? r.families.split('|').map(f => FAMILY[f] || f).join(', ') : 'All');

  const addRule = e => {
    e.preventDefault();
    const a = exName(nr.extra_ID), b = exName(nr.target_ID);
    const reason = nr.reason.trim() || (nr.ruleType === 'REQUIRES' ? `${a} needs ${b}` : nr.ruleType === 'EXCLUDES' ? `${a} cannot be combined with ${b}` : `Package: ${a} with ${b}`);
    act(async () => {
      await api.create('ExtraRules', { ID: 'x-' + Math.random().toString(36).slice(2, 9), extra_ID: nr.extra_ID, ruleType: nr.ruleType, target_ID: nr.target_ID, amount: +nr.amount || 0, reason });
      setNr({ ...nr, target_ID: '', amount: '', reason: '' });
    }, 'Rule added');
  };
  const extraPick = (value, onChange, label) => (
    <select value={value} onChange={e => onChange(e.target.value)} required aria-label={label}>
      <option value="">{label}</option>
      {cat.extras.map(x => <option key={x.ID} value={x.ID}>{x.name}</option>)}
    </select>
  );

  const TABS = [['overview', 'Overview'], ['products', 'Head types and materials'], ['processing', 'Processing'], ['extras', 'Extras and rules'], ['commercial', 'Delivery and payment'], ['settings', 'Settings']];
  return (
    <section className="page">
      <div className="page-head">
        <h2>Dashboard</h2>
        {flash && <span className={'flash' + (flash.bad ? ' bad' : '')} role="status">{flash.m}</span>}
      </div>
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'overview' && (stats ? <>
        <div className="kpis">
          <div><span>Quotes</span><b>{stats.totalQuotes}</b></div>
          <div><span>Quoted value</span><b>{compact(stats.totalValue)}</b></div>
          <div><span>Steel quoted</span><b>{num(stats.totalTonnes, 1)} t</b></div>
          <div><span>Won (accepted)</span><b>{stats.totalQuotes ? Math.round(100 * stats.accepted / stats.totalQuotes) : 0}%</b><small>{compact(stats.acceptedValue)}</small></div>
          <div><span>Average margin</span><b>{stats.avgMarginPct}%</b><small>of price, ex-freight</small></div>
        </div>
        <div className="cols">
          <div className="card"><h3>Heads quoted by type</h3><Bars rows={stats.headTypes} /></div>
          <div className="card"><h3>Weight by material (kg)</h3><Bars rows={stats.materials} fmt={v => num(v)} /></div>
          <div className="card"><h3>Value by delivery zone</h3><Bars rows={stats.zones} fmt={compact} /></div>
          <div className="card"><h3>Quote status</h3><Bars rows={stats.status} /></div>
        </div>
      </> : <p className="muted">Loading…</p>)}

      {tab === 'products' && <>
        <Table title="Head types" set="HeadTypes" rows={cat.headTypes} save={save}
          note="Forming cost per kg is multiplied by the material's forming factor. Thinning decides which plate is used for a given minimum thickness."
          cols={[['name', 'Head type', 'ro'], ['code', 'Code', 'ro'], ['minDia', 'Min Ø', 'num', 50], ['maxDia', 'Max Ø', 'num', 50], ['thinningPct', 'Thinning %', 'num', 0.5],
            ['formingRate', '₹/kg forming', 'num', 1], ['minCharge', 'Min ₹/head', 'num', 500], ['setupCharge', 'Setup ₹/order', 'num', 1000], ['leadDays', 'Days', 'num'], ['active', 'Offered', 'bool']]} />
        <Table title="Materials" set="Materials" rows={cat.materials} save={save}
          note="Update plate rates when the steel price changes; new quotes use them immediately, issued quotes keep their price."
          cols={[['name', 'Material', 'ro'], ['family', 'Family', r => FAMILY[r.family]], ['ratePerKg', '₹/kg plate', 'num', 1], ['formingFactor', 'Forming factor', 'num', 0.05],
            ['minThk', 'Min mm', 'num'], ['maxThk', 'Max mm', 'num'], ['maxPlateWidth', 'Plate width', 'num', 100], ['leadDays', 'Days', 'num'], ['codeApproved', 'Code grade', 'bool'], ['active', 'Stocked', 'bool']]} />
      </>}

      {tab === 'processing' && <>
        <Table title="Edge preparation" set="EdgePreps" rows={cat.edges} save={save} note="Rate per metre of circumference at 10 mm; thicker plates scale up."
          cols={[['name', 'Edge', 'ro'], ['angle', 'Angle °', 'num', 2.5], ['ratePerM', '₹/m', 'num', 10], ['minThk', 'Min mm', 'num']]} />
        <Table title="Surface finishes" set="Finishes" rows={cat.finishes} save={save}
          cols={[['name', 'Finish', 'ro'], ['families', 'For', fam], ['ratePerM2', '₹/m²', 'num', 10], ['sides', 'Sides', 'num'], ['leadDays', 'Days', 'num'], ['active', 'Offered', 'bool']]} />
        <Table title="Heat treatment" set="HeatTreatments" rows={cat.heatTreatments} save={save} note="Charged per order: one furnace cycle, with a minimum charge."
          cols={[['name', 'Treatment', 'ro'], ['families', 'For', fam], ['ratePerKg', '₹/kg', 'num', 1], ['minCharge', 'Min ₹/order', 'num', 1000], ['leadDays', 'Days', 'num']]} />
        <Table title="Design codes" set="DesignCodes" rows={cat.codes} save={save}
          cols={[['name', 'Code', 'ro'], ['docCharge', 'Documents ₹/order', 'num', 1000], ['requiresCodeMaterial', 'Needs code grade', 'bool'], ['rtOnWelds', 'RT on welded blanks', 'bool']]} />
      </>}

      {tab === 'extras' && <>
        <Table title="Testing, documents, fabrication and packing" set="Extras" rows={cat.extras} save={save}
          cols={[['name', 'Extra', 'ro'], ['groupName', 'Group', 'ro'], ['basis', 'Charged', r => ({ PER_HEAD: 'per head', PER_ORDER: 'per order', PER_KG: 'per kg', PER_M2: 'per m² plate', PER_M: 'per m edge', PER_WELD: 'per m seam' })[r.basis]],
            ['families', 'For', fam], ['rate', 'Rate ₹', 'num', 100], ['active', 'Offered', 'bool']]} />
        <div className="card"><h3>Extra rules</h3>
          <p className="muted">Needs: picking the extra adds the other one. Cannot combine: works both ways. Package saving: taking both lowers the price.
            Engineering rules (heat treatment, radiography of welded blanks, code grades, D/t limits) run automatically and are tuned under Settings.</p>
          <table className="tbl"><thead><tr><th>Extra</th><th>Rule</th><th>Other extra</th><th className="r">Saving</th><th>Shown to customer</th><th /></tr></thead>
            <tbody>{cat.rules.map(r => (
              <tr key={r.ID}><td>{exName(r.extra_ID)}</td><td><span className={'tag ' + r.ruleType.toLowerCase()}>{RULES[r.ruleType] || r.ruleType}</span></td>
                <td>{exName(r.target_ID)}</td><td className="r">{r.ruleType === 'DISCOUNT' ? inr(r.amount) : ''}</td><td className="muted">{r.reason}</td>
                <td className="r"><button className="btn ghost sm" onClick={() => act(() => api.remove('ExtraRules', r.ID), 'Rule removed')}>Remove</button></td></tr>
            ))}</tbody></table>
          <form className="addrow" onSubmit={addRule}>
            {extraPick(nr.extra_ID, v => setNr({ ...nr, extra_ID: v }), 'Extra')}
            <select value={nr.ruleType} onChange={e => setNr({ ...nr, ruleType: e.target.value })} aria-label="Rule type">{Object.entries(RULES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            {extraPick(nr.target_ID, v => setNr({ ...nr, target_ID: v }), 'Other extra')}
            {nr.ruleType === 'DISCOUNT' && <input type="number" placeholder="Saving ₹" min="1" value={nr.amount} onChange={e => setNr({ ...nr, amount: e.target.value })} required />}
            <input className="wide" placeholder="Message for the customer (optional)" value={nr.reason} onChange={e => setNr({ ...nr, reason: e.target.value })} />
            <button className="btn primary">Add rule</button>
          </form></div>
      </>}

      {tab === 'commercial' && <>
        <Table title="Delivery zones" set="Zones" rows={cat.zones} save={save} note="Freight is charged at cost (no margin). The zone's state decides CGST + SGST or IGST."
          cols={[['name', 'Zone', 'ro'], ['state', 'State', 'ro'], ['freightPerKg', '₹/kg', 'num', 0.5], ['minFreight', 'Minimum ₹', 'num', 1000], ['transitDays', 'Transit days', 'num']]} />
        <Table title="Payment terms" set="PaymentTerms" rows={cat.terms} save={save} note="Adjustment is applied to the price before GST. Negative = early payment discount."
          cols={[['name', 'Terms', 'ro'], ['advancePct', 'Advance %', 'num', 5], ['adjustPct', 'Adjustment %', 'num', 0.5]]} />
      </>}

      {tab === 'settings' && <div className="card"><h3>Pricing and engineering settings</h3>
        <table className="tbl"><tbody>{cat.settings.map(s => (
          <tr key={s.ID}><td><b>{s.label}</b><br /><span className="muted">{s.hint}</span></td>
            <td className="r"><Text wide value={s.value} onSave={v => save('Settings', s.ID, { value: v })} /></td></tr>
        ))}</tbody></table></div>}
    </section>
  );
}
````

### frontend/src/App.jsx

````jsx
import { useEffect, useState } from 'react';
import { api, hasAuth, setAuth, clearAuth } from './api';
import { HeadIcon } from './HeadArt';
import Configurator from './Configurator';
import Quotes from './Quotes';
import Admin from './Admin';

// Demo accounts only exist on the local dev server (npm run frontend); the deployed app has real passwords
const DEMO = import.meta.env.DEV;

function Login({ onLogin }) {
  const [u, setU] = useState(DEMO ? 'user' : ''), [p, setP] = useState(DEMO ? 'user' : ''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const go = async e => {
    e?.preventDefault(); setBusy(true); setErr('');
    try { setAuth(u, p); await onLogin(); }
    catch (ex) { clearAuth(); setErr(ex.message.includes('fetch') ? 'Cannot reach the server. Is "npm start" running?' : ex.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="login">
      <section className="login-hero">
        <h1>Specify the head.<br />See the price<br />as you go.</h1>
        <p>Dished, hemispherical and conical heads in carbon steel, stainless, duplex and aluminium. Engineering checks and a delivered price in minutes.</p>
        <div className="hero-heads"><HeadIcon kind="ELLIPSE" /><HeadIcon kind="HEMI" /><HeadIcon kind="CONE" /></div>
      </section>
      <form className="login-card" onSubmit={go}>
        <h2>Sign in</h2>
        <label>Username<input value={u} onChange={e => setU(e.target.value)} autoComplete="username" required autoFocus={!DEMO} /></label>
        <label>Password<input type="password" value={p} onChange={e => setP(e.target.value)} autoComplete="current-password" required /></label>
        {err && <div className="alert" role="alert">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {DEMO ? (
          <div className="demo">
            <span>Try a demo account</span>
            <button type="button" className="chip" onClick={() => { setU('user'); setP('user'); }}>Customer</button>
            <button type="button" className="chip" onClick={() => { setU('admin'); setP('admin'); }}>Admin</button>
          </div>
        ) : <p className="demo">Use the account details you were given. Ask your administrator if you need access.</p>}
      </form>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [cat, setCat] = useState(null);
  const [tab, setTab] = useState('configure');
  const [booting, setBooting] = useState(hasAuth());
  const [draft, setDraft] = useState(null);   // a quote being revised: { config, company, reference, notes }
  const revise = d => { setDraft({ ...d, at: Date.now() }); setTab('configure'); };

  const load = async () => {
    const who = await api.whoami();
    const catalog = await api.catalog();
    setMe(who); setCat(catalog);
    // Read the flag now: the updater below runs later, after the flag is already set
    const firstVisit = !sessionStorage.getItem('cpq-seen');
    setTab(t => (who.admin && t === 'configure' && firstVisit) ? 'admin' : t);
    sessionStorage.setItem('cpq-seen', '1');
  };
  const reloadCatalog = async () => setCat(await api.catalog());
  useEffect(() => { if (hasAuth()) load().catch(() => clearAuth()).finally(() => setBooting(false)); }, []);
  const logout = () => { clearAuth(); sessionStorage.removeItem('cpq-seen'); setMe(null); setCat(null); setDraft(null); setTab('configure'); };

  if (booting) return <div className="boot">Loading…</div>;
  if (!me || !cat) return <Login onLogin={load} />;

  const tabs = me.admin
    ? [['admin', 'Dashboard'], ['configure', 'Configure'], ['quotes', 'All quotes']]
    : [['configure', 'Configure'], ['quotes', 'My quotes']];
  return (
    <>
      <header className="top">
        <div className="brand"><span className="dot" />HeadQuote CPQ</div>
        <nav>{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>
        <div className="who"><span>{me.user}<em>{me.admin ? 'Admin' : 'Customer'}</em></span><button className="btn ghost" onClick={logout}>Sign out</button></div>
      </header>
      <main>
        {/* the key remounts the configurator when a quote is opened for revision */}
        {tab === 'configure' && <Configurator key={draft?.at || 0} cat={cat} me={me} draft={draft} goQuotes={() => setTab('quotes')} />}
        {tab === 'quotes' && <Quotes me={me} onRevise={revise} />}
        {tab === 'admin' && me.admin && <Admin cat={cat} reload={reloadCatalog} />}
      </main>
    </>
  );
}
````

### frontend/src/Configurator.jsx

````jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { inr, num, FAMILY, fits, pipes } from './util';
import HeadArt, { HeadIcon } from './HeadArt';
import { downloadQuotePdf } from './pdf';

function useCountUp(target) {
  const [v, setV] = useState(target); const from = useRef(target);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { from.current = target; setV(target); return; }
    const t0 = performance.now(), start = from.current; let raf;
    const tick = t => {
      const k = Math.min(1, (t - t0) / 450), val = start + (target - start) * (1 - Math.pow(1 - k, 3));
      from.current = val; setV(val); if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

const STEPS = ['Head and size', 'Material and thickness', 'Finish and processing', 'Delivery and quote'];
const NUMERIC = ['diameter', 'thickness', 'outletDia', 'qty', 'coneAngle', 'sf'];

export function defaultConfig(cat) {
  const first = (list, id) => (list.find(x => x.ID === id && x.active !== false) || list.find(x => x.active !== false) || list[0]).ID;
  const sfs = pipes(cat.setting.sfOptions);
  return {
    headTypeId: first(cat.headTypes, 'se21'), materialId: first(cat.materials, 'ss304l'), codeId: first(cat.codes, 'asme'),
    diaBasis: 'ID', diameter: 1500, thkBasis: 'MIN', thickness: 6, sf: sfs.includes(50) ? 50 : sfs[0],
    coneAngle: 30, outletDia: 0, qty: 1,
    edgeId: first(cat.edges, 'bevel30'), finishId: first(cat.finishes, 'mill'), colourId: null, htId: first(cat.heatTreatments, 'none'),
    extraIds: [], zoneId: first(cat.zones, 'telangana'), termsId: cat.terms[0].ID
  };
}

// Empty number inputs go to the server as null, so it can say what is missing
const clean = cfg => Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, NUMERIC.includes(k) && (v === '' || v == null) ? null : v]));

function Seg({ value, options, onChange, label }) {
  return <div className="seg" role="radiogroup" aria-label={label}>
    {options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
  </div>;
}

export default function Configurator({ cat, me, draft, goQuotes }) {
  const byId = (list, id) => list.find(x => x.ID === id);
  const extraById = useMemo(() => Object.fromEntries(cat.extras.map(e => [e.ID, e])), [cat.extras]);

  const [step, setStep] = useState(0);
  const [cfg, setCfg] = useState(() => ({ ...defaultConfig(cat), ...(draft?.config || {}) }));
  const [party, setParty] = useState(() => ({ company: draft?.company || '', reference: draft?.reference || '', notes: draft?.notes || '' }));
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);

  const type = byId(cat.headTypes, cfg.headTypeId), mat = byId(cat.materials, cfg.materialId);
  const code = byId(cat.codes, cfg.codeId), finish = byId(cat.finishes, cfg.finishId);

  // Keep the selection consistent when the material or finish changes, and say what changed
  const settle = c => {
    const m = byId(cat.materials, c.materialId), msgs = [];
    const f = byId(cat.finishes, c.finishId);
    if (!fits(f, m.family)) {
      const nf = cat.finishes.find(x => x.active && fits(x, m.family));
      msgs.push(`${f.name} is not offered on ${FAMILY[m.family].toLowerCase()}, so the finish is now ${nf.name}`);
      c.finishId = nf.ID;
    }
    const h = byId(cat.heatTreatments, c.htId);
    if (!fits(h, m.family)) { c.htId = cat.heatTreatments.find(x => fits(x, m.family)).ID; msgs.push(`${h.name} removed (not used for ${FAMILY[m.family].toLowerCase()})`); }
    const cd = byId(cat.codes, c.codeId);
    if (cd.requiresCodeMaterial && !m.codeApproved) {
      const nc = cat.codes.find(x => !x.requiresCodeMaterial);
      msgs.push(`${m.name} is not a pressure-vessel grade, so the design code is now ${nc.name}`); c.codeId = nc.ID;
    }
    const gone = c.extraIds.filter(id => !extraById[id] || !fits(extraById[id], m.family));
    if (gone.length) { c.extraIds = c.extraIds.filter(id => !gone.includes(id)); msgs.push(`Removed ${gone.map(id => extraById[id]?.name).join(', ')} (does not apply)`); }
    const nf = byId(cat.finishes, c.finishId);
    if (nf.needsColour && !c.colourId) c.colourId = (cat.colours.find(x => x.ID === 'RAL7035') || cat.colours[0])?.ID || null;   // light grey, the usual shop primer colour
    if (!nf.needsColour) c.colourId = null;
    return [c, msgs];
  };
  const set = patch => {
    const [next, msgs] = settle({ ...cfg, ...patch });
    setCfg(next); if (msgs.length) setNote(msgs.join('. '));
  };

  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(''), 5000); return () => clearTimeout(t); }, [note]);

  // The backend does all engineering and pricing; it answers with issues instead of failing
  const key = JSON.stringify(cfg);
  useEffect(() => {
    let live = true; setSaved(null);
    const t = setTimeout(() => api.calculate(clean(cfg))
      .then(b => { if (live) { setRes(b); setErr(''); } })
      .catch(e => live && setErr(e.message)), 250);
    return () => { live = false; clearTimeout(t); };
  }, [key]);

  const spec = res?.spec;
  const issuesFor = f => (res?.issues || []).filter(i => i.field === f);
  const Issues = ({ f }) => issuesFor(f).map(i => <p key={i.message} className="field-issue" role="alert">{i.message}</p>);
  const shown = useCountUp(res?.total ?? 0);

  // ---- Extras and their rules ----
  const auto = new Set(res?.autoExtras || []);
  const welded = !!spec?.seams;
  const picked = id => cfg.extraIds.includes(id) || auto.has(id);
  const other = (r, id) => (r.extra_ID === id ? r.target_ID : r.extra_ID);
  const extraStatus = e => {
    if (auto.has(e.ID)) return { state: 'auto', why: `Required by ${code.name} because the blank is welded` };
    if (cfg.extraIds.includes(e.ID)) return { state: 'on' };
    if (e.weldedOnly && !welded) return { state: 'blocked', why: 'Only needed when the blank is welded from plates' };
    const clash = cat.rules.find(r => r.ruleType === 'EXCLUDES' && (r.extra_ID === e.ID || r.target_ID === e.ID) && picked(other(r, e.ID)));
    if (clash) return { state: 'blocked', why: clash.reason };
    const needs = cat.rules.filter(r => r.ruleType === 'REQUIRES' && r.extra_ID === e.ID && !picked(r.target_ID)).map(r => extraById[r.target_ID]).filter(Boolean);
    return needs.length ? { state: 'needs', needs } : { state: 'ok' };
  };
  const deal = e => {
    const r = cat.rules.find(r => r.ruleType === 'DISCOUNT' && (r.extra_ID === e.ID || r.target_ID === e.ID));
    if (!r) return '';
    const p = extraById[other(r, e.ID)];
    return picked(e.ID) && picked(p.ID) ? `Package saving of ${inr(r.amount)} applied` : `Save ${inr(r.amount)} with ${p.name}`;
  };
  const toggleExtra = e => {
    const st = extraStatus(e);
    if (st.state === 'blocked' || st.state === 'auto') return;
    let ids = [...cfg.extraIds], msg = '';
    if (st.state === 'on') {
      ids = ids.filter(id => id !== e.ID);
      const dependents = cat.rules.filter(r => r.ruleType === 'REQUIRES' && r.target_ID === e.ID && ids.includes(r.extra_ID)).map(r => r.extra_ID);
      if (dependents.length) { ids = ids.filter(id => !dependents.includes(id)); msg = `Also removed ${dependents.map(id => extraById[id].name).join(', ')} because it needs ${e.name}`; }
    } else {
      if (st.state === 'needs') { st.needs.forEach(n => ids.push(n.ID)); msg = `Added ${st.needs.map(n => n.name).join(' and ')} because ${e.name} needs it`; }
      ids.push(e.ID);
    }
    set({ extraIds: [...new Set(ids)] }); if (msg) setNote(msg);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.saveQuote({ config: clean(cfg), ...party });
      setSaved({ ...res, ...party, quoteNo: r.quoteNo, validUntil: r.validUntil, customer: me.user, createdAt: new Date().toISOString() });
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const plates = pipes(cat.setting.plateThicknesses).filter(p => p >= mat.minThk && p <= mat.maxThk);
  const groups = [...new Set(cat.extras.filter(e => e.active && fits(e, mat.family)).map(e => e.groupName))];
  const families = cat.heatTreatments.filter(h => fits(h, mat.family));
  const autoHt = res?.autoHeatTreatment;
  const knuckleAbove = Number(cat.setting.coneKnuckleAbove);

  return (
    <div className="cfg">
      <div className="cfg-main">
        <section className="stage">
          <div className="stage-head">
            <div><h2>{type.name}</h2><p>{type.code} · {mat.name} · {code.name}</p></div>
            {note && <div className="note" role="status">{note}</div>}
          </div>
          <HeadArt outer={res?.profile?.outer} spec={spec} look={finish.look} family={mat.family} hex={spec?.colourHex} />
          {spec && <div className="figures">
            <div><span>Weight / head</span><b>{num(spec.unitKg, 1)} kg</b></div>
            <div><span>Plate</span><b>{spec.plateThk} mm</b></div>
            <div><span>Inside depth</span><b>{num(spec.depth)} mm</b></div>
            <div><span>Blank</span><b>Ø{num(spec.blankDia)}{spec.seams ? ` · ${spec.seams + 1} pcs` : ''}</b></div>
            <div><span>Capacity</span><b>{num(spec.capacityL)} L</b></div>
            <div><span>Fibre elongation</span><b>{spec.elongationPct}%</b></div>
          </div>}
        </section>

        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s}><button className={step === i ? 'on' : i < step ? 'done' : ''} onClick={() => setStep(i)}><b>{i + 1}</b>{s}</button></li>
          ))}
        </ol>

        {step === 0 && (
          <section className="panel">
            <h3>Head type</h3>
            <div className="cards">
              {cat.headTypes.filter(h => h.active).map(h => (
                <button key={h.ID} className={'card-opt' + (h.ID === cfg.headTypeId ? ' on' : '')} onClick={() => set({ headTypeId: h.ID })} aria-pressed={h.ID === cfg.headTypeId}>
                  <HeadIcon kind={h.kind} /><strong>{h.name}</strong><span className="code">{h.code}</span>
                  <em>{h.description}</em><small>Ø{num(h.minDia)} to {num(h.maxDia)} mm</small>
                </button>
              ))}
            </div>
            <div className="fields">
              <label className="field wide">Diameter (mm)
                <span className="row">
                  <Seg label="Diameter basis" value={cfg.diaBasis} options={[['ID', 'Inside (ID)'], ['OD', 'Outside (OD)']]} onChange={v => set({ diaBasis: v })} />
                  <input type="number" min={type.minDia} max={type.maxDia} step="10" value={cfg.diameter ?? ''} onChange={e => set({ diameter: e.target.value === '' ? '' : +e.target.value })} />
                </span>
                <Issues f="diameter" />
              </label>
              <label className="field">Straight flange (mm)
                <select value={cfg.sf} onChange={e => set({ sf: +e.target.value })}>{pipes(cat.setting.sfOptions).map(s => <option key={s} value={s}>{s} mm</option>)}</select>
                <Issues f="sf" />
              </label>
              <label className="field">Quantity (heads)
                <input type="number" min="1" max={cat.setting.maxQty} value={cfg.qty ?? ''} onChange={e => set({ qty: e.target.value === '' ? '' : Math.round(+e.target.value) })} />
                <Issues f="qty" />
              </label>
              {type.kind === 'CONE' && <>
                <div className="field wide">Cone angle (half apex)
                  <span className="row chips">
                    {pipes(type.coneAngles).map(a => <button key={a} type="button" className={'chip' + (cfg.coneAngle === a ? ' on' : '')} aria-pressed={cfg.coneAngle === a} onClick={() => set({ coneAngle: a })}>{a}°</button>)}
                  </span>
                  <small className="muted">Steeper angles empty hoppers better. Above {knuckleAbove}° a knuckle is formed at the rim.</small>
                </div>
                <label className="field">Outlet diameter (mm)
                  <input type="number" min="0" step="10" value={cfg.outletDia ?? ''} onChange={e => set({ outletDia: e.target.value === '' ? '' : +e.target.value })} />
                  <small className="muted">0 = closed apex</small>
                </label>
                <div className="field wide"><Issues f="cone" /></div>
              </>}
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="panel">
            <h3>Material</h3>
            <div className="cards">
              {cat.materials.filter(m => m.active).map(m => (
                <button key={m.ID} className={'card-opt' + (m.ID === cfg.materialId ? ' on' : '')} onClick={() => set({ materialId: m.ID })} aria-pressed={m.ID === cfg.materialId}>
                  <i className={'swatch-mat ' + m.family} /><strong>{m.name}</strong><span className="code">{FAMILY[m.family]}</span>
                  <em>{m.description}</em>
                  <small>{m.minThk} to {m.maxThk} mm · {m.codeApproved ? 'Pressure-vessel grade' : 'Non-pressure only'} · about {m.leadDays} days to procure</small>
                </button>
              ))}
            </div>
            <h3>Design code</h3>
            <div className="cards small">
              {cat.codes.map(c => {
                const blocked = c.requiresCodeMaterial && !mat.codeApproved;
                return (
                  <button key={c.ID} className={'card-opt' + (c.ID === cfg.codeId ? ' on' : '')} disabled={blocked} onClick={() => set({ codeId: c.ID })} aria-pressed={c.ID === cfg.codeId}>
                    <strong>{c.name}</strong><em className={blocked ? 'why' : ''}>{blocked ? `Needs a pressure-vessel grade, not ${mat.name}` : c.rtOnWelds ? 'Radiography on welded blanks, code documentation' : 'No code documentation'}</em>
                  </button>
                );
              })}
            </div>
            <Issues f="code" />
            <h3>Thickness</h3>
            <div className="fields">
              <div className="field wide">
                <Seg label="Thickness basis" value={cfg.thkBasis} options={[['MIN', 'Minimum after forming'], ['NOM', 'Nominal plate']]}
                  onChange={v => set({ thkBasis: v, thickness: v === 'NOM' ? (res?.plateThk || plates.find(p => p >= cfg.thickness) || plates[0]) : cfg.thickness })} />
                <span className="row">
                  {cfg.thkBasis === 'MIN'
                    ? <input type="number" min="1" step="0.5" value={cfg.thickness ?? ''} aria-label="Minimum thickness after forming (mm)" onChange={e => set({ thickness: e.target.value === '' ? '' : +e.target.value })} />
                    : <select value={cfg.thickness} aria-label="Plate thickness" onChange={e => set({ thickness: +e.target.value })}>{plates.map(p => <option key={p} value={p}>{p} mm</option>)}</select>}
                  <span className="muted">mm</span>
                </span>
                {spec && <p className="calc">
                  {cfg.thkBasis === 'MIN' ? `Forming thins this head by about ${type.thinningPct}%, so it is formed from a ` : 'Formed from a '}
                  <b>{spec.plateThk} mm plate</b>, about <b>{spec.minAfterForming} mm</b> after forming · D/t {spec.dt}
                </p>}
                <Issues f="thickness" />
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="panel">
            <h3>Edge preparation</h3>
            <div className="cards small">
              {cat.edges.map(e => {
                const blocked = res?.plateThk && res.plateThk < e.minThk;
                return (
                  <button key={e.ID} className={'card-opt' + (e.ID === cfg.edgeId ? ' on' : '')} disabled={blocked} onClick={() => set({ edgeId: e.ID })} aria-pressed={e.ID === cfg.edgeId}>
                    <strong>{e.name}</strong><em className={blocked ? 'why' : ''}>{blocked ? `Needs ${e.minThk} mm or thicker` : e.angle ? `Ready for the shell weld, ${e.angle}°` : 'Plain edge'}</em>
                  </button>
                );
              })}
            </div>
            <Issues f="edge" />
            <h3>Surface finish</h3>
            <div className="cards small">
              {cat.finishes.filter(f => f.active && fits(f, mat.family)).map(f => (
                <button key={f.ID} className={'card-opt' + (f.ID === cfg.finishId ? ' on' : '')} onClick={() => set({ finishId: f.ID })} aria-pressed={f.ID === cfg.finishId}>
                  <strong>{f.name}</strong><em>{f.description}</em>
                </button>
              ))}
            </div>
            {finish.needsColour && <>
              <h3>Paint colour</h3>
              <div className="colours">
                {cat.colours.map(c => (
                  <button key={c.ID} className={'colour' + (c.ID === cfg.colourId ? ' on' : '')} onClick={() => set({ colourId: c.ID })} aria-pressed={c.ID === cfg.colourId}>
                    <i style={{ background: c.hex }} /><strong>{c.ID.replace('RAL', 'RAL ')}</strong><span>{c.name}</span>
                  </button>
                ))}
              </div>
              <Issues f="colour" />
            </>}
            <Issues f="finish" />
            <h3>Heat treatment</h3>
            {spec && <p className="calc">Fibre elongation from forming: <b>{spec.elongationPct}%</b>{mat.family === 'CS' ? ` (limit ${cat.setting.csElongationLimit}% for carbon steel)` : ''}</p>}
            <div className="cards small">
              {families.map(h => {
                // The server adds a treatment when forming strain needs one; show that as the selection
                const isAuto = autoHt === h.ID, on = autoHt ? isAuto : h.ID === cfg.htId;
                const blocked = autoHt && h.ID === 'none';
                return (
                  <button key={h.ID} className={'card-opt' + (on ? ' on' : '')} disabled={blocked} onClick={() => set({ htId: h.ID })} aria-pressed={on}>
                    <strong>{h.name}{isAuto && <span className="req">Required</span>}</strong>
                    <em className={blocked ? 'why' : ''}>{blocked ? 'Not allowed: forming strain is above the code limit' : h.description}</em>
                  </button>
                );
              })}
            </div>
            <Issues f="ht" />
            {groups.map(g => (
              <div key={g} className="group">
                <h3>{g}</h3>
                <div className="optlist">
                  {cat.extras.filter(e => e.active && e.groupName === g && fits(e, mat.family)).map(e => {
                    const st = extraStatus(e), on = st.state === 'on' || st.state === 'auto', blocked = st.state === 'blocked';
                    const hint = st.state === 'auto' || blocked ? st.why : st.state === 'needs' ? `Also adds ${st.needs.map(n => n.name).join(', ')}` : e.description;
                    const d = !blocked && deal(e);
                    return (
                      <button key={e.ID} className={'opt' + (on ? ' on' : '') + (blocked ? ' blocked' : '') + (st.state === 'auto' ? ' std' : '')} disabled={blocked || st.state === 'auto'}
                        onClick={() => toggleExtra(e)} role="switch" aria-checked={on}>
                        <span className="sw"><span /></span>
                        <span className="txt"><strong>{e.name}</strong><em className={blocked ? 'why' : ''}>{hint}</em>{d && <em className="deal">{d}</em>}</span>
                        <span className="pr">{st.state === 'auto' ? 'Required' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <Issues f="extras" />
          </section>
        )}

        {step === 3 && (
          <section className="panel">
            <h3>Delivery</h3>
            <div className="cards small">
              {cat.zones.map(z => (
                <button key={z.ID} className={'card-opt' + (z.ID === cfg.zoneId ? ' on' : '')} onClick={() => set({ zoneId: z.ID })} aria-pressed={z.ID === cfg.zoneId}>
                  <strong>{z.name}</strong><em>{z.transitDays ? `About ${z.transitDays} day${z.transitDays > 1 ? 's' : ''} in transit` : 'No freight charge'}</em>
                </button>
              ))}
            </div>
            <h3>Payment terms</h3>
            <div className="cards small">
              {cat.terms.map(t => (
                <button key={t.ID} className={'card-opt' + (t.ID === cfg.termsId ? ' on' : '')} onClick={() => set({ termsId: t.ID })} aria-pressed={t.ID === cfg.termsId}>
                  <strong>{t.name}</strong><em>{t.adjustPct < 0 ? `${-t.adjustPct}% off the price` : t.adjustPct > 0 ? `${t.adjustPct}% finance charge` : 'Standard price'}</em>
                </button>
              ))}
            </div>
            <h3>Your details</h3>
            <div className="fields">
              <label className="field">Company<input value={party.company} maxLength="80" onChange={e => setParty({ ...party, company: e.target.value })} placeholder="Company name" /></label>
              <label className="field">Your reference<input value={party.reference} maxLength="60" onChange={e => setParty({ ...party, reference: e.target.value })} placeholder="Enquiry or tag no." /></label>
              <label className="field wide">Notes for our team<textarea value={party.notes} maxLength="300" rows="3" onChange={e => setParty({ ...party, notes: e.target.value })} placeholder="Drawing number, nozzle positions, delivery window…" /></label>
            </div>
            {res?.spec && <div className="lead">
              <div><span>Ready to dispatch</span><b>about {res.dispatchDays} working days</b><small>after order and advance</small></div>
              <div><span>Delivered</span><b>about {res.deliveryDays} working days</b><small>{res.freightDetail}</small></div>
            </div>}
          </section>
        )}

        <div className="nav">
          <button className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {step < 3 && <button className="btn primary" onClick={() => setStep(step + 1)}>Continue</button>}
        </div>
      </div>

      <aside className="sheet">
        {res ? <>
          <h3>{res.spec ? `${res.spec.headCode} · ${res.spec.material}` : type.name}</h3>
          <p className="sub">{res.spec ? `${res.spec.diaBasis} ${num(res.spec.diameter)} × ${res.spec.plateThk} mm · Qty ${res.spec.qty} · ${num(res.spec.totalKg)} kg` : 'Fix the items below to see a price'}</p>
          {res.spec && <>
            <dl>
              {Object.entries(res.lines.reduce((g, l) => ({ ...g, [l.group]: [...(g[l.group] || []), l] }), {})).map(([g, ls]) => (
                <div key={g} className="grp">
                  <div className="sep"><dt>{g}</dt></div>
                  {ls.map(l => <div key={l.name} className={'opt-line' + (l.amount < 0 ? ' deal' : '')}><dt title={l.detail}>{l.name}</dt><dd>{l.amount < 0 ? '−' + inr(-l.amount) : inr(l.amount)}</dd></div>)}
                </div>
              ))}
              {res.discount > 0 && <div className="opt-line deal"><dt>Quantity discount ({res.qtyDiscountPct}% on conversion)</dt><dd>−{inr(res.discount)}</dd></div>}
              {res.paymentAdjust !== 0 && <div className={'opt-line' + (res.paymentAdjust < 0 ? ' deal' : '')}><dt>{res.paymentAdjust < 0 ? 'Early payment discount' : 'Finance charge'} ({Math.abs(res.paymentAdjustPct)}%)</dt><dd>{res.paymentAdjust < 0 ? '−' + inr(-res.paymentAdjust) : inr(res.paymentAdjust)}</dd></div>}
              <div className="sum"><dt>Price ex-GST · {inr(res.unitPrice)} per head</dt><dd>{inr(res.subtotal)}</dd></div>
              <div><dt>Freight</dt><dd>{res.freight ? inr(res.freight) : 'Ex-works'}</dd></div>
              {res.gstMode === 'IGST'
                ? <div><dt>IGST ({res.gstPct}%)</dt><dd>{inr(res.igst)}</dd></div>
                : <><div><dt>CGST ({res.gstPct / 2}%)</dt><dd>{inr(res.cgst)}</dd></div><div><dt>SGST ({res.gstPct / 2}%)</dt><dd>{inr(res.sgst)}</dd></div></>}
            </dl>
            <div className="total"><span>Quotation total</span><strong>{inr(shown)}</strong></div>
            {res.advancePct > 0 && <p className="adv">Advance {res.advancePct}%: <b>{inr(res.advance)}</b> · dispatch in about {res.dispatchDays} working days</p>}
            {me.admin && res.cost != null && <p className="adv internal">Internal: cost {inr(res.cost)} · margin {res.marginPct}% of price</p>}
          </>}
          {res.issues.length > 0 && <ul className="msgs bad">{res.issues.map(i => <li key={i.message}>{i.message}</li>)}</ul>}
          {res.notices.length > 0 && <ul className="msgs info">{res.notices.map(n => <li key={n}>{n}</li>)}</ul>}
          {res.warnings.length > 0 && <ul className="msgs warn">{res.warnings.map(n => <li key={n}>{n}</li>)}</ul>}
          {err && <div className="alert dark" role="alert">{err}</div>}
          {!saved ? (
            step === 3
              ? <button className="btn accent" onClick={save} disabled={saving || !res.valid || !!err}>{saving ? 'Saving…' : 'Get quotation'}</button>
              : <button className="btn accent" onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1]}</button>
          ) : (
            <div className="saved">
              <p>Quotation <b>{saved.quoteNo}</b> · valid until {new Date(saved.validUntil).toLocaleDateString('en-IN')}</p>
              <button className="btn accent" onClick={() => downloadQuotePdf(saved)}>Download PDF</button>
              <button className="btn outline" onClick={goQuotes}>View my quotes</button>
            </div>
          )}
        </> : <p className="sub">{err || 'Calculating…'}</p>}
      </aside>
    </div>
  );
}
````

### frontend/src/HeadArt.jsx

````jsx
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
````

### frontend/src/Quotes.jsx

````jsx
import { useEffect, useState } from 'react';
import { api } from './api';
import { inr, num, today } from './util';
import { downloadQuotePdf } from './pdf';

const parse = (s, fallback) => { try { return JSON.parse(s) ?? fallback; } catch { return fallback; } };
// Rebuild the calculate() shape from the snapshot stored on the quote
const toDoc = q => ({
  ...parse(q.linesJson, {}), spec: parse(q.specJson, {}),
  quoteNo: q.quoteNo, createdAt: q.createdAt, validUntil: q.validUntil, customer: q.customer, company: q.company,
  reference: q.reference, notes: q.notes, summary: q.summary, terms: q.paymentTerms, zone: q.zone,
  unitPrice: q.unitPrice, total: q.total, advance: q.advance, dispatchDays: q.dispatchDays
});
const stateOf = q => (q.status === 'ISSUED' && q.validUntil < today() ? 'EXPIRED' : q.status);
const LABEL = { ISSUED: 'Open', ACCEPTED: 'Accepted', DECLINED: 'Declined', EXPIRED: 'Expired' };

export default function Quotes({ me, onRevise }) {
  const [rows, setRows] = useState(null), [err, setErr] = useState(''), [show, setShow] = useState('all'), [busy, setBusy] = useState('');
  const load = () => api.quotes().then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  if (err) return <div className="alert page">{err}</div>;
  if (!rows) return <div className="boot">Loading quotes…</div>;

  const respond = async (q, accept) => {
    setBusy(q.ID);
    try { await api.respondQuote(q.ID, accept); await load(); } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  const list = rows.filter(q => show === 'all' || stateOf(q) === show);
  return (
    <section className="page">
      <div className="page-head">
        <h2>{me.admin ? 'All quotes' : 'My quotes'}</h2>
        {rows.length > 0 && <div className="tabs inline">
          {[['all', 'All'], ['ISSUED', 'Open'], ['ACCEPTED', 'Accepted'], ['EXPIRED', 'Expired'], ['DECLINED', 'Declined']].map(([k, l]) =>
            <button key={k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>)}
        </div>}
      </div>
      {rows.length === 0 ? <div className="empty"><b>No quotes yet</b><p>Configure a head and request a quotation to see it here.</p></div> : (
        <div className="qlist">
          {list.length === 0 && <p className="muted">No quotes match this filter.</p>}
          {list.map(q => {
            const st = stateOf(q), mine = q.customer === me.user;
            return (
              <article key={q.ID} className="qcard">
                <div>
                  <strong>{q.summary}</strong>
                  <span>{q.quoteNo} · {new Date(q.createdAt).toLocaleDateString('en-IN')}{q.company ? ` · ${q.company}` : ''}{me.admin ? ` · ${q.customer}` : ''}{q.reference ? ` · Ref ${q.reference}` : ''}</span>
                </div>
                <div className="qmeta">
                  <span className={'status ' + st.toLowerCase()}>{LABEL[st]}</span>
                  <span>{st === 'ISSUED' ? `Valid until ${new Date(q.validUntil).toLocaleDateString('en-IN')}` : `${num(q.totalWeight)} kg · ${q.zone}`}</span>
                </div>
                <div className="qtotal">{inr(q.total)}<small>{inr(q.unitPrice)} per head ex-GST · dispatch ~{q.dispatchDays} days</small></div>
                <div className="qact">
                  <button className="btn outline sm" onClick={() => downloadQuotePdf(toDoc(q))}>PDF</button>
                  <button className="btn outline sm" onClick={() => onRevise({ config: parse(q.configJson, {}), company: q.company, reference: q.reference, notes: q.notes })}>Revise</button>
                  {mine && st === 'ISSUED' && <>
                    <button className="btn primary sm" disabled={busy === q.ID} onClick={() => respond(q, true)}>Accept</button>
                    <button className="btn ghost sm" disabled={busy === q.ID} onClick={() => respond(q, false)}>Decline</button>
                  </>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
````

### frontend/src/api.js

````js
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
````

### frontend/src/main.jsx

````jsx
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
createRoot(document.getElementById('root')).render(<App />);
````

### frontend/src/pdf.js

````js
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
````

### frontend/src/styles.css

````css
:root{
  --ink:#0d2240; --ink2:#173459; --studio:#e8ecf1; --paper:#fff; --line:#d6dde6; --text:#14233b; --mute:#637288;
  --signal:#1b66ff; --amber:#ffb23e; --ok:#0f9d6b; --bad:#c0392b; --warn:#9a5b00;
  --head:'Bricolage Grotesque',system-ui,sans-serif; --body:'Instrument Sans',system-ui,sans-serif;
}
*{box-sizing:border-box}
body{margin:0;background:var(--studio);color:var(--text);font:15px/1.5 var(--body)}
h1,h2,h3,strong,b{font-family:var(--head)}
h2{font-size:26px;margin:0}h3{font-size:17px;margin:24px 0 10px}h3:first-child{margin-top:0}
button{font:inherit;color:inherit;cursor:pointer}
button:disabled{cursor:not-allowed}
:focus-visible{outline:3px solid var(--signal);outline-offset:2px}
.muted{color:var(--mute)}.r{text-align:right}

/* buttons / inputs */
.btn{border:0;border-radius:10px;padding:11px 18px;font-weight:600;transition:transform .15s,background .15s}
.btn:active{transform:translateY(1px)}
.btn.primary{background:var(--ink);color:#fff}.btn.primary:hover{background:var(--ink2)}
.btn.accent{background:var(--amber);color:#2b1b00;width:100%;padding:14px;font-size:16px}.btn.accent:hover{background:#ffc064}
.btn.outline{background:transparent;border:1.5px solid currentColor}
.btn.ghost{background:transparent;color:var(--mute)}.btn.ghost:hover{color:var(--text)}
.btn.sm{padding:5px 10px;font-size:13px}.btn:disabled{opacity:.45}
input,select,textarea{font:inherit;padding:9px 12px;border:1.5px solid var(--line);border-radius:10px;background:#fff;color:var(--text)}
textarea{resize:vertical}
.alert{background:#fdeceb;color:#8a1f14;padding:10px 14px;border-radius:10px;font-size:14px}
.alert.dark{background:rgba(255,120,100,.16);color:#ffc9c0;margin-bottom:10px}.alert.page{margin:24px}
.boot{padding:80px;text-align:center;color:var(--mute)}
.chip{border:1.5px solid var(--line);background:#fff;border-radius:99px;padding:4px 12px;font-size:13px}.chip:hover{border-color:var(--signal)}
.chip.on{background:var(--ink);border-color:var(--ink);color:#fff}

/* top bar */
.top{display:flex;align-items:center;gap:28px;padding:12px 28px;background:var(--paper);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.brand{font:700 19px var(--head);display:flex;align-items:center;gap:9px}.dot{width:14px;height:14px;border-radius:50%;background:var(--signal);box-shadow:5px 0 0 -2px var(--amber)}
.top nav{display:flex;gap:4px;flex:1}.top nav button{background:none;border:0;padding:8px 14px;border-radius:9px;color:var(--mute);font-weight:500}
.top nav button:hover{color:var(--text)}.top nav .active{background:var(--studio);color:var(--ink);font-weight:600}
.who{display:flex;align-items:center;gap:8px}.who span{display:flex;flex-direction:column;align-items:flex-end;line-height:1.2;font-weight:600}.who em{font-style:normal;font-weight:400;font-size:12px;color:var(--mute)}
main{max-width:1280px;margin:0 auto;padding:24px 28px 60px}

/* login */
.login{min-height:100vh;display:grid;grid-template-columns:1.25fr 1fr;background:linear-gradient(160deg,var(--ink),#102c52)}
.login-hero{padding:9vh 6vw;color:#fff;display:flex;flex-direction:column;justify-content:center}
.login-hero h1{font-size:clamp(36px,5vw,64px);line-height:1.02;margin:0 0 18px;letter-spacing:-.02em}
.login-hero p{max-width:420px;color:#b7c6dc;margin:0 0 30px}
.hero-heads{display:flex;gap:18px;max-width:520px}.hero-heads .head-icon{flex:1;fill:#c9d3df;filter:drop-shadow(0 14px 18px rgba(0,0,0,.35))}
.login-card{background:var(--paper);margin:auto;width:min(380px,90%);padding:32px;border-radius:18px;display:flex;flex-direction:column;gap:14px}
.login-card h2{margin-bottom:4px}.login-card label{display:flex;flex-direction:column;gap:5px;font-weight:500;font-size:14px}
.demo{display:flex;align-items:center;gap:8px;color:var(--mute);font-size:13px;flex-wrap:wrap}

/* configurator layout */
.cfg{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:24px;align-items:start}
.stage{position:relative;border-radius:22px;padding:22px 26px 16px;overflow:hidden;
  background:radial-gradient(120% 90% at 50% 0,#fff 0,#f2f5f8 55%,#dde3ea 100%);border:1px solid var(--line)}
.stage-head{display:flex;justify-content:space-between;gap:16px;min-height:56px}.stage-head p{margin:2px 0 0;color:var(--mute)}
.note{background:var(--ink);color:#fff;padding:8px 14px;border-radius:10px;font-size:13px;max-width:340px;align-self:flex-start;animation:pop .25s}
@keyframes pop{from{transform:scale(.94);opacity:0}}
.head-art{display:block;width:100%;max-width:620px;margin:4px auto 0}.head-art .paint{transition:fill .5s}
.head-art .dim line{stroke:#637288;stroke-width:1}.head-art .dim text{font:12px var(--body);fill:#425066;text-anchor:middle}
.art-empty{height:200px;display:grid;place-items:center;color:var(--mute)}
.figures{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:8px}
.figures div{background:rgba(255,255,255,.75);border:1px solid var(--line);border-radius:12px;padding:8px 10px;display:flex;flex-direction:column}
.figures span{font-size:12px;color:var(--mute)}.figures b{font-size:15px}

.steps{list-style:none;display:flex;gap:8px;padding:0;margin:18px 0;flex-wrap:wrap}
.steps button{display:flex;align-items:center;gap:10px;padding:9px 16px 9px 9px;border-radius:99px;border:1.5px solid var(--line);background:var(--paper);font-weight:500;color:var(--mute)}
.steps b{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--studio);font-size:13px}
.steps .on{border-color:var(--ink);color:var(--ink);font-weight:600}.steps .on b{background:var(--ink);color:#fff}.steps .done b{background:var(--ok);color:#fff}
.panel{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:24px}
.nav{display:flex;justify-content:space-between;margin-top:16px}

/* selectable cards */
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.cards.small{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
.card-opt{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;padding:14px;border-radius:14px;border:1.5px solid var(--line);background:#fff}
.card-opt:hover:not(:disabled){border-color:#9db7e6}
.card-opt.on{border-color:var(--signal);box-shadow:0 0 0 3px rgba(27,102,255,.14);background:#f7faff}
.card-opt:disabled{background:#f7f8fa;border-style:dashed;opacity:.85}.card-opt:disabled strong{color:var(--mute)}
.card-opt em{font-style:normal;font-size:13px;color:var(--mute)}.card-opt small{font-size:12px;color:var(--ink);font-weight:600;margin-top:4px}
.card-opt .code{font-size:12px;font-weight:600;color:var(--signal);letter-spacing:.02em}
.card-opt .head-icon{width:100%;height:46px;fill:#a9b6c6;margin-bottom:8px}.card-opt.on .head-icon{fill:var(--signal)}
.req{margin-left:8px;font:600 11px var(--body);background:#e5f6ee;color:#0a7a52;padding:2px 7px;border-radius:99px;vertical-align:2px}
.swatch-mat{width:100%;height:10px;border-radius:5px;margin-bottom:10px}
.swatch-mat.CS{background:linear-gradient(90deg,#5d646c,#9aa1a9,#5d646c)}.swatch-mat.SS{background:linear-gradient(90deg,#9aa3ad,#eef1f4,#9aa3ad)}
.swatch-mat.DUPLEX{background:linear-gradient(90deg,#99a097,#e6e9e4,#99a097)}.swatch-mat.AL{background:linear-gradient(90deg,#b4b9c0,#f6f7f9,#b4b9c0)}

/* fields */
.fields{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:20px}
.field{display:flex;flex-direction:column;gap:6px;font-weight:500;font-size:14px}.field.wide{grid-column:1/-1}
.field .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.field .row input{width:160px}
.field small{font-weight:400}
.seg{display:inline-flex;background:var(--studio);border-radius:10px;padding:3px;gap:2px;align-self:flex-start}
.seg button{border:0;background:none;padding:6px 12px;border-radius:8px;font-size:14px;color:var(--mute);font-weight:500}
.seg .on{background:#fff;color:var(--ink);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.field-issue{color:var(--bad);font-size:13px;margin:4px 0 0;font-weight:500}
.calc{font-size:14px;color:var(--mute);margin:6px 0 0;font-weight:400}.calc b{color:var(--text)}
.colours{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}
.colour{display:flex;flex-direction:column;align-items:flex-start;text-align:left;padding:8px;border-radius:12px;border:1.5px solid var(--line);background:#fff}
.colour i{width:100%;height:34px;border-radius:7px;border:1px solid rgba(0,0,0,.12);margin-bottom:6px}
.colour span{font-size:12px;color:var(--mute)}.colour.on{border-color:var(--signal);box-shadow:0 0 0 3px rgba(27,102,255,.14)}
.lead{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}
.lead div{background:var(--studio);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column}
.lead span,.lead small{font-size:13px;color:var(--mute)}.lead b{font-size:18px}

/* extras (switch rows) */
.group+.group{margin-top:6px}
.optlist{display:grid;gap:8px}
.opt{display:flex;align-items:center;gap:14px;text-align:left;padding:12px 14px;border-radius:12px;border:1.5px solid var(--line);background:#fff;width:100%}
.opt:hover:not(:disabled){border-color:#9db7e6}.opt.on{border-color:var(--signal);background:#f4f8ff}
.opt .txt{flex:1;display:flex;flex-direction:column}.opt em{font-style:normal;font-size:13px;color:var(--mute)}
.why{color:var(--bad)!important}.opt .pr{font-weight:600;white-space:nowrap;font-size:13px}
.opt.blocked{background:#f7f8fa;border-style:dashed}.opt.blocked strong{color:var(--mute)}
.opt.std{background:#f2faf6;border-color:#9fd6bd;cursor:default}.opt.std .sw{background:var(--ok)}.opt.std .sw span{transform:translateX(17px)}.opt.std .pr{color:var(--ok)}
.opt em.deal{color:var(--warn)}
.sw{width:40px;height:23px;border-radius:99px;background:#c9d1dc;position:relative;flex:none;transition:background .2s}
.sw span{position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#fff;transition:transform .2s}
.opt.on .sw{background:var(--signal)}.opt.on .sw span{transform:translateX(17px)}

/* price sheet */
.sheet{position:sticky;top:76px;background:var(--ink);color:#fff;border-radius:22px;padding:22px;box-shadow:0 24px 50px -24px rgba(13,34,64,.6);max-height:calc(100vh - 96px);overflow:auto}
.sheet h3{font-size:19px;margin:0}.sub{color:#9fb2cf;margin:2px 0 14px;font-size:14px}
.sheet dl{margin:0}.sheet dl div:not(.grp){display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.09);font-size:13.5px}
.sheet dt{color:#c3d1e6}.sheet dd{margin:0;font-weight:600;white-space:nowrap}
.sheet .opt-line dt{padding-left:10px;color:#9fb2cf}.sheet .opt-line.deal dt,.sheet .opt-line.deal dd{color:#8fe3b8}
.sheet .sep{border:0!important;padding-top:12px!important}.sheet .sep dt{font:600 12px var(--head);color:var(--amber);text-transform:uppercase;letter-spacing:.05em}
.sheet .sum dt,.sheet .sum dd{color:#fff;font-weight:700}
.total{display:flex;flex-direction:column;margin:14px 0 8px}.total span{color:#9fb2cf;font-size:14px}.total strong{font-size:34px;letter-spacing:-.02em;line-height:1.1}
.adv{margin:0 0 10px;font-size:13px;color:#c3d1e6}.adv.internal{color:var(--amber)}
.msgs{list-style:none;margin:0 0 10px;padding:10px 12px;border-radius:10px;font-size:13px;display:grid;gap:6px}
.msgs.bad{background:rgba(255,120,100,.16);color:#ffc9c0}.msgs.info{background:rgba(120,170,255,.14);color:#cfe0ff}.msgs.warn{background:rgba(255,178,62,.14);color:#ffd9a0}
.saved p{margin:0 0 10px;color:#c3d1e6}.saved .btn{margin-bottom:8px}.saved .outline{color:#fff;width:100%;border-color:rgba(255,255,255,.4)}

/* quotes + admin */
.page-head{display:flex;align-items:center;gap:16px;flex-wrap:wrap}.flash{background:var(--ok);color:#fff;padding:4px 12px;border-radius:99px;font-size:13px}.flash.bad{background:var(--bad)}
.empty{background:var(--paper);border:1px dashed var(--line);border-radius:16px;padding:40px;text-align:center;margin-top:16px}.empty p{color:var(--mute);margin:4px 0 0}
.qlist{display:grid;gap:10px;margin-top:16px}
.qcard{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:22px;align-items:center;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px 20px}
.qcard>div:first-child{display:flex;flex-direction:column}.qcard div span{color:var(--mute);font-size:13px}.qmeta{display:flex;flex-direction:column;align-items:flex-start;gap:3px}
.qtotal{display:flex;flex-direction:column;align-items:flex-end;font:700 20px var(--head)}.qtotal small{font:400 12px var(--body);color:var(--mute)}
.qact{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.status{font-size:12px!important;font-weight:600;padding:2px 9px;border-radius:99px}
.status.issued{background:#e8f0ff;color:#1b4fc4!important}.status.accepted{background:#e5f6ee;color:#0a7a52!important}
.status.declined{background:#eef0f3;color:#637288!important}.status.expired{background:#fdeceb;color:#a02a1c!important}
.tabs{display:flex;gap:6px;margin:16px 0;flex-wrap:wrap}.tabs button{background:none;border:0;padding:8px 14px;border-radius:99px;color:var(--mute);font-weight:500}.tabs .on{background:var(--ink);color:#fff}
.tabs.inline{margin:0 0 0 auto}
.card{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:22px;margin-bottom:16px}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px}
.kpis div{background:var(--ink);color:#fff;border-radius:16px;padding:18px;display:flex;flex-direction:column}.kpis span,.kpis small{color:#9fb2cf;font-size:13px}.kpis b{font-size:28px;letter-spacing:-.02em}
.cols{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.cols .card{margin:0}
.bars{list-style:none;padding:0;margin:0;display:grid;gap:12px}
.bars li{display:grid;grid-template-columns:minmax(0,1fr) 2fr 90px;gap:12px;align-items:center;font-size:14px}
.bars div{height:12px;background:var(--studio);border-radius:6px;overflow:hidden}.bars i{display:block;height:100%;background:#a9bde0;border-radius:6px;transition:width .5s}.bars b{text-align:right}
.tbl-wrap{overflow-x:auto}
.tbl{width:100%;border-collapse:collapse}.tbl th{font-weight:500;color:var(--mute);font-size:13px;text-align:left;padding:6px 8px;white-space:nowrap}.tbl th.r{text-align:right}
.tbl td{padding:7px 8px;border-top:1px solid var(--line);font-size:14px}.num{width:100px;text-align:right;padding:6px 8px}
.txt{width:160px;padding:6px 8px}.txt.wide{width:min(420px,100%)}
.toggle{width:40px;height:23px;border-radius:99px;border:0;background:#c9d1dc;position:relative;transition:background .2s}.toggle span{position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#fff;transition:transform .2s}
.toggle.on{background:var(--ok)}.toggle.on span{transform:translateX(17px)}
.addrow{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}.addrow .wide{flex:1;min-width:200px}.addrow input[type=number]{width:120px}
.tag{font-size:12px;padding:3px 9px;border-radius:99px;font-weight:600;white-space:nowrap}.tag.requires{background:#e5f6ee;color:#0a7a52}.tag.excludes{background:#fdeceb;color:#a02a1c}.tag.discount{background:#fff3dc;color:#8a5200}

@media(max-width:1100px){.figures{grid-template-columns:repeat(3,1fr)}.kpis{grid-template-columns:repeat(3,1fr)}}
@media(max-width:980px){
  .cfg{grid-template-columns:1fr}.sheet{position:static;max-height:none}.login{grid-template-columns:1fr}.login-hero{padding:40px 24px 10px}
  .cols,.kpis,.fields,.lead{grid-template-columns:1fr}.figures{grid-template-columns:repeat(2,1fr)}
  .qcard{grid-template-columns:1fr}.qtotal{align-items:flex-start}.qact{justify-content:flex-start}
  .top{gap:10px;padding:10px 14px;flex-wrap:wrap}main{padding:16px}.tabs.inline{margin:0}
}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
````

### frontend/src/util.js

````js
export const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
export const compact = n => n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : inr(n);
export const num = (n, d = 0) => (n == null ? '–' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d }));
export const FAMILY = { CS: 'Carbon steel', SS: 'Stainless steel', DUPLEX: 'Duplex stainless', AL: 'Aluminium' };
export const fits = (item, family) => !item.families || item.families.split('|').includes(family);
export const pipes = s => String(s || '').split('|').map(Number).filter(Number.isFinite);
export const today = () => new Date().toISOString().slice(0, 10);
````

---

End of source files (38 files).
