# Showroom CPQ: complete source for rebuilding

This file holds the **entire source** of the Showroom CPQ app (Configure, Price, Quote for cars),
built on **SAP CAP (Node.js) + SQLite + React (Vite)**. Every file is reproduced in full below,
so the project can be rebuilt exactly as it is, by hand or by Claude.

## How to rebuild it with Claude

Give Claude this file and paste:

> Recreate the project described in this file in a new folder named `car-cpq-cap`. Create every file
> listed under "Source files" at the exact path shown, with the exact content of its code block.
> Do not change, shorten or "improve" anything. Then run `npm run setup`, start the backend with
> `npm start`, start the frontend in a second terminal with `npm run frontend`, and confirm the app
> loads at http://localhost:5173.

Each file appears as a `### path/to/file` heading followed by one fenced code block with its full content.
The code blocks are fenced with four backticks, so their content can be copied as-is.

## Not included (generated automatically)

| Left out | Recreated by |
| --- | --- |
| `node_modules/`, `frontend/node_modules/` | `npm run setup` |
| `package-lock.json`, `frontend/package-lock.json` | `npm run setup` (dependency versions may be slightly newer) |
| `gen/` (CAP / HANA build output that `mta.yaml` deploys) | `npx cds build --production` |
| `frontend/dist/` | `npm --prefix frontend run build` |

## Requirements and running it

- Node.js 18 or later (20+ recommended) and npm.
- `npm run setup` installs the backend and frontend dependencies.
- `npm start` runs the CAP backend on http://localhost:4004. It uses in-memory SQLite seeded from
  `db/data/*.csv`, so data resets on every restart.
- `npm run frontend` runs the React app on **http://localhost:5173**. Open this one; Vite forwards `/cpq` calls to CAP.

Demo logins (CAP mocked auth): customer `user` / `user`, admin `admin` / `admin`.

## What the app does

- **Customer:** choose a model (Verna sedan, Creta SUV, i20 hatchback) and one of 5 trims per car,
  filterable by fuel and gearbox. Add options, pick the registration state, and get an on-road
  quotation with a line-by-line tax breakdown, the same car's price in every region, and a PDF valid for 15 days.
- **Payment:** a quote is a **direct purchase** by default. An **EMI** button opens the EMI calculator
  (down payment, tenure, interest rate), and the quote is then saved with its EMI plan.
- **Option rules**, all enforced on the server in `srv/cpq-service.js`, with the reason shown to the customer:
  - available from a trim level (`Options.minRank`, 1 Entry to 4 Top)
  - standard (free) from a trim level (`Options.standardRank`)
  - fits certain body types only (`Options.bodyTypes`)
  - `OptionRules` of type REQUIRES (auto-adds the needed option), EXCLUDES (works in both directions)
    and DISCOUNT (combo price, using `amount`)
- **Admin:** dashboard analytics (quote value, EMI share, top options, trims and regions); editing of
  trims, prices, option availability and region tax; creating and removing rules.
- All prices, EMI included, are calculated **only on the backend**. The frontend sends IDs only.

## Project structure

```
car-cpq-cap/
├── package.json             CAP backend: dependencies, scripts, mocked users
├── mta.yaml                 SAP BTP deployment descriptor (optional; deploys gen/)
├── .gitignore
├── README.md                project readme
├── db/
│   ├── schema.cds           data model: Models, Variants, Options, OptionRules, Regions, Quotes, QuoteItems
│   └── data/*.csv           seed data: 3 models, 15 trims, 18 options, 13 rules, 3 regions
├── srv/
│   ├── cpq-service.cds      OData service at /cpq, role restrictions, actions
│   └── cpq-service.js       pricing engine, rule checks, EMI, quote saving, admin input checks, analytics
└── frontend/
    ├── package.json, vite.config.js, index.html
    └── src/
        ├── main.jsx, App.jsx     entry point, login, top navigation
        ├── api.js, util.js       OData client (Basic auth), rupee formatting
        ├── Configurator.jsx      3-step configurator, rule hints, EMI panel, price sheet
        ├── Quotes.jsx            quote list with filters and PDF download
        ├── Admin.jsx             admin dashboard
        ├── CarArt.jsx            SVG car illustration
        ├── pdf.js                jsPDF quotation
        └── styles.css            all styling
```

## Source files

### package.json

````json
{
  "name": "car-cpq-cap",
  "version": "2.0.0",
  "description": "Car CPQ prototype - SAP CAP (Node.js) + SQLite + React",
  "dependencies": {
    "@sap/cds": "^9",
    "@cap-js/sqlite": "^2",
    "express": "^4"
  },
  "devDependencies": {
    "@sap/cds-dk": "^9"
  },
  "scripts": {
    "setup": "npm install && npm --prefix frontend install",
    "start": "cds watch",
    "frontend": "npm --prefix frontend run dev"
  },
  "cds": {
    "requires": {
      "auth": {
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
      }
    }
  }
}
````

### mta.yaml

````yaml
_schema-version: 3.3.0
ID: car-cpq-cap
version: 2.0.0
description: "Car CPQ prototype - SAP CAP (Node.js) + SQLite + React"
parameters:
  enable-parallel-deployments: true
build-parameters:
  before-all:
    - builder: custom
      commands:
        - npm ci
        - npx cds build --production
modules:
  - name: car-cpq-cap-srv
    type: nodejs
    path: gen/srv
    parameters:
      instances: 1
      buildpack: nodejs_buildpack
    build-parameters:
      builder: npm-ci
    provides:
      - name: srv-api # required by consumers of CAP services (e.g. approuter)
        properties:
          srv-url: ${default-url}
    requires:
      []

resources:
  []
````

### .gitignore

````text
node_modules
frontend/dist
*.sqlite
````

### README.md

````markdown
# Showroom CPQ (SAP CAP + SQLite + React)

Configure, Price, Quote prototype for cars with two roles.

| Role | Login | Can do |
| --- | --- | --- |
| Customer | `user` / `user` | Configure a car, see live pricing, save quotes, download PDF |
| Admin | `admin` / `admin` | Edit prices, options, region pricing and tax, rules; see all quotes and analytics |

## Run (Node 18+; Node 20 recommended)

    npm run setup          # installs backend and frontend dependencies
    npm start              # CAP backend on http://localhost:4004

    # second terminal
    npm run frontend       # React app on http://localhost:5173  (open this one)

CAP runs on an in-memory SQLite database seeded from `db/data/*.csv`, so data resets on restart.
To keep data in a file: `npx cds deploy --to sqlite:cpq.sqlite`.

