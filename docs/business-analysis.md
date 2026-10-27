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
