# FACTOR_SOURCES.md

Provenance for every row in `data/factors.csv`.

**All files listed here were downloaded during the build session on 2026-08-27** and are
cached byte-for-byte under `data/raw/`. `tools/build_factors.py` re-downloads them from the
URLs below with `--refresh`, and parses only those local copies. No value in `factors.csv`
was typed from memory, from a secondary summary, or from an LLM's recall — every
`value_primary` is extracted programmatically from one of the files in this document.

Retrieval date for all sources: **2026-08-27**.

---

## A. GHG Protocol — Cross-Sector Tools emission factors workbook v2.0

*Primary source for all Scope 1 fuel combustion factors.*

| | |
|---|---|
| **Citation** | Greenhouse Gas Protocol / Greenhouse Gas Management Institute (2024). *Emission Factors for Cross-Sector Tools*, Version 2.0. |
| **URL** | `https://ghgprotocol.org/sites/default/files/2024-05/Emission_Factors_for_Cross_Sector_Tools_V2.0_0.xlsx` |
| **Version / vintage** | v2.0, revision dated **March 2024** (read from the workbook's own `Revision History` sheet: "2.0 / March, 2024 / Greenhouse Gas Management Institute & GHG Protocol / Updated EFs to most recently published datasets"). Underlying factor basis is IPCC 2006 Guidelines. |
| **Retrieved** | 2026-08-27 |
| **Local cache** | `data/raw/GHGP_Cross_Sector_Tools_V2.0.xlsx` (433,425 bytes) |
| **Sheet parsed** | `Stationary Combustion` — Table 1 (CO2, rows 6–59), Table 2 (CH4, rows 71–124), Table 3 (N2O, rows 136–189). Column layout: C fuel, D NCV (TJ/Gg), E energy basis, F mass basis, G liquid density kg/L, H gas density kg/m³, I per-litre, J per-m³. |

**Factor IDs from this source** — all 51 `source_class=fuel` rows:

`fuel_diesel_*`, `fuel_petrol_*`, `fuel_natural_gas_*`, `fuel_lpg_*`, `fuel_fuel_oil_*`,
`fuel_coal_bituminous_*`, `fuel_lignite_*`, `fuel_pet_coke_*`, `fuel_coke_oven_coke_*`,
`fuel_naphtha_*`, `fuel_biomass_rice_husk_*` — each × {`co2`, `ch4`, `n2o`} ×
{`per_litre`, `per_tonne`, `per_m3`} as the workbook provides.

**Basis note (load-bearing).** All GHGP values are on a **net calorific value (NCV / lower
heating value)** basis. The workbook's per-litre and per-m³ columns are *derived* by GHGP
from the mass-basis factor and a **generic IPCC/API density**, not from a market-specific
density. This matters: see the diesel finding in `FACTOR_BUILD_REPORT.md` §4.

**Licensing.** The workbook carries a "Calculation Tools Disclaimer" sheet stating the
spreadsheets were prepared with professional care but are provided without warranty, and
directs enquiries to the GHG Protocol Technical Support form. No explicit redistribution
licence is stated inside the file. **Action before publishing the repo:** confirm reuse terms
at `ghgprotocol.org` — do not assume open licensing.

---

## B. UK DESNZ/DEFRA — Greenhouse gas reporting conversion factors 2026

*Cross-check for all fuel factors. Also the AR5-basis GWP reference set, and the source of the
R-404A blend composition.*

| | |
|---|---|
| **Citation** | UK Department for Energy Security and Net Zero / Defra (2026). *Greenhouse gas reporting: conversion factors 2026*. |
| **Landing page** | `https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2026` |
| **Full set (xlsx)** | `https://assets.publishing.service.gov.uk/media/6a29392bade52dc0882218a8/ghg-conversion-factors-2026-full-set.xlsx` |
| **Flat file (xlsx)** | `https://assets.publishing.service.gov.uk/media/6a6c9748862aaf18d9c62ac9/ghg-conversion-factors-2026-flat-format-revised.xlsx` |
| **Methodology (pdf)** | `https://assets.publishing.service.gov.uk/media/6a2940543b15d05a7ce3202e/2026-GHG-conversion-factors-methodology-report.pdf` |
| **Version / vintage** | 2026 set, **published 11 June 2026**, page last updated **31 July 2026**. Workbook internal metadata: `Version: 1`, `Year: 2026`, `Next publication date: June 2027`. |
| **Retrieved** | 2026-08-27 |
| **Local cache** | `data/raw/DEFRA_2026_full_set.xlsx` (2,109,334 B), `data/raw/DEFRA_2026_flat_format.xlsx` (515,426 B), `data/raw/DEFRA_2026_methodology.pdf` (1,761,487 B, 152 pp) |
| **Sheets parsed** | `Fuels` (rows 23–148; gaseous / liquid / solid blocks), `Refrigerant & other` (rows 20–202) |

**Factor IDs cross-checked from this source:** every `source_class=fuel` row that has a
DEFRA equivalent, plus `value_crosscheck` on all 11 `source_class=gwp` rows.

### B.1 GWP set — DEFRA 2026 is **AR5**, not AR6

This is recorded here because SPEC §4 declares AR6 as the project basis and the two must not
be mixed.

Read directly from the methodology paper:

- p.14: values for CH4 and N2O are presented as CO2e using GWP factors from the IPCC **Fifth**
  Assessment Report (IPCC, 2014), **GWP for CH4 = 28, GWP for N2O = 265**.
- p.17, Table 1: a per-worksheet summary of which factors remain on an **AR4** basis and which
  have been aligned to **AR5**. (Material Use, Waste Disposal and Homeworking are still AR4.)
- p.43 §4.5: for refrigerants, "In most cases, GWP values are those published by the IPCC in
  the Fifth Assessment Report (IPCC, 2014)", with AR6 / AR4 / EU F-gas Annex IV used only for
  the handful of species AR5 does not cover.

Confirmed against the workbook itself — `Refrigerant & other` gives Methane = 28, Nitrous
oxide = 265, SF6 = 23,500, PFC-14 = 6,630, PFC-116 = 11,100: all AR5 values.

**Consequence, and how this project handles it.** Our declared basis stays **AR6** (source E).
DEFRA's AR5 numbers are recorded in `value_crosscheck` as *context only*. The resulting
`deviation_pct` on the GWP rows (−6% to −17%) measures the **AR5→AR6 revision**, not a source
disagreement or an error. The engine must never mix the two sets in one CO2e total.

### B.2 R-404A blend composition

Methodology paper p.43 §4.6 states the blend composition explicitly: R-404A comprises
**44% HFC-125, 52% HFC-143a, 4% HFC-134a**, and shows DEFRA's own AR5 arithmetic
`[3170 × 0.44] + [4800 × 0.52] + [1300 × 0.04] = 3943`.

The build takes its blend mass fractions from source F (EPA SNAP) for both blends, so this
DEFRA statement serves as an **independent cross-confirmation** of the R-404A split rather
than as the primary composition source. The two agree exactly. See §E.3.

DEFRA's published R-410A value (1924) additionally corroborates the R-410A composition —
see §E.3.

### B.3 Cross-check unit reconciliations

Two conversions were needed and are documented in the `notes` column of every affected row:

1. **CO2** — DEFRA's `kg CO2e of CO2 per unit` column is GWP-invariant (CO2 GWP = 1), so it is
   directly comparable to GHGP's kg CO2 per unit. No conversion.
2. **CH4 / N2O** — DEFRA publishes these already GWP-weighted as CO2e. To compare against
   GHGP's *mass* factors they were divided by **DEFRA's own declared AR5 GWP** (28 / 265),
   both parsed from the `Refrigerant & other` sheet rather than assumed.

Where units could **not** be reconciled cleanly, no cross-check was forced:

- **Lignite** — DEFRA 2026 publishes no lignite/brown-coal factor. Cross-check empty.
- **Coke-oven coke** — DEFRA lists "Coking coal", which is the kiln *input* coal, not the
  *output* coke. Different commodity; cross-check left empty rather than mismatched. (DEFRA
  coking coal = 3144.16 kg CO2/t, recorded in `notes` for reference only.)
- **Biomass / rice husk** — DEFRA's `Bioenergy` sheet publishes only the non-CO2 portion as a
  single AR5-weighted kg CO2e/tonne aggregate (e.g. Grass/straw 46.89) with biogenic CO2
  excluded entirely. Not reducible to a per-gas mass factor. Cross-check empty.
- **India grid** — DEFRA 2026 **withdrew** overseas electricity factors. Its `Overseas
  electricity` sheet now only signposts EEA / US EPA / SEAI / RTE / IEA. No India row exists,
  so it cannot serve as the grid cross-check (see source C).

**Licensing.** gov.uk publications are normally issued under the Open Government Licence
v3.0, but the licence statement was not separately captured in this session. **Verify the
licence footer on the publication page before redistributing the workbook or its values.**

---

## C. CEA — CO2 Baseline Database for the Indian Power Sector v21.0

*Primary source for India grid Scope 2.*

| | |
|---|---|
| **Citation** | Clean Energy & Energy Transition (CE&ET) Division, Central Electricity Authority (2025). *CO2 Baseline Database for the Indian Power Sector — User Guide, Version 21.0*. Ministry of Power, Government of India, New Delhi. |
| **URL** | `https://cea.nic.in/wp-content/uploads/baseline/2025/12/User_Guide_V_21.0.pdf` |
| **Version / vintage** | **Version 21.0, November 2025**, reporting **FY 2024-25** |
| **Retrieved** | 2026-08-27 |
| **Local cache** | `data/raw/CEA_User_Guide_V21.0.pdf` (801,207 bytes, 36 pp) |
| **Tables parsed** | **Table S** (Summary, p.1) and **Annexure-I** (p.21) |

**Factor IDs from this source:** `grid_india_weighted_avg`, `grid_india_operating_margin`,
`grid_india_build_margin`, `grid_india_combined_margin`.

**Table S** — "Weighted average emission factor, simple operating margin (OM), build margin
(BM) and combined margin (CM) of the Indian Grid for FY 2024-25 (adjusted for cross-border
electricity transfers) (including RES & Captive power injection into grid), in tCO2/MWh":

| Average | OM | BM | CM |
|---|---|---|---|
| **0.710** | 0.961 | 0.512 | 0.736 |

Table 4 (p.13) gives the unadjusted variant (excluding cross-border transfers): Average
0.712, OM 0.965, BM 0.512, CM 0.738. The **adjusted** figures are used, matching Table S.

**Cross-check — resolved better than SPEC anticipated.** SPEC §4 proposed the Climatiq
CEA-republished page, or CEA v20's 0.727 (FY 2023-24), as the cross-check. Neither third-party
fetch was needed: **Annexure-I of v21.0 itself** carries the full FY 2013-14 → FY 2024-25 time
series, including **FY 2023-24 = 0.727 tCO2/MWh**. That prior-vintage value is used as
`value_crosscheck`, sourced to the same document. This is strictly stronger than a
third-party republication — one primary document, two vintages, no intermediary. The
resulting +2.39% deviation is the grid's real year-on-year decarbonisation, not a source
disagreement.

Annexure-I also supports the SPEC §5 trend narrative: 0.774 (FY 2013-14) → 0.710
(FY 2024-25), with total generation 939.83 → 1739.06 BU and RE generation 53.06 → 255.01 BU.

**Definitions carried into the engine** (User Guide pp.5–6): *Average* is the weighted average
across all grid stations including hydro, nuclear, RE and grid-connected captive injection —
this is the correct **location-based Scope 2** factor. *OM* excludes low-cost/must-run
sources. *BM* is the 20% most recent capacity addition. *CM* = 50:50 OM/BM. OM/BM/CM are
carried for CDM/Article-6-style marginal work and are **not** the location-based Scope 2
number.

**Licensing.** Official publication of the Government of India. The PDF carries a disclaimer
(p.2) stating the factors were developed using methodologies consistent with internationally
recognised guidance, are intended solely for general information, planning and policy
analysis, and do not constitute professional advice; and that the accuracy of plant-level
input data remains the responsibility of the submitting utilities. Cite CEA as author. No
explicit reuse licence is stated in the document.

---

## D. IPCC 2006 Guidelines, Volume 3 (Industrial Processes and Product Use)

*Primary source for all process factors and for the carbonate stoichiometry.*

| | |
|---|---|
| **Citation** | IPCC (2006). *2006 IPCC Guidelines for National Greenhouse Gas Inventories*, Volume 3: Industrial Processes and Product Use. Prepared by the National Greenhouse Gas Inventories Programme; Eggleston H.S., Buendia L., Miwa K., Ngara T., Tanabe K. (eds). IGES, Japan. |
| **Volume index** | `https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol3.html` |
| **Ch.2 (Mineral)** | `https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/3_Volume3/V3_2_Ch2_Mineral_Industry.pdf` |
| **Ch.3 (Chemical)** | `https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/3_Volume3/V3_3_Ch3_Chemical_Industry.pdf` |
| **Ch.4 (Metal)** | `https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/3_Volume3/V3_4_Ch4_Metal_Industry.pdf` |
| **Version / vintage** | 2006 Guidelines (the original, not the 2019 Refinement) |
| **Retrieved** | 2026-08-27 |
| **Local cache** | `IPCC_2006_V3_Ch2_Mineral.pdf` (490,745 B), `IPCC_2006_V3_Ch3_Chemical.pdf` (1,367,463 B), `IPCC_2006_V3_Ch4_Metal.pdf` (820,199 B) |

### D.1 Chapter 2 — Mineral Industry

**Equation 2.4** (p.2.12), quoted verbatim from the PDF:
`EF_clc = 0.51 • 1.02 (CKD correction) = 0.52 tonnes CO2 / tonne clinker`

→ `process_cement_clinker_co2` = **0.52**, cross-checked against the same equation's
uncorrected base factor **0.51** (the Tier 2 starting point, which excludes cement kiln dust).
The Tier 1 default assumes clinker is 65% CaO, 100% carbonate-derived, 100% calcined. The
chapter also gives 0.47 for 60% CaO and 0.53 for 67% CaO, noted for the SPEC §5 preference
for a plant CaO-based Tier 2 factor.

**Table 2.1** — Formulae, formula weights and CO2 contents of common carbonate species
(source: CRC Handbook of Chemistry and Physics, 2004):

| Mineral | Formula weight | EF (t CO2/t carbonate) | Factor ID |
|---|---|---|---|
| CaCO3 (calcite/aragonite) | 100.0869 | **0.43971** | `stoich_limestone_caco3` |
| CaMg(CO3)2 (dolomite) | 184.4008 | **0.47732** | `stoich_dolomite` |

These are molar-mass identities at 100% calcination, not empirical estimates — which is why
they carry `flags=stoichiometric` even though they were parsed from IPCC rather than
hand-computed. SPEC §4's pinned 0.440 / 0.477 are recorded in `value_crosscheck`; the
difference is rounding only (0.07% / 0.06%).

### D.2 Chapter 3 — Chemical Industry

**Table 3.3** — Default factors for nitric acid production (source: van Balken, 2005),
relating to 100 percent pure acid:

| Production process | kg N2O / t HNO3 | Uncertainty | Factor ID |
|---|---|---|---|
| Plants with NSCR (all processes) | **2** | ±10% | `process_hno3_n2o_nscr` |
| Process-integrated or tailgas N2O destruction | **2.5** | ±10% | `process_hno3_n2o_destruction` |
| Atmospheric pressure plants (low pressure) | **5** | ±10% | `process_hno3_n2o_atmospheric` |
| Medium pressure combustion plants | **7** | ±20% | `process_hno3_n2o_medium` |
| High pressure plants | **9** | ±40% | `process_hno3_n2o_high` |

The first two are the **abated** cases; the last three are **unabated** by pressure class. The
chapter is explicit that the NSCR and destruction factors *already incorporate* the abatement
effect, so no separate destruction efficiency may be applied on top, and that the compiler
must verify the abatement kit is installed **and operated throughout the year**.

**Urea production** (p.3.16), quoted verbatim: "Assuming complete conversion of NH3 and CO2 to
urea, **0.733 tonnes of CO2** are required per tonne of urea produced."

→ `stoich_urea_co2_uptake` = **0.733**, matching SPEC §4's pinned constant exactly. Note this
is CO2 **consumed**; SPEC §5 requires it as an explicit negative line.

### D.3 Chapter 4 — Metal Industry

**Table 4.1** — Tier 1 default CO2 emission factors for coke production and iron & steel
production (t CO2 / t product):

| Process | Value | Factor ID |
|---|---|---|
| Sinter production | 0.20 | `process_steel_sinter_tier1` |
| Coke oven | 0.56 | `process_steel_coke_oven_tier1` |
| Iron production (pig iron) | 1.35 | `process_steel_bf_iron_tier1` |
| Direct reduced iron | 0.70 | `process_steel_dri_tier1` |
| Basic Oxygen Furnace (BOF) | 1.46 | `process_steel_bof_tier1` |
| **Electric Arc Furnace (EAF)** | **0.08** | `process_steel_eaf_tier1` |

Sources cited by IPCC: European IPPC Bureau (2001) I&S BAT Document for the first four; IISI
Environmental Performance Indicators 2003 STEEL for the steelmaking routes.

⚠ **DRI caveat carried into the CSV notes:** the 0.70 Tier 1 default assumes **natural-gas**
based DRI (12.5 GJ/t, 15.3 kg C/GJ, MIDREX-type). India's **coal-DRI** route is materially
more carbon-intensive, so SPEC §5's coal-DRI gate must **not** use this default.

**Table 4.3** — Tier 2 material-specific carbon contents: `EAF Carbon Electrodes` =
**0.82 kg C/kg** (IPCC assumption: 80% petroleum coke, 20% coal tar).

→ `process_eaf_electrode_carbon` = 0.82 kg C/kg (the parsed value), plus a *derived* row
`process_eaf_electrode_co2` = 0.82 × 44/12 = **3.00667 t CO2 / t electrode**, flagged
`derived|stoichiometric` with the arithmetic shown in `notes`.

**Table 4.10** — Tier 1 technology-specific EFs for CO2 from anode or paste consumption
(source: IAI, *Life Cycle Assessment of Aluminium*, 2000):

| Technology | t CO2 / t Al | Uncertainty | Factor ID |
|---|---|---|---|
| Prebake | **1.6** | ±10% | `process_alu_anode_prebake_co2` |
| Søderberg | **1.7** | ±10% | `process_alu_paste_soderberg_co2` |

The Prebake factor already includes CO2 from combustion of pitch volatiles and packing coke
during anode baking (IPCC footnote 7).

**Table 4.15** — Tier 1 default PFC EFs by cell technology (kg gas / t Al):

| Technology | CF4 | CF4 uncertainty | C2F6 | C2F6 uncertainty |
|---|---|---|---|---|
| CWPB (Centre Worked Prebake) | **0.4** | −99/+380% | **0.04** | −99/+380% |
| SWPB (Side Worked Prebake) | **1.6** | −40/+150% | **0.4** | −40/+150% |
| VSS (Vertical Stud Søderberg) | **0.8** | −70/+260% | **0.04** | −70/+260% |
| HSS (Horizontal Stud Søderberg) | **0.4** | −80/+180% | **0.03** | −80/+180% |

→ eight factor IDs, `process_alu_{cf4,c2f6}_{cwpb,swpb,vss,hss}`. Both Prebake **and**
Søderberg rows are present, as SPEC requested. IPCC states these defaults "should only be used
in the absence of Tier 2 or Tier 3 data" — hence SPEC §5's requirement to prefer the
anode-effect slope method and to carry the `default` flag into the calculation trail.

**44/12 ratio.** Stated verbatim in Ch.4 (Equation 4.24 variable list): "44/12 = CO2 molecular
mass : carbon atomic mass ratio". → `stoich_carbon_to_co2` = 3.66667.

**Licensing.** IPCC/IGES material. Cite as above. Confirm reuse terms at
`ipcc-nggip.iges.or.jp` before redistribution.

---

## E. IPCC AR6 WGI — GWP-100

*Declared GWP basis for this project (SPEC §4).*

| | |
|---|---|
| **Citation** | Forster P. *et al.* (2021). *The Earth's Energy Budget, Climate Feedbacks and Climate Sensitivity*. Chapter 7 in: Climate Change 2021: The Physical Science Basis. Contribution of Working Group I to the Sixth Assessment Report of the IPCC. Cambridge University Press. |
| **Chapter 7 URL** | `https://www.ipcc.ch/report/ar6/wg1/downloads/report/IPCC_AR6_WGI_Chapter07.pdf` |
| **Supplementary URL** | `https://www.ipcc.ch/report/ar6/wg1/downloads/report/IPCC_AR6_WGI_Chapter07_SM.pdf` |
| **Version / vintage** | AR6 (2021), GWP-100, including carbon-cycle responses for non-CO2 gases |
| **Retrieved** | 2026-08-27 |
| **Local cache** | `IPCC_AR6_WGI_Chapter07.pdf` (22,836,832 B, 132 pp), `IPCC_AR6_WGI_Chapter07_SM.pdf` (2,609,747 B, 36 pp) |

### E.1 From Chapter 7, **Table 7.15** (the assessed headline table)

Values are printed as `X ± Y`; GWP-100 is the fourth such group on each row.

| Species | GWP-100 | Factor ID |
|---|---|---|
| CH4 — fossil | **29.8** ± 11 | `gwp_ch4_fossil` |
| CH4 — non-fossil | **27.0** ± 11 | `gwp_ch4_nonfossil` |
| N2O | **273** ± 130 | `gwp_n2o` |

AR6 separates fossil from non-fossil methane. This matters for SPEC §5: rice-husk and
biomass boiler CH4 takes the **non-fossil** value (27.0), while natural gas / LPG / coal /
oil combustion CH4 takes the **fossil** value (29.8).

### E.2 From Supplementary Material, **Table 7.SM.7** (the full species table)

Table 7.15 is an abridged extract; the halogenated species this project needs are only in the
supplementary table. Column order is `lifetime, RE, AGWP-20, GWP-20, AGWP-100, GWP-100, …`,
so GWP-100 is the 6th numeric token — verified against Table 7.15 for the species appearing
in both (HFC-32 = 771 in both; PFC-14 = 7380 in both).

| Species | GWP-100 | Factor ID |
|---|---|---|
| HCFC-22 (**R-22**) | **1960** | `gwp_r22` |
| HFC-32 (**R-32**) | **771** | `gwp_r32` |
| HFC-134a (**R-134a**) | **1530** | `gwp_r134a` |
| PFC-14 (**CF4**) | **7380** | `gwp_cf4` |
| PFC-116 (**C2F6**) | **12400** | `gwp_c2f6` |
| SF6 | **24300** | `gwp_sf6` |
| HFC-125 | 3740 | *(blend component only)* |
| HFC-143a | 5810 | *(blend component only)* |

**Rounding note.** Chapter 7 Table 7.15 gives HFC-134a = 1526; Supplementary Table 7.SM.7
gives 1530 (3 significant figures). The CSV uses **1530** so that all halocarbons come from a
single consistent table. The 0.26% difference is rounding, not disagreement.

### E.3 Refrigerant blends — derived, and flagged as such

AR6 assesses **pure species only**; it publishes no blend GWPs. `gwp_r404a` and `gwp_r410a`
are therefore **derived**, not parsed, and both carry `flags=derived-blend`.

**Method.** Mass-weighted sum of constituent GWP-100 values, `Σ(wᵢ × GWPᵢ)`. This is the
standard convention and is the method defined by both EU F-gas Regulations already fetched
for this build — 517/2014 **Annex IV** and (EU) 2024/573 **Annex VI** — each of which
specifies the weighted-average calculation but publishes no named-blend composition table.

**Component GWPs** come from AR6 Table 7.SM.7 (§E.2). **Mass fractions** come from source F
(US EPA SNAP). Neither is recalled.

```
R-404A   0.52 × 5810 (HFC-143a) = 3021.2
         0.44 × 3740 (HFC-125)  = 1645.6
         0.04 × 1530 (HFC-134a) =   61.2
                                = 4728    kg CO2e / kg

R-410A   0.50 ×  771 (HFC-32)   =  385.5
         0.50 × 3740 (HFC-125)  = 1870.0
                                = 2255.5  kg CO2e / kg
```

**Both compositions are independently corroborated**, which matters because these are the
only two derived GWP rows in the file:

- **R-404A** — the DEFRA 2026 methodology paper §4.6 (source B.2) states the identical split
  (44% HFC-125, 52% HFC-143a, 4% HFC-134a) and shows its own AR5 arithmetic
  `[3170 × 0.44] + [4800 × 0.52] + [1300 × 0.04] = 3943`. Two independent sources agree.
- **R-410A** — applying DEFRA's *own* AR5 component GWPs (HFC-32 = 677, HFC-125 = 3170) to
  the EPA 50/50 split reproduces `0.5 × 677 + 0.5 × 3170 = 1923.5`, against DEFRA's published
  R-410A value of **1924**. That reproduction to within rounding independently validates the
  50/50 composition without relying on the EPA page alone.

The deviations against `value_crosscheck` (−16.60% and −14.70%) are therefore purely the
AR5→AR6 component revision, not any disagreement about composition.

**Licensing.** IPCC AR6 material, © IPCC / Cambridge University Press. Cite as above. Confirm
reuse terms at `ipcc.ch` before redistribution.

---

## F. US EPA SNAP — Compositions of Refrigerant Blends

*Source of the blend mass fractions used to derive the R-404A and R-410A AR6 GWPs.*

| | |
|---|---|
| **Citation** | United States Environmental Protection Agency, Significant New Alternatives Policy (SNAP) Program. *Compositions of Refrigerant Blends*. |
| **URL** | `https://www.epa.gov/snap/compositions-refrigerant-blends` |
| **Version / vintage** | Undated web table maintained by EPA SNAP; retrieved as served on 2026-08-27. Compositions are the ASHRAE Standard 34 designations. |
| **Retrieved** | 2026-08-27 |
| **Local cache** | `data/raw/EPA_SNAP_refrigerant_blend_compositions.html` (73,349 bytes) |
| **Parsed** | 44 blends. Two-level header — a group row (HCFCs / HFCs / HCs / HFOs / PFCs) over a substance row of 20 labels; data rows carry trade name, ASHRAE number, then the 20 percentages positionally. |

**Rows used:**

| ASHRAE | Composition parsed (% by weight) | Used for |
|---|---|---|
| R-404A | HFC-125 44, HFC-134a 4, HFC-143a 52 | `gwp_r404a` |
| R-410A | HFC-32 50, HFC-125 50 | `gwp_r410a` |

The build script maps EPA's bare numeric column labels to AR6 species names via an explicit
table (`EPA_TO_AR6`), disambiguated by the group header — `22`/`124`/`142b` are HCFCs, the
remaining numerics HFCs. It refuses to derive a blend whose parsed fractions do not sum to
~100%, or whose components have no AR6 GWP in the file, emitting a TODO row instead.

**How this source was chosen.** The blend compositions were originally unavailable: ANSI/ASHRAE
Standard 34 is the normative source but is paywalled, and both EU F-gas Regulations give only
the calculation method. The Australian Government DCCEEW HFC-GWP page was attempted first and
was **unreachable** — four attempts (two via WebFetch, two direct, up to a 280-second timeout)
all timed out at `www.dcceew.gov.au`. The EPA SNAP table was used instead: it is a primary
government publication, it carries the ASHRAE-34 compositions, and it is retrievable and
machine-parseable.

**Licensing.** US EPA web content is generally in the public domain as a work of the US
federal government, but that was not separately verified in this session. Confirm before
redistribution.

---

## G. Stoichiometric constants

`source_class=stoichiometric` rows are exact chemistry, safe to hard-code per SPEC §4. Every
one of them is nonetheless **backed by a parsed source** rather than asserted:

| Factor ID | Value | Parsed from | SPEC pinned value (recorded as cross-check) |
|---|---|---|---|
| `stoich_limestone_caco3` | 0.43971 | IPCC Vol.3 Ch.2 Table 2.1 | 0.440 |
| `stoich_dolomite` | 0.47732 | IPCC Vol.3 Ch.2 Table 2.1 | 0.477 |
| `stoich_urea_co2_uptake` | 0.733 | IPCC Vol.3 Ch.3 p.3.16 | 0.733 |
| `stoich_carbon_to_co2` | 3.66667 | IPCC Vol.3 Ch.4 Eq. 4.24 variable list | 3.667 |

---

## H. Purchased steam — no factor by design

`steam_purchased` is a **note row** with an empty `value_primary` and `flags=TODO`, exactly as
SPEC §5 line C6 requires. A purchased-steam factor is a property of the *supplier's* boiler
fuel, efficiency and cogeneration allocation — not of a factor library — so publishing a
generic default here would be a fabricated number.

DEFRA 2026's `Heat and steam` sheet publishes 0.17529 kg CO2e/kWh (onsite and district, 2026).
That figure is recorded in the row's `notes` as **UK-supply-mix context only**. It is not
applicable to Indian suppliers and must not be promoted to `value_primary`.

Required engine behaviour is specified in full in the row's `notes` column: supplier-documented
factor first; documented boiler-efficiency reconstruction (steam enthalpy ÷ boiler efficiency
→ fuel energy → `fuel_*` rows) as a flagged `estimate` fallback; never a silent generic.

---

## Sources considered and not used

| Source | Why not |
|---|---|
| Climatiq CEA republication (`climatiq.io/data/source/government-of-india-_-central-electricity-authority`) | Not needed. CEA v21.0 Annexure-I carries the FY 2023-24 prior-vintage value (0.727) directly, which is a strictly better cross-check than a third-party republication. Not fetched. |
| DEFRA 2026 `Overseas electricity` sheet | Fetched and read. DEFRA has **withdrawn** overseas electricity factors; the sheet only signposts EEA / US EPA / SEAI / RTE / IEA. No India row. Cannot serve as the grid cross-check. |
| EU F-gas Regulation 517/2014, Annex IV | Fetched. Gives only the weighted-average *method* for mixtures, no named-blend composition table. **Still used** — it is one of the two citations for the derivation *method* in §E.3. |
| EU F-gas Regulation (EU) 2024/573, Annex VI | Fetched. Same outcome — method only, no named-blend compositions. Also cited for the method. |
| ANSI/ASHRAE Standard 34 | The normative source for blend compositions, but paywalled and not retrievable. Superseded for this build by source F (EPA SNAP), which publishes the ASHRAE-34 compositions in a retrievable form. |
| Australian Government DCCEEW, HFC GWP values page | **Attempted and failed.** Four attempts (2 × WebFetch, 2 × direct request, up to 280 s timeout) all timed out at `www.dcceew.gov.au`. Nothing from this source was used. Source F was retrieved instead. |
| HVAC vendor pages and Wikipedia | Surfaced by search when looking for the R-410A composition. **Rejected** — not citable as a primary source for a factor database. |
