# Academic literature — Scope 1 & 2 GHG accounting for the India–EU context
*10-paper review · compiled 2026-08-28 · feeds METHODOLOGY.md of the India–EU Carbon Ratings engine*

Method note: papers located via web search on 2026-08-28; citations reflect what the
publisher/indexing pages state. Three of ten are institutional working/practitioner papers
(ICRIER, CSEP, HBR); the rest are peer-reviewed. Where a detail (e.g. page range) was not
surfaced by the source page, it is omitted rather than guessed.

---

## The papers

### 1. Brander, Gillenwater & Ascui (2018) — the market-based Scope 2 critique
*Energy Policy 112: 29–33.* "Creative accounting: A critical perspective on the market-based
method for reporting purchased electricity (scope 2) emissions."
**Summary.** Argues the GHG Protocol's market-based method lets companies report reductions
from contractual instruments (RECs, green tariffs) that rarely change physical generation,
producing inventories that misstate actual emissions.
**Calculation nuances.** (i) Two legitimate-looking Scope 2 numbers can differ hugely for the
same site; (ii) contractual instruments lack additionality tests; (iii) the location-based
method is the physically meaningful default.
→ *Engine implication:* CEA location-based factor is `value_primary`; market-based is a
secondary line requiring declared instruments, never a silent substitution.

### 2. Bjørn, Lloyd, Brander & Matthews (2022) — RECs inflate reported progress
*Nature Climate Change 12(6): 539–546.* "Renewable energy certificates threaten the integrity
of corporate science-based targets."
**Summary.** Removing REC-claimed reductions, companies' 2015–2019 Scope 2 trajectories are no
longer 1.5 °C-aligned — quantified evidence that the market-based method materially distorts
aggregate corporate accounting.
**Calculation nuances.** REC-based deltas are an accounting artefact unless instruments are
additional; trajectory analysis must be re-computable on a location basis.
→ *Engine implication:* ratings computed on location-based Scope 2 only; market-based shown
as context, flagged.