## Structure

    db/schema.cds            data model (catalog, rules, regions, quotes)
    db/data/*.csv            seed data: 3 models, 15 trims, 18 options, 13 rules, 3 regions
    srv/cpq-service.cds      OData service, roles via @restrict
    srv/cpq-service.js       pricing engine + rule validation (prices only calculated here)
    frontend/src             React app (Vite proxies /cpq to CAP)

## Features
Live animated price panel · car preview that changes paint, wheels and sunroof · 5 trims per model
with fuel and gearbox filters · line-by-line tax breakdown · same-car region comparison ·
PDF quote with number and 15-day validity · admin dashboard with analytics, trim/price/option/tax
editing and a rule editor.

**Payment.** A quote is a direct purchase by default (full on-road price). The customer clicks **EMI**
to open the EMI calculator; the quote is then saved with the plan (down payment, tenure, rate, EMI).
EMI is calculated on the server, like every other price.

**Option rules** (all re-checked on the server; the UI explains each one to the customer):

| Rule | Where | Example |
| --- | --- | --- |
| Available from trim level | `Options.minRank` (1 Entry … 4 Top) | Sunroof from the SX / Sportz trim |
| Standard from trim level | `Options.standardRank` | Alloys free on level 3+, shown as "Included" |
| Body type | `Options.bodyTypes` | Roof Rails on SUVs only, Spoiler on hatchbacks |
| Needs | `OptionRules` REQUIRES | ADAS needs Rear Camera and 6 Airbags (auto-added) |
| Cannot combine | `OptionRules` EXCLUDES, both directions | Ceramic Coating not over Matte paint |
| Combo discount | `OptionRules` DISCOUNT + `amount` | Music System + Premium Sound saves ₹5,000 |

Changing trim drops options the new trim cannot take, and tells the customer what was removed
or is now included.

Switching to HANA later: `cds add hana` and deploy with the production profile (replace mocked auth with XSUAA).
````

### db/schema.cds

````cds
using { cuid, managed } from '@sap/cds/common';
namespace cpq;

// ---- Catalog ----
entity Models {
  key ID    : String(30);
  brand     : String(30);
  name      : String(40);
  bodyType  : String(20);     // Sedan | SUV | Hatchback
  tagline   : String(80);
  accent    : String(9);      // default paint colour
  variants  : Composition of many Variants on variants.model = $self;
}

entity Variants {
  key ID    : String(40);
  model     : Association to Models;
  name      : String(30);
  basePrice : Integer;
  trimRank  : Integer;        // 1 = Entry, 2 = Mid, 3 = High, 4 = Top
  fuel      : String(15);     // Petrol | Turbo Petrol | Diesel
  transmission : String(15);  // Manual | IVT | DCT
  features  : String(300);    // pipe separated
}

entity Options {
  key ID      : String(30);
  groupName   : String(30);   // Interior, Infotainment, Safety, Comfort, Exterior, Colour
  name        : String(60);
  description : String(120);
  price       : Integer;
  active      : Boolean default true;
  minRank     : Integer default 1;   // lowest trim that can take this option
  standardRank: Integer;             // trims at or above this rank get it free (null = never standard)
  bodyTypes   : String(60);          // pipe separated body types it fits (empty = all)
  swatch      : String(9);           // hex colour for paint options
}

// REQUIRES = needs target selected
// EXCLUDES = cannot be combined with target (works in both directions)
// DISCOUNT = combo price: taking both paid options takes `amount` off
entity OptionRules {
  key ID   : String(30);
  option   : Association to Options;
  ruleType : String(10);
  target   : Association to Options;
  amount   : Integer default 0;
  reason   : String(120);
}

// ---- Region & tax ----
entity Regions {
  key ID          : String(30);
  name            : String(40);
  currency        : String(3);
  adjustPct       : Double;
  gstPct          : Double;
  roadTaxPct      : Double;
  registrationFee : Integer;
}

// ---- Quotes (prices are snapshotted at quoting time) ----
entity Quotes : cuid, managed {
  quoteNo      : String(20);
  customer     : String(60);
  modelName    : String(40);
  carName      : String(120);
  regionName   : String(40);
  basePrice    : Integer;
  optionsTotal : Integer;
  adjustment   : Integer;
  gst          : Integer;
  roadTax      : Integer;
  registration : Integer;
  discount     : Integer default 0;
  total        : Integer;
  validUntil   : Date;
  // CASH = direct purchase, EMI = financed
  paymentMode  : String(4) default 'CASH';
  downPct      : Double;
  downPayment  : Integer;
  loanAmount   : Integer;
  tenureMonths : Integer;
  interestRate : Double;
  emi          : Integer;
  totalInterest: Integer;
  optionsJson  : LargeString;
  discountsJson: LargeString;
  items        : Composition of many QuoteItems on items.quote = $self;
}

entity QuoteItems : cuid {
  quote      : Association to Quotes;
  optionName : String(60);
  price      : Integer;
}
````

### db/data/cpq-Models.csv

````csv
ID,brand,name,bodyType,tagline,accent
verna,Hyundai,Verna,Sedan,Sharp lines. Quiet cabin.,#2f6fe4
creta,Hyundai,Creta,SUV,Room for every road.,#e0562f
i20,Hyundai,i20,Hatchback,Small footprint. Big personality.,#12a39a
````

### db/data/cpq-Variants.csv

````csv
ID,model_ID,name,basePrice,trimRank,fuel,transmission,features
verna-ex,verna,EX,1100000,1,Petrol,Manual,1.5L petrol 115 PS|6-speed manual|Dual airbags|Halogen headlamps
verna-s,verna,S,1230000,2,Petrol,Manual,Everything in EX|LED DRLs|Rear AC vents|Cruise control
verna-sx,verna,SX,1360000,3,Petrol,IVT,Everything in S|IVT automatic|Ventilated seats|LED headlamps
verna-sx-turbo,verna,SX Turbo,1480000,3,Turbo Petrol,DCT,Everything in SX|1.5L turbo 160 PS|7-speed DCT|Paddle shifters
verna-sxo,verna,SX(O) Turbo,1650000,4,Turbo Petrol,DCT,Everything in SX Turbo|Wireless charging|Heated and ventilated seats|Digital cluster
creta-e,creta,E,1100000,1,Petrol,Manual,1.5L petrol 115 PS|6-speed manual|Dual airbags|Rear parking sensors
creta-ex,creta,EX,1230000,2,Petrol,Manual,Everything in E|LED DRLs|Rear AC vents|Steering mounted controls
creta-ex-diesel,creta,EX Diesel,1380000,2,Diesel,Manual,Everything in EX|1.5L diesel 116 PS|Higher torque|Better highway mileage
creta-sx,creta,SX,1560000,3,Petrol,IVT,Everything in EX|IVT automatic|Drive modes|LED headlamps
creta-sxo,creta,SX(O) Turbo,1950000,4,Turbo Petrol,DCT,Everything in SX|1.5L turbo 160 PS|7-speed DCT|Powered driver seat
i20-era,i20,Era,720000,1,Petrol,Manual,1.2L petrol 83 PS|5-speed manual|Dual airbags|Tilt steering
i20-magna,i20,Magna,800000,2,Petrol,Manual,Everything in Era|Rear parking sensors|Electric ORVMs|Steering mounted controls
i20-sportz,i20,Sportz,880000,3,Petrol,Manual,Everything in Magna|Projector headlamps|Auto climate control|Push button start
i20-sportz-ivt,i20,Sportz IVT,980000,3,Petrol,IVT,Everything in Sportz|IVT automatic|Smooth city drive|Hill start assist
i20-astao,i20,Asta(O),1050000,4,Petrol,IVT,Everything in Sportz IVT|Wireless charging|Digital cluster|Connected car tech
````

### db/data/cpq-Options.csv

````csv
ID,groupName,name,description,price,active,minRank,standardRank,bodyTypes,swatch
leather,Interior,Leather Seats,Perforated premium leather,45000,true,3,,,
fabric,Interior,Fabric Seats,Breathable woven fabric,12000,true,1,,,
ambient,Interior,Ambient Lighting,64-colour cabin glow,18000,true,2,4,,
music,Infotainment,Music System,10.25 in touchscreen,25000,true,1,2,,
sound,Infotainment,Premium Sound,8-speaker tuned audio,30000,true,2,4,,
dashcam,Infotainment,Dual Dashcam,Front and rear recording,14000,true,1,,,
airbags,Safety,6 Airbags,Front side and curtain,28000,true,1,3,,
camera,Safety,Rear Camera,360 degree parking view,15000,true,1,4,,
adas,Safety,ADAS Level 2,Lane keep assist and smart cruise,85000,true,3,,Sedan|SUV,
sunroof,Comfort,Sunroof,Panoramic electric,60000,true,3,4,,
alloy,Exterior,Alloy Wheels,17 in diamond cut,35000,true,1,3,,
roofrails,Exterior,Roof Rails,Load-rated silver rails,9000,true,1,,SUV,
spoiler,Exterior,Rear Spoiler,Sporty roof spoiler,7500,true,1,,Hatchback,
ceramic,Exterior,Ceramic Coating,9H gloss protection,25000,true,1,,,
warranty,Protection,Extended Warranty,5 years or 1 lakh km,22000,true,1,,,
metallic,Colour,Metallic Silver,Fine metal flake finish,20000,true,1,,,#b9c2cf
pearl,Colour,Pearl White,Three-layer pearl coat,30000,true,3,,,#f3f0e8
matte,Colour,Matte Graphite,Satin matte finish,40000,true,1,,,#3b4048
````

### db/data/cpq-OptionRules.csv

````csv
ID,option_ID,ruleType,target_ID,amount,reason
r01,leather,EXCLUDES,fabric,0,Leather Seats cannot be combined with Fabric Seats
r02,metallic,EXCLUDES,pearl,0,Pick one paint: Metallic Silver conflicts with Pearl White
r03,matte,EXCLUDES,metallic,0,Pick one paint: Matte Graphite conflicts with Metallic Silver
r04,matte,EXCLUDES,pearl,0,Pick one paint: Matte Graphite conflicts with Pearl White
r05,ceramic,EXCLUDES,matte,0,Ceramic Coating cannot be applied over Matte Graphite
r06,sound,REQUIRES,music,0,Premium Sound needs the Music System
r07,sunroof,REQUIRES,alloy,0,Sunroof needs Alloy Wheels
r08,dashcam,REQUIRES,music,0,Dual Dashcam needs the Music System screen
r09,adas,REQUIRES,camera,0,ADAS Level 2 needs the Rear Camera
r10,adas,REQUIRES,airbags,0,ADAS Level 2 needs 6 Airbags
r11,music,DISCOUNT,sound,5000,Audio pack: Music System with Premium Sound
r12,airbags,DISCOUNT,camera,4000,Safety pack: 6 Airbags with Rear Camera
r13,sunroof,DISCOUNT,ambient,6000,Luxe pack: Sunroof with Ambient Lighting
````

### db/data/cpq-Regions.csv

````csv
ID,name,currency,adjustPct,gstPct,roadTaxPct,registrationFee
telangana,Telangana,INR,0,28,12,15000
maharashtra,Maharashtra,INR,2,28,11,20000
karnataka,Karnataka,INR,1,28,14,18000
````

### srv/cpq-service.cds

````cds
using cpq from '../db/schema';

@path: '/cpq'
service CPQService @(requires: 'authenticated-user') {

  // Everyone can read the catalog, only ADMIN can change it
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'ADMIN' }]
  entity Models as projection on cpq.Models;
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'ADMIN' }]
  entity Variants as projection on cpq.Variants;
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'ADMIN' }]
  entity Options as projection on cpq.Options;
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'ADMIN' }]
  entity OptionRules as projection on cpq.OptionRules;
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'ADMIN' }]
  entity Regions as projection on cpq.Regions;

  // Users see their own quotes, admins see all
  @readonly
  @restrict: [{ grant: 'READ', to: 'USER', where: 'customer = $user' }, { grant: 'READ', to: 'ADMIN' }]
  entity Quotes as projection on cpq.Quotes excluding { items };

  type LineItem    { name: String; price: Integer; standard: Boolean; }
  type RegionTotal { region: String; total: Integer; }
  // Sent only when the customer opens the EMI calculator; absent = direct purchase
  type FinanceInput { downPct: Double; months: Integer; ratePct: Double; }
  type FinancePlan {
    downPct: Double; months: Integer; ratePct: Double;
    downPayment: Integer; loanAmount: Integer; emi: Integer;
    totalInterest: Integer; totalPayable: Integer;
  }
  type Breakdown {
    car: String; model: String; region: String;
    basePrice: Integer; optionsTotal: Integer;
    discount: Integer; discounts: many LineItem;
    adjustment: Integer; adjustPct: Double;
    gst: Integer; gstPct: Double;
    roadTax: Integer; roadTaxPct: Double;
    registration: Integer; total: Integer;
    options: many LineItem;
    comparison: many RegionTotal;
    paymentMode: String;
    finance: FinancePlan;
  }
  type Stat      { label: String; value: Integer; }
  type Analytics {
    totalQuotes: Integer; totalValue: Integer; emiQuotes: Integer;
    options: many Stat; models: many Stat; regions: many Stat; variants: many Stat; payment: many Stat;
  }
  type Me        { user: String; admin: Boolean; }

  action calculate(variantId: String, optionIds: many String, regionId: String, finance: FinanceInput) returns Breakdown;
  action saveQuote(variantId: String, optionIds: many String, regionId: String, finance: FinanceInput) returns { ID: String; quoteNo: String; };
  function whoami() returns Me;
  @requires: 'ADMIN'
  function analytics() returns Analytics;
}
````

### srv/cpq-service.js

````js
const cds = require('@sap/cds');

const RULE_TYPES = ['REQUIRES', 'EXCLUDES', 'DISCOUNT'];
const QUOTE_VALID_DAYS = 15;
// Business limits for financing, mirrored by the EMI sliders in the UI
const FINANCE = { downPct: [10, 90], months: [12, 84], ratePct: [6, 18] };

module.exports = class CPQService extends cds.ApplicationService {
  init() {
    const { Variants, Models, Options, OptionRules, Regions, Quotes, QuoteItems } = cds.entities('cpq');

    // Pure maths for one region
    const priceFor = (v, optionsTotal, discount, r) => {
      const subtotal = v.basePrice + optionsTotal - discount;
      const adjustment = Math.round(subtotal * r.adjustPct / 100);
      const taxable = subtotal + adjustment;
      const gst = Math.round(taxable * r.gstPct / 100);
      const roadTax = Math.round(taxable * r.roadTaxPct / 100);
      return { optionsTotal, discount, adjustment, gst, roadTax, registration: r.registrationFee,
               total: taxable + gst + roadTax + r.registrationFee };
    };

    // Reducing-balance EMI on the on-road price
    const financeFor = (total, f) => {
      const downPayment = Math.round(total * f.downPct / 100);
      const loanAmount = total - downPayment;
      const rr = f.ratePct / 1200;
      const emi = Math.round(loanAmount * rr * Math.pow(1 + rr, f.months) / (Math.pow(1 + rr, f.months) - 1));
      const totalInterest = emi * f.months - loanAmount;
      return { ...f, downPayment, loanAmount, emi, totalInterest, totalPayable: downPayment + emi * f.months };
    };

    const checkFinance = (req, f) => {
      for (const [k, [lo, hi]] of Object.entries(FINANCE)) {
        const n = Number(f[k]);
        if (!Number.isFinite(n) || n < lo || n > hi) return `EMI ${k} must be between ${lo} and ${hi}`;
      }
      if (f.months % 12) return 'EMI tenure must be in whole years';
    };

    const fits = (o, model) => !o.bodyTypes || o.bodyTypes.split('|').includes(model.bodyType);
    const isStandard = (o, v) => o.standardRank != null && v.trimRank >= o.standardRank;

    // Validates the configuration (availability + rules) and builds the breakdown.
    // The frontend never sends prices - only IDs.
    const build = async (req) => {
      const { variantId, regionId, finance } = req.data;
      const v = await SELECT.one.from(Variants).where({ ID: variantId });
      if (!v) return req.reject(400, 'Unknown variant');
      const model = await SELECT.one.from(Models).where({ ID: v.model_ID });
      const regions = await SELECT.from(Regions);
      const region = regions.find(r => r.ID === regionId);
      if (!region) return req.reject(400, 'Unknown region');

      const all = await SELECT.from(Options);
      const byId = Object.fromEntries(all.map(o => [o.ID, o]));
      const trimName = rank => {
        // e.g. "SX" for the Verna - the cheapest trim of this model that reaches the rank
        return SELECT.one.from(Variants).columns('name').where({ model_ID: model.ID, trimRank: { '>=': rank } }).orderBy('trimRank', 'basePrice');
      };

      // Standard-fit options come free with the trim; a customer cannot buy them again
      const standard = all.filter(o => o.active && fits(o, model) && isStandard(o, v));
      const stdIds = new Set(standard.map(o => o.ID));
      const ids = [...new Set(req.data.optionIds || [])].filter(id => !stdIds.has(id));
      const opts = ids.map(id => byId[id]);
      if (opts.some(o => !o)) return req.reject(400, 'Unknown option in configuration');
      for (const o of opts) {
        if (!o.active) return req.reject(400, `${o.name} is currently unavailable`);
        if (!fits(o, model)) return req.reject(400, `${o.name} is not offered on the ${model.name}`);
        if (o.minRank > v.trimRank) {
          const t = await trimName(o.minRank);
          return req.reject(400, t ? `${o.name} needs the ${t.name} trim or above` : `${o.name} is not offered on the ${model.name}`);
        }
      }

      const fitted = new Set([...ids, ...stdIds]);
      const rules = await SELECT.from(OptionRules);
      const discounts = [];
      for (const r of rules) {
        const a = fitted.has(r.option_ID), b = fitted.has(r.target_ID);
        if (r.ruleType === 'REQUIRES' && a && !b) return req.reject(400, r.reason);
        if (r.ruleType === 'EXCLUDES' && a && b) return req.reject(400, r.reason);
        // Combo price only when both are paid for; a free standard item earns no discount
        if (r.ruleType === 'DISCOUNT' && ids.includes(r.option_ID) && ids.includes(r.target_ID) && r.amount > 0)
          discounts.push({ name: r.reason, price: r.amount });
      }

      let plan = null;
      if (finance) {
        const bad = checkFinance(req, finance);
        if (bad) return req.reject(400, bad);
      }

      const optionsTotal = opts.reduce((s, o) => s + o.price, 0);
      const discount = discounts.reduce((s, d) => s + d.price, 0);
      const p = priceFor(v, optionsTotal, discount, region);
      if (finance) plan = financeFor(p.total, { downPct: +finance.downPct, months: +finance.months, ratePct: +finance.ratePct });
      return {
        car: `${model.brand} ${model.name} ${v.name}`, model: model.name, region: region.name,
        basePrice: v.basePrice, adjustPct: region.adjustPct, gstPct: region.gstPct, roadTaxPct: region.roadTaxPct,
        ...p,
        discounts,
        options: [
          ...standard.map(o => ({ name: o.name, price: 0, standard: true })),
          ...opts.map(o => ({ name: o.name, price: o.price, standard: false }))
        ],
        comparison: regions.map(r => ({ region: r.name, total: priceFor(v, optionsTotal, discount, r).total })),
        paymentMode: plan ? 'EMI' : 'CASH',
        finance: plan
      };
    };

    this.on('calculate', req => build(req));

    this.on('saveQuote', async req => {
      const b = await build(req);
      if (!b) return;
      const { n } = await SELECT.one.from(Quotes).columns('count(*) as n');
      const ID = cds.utils.uuid();
      const quoteNo = `Q-${new Date().getFullYear()}-${String(n + 1).padStart(5, '0')}`;
      const validUntil = new Date(Date.now() + QUOTE_VALID_DAYS * 864e5).toISOString().slice(0, 10);
      const f = b.finance || {};
      await INSERT.into(Quotes).entries({
        ID, quoteNo, customer: req.user.id, modelName: b.model, carName: b.car, regionName: b.region,
        basePrice: b.basePrice, optionsTotal: b.optionsTotal, adjustment: b.adjustment, gst: b.gst,
        roadTax: b.roadTax, registration: b.registration, discount: b.discount, total: b.total, validUntil,
        paymentMode: b.paymentMode, downPct: f.downPct, downPayment: f.downPayment, loanAmount: f.loanAmount,
        tenureMonths: f.months, interestRate: f.ratePct, emi: f.emi, totalInterest: f.totalInterest,
        optionsJson: JSON.stringify(b.options),
        discountsJson: JSON.stringify(b.discounts),
        items: b.options.map(o => ({ optionName: o.name, price: o.price }))
      });
      return { ID, quoteNo };
    });

    // ---- Admin input checks, so a bad edit cannot break the configurator ----
    const rank = (req, k, nullable) => {
      const val = req.data[k];
      if (val === undefined || (nullable && val === null)) return;
      if (!Number.isInteger(val) || val < 1 || val > 4) req.error(400, `${k} must be a trim level from 1 to 4`);
    };
    const notNegative = (req, k) => { if (req.data[k] !== undefined && !(req.data[k] >= 0)) req.error(400, `${k} cannot be negative`); };

    this.before(['CREATE', 'UPDATE'], 'Variants', req => {
      rank(req, 'trimRank');
      if (req.data.basePrice !== undefined && !(req.data.basePrice > 0)) req.error(400, 'Ex-showroom price must be above zero');
    });
    this.before(['CREATE', 'UPDATE'], 'Options', req => {
      rank(req, 'minRank'); rank(req, 'standardRank', true); notNegative(req, 'price');
    });
    this.before('CREATE', 'OptionRules', async req => {
      const r = req.data;
      if (!RULE_TYPES.includes(r.ruleType)) return req.reject(400, `Rule type must be one of ${RULE_TYPES.join(', ')}`);
      if (!r.option_ID || r.option_ID === r.target_ID) return req.reject(400, 'Pick two different options');
      const found = await SELECT.from(Options).columns('ID').where({ ID: { in: [r.option_ID, r.target_ID] } });
      if (found.length !== 2) return req.reject(400, 'Unknown option in rule');
      if (r.ruleType === 'DISCOUNT' && !(r.amount > 0)) return req.reject(400, 'A combo discount needs an amount');
      if (r.ruleType !== 'DISCOUNT') r.amount = 0;
      const dupe = await SELECT.one.from(OptionRules).where({ ruleType: r.ruleType, option_ID: r.option_ID, target_ID: r.target_ID });
      if (dupe) return req.reject(400, 'This rule already exists');
    });
    this.before('DELETE', 'Variants', async req => {
      const v = await SELECT.one.from(Variants).where({ ID: req.data.ID });
      if (!v) return;
      const { n } = await SELECT.one.from(Variants).columns('count(*) as n').where({ model_ID: v.model_ID });
      if (n <= 1) req.reject(400, 'A model needs at least one trim');
    });

    this.on('whoami', req => ({ user: req.user.id, admin: !!req.user.is('ADMIN') }));

    this.on('analytics', async () => {
      const quotes = await SELECT.from(Quotes);
      const items = await SELECT.from(QuoteItems).where({ price: { '>': 0 } });
      const tally = (rows, key, val = () => 1) => {
        const m = {};
        rows.forEach(r => { m[key(r)] = (m[key(r)] || 0) + val(r); });
        return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
      };
      return {
        totalQuotes: quotes.length,
        totalValue: quotes.reduce((s, q) => s + q.total, 0),
        emiQuotes: quotes.filter(q => q.paymentMode === 'EMI').length,
        options: tally(items, i => i.optionName),
        models: tally(quotes, q => q.modelName),
        variants: tally(quotes, q => q.carName),
        regions: tally(quotes, q => q.regionName, q => q.total),
        payment: tally(quotes, q => q.paymentMode === 'EMI' ? 'EMI' : 'Direct purchase')
      };
    });

    return super.init();
  }
};
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
// /cpq calls are proxied to the CAP server, so no CORS setup is needed
export default defineConfig({ plugins: [react()], server: { port: 5173, proxy: { '/cpq': 'http://localhost:4004' } } });
````

### frontend/index.html

````html
<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Showroom CPQ</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
</head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>
````

### frontend/src/main.jsx

````jsx
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
createRoot(document.getElementById('root')).render(<App />);
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
    const [models, variants, options, rules, regions] = await Promise.all(['Models', 'Variants', 'Options', 'OptionRules', 'Regions'].map(list));
    return { models, variants, options, rules, regions };
  },
  calculate: b => call('calculate', { method: 'POST', body: b }),
  saveQuote: b => call('saveQuote', { method: 'POST', body: b }),
  quotes: () => list('Quotes?$orderby=createdAt desc'),
  analytics: () => call('analytics()'),
  patch: (set, key, body) => call(`${set}('${key}')`, { method: 'PATCH', body }),
  create: (set, body) => call(set, { method: 'POST', body }),
  remove: (set, key) => call(`${set}('${key}')`, { method: 'DELETE' })
};
````

### frontend/src/util.js

````js
export const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
export const compact = n => n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : inr(n);
````

### frontend/src/App.jsx

````jsx
import { useEffect, useState } from 'react';
import { api, hasAuth, setAuth, clearAuth } from './api';
import CarArt from './CarArt';
import Configurator from './Configurator';
import Quotes from './Quotes';
import Admin from './Admin';

function Login({ onLogin }) {
  const [u, setU] = useState('user'), [p, setP] = useState('user'), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const go = async e => {
    e?.preventDefault(); setBusy(true); setErr('');
    try { setAuth(u, p); await onLogin(); }
    catch (ex) { clearAuth(); setErr(ex.message.includes('fetch') ? 'Cannot reach the server. Is "npm start" running?' : ex.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="login">
      <section className="login-hero">
        <h1>Build the car.<br />See the price<br />as you go.</h1>
        <p>Pick a model, choose options, and get an on-road quote for your state in minutes.</p>
        <CarArt body="SUV" color="#e0562f" alloy />
      </section>
      <form className="login-card" onSubmit={go}>
        <h2>Sign in</h2>
        <label>Username<input value={u} onChange={e => setU(e.target.value)} autoComplete="username" /></label>
        <label>Password<input type="password" value={p} onChange={e => setP(e.target.value)} autoComplete="current-password" /></label>
        {err && <div className="alert" role="alert">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="demo">
          <span>Try a demo account</span>
          <button type="button" className="chip" onClick={() => { setU('user'); setP('user'); }}>Customer</button>
          <button type="button" className="chip" onClick={() => { setU('admin'); setP('admin'); }}>Admin</button>
        </div>
      </form>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [cat, setCat] = useState(null);
  const [tab, setTab] = useState('configure');
  const [booting, setBooting] = useState(hasAuth());

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
  const logout = () => { clearAuth(); sessionStorage.removeItem('cpq-seen'); setMe(null); setCat(null); setTab('configure'); };

  if (booting) return <div className="boot">Loading showroom…</div>;
  if (!me || !cat) return <Login onLogin={load} />;

  const tabs = me.admin
    ? [['admin', 'Dashboard'], ['configure', 'Configure'], ['quotes', 'All quotes']]
    : [['configure', 'Configure'], ['quotes', 'My quotes']];
  return (
    <>
      <header className="top">
        <div className="brand"><span className="dot" />Showroom CPQ</div>
        <nav>{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>
        <div className="who"><span>{me.user}<em>{me.admin ? 'Admin' : 'Customer'}</em></span><button className="btn ghost" onClick={logout}>Sign out</button></div>
      </header>
      <main>
        {tab === 'configure' && <Configurator cat={cat} me={me} goQuotes={() => setTab('quotes')} />}
        {tab === 'quotes' && <Quotes me={me} />}
        {tab === 'admin' && me.admin && <Admin cat={cat} reload={reloadCatalog} />}
      </main>
    </>
  );
}
````

### frontend/src/CarArt.jsx

````jsx
// Side-view car illustrations. `color` is animated via CSS so paint changes glide.
const SHAPES = {
  Sedan: {
    body: 'M28 156 C28 142 38 136 62 132 L124 120 C146 92 172 74 208 72 L300 72 C332 74 356 94 376 120 L430 130 C456 135 468 144 468 156 L468 168 L28 168 Z',
    glass: 'M152 118 C166 94 184 82 208 80 L246 80 L246 118 Z M258 80 L300 80 C322 82 340 98 354 118 L258 118 Z',
    roof: [206, 72, 96], wheels: [128, 372]
  },
  SUV: {
    body: 'M28 156 C28 138 38 130 62 126 L112 116 L148 76 C156 66 168 62 184 62 L338 62 C354 62 362 70 370 82 L392 116 L436 124 C460 130 470 140 470 156 L470 170 L28 170 Z',
    glass: 'M158 114 L186 74 L246 74 L246 114 Z M258 74 L334 74 C342 74 346 78 352 86 L368 114 L258 114 Z',
    roof: [184, 62, 154], wheels: [128, 376]
  },
  Hatchback: {
    body: 'M44 156 L48 118 C52 94 74 78 112 74 L304 74 C336 76 358 94 374 118 L426 128 C450 134 460 144 460 156 L460 168 L44 168 Z',
    glass: 'M92 112 C96 92 108 84 128 82 L206 82 L206 114 Z M218 82 L300 82 C322 84 340 100 352 114 L218 114 Z',
    roof: [112, 74, 192], wheels: [130, 372]
  }
};

export default function CarArt({ body = 'Sedan', color = '#2f6fe4', alloy = false, matte = false, sunroof = false, className = '' }) {
  const s = SHAPES[body] || SHAPES.Sedan;
  const gid = 'g' + body + (matte ? 'm' : 'g');
  const wheelY = 166;
  return (
    <svg viewBox="0 0 500 220" className={'car ' + className} role="img" aria-label={`${body} illustration`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={matte ? 0.06 : 0.42} />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.38" />
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#dfe9f5" /><stop offset="1" stopColor="#7e92ab" /></linearGradient>
      </defs>
      <ellipse cx="250" cy="198" rx="205" ry="9" fill="#0d2240" opacity="0.18" />
      <path d={s.body} className="paint" style={{ fill: color }} />
      <path d={s.body} fill={`url(#${gid})`} />
      {!matte && <path d="M70 134 C150 124 330 124 430 134" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" fill="none" />}
      <path d={s.glass} fill="url(#glass)" opacity="0.92" />
      {sunroof && <rect x={s.roof[0]} y={s.roof[1] - 3} width={s.roof[2]} height="5" rx="2.5" fill="url(#glass)" />}
      <ellipse cx="452" cy="142" rx="9" ry="4" fill="#fff6c9" />
      <rect x={s.wheels[0] - 82} y="140" width="8" height="8" rx="2" fill="#e5484d" />
      {s.wheels.map(cx => (
        <g key={cx}>
          <circle cx={cx} cy={wheelY} r="40" fill="#0b1522" />
          <circle cx={cx} cy={wheelY} r="31" fill="#161d27" />
          <circle cx={cx} cy={wheelY} r="21" fill={alloy ? '#d7dde6' : '#2b323d'} />
          {alloy && [0, 72, 144, 216, 288].map(a => (
            <line key={a} x1={cx} y1={wheelY} x2={cx + 21 * Math.cos(a * Math.PI / 180)} y2={wheelY + 21 * Math.sin(a * Math.PI / 180)} stroke="#8d97a6" strokeWidth="4" />
          ))}
          <circle cx={cx} cy={wheelY} r="5" fill={alloy ? '#8d97a6' : '#4a5361'} />
        </g>
      ))}
    </svg>
  );
}
````

### frontend/src/Configurator.jsx

````jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { inr } from './util';
import CarArt from './CarArt';
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

const STEPS = ['Choose your car', 'Customise', 'Region and quote'];
const EMI_DEFAULT = { downPct: 20, months: 60, ratePct: 9 };
const GEARBOX = { Manual: 'Manual', IVT: 'Automatic', DCT: 'Automatic' };

export default function Configurator({ cat, me, goQuotes }) {
  const { models, variants, options, rules, regions } = cat;
  const optById = useMemo(() => Object.fromEntries(options.map(o => [o.ID, o])), [options]);
  const trimsOf = id => variants.filter(v => v.model_ID === id).sort((a, b) => a.trimRank - b.trimRank || a.basePrice - b.basePrice);

  const [step, setStep] = useState(0);
  const [modelId, setModelId] = useState(models[0].ID);
  const [variantId, setVariantId] = useState(() => trimsOf(models[0].ID)[0].ID);
  const [sel, setSel] = useState(new Set());
  const [regionId, setRegionId] = useState(regions[0].ID);
  const [price, setPrice] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [emi, setEmi] = useState(null);           // null = direct purchase; the EMI calculator opens on demand
  const [filter, setFilter] = useState({ fuel: '', gear: '' });

  const model = models.find(m => m.ID === modelId);
  const variant = variants.find(v => v.ID === variantId);

  // ---- Option rules (the backend re-checks all of these) ----
  const fits = (o, m = model) => !o.bodyTypes || o.bodyTypes.split('|').includes(m.bodyType);
  const standardOf = (v, m) => new Set(options.filter(o => o.active && fits(o, m) && o.standardRank != null && v.trimRank >= o.standardRank).map(o => o.ID));
  const std = useMemo(() => standardOf(variant, model), [variant, model, options]);
  const trimFrom = rank => trimsOf(modelId).find(v => v.trimRank >= rank);
  const offered = o => o.active && fits(o) && !!trimFrom(o.minRank);   // hide what this model can never have
  const other = (r, id) => (r.option_ID === id ? r.target_ID : r.option_ID);
  const excludesOf = id => rules.filter(r => r.ruleType === 'EXCLUDES' && (r.option_ID === id || r.target_ID === id));

  // Remove selections that stopped being valid (trim/model change, dependency removed, now standard)
  const settle = (set, v = variant, m = model) => {
    const s = new Set(set), st = standardOf(v, m); let again = true;
    while (again) {
      again = false;
      for (const id of [...s]) {
        const o = optById[id];
        const bad = !o || !o.active || !fits(o, m) || o.minRank > v.trimRank || st.has(id) ||
          rules.some(r => r.option_ID === id && r.ruleType === 'REQUIRES' && !s.has(r.target_ID) && !st.has(r.target_ID)) ||
          excludesOf(id).some(r => st.has(other(r, id)));
        if (bad) { s.delete(id); again = true; }
      }
    }
    return s;
  };

  const pickVariant = (v, m = model) => {
    const after = settle(sel, v, m), st = standardOf(v, m);
    const gone = [...sel].filter(id => !after.has(id));
    const nowStd = gone.filter(id => st.has(id)).map(id => optById[id].name);
    const lost = gone.filter(id => !st.has(id)).map(id => optById[id]?.name).filter(Boolean);
    setNote([nowStd.length && `${nowStd.join(', ')} now included with ${v.name}`, lost.length && `Removed ${lost.join(', ')} (not available on ${v.name})`].filter(Boolean).join('. '));
    setVariantId(v.ID); setSel(after);
  };
  const pickModel = id => { setModelId(id); setFilter({ fuel: '', gear: '' }); pickVariant(trimsOf(id)[0], models.find(m => m.ID === id)); };

  // What happens if the customer clicks this option?
  const status = o => {
    if (std.has(o.ID)) return { state: 'std' };
    if (sel.has(o.ID)) return { state: 'on' };
    if (!o.active) return { state: 'blocked', why: 'Currently unavailable' };
    if (o.minRank > variant.trimRank) return { state: 'blocked', why: `Available from the ${trimFrom(o.minRank).name} trim` };
    const has = id => sel.has(id) || std.has(id);
    const clashes = excludesOf(o.ID).filter(r => has(other(r, o.ID)));
    const fixed = clashes.find(r => std.has(other(r, o.ID)));
    if (fixed) return { state: 'blocked', why: `${optById[other(fixed, o.ID)].name} comes standard on this trim` };
    if (clashes.length) return o.groupName === 'Colour' ? { state: 'swap', clashes } : { state: 'blocked', why: clashes[0].reason };
    const needs = rules.filter(r => r.option_ID === o.ID && r.ruleType === 'REQUIRES' && !has(r.target_ID)).map(r => optById[r.target_ID]);
    const bad = needs.find(t => !t || !t.active || !fits(t) || t.minRank > variant.trimRank);
    if (bad) return { state: 'blocked', why: `Needs ${bad?.name || 'an option'}, which this trim cannot take` };
    const blocker = needs.flatMap(t => excludesOf(t.ID).filter(r => has(other(r, t.ID))).map(r => [t, optById[other(r, t.ID)]]))[0];
    if (blocker) return { state: 'blocked', why: `Needs ${blocker[0].name}, which conflicts with ${blocker[1].name}` };
    if (needs.length) return { state: 'auto', needs };
    return { state: 'ok' };
  };

  // Combo discount hint, e.g. "Save ₹5,000 with Premium Sound"
  const combo = o => {
    const r = rules.find(r => r.ruleType === 'DISCOUNT' && (r.option_ID === o.ID || r.target_ID === o.ID) && !std.has(other(r, o.ID)) && offered(optById[other(r, o.ID)] || {}));
    if (!r) return '';
    const partner = optById[other(r, o.ID)];
    return sel.has(o.ID) && sel.has(partner.ID) ? `Combo price: you save ${inr(r.amount)}` : `Save ${inr(r.amount)} with ${partner.name}`;
  };

  const toggle = o => {
    const st = status(o); if (st.state === 'blocked' || st.state === 'std') return;
    const s = new Set(sel); let msg = '';
    if (st.state === 'on') s.delete(o.ID);
    else {
      if (st.state === 'swap') { st.clashes.forEach(r => s.delete(other(r, o.ID))); msg = `Switched to ${o.name}`; }
      if (st.state === 'auto') { st.needs.forEach(t => s.add(t.ID)); msg = `Added ${st.needs.map(t => t.name).join(' and ')} because ${o.name} needs it`; }
      s.add(o.ID);
    }
    const after = settle(s);
    const dropped = [...s].filter(id => !after.has(id) && id !== o.ID).map(id => optById[id].name);
    if (st.state === 'on' && dropped.length) msg = `Also removed ${dropped.join(', ')} because it needs ${o.name}`;
    setNote(msg); setSel(after);
  };

  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(''), 4000); return () => clearTimeout(t); }, [note]);

  // Backend does all pricing (EMI included); we only send IDs and the finance choice
  const key = [...sel].sort().join(',') + JSON.stringify(emi);
  useEffect(() => {
    let live = true; setSaved(null);
    const t = setTimeout(() => api.calculate({ variantId, regionId, optionIds: [...sel], finance: emi })
      .then(b => { if (live) { setPrice(b); setErr(''); } })
      .catch(e => live && setErr(e.message)), emi ? 200 : 0);   // sliders fire quickly, so wait for them to settle
    return () => { live = false; clearTimeout(t); };
  }, [variantId, regionId, key]);

  const shown = useCountUp(price?.total ?? 0);
  const paint = [...sel, ...std].map(id => optById[id]).find(o => o.groupName === 'Colour');
  const color = paint?.swatch || model.accent;
  const fitted = id => sel.has(id) || std.has(id);

  const openEmi = () => { setEmi(EMI_DEFAULT); setStep(2); };
  const save = async () => {
    setSaving(true);
    try {
      const r = await api.saveQuote({ variantId, regionId, optionIds: [...sel], finance: emi });
      const validUntil = new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10);
      setSaved({ ...price, quoteNo: r.quoteNo, customer: me.user, createdAt: new Date().toISOString(), validUntil });
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const groups = [...new Set(options.filter(offered).map(o => o.groupName))];
  const comparisonMax = price ? Math.max(...price.comparison.map(c => c.total)) : 1;
  const comparisonMin = price ? Math.min(...price.comparison.map(c => c.total)) : 0;
  const plan = price?.finance;
  const trims = trimsOf(modelId);
  const fuels = [...new Set(trims.map(v => v.fuel))], gears = [...new Set(trims.map(v => GEARBOX[v.transmission]))];
  const shownTrims = trims.filter(v => (!filter.fuel || v.fuel === filter.fuel) && (!filter.gear || GEARBOX[v.transmission] === filter.gear));

  return (
    <div className="cfg">
      <div className="cfg-main">
        <section className="stage" style={{ '--paint': color }}>
          <div className="stage-head">
            <div><h2>{model.brand} {model.name}</h2><p>{variant.name} · {model.bodyType}{paint ? ` · ${paint.name}` : ''}</p></div>
            {note && <div className="note" role="status">{note}</div>}
          </div>
          <CarArt body={model.bodyType} color={color} alloy={fitted('alloy')} sunroof={fitted('sunroof')} matte={paint?.ID === 'matte'} />
        </section>

        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s}><button className={step === i ? 'on' : i < step ? 'done' : ''} onClick={() => setStep(i)}><b>{i + 1}</b>{s}</button></li>
          ))}
        </ol>

        {step === 0 && (
          <section className="panel">
            <h3>Model</h3>
            <div className="models">
              {models.map(m => (
                <button key={m.ID} className={'model' + (m.ID === modelId ? ' on' : '')} onClick={() => pickModel(m.ID)}>
                  <CarArt body={m.bodyType} color={m.accent} />
                  <strong>{m.name}</strong><span>{m.bodyType}</span><em>{m.tagline}</em>
                  <small>from {inr(trimsOf(m.ID)[0].basePrice)} · {trimsOf(m.ID).length} trims</small>
                </button>
              ))}
            </div>
            <h3>Trim</h3>
            {(fuels.length > 1 || gears.length > 1) && (
              <div className="filters" role="group" aria-label="Filter trims">
                {[['fuel', fuels], ['gear', gears]].filter(([, vals]) => vals.length > 1).map(([k, vals]) => (
                  <span key={k}>
                    {['', ...vals].map(val => (
                      <button key={val || 'all'} className={'chip' + (filter[k] === val ? ' on' : '')} aria-pressed={filter[k] === val}
                        onClick={() => setFilter({ ...filter, [k]: val })}>{val || (k === 'fuel' ? 'Any fuel' : 'Any gearbox')}</button>
                    ))}
                  </span>
                ))}
              </div>
            )}
            <div className="trims">
              {shownTrims.map(v => {
                const inc = [...standardOf(v, model)].map(id => optById[id].name);
                return (
                  <button key={v.ID} className={'trim' + (v.ID === variantId ? ' on' : '')} onClick={() => pickVariant(v)}>
                    <div><strong>{v.name}</strong><span>{inr(v.basePrice)}</span></div>
                    <p className="spec">{v.fuel} · {v.transmission}</p>
                    <ul>{(v.features || '').split('|').map(f => <li key={f}>{f}</li>)}</ul>
                    {inc.length > 0 && <p className="inc">Included: {inc.join(', ')}</p>}
                  </button>
                );
              })}
              {shownTrims.length === 0 && <p className="muted">No trim matches these filters.</p>}
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="panel">
            {groups.map(g => (
              <div key={g} className="group">
                <h3>{g}</h3>
                <div className={g === 'Colour' ? 'swatches' : 'optlist'}>
                  {options.filter(o => offered(o) && o.groupName === g).map(o => {
                    const st = status(o), isStd = st.state === 'std', on = st.state === 'on' || isStd, blocked = st.state === 'blocked';
                    const deal = !blocked && !isStd && combo(o);
                    const hint = isStd ? `Included with the ${variant.name} trim` : blocked ? st.why : st.state === 'auto' ? `Also adds ${st.needs.map(t => t.name).join(', ')}` : st.state === 'swap' ? 'Replaces your current paint' : o.description;
                    const pr = isStd ? 'Included' : `+${inr(o.price)}`;
                    return g === 'Colour' ? (
                      <button key={o.ID} className={'swatch' + (on ? ' on' : '')} disabled={blocked || isStd} onClick={() => toggle(o)} aria-pressed={on}>
                        <i style={{ background: o.swatch }} /><strong>{o.name}</strong><span>{pr}</span><em className={blocked ? 'why' : ''}>{blocked ? hint : o.description}</em>
                      </button>
                    ) : (
                      <button key={o.ID} className={'opt' + (on ? ' on' : '') + (blocked ? ' blocked' : '') + (isStd ? ' std' : '')} disabled={blocked || isStd} onClick={() => toggle(o)} role="switch" aria-checked={on}>
                        <span className="sw"><span /></span>
                        <span className="txt"><strong>{o.name}</strong><em className={blocked ? 'why' : ''}>{hint}</em>{deal && <em className="deal">{deal}</em>}</span>
                        <span className="pr">{pr}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}

        {step === 2 && (
          <section className="panel">
            <h3>Where will it be registered?</h3>
            <div className="regions">
              {regions.map(r => (
                <button key={r.ID} className={'region' + (r.ID === regionId ? ' on' : '')} onClick={() => setRegionId(r.ID)}>
                  <strong>{r.name}</strong><span>GST {r.gstPct}% · Road tax {r.roadTaxPct}%</span>
                </button>
              ))}
            </div>
            {price && <>
              <h3>Same car, every region</h3>
              <ul className="compare">
                {price.comparison.map(c => (
                  <li key={c.region} className={c.region === price.region ? 'cur' : ''}>
                    <span>{c.region}</span>
                    <div><i style={{ width: `${40 + 60 * (c.total - comparisonMin) / Math.max(1, comparisonMax - comparisonMin)}%` }} /></div>
                    <b>{inr(c.total)}</b>
                  </li>
                ))}
              </ul>
              <h3>Payment</h3>
              {!emi ? (
                <div className="pay">
                  <div><strong>Direct purchase</strong><span>Pay the full on-road price of {inr(price.total)}. Your quotation shows this amount.</span></div>
                  <button className="btn outline" onClick={openEmi}>EMI</button>
                </div>
              ) : (
                <div className="emi">
                  <label>Down payment <b>{emi.downPct}%</b><input type="range" min="10" max="90" step="5" value={emi.downPct} onChange={e => setEmi({ ...emi, downPct: +e.target.value })} /></label>
                  <label>Tenure <b>{emi.months / 12} years</b><input type="range" min="12" max="84" step="12" value={emi.months} onChange={e => setEmi({ ...emi, months: +e.target.value })} /></label>
                  <label>Interest <b>{emi.ratePct}%</b><input type="range" min="6" max="18" step="0.25" value={emi.ratePct} onChange={e => setEmi({ ...emi, ratePct: +e.target.value })} /></label>
                  {plan && <div className="emi-out">
                    <div>Estimated EMI<strong>{inr(plan.emi)}<small> / month</small></strong></div>
                    <dl>
                      <div><dt>Down payment</dt><dd>{inr(plan.downPayment)}</dd></div>
                      <div><dt>Loan amount</dt><dd>{inr(plan.loanAmount)}</dd></div>
                      <div><dt>Total interest</dt><dd>{inr(plan.totalInterest)}</dd></div>
                      <div><dt>Total you pay</dt><dd>{inr(plan.totalPayable)}</dd></div>
                    </dl>
                  </div>}
                  <button className="btn ghost emi-off" onClick={() => setEmi(null)}>Remove EMI, pay in full</button>
                </div>
              )}
            </>}
          </section>
        )}

        <div className="nav">
          <button className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {step < 2 && <button className="btn primary" onClick={() => setStep(step + 1)}>Continue</button>}
        </div>
      </div>

      <aside className="sheet">
        {price ? <>
          <h3>{price.car}</h3><p className="sub">Registered in {price.region}</p>
          <dl>
            <div><dt>Ex-showroom</dt><dd>{inr(price.basePrice)}</dd></div>
            {price.options.filter(o => !o.standard).map(o => <div key={o.name} className="opt-line"><dt>{o.name}</dt><dd>{inr(o.price)}</dd></div>)}
            {price.discounts.map(d => <div key={d.name} className="opt-line deal"><dt>{d.name}</dt><dd>−{inr(d.price)}</dd></div>)}
            {price.options.some(o => o.standard) && <div className="opt-line"><dt>{price.options.filter(o => o.standard).length} standard features</dt><dd>Included</dd></div>}
            <div className="sep"><dt>Taxes and fees</dt></div>
            <div><dt>Region adjustment ({price.adjustPct}%)</dt><dd>{inr(price.adjustment)}</dd></div>
            <div><dt>GST ({price.gstPct}%)</dt><dd>{inr(price.gst)}</dd></div>
            <div><dt>Road tax ({price.roadTaxPct}%)</dt><dd>{inr(price.roadTax)}</dd></div>
            <div><dt>Registration</dt><dd>{inr(price.registration)}</dd></div>
          </dl>
          <div className="total"><span>On-road price{price.discount > 0 ? ` · you save ${inr(price.discount)}` : ''}</span><strong>{inr(shown)}</strong></div>
          {plan
            ? <div className="emi-sum"><span>EMI {inr(plan.emi)}/month</span><small>{plan.months / 12} years at {plan.ratePct}% · {inr(plan.downPayment)} down</small></div>
            : <button className="btn outline emi-btn" onClick={openEmi}>EMI</button>}
          {err && <div className="alert dark" role="alert">{err}</div>}
          {!saved ? (
            step === 2
              ? <button className="btn accent" onClick={save} disabled={saving || !!err}>{saving ? 'Saving…' : plan ? 'Get EMI quotation' : 'Get quotation'}</button>
              : <button className="btn accent" onClick={() => setStep(step + 1)}>{step === 0 ? 'Customise this car' : 'Choose region'}</button>
          ) : (
            <div className="saved">
              <p>Quotation <b>{saved.quoteNo}</b> · valid until {new Date(saved.validUntil).toLocaleDateString('en-IN')}</p>
              <button className="btn accent" onClick={() => downloadQuotePdf(saved)}>Download PDF</button>
              <button className="btn outline" onClick={goQuotes}>View my quotes</button>
            </div>
          )}
        </> : <p className="sub">{err || 'Pricing…'}</p>}
      </aside>
    </div>
  );
}
````

### frontend/src/Quotes.jsx

````jsx
import { useEffect, useState } from 'react';
import { api } from './api';
import { inr } from './util';
import { downloadQuotePdf } from './pdf';

const parse = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
// Rebuild the PDF shape from the snapshot stored on the quote
const toPdf = q => ({
  ...q, car: q.carName, region: q.regionName, options: parse(q.optionsJson), discounts: parse(q.discountsJson),
  finance: q.paymentMode === 'EMI'
    ? { downPct: q.downPct, downPayment: q.downPayment, loanAmount: q.loanAmount, months: q.tenureMonths, ratePct: q.interestRate, emi: q.emi, totalInterest: q.totalInterest }
    : null
});

export default function Quotes({ me }) {
  const [rows, setRows] = useState(null), [err, setErr] = useState(''), [show, setShow] = useState('all');
  useEffect(() => { api.quotes().then(setRows).catch(e => setErr(e.message)); }, []);
  if (err) return <div className="alert page">{err}</div>;
  if (!rows) return <div className="boot">Loading quotes…</div>;
  const today = new Date().toISOString().slice(0, 10);
  const expired = q => q.validUntil && q.validUntil < today;
  const list = rows.filter(q => show === 'all' || (show === 'valid' ? !expired(q) : q.paymentMode === show));
  return (
    <section className="page">
      <div className="page-head">
        <h2>{me.admin ? 'All quotes' : 'My quotes'}</h2>
        {rows.length > 0 && <div className="tabs inline">
          {[['all', 'All'], ['valid', 'Still valid'], ['CASH', 'Direct purchase'], ['EMI', 'EMI']].map(([k, l]) =>
            <button key={k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>)}
        </div>}
      </div>
      {rows.length === 0 ? <div className="empty"><b>No quotes yet</b><p>Configure a car and save it to see it here.</p></div> : (
        <div className="qlist">
          {list.length === 0 && <p className="muted">No quotes match this filter.</p>}
          {list.map(q => {
            const n = parse(q.optionsJson).filter(o => !o.standard).length;
            return (
              <article key={q.ID} className="qcard">
                <div><strong>{q.carName}</strong><span>{q.quoteNo} · {new Date(q.createdAt).toLocaleDateString('en-IN')}{me.admin ? ` · ${q.customer}` : ''}</span></div>
                <div className="qmeta"><span>{q.regionName} · {n} option{n === 1 ? '' : 's'}</span>
                  <span className={expired(q) ? 'why' : ''}>{q.validUntil ? (expired(q) ? 'Expired ' : 'Valid until ') + new Date(q.validUntil).toLocaleDateString('en-IN') : ''}</span></div>
                <div className="qtotal">{inr(q.total)}
                  <small>{q.paymentMode === 'EMI' ? `EMI ${inr(q.emi)}/mo · ${q.tenureMonths / 12} yrs` : 'Direct purchase'}</small></div>
                <button className="btn outline" onClick={() => downloadQuotePdf(toPdf(q))}>PDF</button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
````

### frontend/src/Admin.jsx

````jsx
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { inr, compact } from './util';

function Num({ value, onSave, step = 1 }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input className="num" type="number" step={step} value={v} onChange={e => setV(e.target.value)}
    onBlur={() => { if (v !== '' && +v !== +value) onSave(+v); else setV(value); }} />;
}

function Bars({ rows, fmt = v => v }) {
  if (!rows?.length) return <p className="muted">Nothing yet. Save a quote to see data here.</p>;
  const max = Math.max(...rows.map(r => r.value));
  return <ul className="bars">{rows.slice(0, 6).map(r => (
    <li key={r.label}><span>{r.label}</span><div><i style={{ width: `${(r.value / max) * 100}%` }} /></div><b>{fmt(r.value)}</b></li>
  ))}</ul>;
}

const RANKS = { 1: 'Entry', 2: 'Mid', 3: 'High', 4: 'Top' };
const RULES = { REQUIRES: 'Needs', EXCLUDES: 'Cannot combine with', DISCOUNT: 'Combo discount with' };
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) + '-' + Math.random().toString(36).slice(2, 5);

function RankSelect({ value, onChange, none }) {
  return <select value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : +e.target.value)}>
    {none && <option value="">{none}</option>}
    {Object.entries(RANKS).map(([k, l]) => <option key={k} value={k}>{k} · {l}</option>)}
  </select>;
}

export default function Admin({ cat, reload }) {
  const { models, variants, options, rules, regions } = cat;
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [flash, setFlash] = useState('');
  const [nw, setNw] = useState({ name: '', groupName: 'Interior', price: '', minRank: 1, standardRank: '', bodyTypes: '' });
  const [nv, setNv] = useState({ model_ID: models[0]?.ID, name: '', fuel: 'Petrol', transmission: 'Manual', trimRank: 1, basePrice: '', features: '' });
  const [nr, setNr] = useState({ option_ID: '', ruleType: 'REQUIRES', target_ID: '', amount: '', reason: '' });

  useEffect(() => { if (tab === 'overview') api.analytics().then(setStats).catch(e => setFlash({ m: e.message, bad: true })); }, [tab]);
  const timer = useRef();
  const say = (m, bad = false) => { clearTimeout(timer.current); setFlash({ m, bad }); timer.current = setTimeout(() => setFlash(''), bad ? 4000 : 2200); };
  const act = async (fn, ok = 'Saved') => { try { await fn(); await reload(); say(ok); } catch (e) { say(e.message, true); } };
  const save = (set, key, body) => act(() => api.patch(set, key, body));
  const optName = id => options.find(o => o.ID === id)?.name || id;
  const addOption = e => {
    e.preventDefault();
    act(async () => {
      await api.create('Options', { ID: slug(nw.name), groupName: nw.groupName, name: nw.name, description: '', price: +nw.price, active: true,
        minRank: +nw.minRank, standardRank: nw.standardRank === '' ? null : +nw.standardRank, bodyTypes: nw.bodyTypes || null });
      setNw({ ...nw, name: '', price: '' });
    }, 'Option added');
  };
  const addVariant = e => {
    e.preventDefault();
    act(async () => {
      await api.create('Variants', { ID: slug(`${nv.model_ID}-${nv.name}`), ...nv, trimRank: +nv.trimRank, basePrice: +nv.basePrice,
        features: nv.features.split(',').map(f => f.trim()).filter(Boolean).join('|') });
      setNv({ ...nv, name: '', basePrice: '', features: '' });
    }, 'Trim added');
  };
  const addRule = e => {
    e.preventDefault();
    const a = optName(nr.option_ID), b = optName(nr.target_ID);
    const reason = nr.reason.trim() || (nr.ruleType === 'REQUIRES' ? `${a} needs ${b}` : nr.ruleType === 'EXCLUDES' ? `${a} cannot be combined with ${b}` : `Combo: ${a} with ${b}`);
    act(async () => {
      await api.create('OptionRules', { ID: 'r-' + Math.random().toString(36).slice(2, 9), option_ID: nr.option_ID, ruleType: nr.ruleType, target_ID: nr.target_ID, amount: +nr.amount || 0, reason });
      setNr({ ...nr, target_ID: '', amount: '', reason: '' });
    }, 'Rule added');
  };
  const bodyTypes = [...new Set(models.map(m => m.bodyType))];
  const optionPick = (value, onChange, label) => (
    <select value={value} onChange={e => onChange(e.target.value)} required aria-label={label}>
      <option value="">{label}</option>
      {options.map(o => <option key={o.ID} value={o.ID}>{o.name} ({o.groupName})</option>)}
    </select>
  );

  return (
    <section className="page">
      <div className="page-head">
        <h2>Dashboard</h2>
        {flash && <span className={'flash' + (flash.bad ? ' bad' : '')} role="status">{flash.m}</span>}
      </div>
      <div className="tabs">
        {[['overview', 'Overview'], ['prices', 'Prices and options'], ['regions', 'Regions and tax'], ['rules', 'Rules']].map(([k, l]) =>
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'overview' && (stats ? <>
        <div className="kpis">
          <div><span>Quotes</span><b>{stats.totalQuotes}</b></div>
          <div><span>Total quoted value</span><b>{compact(stats.totalValue)}</b></div>
          <div><span>Average quote</span><b>{stats.totalQuotes ? compact(stats.totalValue / stats.totalQuotes) : '–'}</b></div>
          <div><span>Financed with EMI</span><b>{stats.totalQuotes ? Math.round(100 * stats.emiQuotes / stats.totalQuotes) + '%' : '–'}</b></div>
        </div>
        <div className="cols">
          <div className="card"><h3>Most chosen options</h3><Bars rows={stats.options} /></div>
          <div className="card"><h3>Quotes per model</h3><Bars rows={stats.models} /></div>
          <div className="card"><h3>Quoted value by region</h3><Bars rows={stats.regions} fmt={compact} /></div>
          <div className="card"><h3>Most quoted trims</h3><Bars rows={stats.variants} /></div>
          <div className="card"><h3>Payment choice</h3><Bars rows={stats.payment} /></div>
        </div>
      </> : <p className="muted">Loading…</p>)}

      {tab === 'prices' && <>
        <div className="card"><h3>Trims and ex-showroom prices</h3>
          <table className="tbl"><thead><tr><th>Trim</th><th>Powertrain</th><th>Level</th><th className="r">Ex-showroom</th><th /></tr></thead>
            <tbody>{models.flatMap(m => variants.filter(v => v.model_ID === m.ID).sort((a, b) => a.trimRank - b.trimRank || a.basePrice - b.basePrice).map(v => (
              <tr key={v.ID}><td>{m.name} {v.name}</td><td className="muted">{v.fuel} · {v.transmission}</td>
                <td><RankSelect value={v.trimRank} onChange={n => save('Variants', v.ID, { trimRank: n })} /></td>
                <td className="r"><Num value={v.basePrice} step={5000} onSave={n => save('Variants', v.ID, { basePrice: n })} /></td>
                <td className="r"><button className="btn ghost sm" onClick={() => act(() => api.remove('Variants', v.ID), 'Trim removed')}>Remove</button></td></tr>
            )))}</tbody></table>
          <form className="addrow" onSubmit={addVariant}>
            <select value={nv.model_ID} onChange={e => setNv({ ...nv, model_ID: e.target.value })} aria-label="Model">{models.map(m => <option key={m.ID} value={m.ID}>{m.name}</option>)}</select>
            <input placeholder="Trim name, e.g. SX(O) Diesel" value={nv.name} onChange={e => setNv({ ...nv, name: e.target.value })} required />
            <select value={nv.fuel} onChange={e => setNv({ ...nv, fuel: e.target.value })} aria-label="Fuel">{['Petrol', 'Turbo Petrol', 'Diesel', 'CNG', 'Electric'].map(f => <option key={f}>{f}</option>)}</select>
            <select value={nv.transmission} onChange={e => setNv({ ...nv, transmission: e.target.value })} aria-label="Transmission">{['Manual', 'IVT', 'DCT'].map(t => <option key={t}>{t}</option>)}</select>
            <RankSelect value={nv.trimRank} onChange={n => setNv({ ...nv, trimRank: n })} />
            <input type="number" placeholder="Price" value={nv.basePrice} onChange={e => setNv({ ...nv, basePrice: e.target.value })} required min="1" />
            <input className="wide" placeholder="Features, comma separated" value={nv.features} onChange={e => setNv({ ...nv, features: e.target.value })} />
            <button className="btn primary">Add trim</button>
          </form>
          <p className="muted">Trim level drives option rules: an option is offered from its "available from" level and comes free from its "standard from" level.</p></div>
        <div className="card"><h3>Options</h3>
          <table className="tbl"><thead><tr><th>Option</th><th>Group</th><th>Fits</th><th>Available from</th><th>Standard from</th><th className="r">Price</th><th className="r">Available</th></tr></thead>
            <tbody>{options.map(o => (
              <tr key={o.ID}><td>{o.name}</td><td className="muted">{o.groupName}</td><td className="muted">{o.bodyTypes ? o.bodyTypes.split('|').join(', ') : 'All'}</td>
                <td><RankSelect value={o.minRank} onChange={n => save('Options', o.ID, { minRank: n })} /></td>
                <td><RankSelect value={o.standardRank} none="Never" onChange={n => save('Options', o.ID, { standardRank: n })} /></td>
                <td className="r"><Num value={o.price} step={1000} onSave={n => save('Options', o.ID, { price: n })} /></td>
                <td className="r"><button className={'toggle' + (o.active ? ' on' : '')} role="switch" aria-checked={o.active} aria-label={`${o.name} available`} onClick={() => save('Options', o.ID, { active: !o.active })}><span /></button></td></tr>
            ))}</tbody></table>
          <form className="addrow" onSubmit={addOption}>
            <input placeholder="New option name" value={nw.name} onChange={e => setNw({ ...nw, name: e.target.value })} required />
            <select value={nw.groupName} onChange={e => setNw({ ...nw, groupName: e.target.value })} aria-label="Group">{['Interior', 'Infotainment', 'Safety', 'Comfort', 'Exterior', 'Protection'].map(g => <option key={g}>{g}</option>)}</select>
            <select value={nw.bodyTypes} onChange={e => setNw({ ...nw, bodyTypes: e.target.value })} aria-label="Fits body type"><option value="">All body types</option>{bodyTypes.map(b => <option key={b} value={b}>{b} only</option>)}</select>
            <select value={nw.minRank} onChange={e => setNw({ ...nw, minRank: e.target.value })} aria-label="Available from">{Object.entries(RANKS).map(([k, l]) => <option key={k} value={k}>From {l} trim</option>)}</select>
            <select value={nw.standardRank} onChange={e => setNw({ ...nw, standardRank: e.target.value })} aria-label="Standard from"><option value="">Never standard</option>{Object.entries(RANKS).map(([k, l]) => <option key={k} value={k}>Standard on {l}+</option>)}</select>
            <input type="number" placeholder="Price" value={nw.price} onChange={e => setNw({ ...nw, price: e.target.value })} required />
            <button className="btn primary">Add option</button>
          </form></div></>}

      {tab === 'regions' && <div className="card"><h3>Region pricing and tax rules</h3>
        <table className="tbl"><thead><tr><th>Region</th><th className="r">Price adj. %</th><th className="r">GST %</th><th className="r">Road tax %</th><th className="r">Registration</th></tr></thead>
          <tbody>{regions.map(r => (
            <tr key={r.ID}><td>{r.name}</td>
              {[['adjustPct', 0.5], ['gstPct', 0.5], ['roadTaxPct', 0.5], ['registrationFee', 1000]].map(([k, st]) => (
                <td key={k} className="r"><Num value={r[k]} step={st} onSave={n => save('Regions', r.ID, { [k]: n })} /></td>))}</tr>
          ))}</tbody></table>
        <p className="muted">New quotes use these values immediately. Saved quotes keep the price they were issued at.</p></div>}

      {tab === 'rules' && <div className="card"><h3>Option rules</h3>
        <p className="muted">Needs: the option auto-adds the other one. Cannot combine: works both ways. Combo discount: taking both paid options lowers the price.
          Trim and body-type limits are set per option under Prices and options.</p>
        <table className="tbl"><thead><tr><th>Option</th><th>Rule</th><th>Other option</th><th className="r">Discount</th><th>Shown to customer</th><th /></tr></thead>
          <tbody>{rules.map(r => (
            <tr key={r.ID}><td>{optName(r.option_ID)}</td><td><span className={'tag ' + r.ruleType.toLowerCase()}>{RULES[r.ruleType] || r.ruleType}</span></td>
              <td>{optName(r.target_ID)}</td><td className="r">{r.ruleType === 'DISCOUNT' ? inr(r.amount) : ''}</td><td className="muted">{r.reason}</td>
              <td className="r"><button className="btn ghost sm" onClick={() => act(() => api.remove('OptionRules', r.ID), 'Rule removed')}>Remove</button></td></tr>
          ))}</tbody></table>
        <form className="addrow" onSubmit={addRule}>
          {optionPick(nr.option_ID, v => setNr({ ...nr, option_ID: v }), 'Option')}
          <select value={nr.ruleType} onChange={e => setNr({ ...nr, ruleType: e.target.value })} aria-label="Rule type">{Object.entries(RULES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          {optionPick(nr.target_ID, v => setNr({ ...nr, target_ID: v }), 'Other option')}
          {nr.ruleType === 'DISCOUNT' && <input type="number" placeholder="Discount" min="1" value={nr.amount} onChange={e => setNr({ ...nr, amount: e.target.value })} required />}
          <input className="wide" placeholder="Message for the customer (optional)" value={nr.reason} onChange={e => setNr({ ...nr, reason: e.target.value })} />
          <button className="btn primary">Add rule</button>
        </form></div>}
    </section>
  );
}
````

### frontend/src/pdf.js

````js
import { jsPDF } from 'jspdf';
const rs = n => 'Rs ' + Math.round(n || 0).toLocaleString('en-IN');

// q: { quoteNo, customer, createdAt, validUntil?, car, region, basePrice, options[{name, price, standard}], discounts[],
//      adjustment, adjustPct?, gst, gstPct?, roadTax, roadTaxPct?, registration, total, paymentMode, finance? }
export function downloadQuotePdf(q) {
  const d = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = d.internal.pageSize.getWidth(), H = d.internal.pageSize.getHeight();
  const emi = q.paymentMode === 'EMI' && q.finance;
  d.setFillColor(13, 34, 64); d.rect(0, 0, W, 110, 'F');
  d.setTextColor(255); d.setFont('helvetica', 'bold'); d.setFontSize(24); d.text(emi ? 'Quotation - EMI' : 'Quotation', 40, 58);
  d.setFont('helvetica', 'normal'); d.setFontSize(11); d.text(q.quoteNo, 40, 82);
  const date = new Date(q.createdAt || Date.now());
  const valid = q.validUntil ? new Date(q.validUntil) : new Date(date.getTime() + 15 * 864e5);
  d.text(`Issued ${date.toDateString()}`, W - 40, 58, { align: 'right' });
  d.text(`Valid until ${valid.toDateString()}`, W - 40, 82, { align: 'right' });

  d.setTextColor(20, 35, 59); d.setFontSize(11);
  d.text(`Prepared for ${q.customer}`, 40, 145); d.text(`Registration region: ${q.region}`, 40, 162);
  d.setFont('helvetica', 'bold'); d.setFontSize(18); d.text(q.car, 40, 200);

  let y = 236;
  const room = h => { if (y + h > H - 50) { d.addPage(); y = 60; } };
  const row = (l, v) => {
    room(24);
    d.setFont('helvetica', 'normal'); d.setFontSize(11); d.setTextColor(20, 35, 59);
    d.text(l, 40, y); d.text(v, W - 40, y, { align: 'right' });
    d.setDrawColor(222, 228, 236); d.line(40, y + 8, W - 40, y + 8); y += 24;
  };
  const pct = p => (p == null ? '' : ` (${p}%)`);
  const opts = q.options || [];
  row('Ex-showroom price', rs(q.basePrice));
  opts.filter(o => !o.standard).forEach(o => row('   ' + o.name, rs(o.price)));
  (q.discounts || []).forEach(x => row('   ' + x.name, '- ' + rs(x.price)));
  row('Region adjustment' + pct(q.adjustPct), rs(q.adjustment));
  row('GST' + pct(q.gstPct), rs(q.gst));
  row('Road tax' + pct(q.roadTaxPct), rs(q.roadTax));
  row('Registration', rs(q.registration));

  room(60);
  y += 8; d.setFillColor(236, 240, 245); d.rect(40, y - 18, W - 80, 42, 'F');
  d.setFont('helvetica', 'bold'); d.setFontSize(15); d.setTextColor(20, 35, 59);
  d.text('On-road price', 54, y + 8); d.text(rs(q.total), W - 54, y + 8, { align: 'right' });
  y += 50;

  const std = opts.filter(o => o.standard).map(o => o.name);
  if (std.length) {
    d.setFont('helvetica', 'normal'); d.setFontSize(10); d.setTextColor(80);   // set before measuring the wrap
    const lines = d.splitTextToSize(`Included as standard with this trim: ${std.join(', ')}.`, W - 80);
    room(lines.length * 14 + 10);
    d.text(lines, 40, y); y += lines.length * 14 + 14;
  }

  if (emi) {
    const f = q.finance;
    room(160);   // keep the EMI plan on one page
    d.setFont('helvetica', 'bold'); d.setFontSize(13); d.setTextColor(20, 35, 59); d.text('EMI plan', 40, y + 10); y += 34;
    row(`Down payment (${f.downPct}%)`, rs(f.downPayment));
    row('Loan amount', rs(f.loanAmount));
    row(`Tenure / interest`, `${f.months / 12} years at ${f.ratePct}% p.a.`);
    row('Monthly EMI', rs(f.emi));
    if (f.totalInterest != null) row('Total interest', rs(f.totalInterest));
    y += 4;
  } else {
    room(20);
    d.setFont('helvetica', 'normal'); d.setFontSize(10); d.setTextColor(80); d.text('Payment: direct purchase, full on-road price.', 40, y); y += 18;
  }

  room(30);
  d.setFont('helvetica', 'normal'); d.setFontSize(9); d.setTextColor(110);
  d.text('Prices are held until the validity date. Taxes follow the rates of the chosen region.', 40, y + 10);
  if (emi) d.text('EMI is indicative and subject to lender approval.', 40, y + 24);
  d.save(`${q.quoteNo}.pdf`);
}
````

### frontend/src/styles.css

````css
:root{
  --ink:#0d2240; --ink2:#173459; --studio:#e8ecf1; --paper:#fff; --line:#d6dde6; --text:#14233b; --mute:#637288;
  --signal:#1b66ff; --amber:#ffb23e; --ok:#0f9d6b; --bad:#c0392b;
  --head:'Bricolage Grotesque',system-ui,sans-serif; --body:'Instrument Sans',system-ui,sans-serif;
}
*{box-sizing:border-box}
body{margin:0;background:var(--studio);color:var(--text);font:15px/1.5 var(--body)}
h1,h2,h3,strong,b{font-family:var(--head)}
h2{font-size:26px;margin:0}h3{font-size:17px;margin:22px 0 10px}h3:first-child{margin-top:0}
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
input,select{font:inherit;padding:9px 12px;border:1.5px solid var(--line);border-radius:10px;background:#fff;color:var(--text)}
.alert{background:#fdeceb;color:#8a1f14;padding:10px 14px;border-radius:10px;font-size:14px}
.alert.dark{background:rgba(255,120,100,.16);color:#ffc9c0}.alert.page{margin:24px}
.boot{padding:80px;text-align:center;color:var(--mute)}

/* top bar */
.top{display:flex;align-items:center;gap:28px;padding:12px 28px;background:var(--paper);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.brand{font:700 19px var(--head);display:flex;align-items:center;gap:9px}.dot{width:14px;height:14px;border-radius:50%;background:var(--signal);box-shadow:5px 0 0 -2px var(--amber)}
.top nav{display:flex;gap:4px;flex:1}.top nav button{background:none;border:0;padding:8px 14px;border-radius:9px;color:var(--mute);font-weight:500}
.top nav button:hover{color:var(--text)}.top nav .active{background:var(--studio);color:var(--ink);font-weight:600}
.who{display:flex;align-items:center;gap:8px}.who span{display:flex;flex-direction:column;align-items:flex-end;line-height:1.2;font-weight:600}.who em{font-style:normal;font-weight:400;font-size:12px;color:var(--mute)}
main{max-width:1240px;margin:0 auto;padding:24px 28px 60px}

/* login */
.login{min-height:100vh;display:grid;grid-template-columns:1.25fr 1fr;background:linear-gradient(160deg,var(--ink),#102c52)}
.login-hero{padding:9vh 6vw;color:#fff;display:flex;flex-direction:column;justify-content:center}
.login-hero h1{font-size:clamp(36px,5vw,64px);line-height:1.02;margin:0 0 18px;letter-spacing:-.02em}
.login-hero p{max-width:380px;color:#b7c6dc;margin:0 0 30px}.login-hero .car{max-width:520px;filter:drop-shadow(0 20px 30px rgba(0,0,0,.35))}
.login-card{background:var(--paper);margin:auto;width:min(380px,90%);padding:32px;border-radius:18px;display:flex;flex-direction:column;gap:14px}
.login-card h2{margin-bottom:4px}.login-card label{display:flex;flex-direction:column;gap:5px;font-weight:500;font-size:14px}
.demo{display:flex;align-items:center;gap:8px;color:var(--mute);font-size:13px;flex-wrap:wrap}
.chip{border:1.5px solid var(--line);background:#fff;border-radius:99px;padding:4px 12px;font-size:13px}.chip:hover{border-color:var(--signal)}

/* configurator layout */
.cfg{display:grid;grid-template-columns:1fr 360px;gap:24px;align-items:start}
.stage{position:relative;border-radius:22px;padding:22px 26px 10px;overflow:hidden;
  background:radial-gradient(120% 90% at 50% 0,#fff 0,#f2f5f8 55%,#dde3ea 100%);border:1px solid var(--line)}
.stage::after{content:"";position:absolute;left:0;right:0;bottom:0;height:34%;background:linear-gradient(#0000,rgba(13,34,64,.07));pointer-events:none}
.stage-head{display:flex;justify-content:space-between;gap:16px;min-height:56px}.stage-head p{margin:2px 0 0;color:var(--mute)}
.note{background:var(--ink);color:#fff;padding:8px 14px;border-radius:10px;font-size:13px;max-width:300px;align-self:flex-start;animation:pop .25s}
@keyframes pop{from{transform:scale(.94);opacity:0}}
.car{display:block;width:100%;max-width:640px;margin:0 auto;position:relative;z-index:1}.car .paint{transition:fill .6s ease}

.steps{list-style:none;display:flex;gap:8px;padding:0;margin:18px 0}
.steps button{display:flex;align-items:center;gap:10px;padding:9px 16px 9px 9px;border-radius:99px;border:1.5px solid var(--line);background:var(--paper);font-weight:500;color:var(--mute)}
.steps b{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--studio);font-size:13px}
.steps .on{border-color:var(--ink);color:var(--ink);font-weight:600}.steps .on b{background:var(--ink);color:#fff}.steps .done b{background:var(--ok);color:#fff}
.panel{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:24px}
.nav{display:flex;justify-content:space-between;margin-top:16px}

.models{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.model{display:flex;flex-direction:column;align-items:flex-start;text-align:left;padding:14px;border-radius:14px;border:1.5px solid var(--line);background:#fff;gap:2px}
.model .car{margin-bottom:8px}.model span{color:var(--mute);font-size:13px}.model em{font-style:normal;font-size:13px;margin:4px 0}.model small{color:var(--ink);font-weight:600}
.model:hover{border-color:#9db7e6}.model.on,.trim.on,.region.on{border-color:var(--signal);box-shadow:0 0 0 3px rgba(27,102,255,.14)}
.trims{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.trim{text-align:left;padding:16px;border-radius:14px;border:1.5px solid var(--line);background:#fff}
.trim div{display:flex;justify-content:space-between;font-size:17px}.trim div span{font-weight:600}
.trim ul{margin:10px 0 0;padding-left:18px;color:var(--mute);font-size:14px}

.group+.group{margin-top:26px}
.optlist{display:grid;gap:8px}
.opt{display:flex;align-items:center;gap:14px;text-align:left;padding:12px 14px;border-radius:12px;border:1.5px solid var(--line);background:#fff;width:100%}
.opt:hover:not(:disabled){border-color:#9db7e6}.opt.on{border-color:var(--signal);background:#f4f8ff}
.opt .txt{flex:1;display:flex;flex-direction:column}.opt em,.swatch em{font-style:normal;font-size:13px;color:var(--mute)}
.why{color:var(--bad)!important}.opt .pr{font-weight:600;white-space:nowrap}
.opt.blocked{background:#f7f8fa;border-style:dashed}.opt.blocked strong,.opt.blocked .pr{color:var(--mute)}
.sw{width:40px;height:23px;border-radius:99px;background:#c9d1dc;position:relative;flex:none;transition:background .2s}
.sw span{position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#fff;transition:transform .2s}
.opt.on .sw{background:var(--signal)}.opt.on .sw span{transform:translateX(17px)}
.swatches{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.swatch{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;padding:12px;border-radius:14px;border:1.5px solid var(--line);background:#fff}
.swatch i{width:100%;height:46px;border-radius:9px;border:1px solid rgba(0,0,0,.12);margin-bottom:8px}
.swatch.on{border-color:var(--signal);box-shadow:0 0 0 3px rgba(27,102,255,.14)}.swatch:disabled{opacity:.6}.swatch span{font-size:13px;font-weight:600}

.regions{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.region{text-align:left;padding:14px;border-radius:14px;border:1.5px solid var(--line);background:#fff;display:flex;flex-direction:column}.region span{font-size:13px;color:var(--mute)}
.compare{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.compare li,.bars li{display:grid;grid-template-columns:110px 1fr 120px;gap:12px;align-items:center;font-size:14px}
.compare div,.bars div{height:12px;background:var(--studio);border-radius:6px;overflow:hidden}
.compare i,.bars i{display:block;height:100%;background:#a9bde0;border-radius:6px;transition:width .5s}.compare .cur i{background:var(--signal)}.compare .cur{font-weight:600}
.compare b,.bars b{text-align:right}
.emi{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:end}
.emi label{display:flex;flex-direction:column;gap:6px;font-size:14px}.emi label b{font-size:15px}.emi input{padding:0;accent-color:var(--signal)}
.emi-out{grid-column:1/-1;background:var(--studio);border-radius:12px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center}
.emi-out strong{font-size:26px}.emi-out small{font-size:14px;font-weight:400;color:var(--mute)}

/* price sheet */
.sheet{position:sticky;top:76px;background:var(--ink);color:#fff;border-radius:22px;padding:24px;box-shadow:0 24px 50px -24px rgba(13,34,64,.6)}
.sheet h3{font-size:21px;margin:0}.sub{color:#9fb2cf;margin:2px 0 16px}
.sheet dl{margin:0}.sheet dl>div{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.09);font-size:14px}
.sheet dt{color:#c3d1e6}.sheet dd{margin:0;font-weight:600;white-space:nowrap}
.sheet .opt-line dt{padding-left:12px;color:#9fb2cf}.sheet .sep{border:0!important;padding-top:14px!important}.sheet .sep dt{font:600 13px var(--head);color:var(--amber)}
.total{display:flex;flex-direction:column;margin:16px 0}.total span{color:#9fb2cf;font-size:14px}.total strong{font-size:36px;letter-spacing:-.02em;line-height:1.1}
.saved p{margin:0 0 10px;color:#c3d1e6}.saved .btn{margin-bottom:8px}.saved .outline{color:#fff;width:100%;border-color:rgba(255,255,255,.4)}

/* quotes + admin */
.page-head{display:flex;align-items:center;gap:16px}.flash{background:var(--ok);color:#fff;padding:4px 12px;border-radius:99px;font-size:13px}
.empty{background:var(--paper);border:1px dashed var(--line);border-radius:16px;padding:40px;text-align:center;margin-top:16px}.empty p{color:var(--mute);margin:4px 0 0}
.qlist{display:grid;gap:10px;margin-top:16px}
.qcard{display:grid;grid-template-columns:1fr auto auto auto;gap:22px;align-items:center;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px 20px}
.qcard div:first-child{display:flex;flex-direction:column}.qcard div span,.qmeta span{color:var(--mute);font-size:13px}.qmeta{display:flex;flex-direction:column}.qtotal{font:700 20px var(--head)}
.tabs{display:flex;gap:6px;margin:16px 0}.tabs button{background:none;border:0;padding:8px 14px;border-radius:99px;color:var(--mute);font-weight:500}.tabs .on{background:var(--ink);color:#fff}
.card{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:22px;margin-bottom:16px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.kpis div{background:var(--ink);color:#fff;border-radius:16px;padding:20px;display:flex;flex-direction:column}.kpis span{color:#9fb2cf;font-size:14px}.kpis b{font-size:32px;letter-spacing:-.02em}
.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.cols .card{margin:0}.cols .bars li{grid-template-columns:1fr;gap:4px}.bars{list-style:none;padding:0;margin:0;display:grid;gap:12px}
.bars li{display:grid}.cols .bars li>span{font-size:14px}
.tbl{width:100%;border-collapse:collapse}.tbl th{font-weight:500;color:var(--mute);font-size:13px;text-align:left;padding:6px 8px}.tbl th.r{text-align:right}
.tbl td{padding:8px;border-top:1px solid var(--line)}.num{width:120px;text-align:right}
.toggle{width:40px;height:23px;border-radius:99px;border:0;background:#c9d1dc;position:relative;transition:background .2s}.toggle span{position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#fff;transition:transform .2s}
.toggle.on{background:var(--ok)}.toggle.on span{transform:translateX(17px)}
.addrow{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}.addrow input:first-child{flex:1;min-width:160px}.addrow input[type=number]{width:110px}
.tag{font-size:12px;padding:3px 9px;border-radius:99px;font-weight:600}.tag.requires{background:#e5f6ee;color:#0a7a52}.tag.excludes{background:#fdeceb;color:#a02a1c}

/* trims, standard fit, combos, payment */
.filters{display:flex;flex-wrap:wrap;gap:14px;margin:-2px 0 12px}.filters span{display:flex;gap:6px;flex-wrap:wrap}
.chip.on{background:var(--ink);border-color:var(--ink);color:#fff}
.trim .spec{margin:2px 0 0;font-size:13px;color:var(--ink);font-weight:600}
.trim .inc{margin:10px 0 0;font-size:13px;color:var(--ok)}
.opt.std{background:#f2faf6;border-color:#9fd6bd}.opt.std .sw{background:var(--ok)}.opt.std .sw span{transform:translateX(17px)}.opt.std .pr{color:var(--ok)}
.opt:disabled.std{cursor:default}.opt em.deal{color:#9a5b00}
.pay{display:flex;align-items:center;justify-content:space-between;gap:16px;border:1.5px solid var(--line);border-radius:14px;padding:14px 16px}
.pay div{display:flex;flex-direction:column}.pay span{color:var(--mute);font-size:14px}.pay .btn{min-width:96px}
.emi-out{flex-wrap:wrap;gap:12px}.emi-out>div{display:flex;flex-direction:column}
.emi-out dl{margin:0;display:grid;grid-template-columns:repeat(4,auto);gap:4px 22px}.emi-out dl div{display:flex;flex-direction:column}
.emi-out dt{font-size:12px;color:var(--mute)}.emi-out dd{margin:0;font-weight:600}
.emi-off{grid-column:1/-1;justify-self:start;padding-left:0}
.sheet .opt-line.deal dt,.sheet .opt-line.deal dd{color:#8fe3b8}
.emi-btn{width:100%;color:#fff;border-color:rgba(255,255,255,.4)!important;margin-bottom:10px}
.emi-sum{display:flex;flex-direction:column;background:rgba(255,255,255,.08);border-radius:12px;padding:10px 14px;margin-bottom:10px}
.emi-sum span{font:600 17px var(--head)}.emi-sum small{color:#9fb2cf}
.qtotal{display:flex;flex-direction:column;align-items:flex-end}.qtotal small{font:400 12px var(--body);color:var(--mute)}
.tabs.inline{margin:0 0 0 auto}.flash.bad{background:var(--bad)}
.tag.discount{background:#fff3dc;color:#8a5200}.addrow .wide{flex:1;min-width:200px}

@media(max-width:980px){
  .emi-out dl{grid-template-columns:1fr 1fr}.pay{flex-direction:column;align-items:stretch}.tabs.inline{margin:0;flex-wrap:wrap}.page-head{flex-wrap:wrap}
  .cfg{grid-template-columns:1fr}.sheet{position:static}.login{grid-template-columns:1fr}.login-hero{padding:40px 24px 10px}
  .models,.regions,.swatches,.cols,.kpis{grid-template-columns:1fr}.trims,.emi{grid-template-columns:1fr}
  .qcard{grid-template-columns:1fr auto}.top{gap:10px;padding:10px 14px;flex-wrap:wrap}main{padding:16px}.steps{flex-wrap:wrap}
}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
````

---

End of source files (25 files).
