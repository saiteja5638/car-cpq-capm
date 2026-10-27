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