### 3. Kaplan & Ramanna (2021) — E-liability and the boundary critique
*Harvard Business Review, Nov–Dec 2021.* "Accounting for Climate Change." (See also the 2024
*Carbon Management* commentary comparing GHG Protocol and E-liability approaches.)
**Summary.** Proposes cradle-to-gate "E-liability" accounting that transfers measured
emissions along the supply chain like cost accounting, criticising scope-based double counting
and unverifiable value-chain estimates.
**Calculation nuances.** (i) Corporate S1+S2 double-counts across a chain (my Scope 2 is the
generator's Scope 1) — fine for management, wrong for product totals; (ii) product-level
allocation needs output-based assignment rules.
→ *Engine implication:* our per-tonne intensity derivation is an allocation step and must be
documented as such; the trader pass-through mirrors E-liability's transfer logic.

### 4. Nature Climate Change (2026) — CBAM is already reshaping EU–India steel trade
*Nature Climate Change (2026), article s41558-026-02607-y.* "Early signs that the EU carbon
border adjustment mechanism is reshaping EU–India steel trade."
**Summary.** Firm-level export and emissions data from Indian steel plants: during CBAM's
reporting phase, high-emission firms significantly reduced export quantities and revenues to
the EU while low-emission firms held theirs.
**Calculation nuances.** Firm-level (not sector-average) intensity is the commercially
decisive quantity; measurement heterogeneity across plants is large enough to move trade.
→ *Engine implication:* validates the product thesis — the measured-vs-default gap has revenue
consequences today, not in 2030.

### 5. ICRIER working paper — CBAM incidence on Indian steel
*ICRIER.* "Carbon Border Adjustment Mechanism (CBAM): Impact on India's Steel Exports to the
EU and Carbon Tax Incidence." (GTAP-E-based Samriddhi model.)
**Summary.** Models a ~24% fall in India's steel exports to the EU under CBAM and traces tax
incidence; sectoral emission intensity assumptions drive the result.
**Calculation nuances.** Results are highly sensitive to the assumed India-vs-EU intensity
gap — i.e., to exactly the benchmark-vs-measured question our tool operationalises.

### 6. CSEP working paper — CGE distributional implications of CBAM on India
*CSEP.* "Assessing the Distributional Implications of the EU's CBAM on India: A CGE Analysis."
**Summary.** Economy-wide analysis of CBAM across India's emissions-intensive trade-exposed
sectors (iron & steel, cement, aluminium, fertilisers).
**Calculation nuances.** Sector aggregation hides route heterogeneity; embedded-emissions
coefficients per sector are the load-bearing inputs.

### 7. Journal of Cleaner Production (2022) — gas vs coal DRI for India
*J. Cleaner Production (2022).* "Comparative life cycle assessment of natural gas and
coal-based directly reduced iron (DRI) production: A case study for India."
**Summary.** LCA of India's dominant DRI (sponge iron) routes. Coal-DRI with domestic coal and
lump ore ≈ **2.08 tCO₂/t DRI**; with pellets **1.84**; pellets + imported coal **1.53** —
against IPCC's gas-DRI Tier 1 default of 0.70.
**Calculation nuances.** (i) Route AND feedstock quality change intensity by ~35% within one
route family; (ii) the IPCC DRI default is gas-based and must not be applied to Indian
coal-DRI (confirms the caveat already carried in our factors.csv).
→ *Engine implication:* steel gate needs route *and* (v2) feedstock fields; benchmark per
route, never per sector.

### 8. Environmental Science & Technology (2022) — marginal emission factors for India
*Environ. Sci. Technol. (2022), doi 10.1021/acs.est.1c07500.* "Current and Future Estimates of
Marginal Emission Factors for Indian Power Generation."
**Summary.** Dispatch modelling of Indian power: marginal CO₂ factors span **three orders of
magnitude across states**, and remain that dispersed even under 2030 scenarios; coal is on the
margin most of the time.
**Calculation nuances.** (i) Marginal ≠ average — attributional corporate Scope 2 takes the
average (CEA weighted average), interventions take the marginal; (ii) a single national factor
hides state-level dispersion — a documented limitation of any India-wide Scope 2 line;
(iii) factor vintage matters (CEA series 0.774 → 0.710 FY14→FY25).

### 9. Rypdal & Winiwarter (2001) — inventory uncertainty
*Environmental Science & Policy.* "Uncertainties in greenhouse gas emission inventories —
evaluation, comparability and implications."
**Summary.** Classic synthesis: total-inventory uncertainty of ±5–20% for high-quality
national inventories; CO₂ from fuels tight, CH₄ and N₂O far looser; parameter vs model
uncertainty distinguished. (Complemented by GHG Protocol's uncertainty guidance for the
corporate level.)
**Calculation nuances.** Uncertainty is heteroskedastic across gases and source classes —
one number per inventory is meaningless; per-line uncertainty classes are needed.
→ *Engine implication:* the calculation trail carries an uncertainty class per line (tight:
fuel CO₂; wide: N₂O process ±10–40%, PFC Tier 1 −99/+380% per IPCC tables already cited in
FACTOR_SOURCES.md).

### 10. Journal of Industrial Ecology (2026) — blended cements in India
*Journal of Industrial Ecology (2026).* "Climate co-benefits of blended cements in India: an
integrated environmental and human health assessment."
**Summary.** Quantifies the clinker-substitution lever for India: OPC ≈ **884 kgCO₂e/t**
falling to **618.5** (PPC), **568.7** (LC3), **466** (PSC) — with co-benefits.
**Calculation nuances.** (i) Clinker-to-cement ratio is the dominant intensity variable —
a per-tonne-of-cement rating without the ratio penalises exactly the wrong plants;
(ii) intensity must be stated per cement AND traceable to per clinker.
→ *Engine implication:* confirms the SPEC's clinker-ratio field and blend-rewarding rating.

---

## Synthesis — cross-cutting calculation nuances, ranked by materiality

1. **Route/technology gates dominate everything else** (papers 4, 7, and the IPCC steel
   tables). Within "Indian steel," intensity spans ~0.7–3+ tCO₂/t by route and feedstock.
   A sector-average rating is not merely imprecise — it inverts commercial reality (paper 4
   shows low-emission firms keeping EU market share). *Status in engine: route gates specified;
   feedstock granularity is a v2 candidate.*

2. **Scope 2 method choice changes the answer, sometimes by the whole amount** (1, 2).
   Location-based (CEA weighted average, vintage-pinned) as the rating basis; market-based
   reported alongside only with declared instruments. *Status: specified (line C5).*

3. **Captive power moves the biggest number between scopes** (8 + CEA v21 definitions).
   Self-generated coal power is Scope 1; grid purchase is Scope 2; CEA's average already
   includes captive injections into the grid. The `grid/captive/ppa` field is therefore
   load-bearing for both scopes and for CBAM's direct/indirect split. *Status: specified.*

4. **Corporate scopes ≠ product embedded emissions** (3, 5, 6). CBAM wants cradle-to-gate
   per-tonne SEE with output-based allocation; corporate S1+S2 double-counts along chains.
   Our intensity derivation is an explicit, documented allocation step, and ratings must say
   "indicative CBAM exposure," never "CBAM filing." *Status: specified; wording rule for
   outputs.*

5. **One national grid factor hides three orders of magnitude of dispersion** (8). Acceptable
   for an attributional rating if stated; the METHODOLOGY.md must carry this as a declared
   limitation, with factor vintage pinned (0.710, FY 2024-25). *Status: to write into
   METHODOLOGY.md.*

6. **Uncertainty is per-line, not per-inventory** (9 + IPCC uncertainty ranges). Fuel CO₂ is
   ±few %; nitric-acid N₂O ±10–40%; aluminium PFC Tier 1 −99/+380%. Ratings near band
   boundaries should surface this. *Status: new requirement → add uncertainty class to the
   trail contract.*

7. **The clinker ratio is cement's rating axis** (10). 884 → 466 kgCO₂e/t via blending —
   nearly a factor of two inside one sector. *Status: specified.*

8. **Default-vs-measured is the commercial story** (4, 5, and the CBAM default-values
   workbook). India-specific CBAM defaults now exist per CN code; a supplier's measured
   intensity beating the default is money. *Status: core product logic.*

## Changes adopted into the SPEC from this review

- Trail contract gains an **uncertainty class** per line (nuance 6).
- METHODOLOGY.md must include the **grid-dispersion limitation** statement (nuance 5).
- Output wording rule: **"indicative exposure," never "CBAM-compliant"** (nuance 4).
- v2 parking lot: steel **feedstock quality** field (pellets vs lump ore) (nuance 1).
