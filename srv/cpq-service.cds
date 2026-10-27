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
