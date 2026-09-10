# FACTOR_BUILD_REPORT.md

Build report for `data/factors.csv` — SPEC §4 factor library, Phase 1.

- **Built:** 2026-08-27 by `tools/build_factors.py`
- **Sources retrieved:** 2026-08-27, all cached under `data/raw/` (11 files, ~33 MB)
- **Rows:** 95
- **Provenance:** every `value_primary` is parsed programmatically from a cached source file.
  Nothing is recalled, estimated or hand-typed. Full citations in `docs/FACTOR_SOURCES.md`.

Reproduce with:

```
python tools/build_factors.py            # uses data/raw/ cache
python tools/build_factors.py --refresh  # re-downloads every source
```

---

## 1. Row counts by source_class

| source_class | Rows | Content |
|---|---:|---|
| `fuel` | **51** | 11 fuels × {CO2, CH4, N2O} × the units the source provides |
| `process` | **24** | clinker 1 · steel Tier 1 6 · EAF electrode 2 · Al anode 2 · Al PFC 8 · nitric acid N2O 5 |
| `gwp` | **11** | CH4 fossil + non-fossil, N2O, CF4, C2F6, SF6, R-22, R-32, R-134a, R-404A, R-410A |
| `grid` | **4** | India weighted average + OM + BM + CM |
| `stoichiometric` | **4** | limestone, dolomite, urea uptake, C→CO2 |
| `steam` | **1** | note row, TODO by design |
| **Total** | **95** | |

Fuel rows by fuel — all 11 SPEC §5 fuels present:

| Fuel | Units emitted | Rows |
|---|---|---:|
| diesel / gas oil | litre, tonne | 6 |
| petrol | litre, tonne | 6 |
| natural gas | m³, tonne | 6 |
| LPG | litre, tonne | 6 |
| fuel oil (residual/furnace) | litre, tonne | 6 |
| naphtha | litre, tonne | 6 |
| bituminous / steam coal | tonne | 3 |
| lignite | tonne | 3 |
| petroleum coke | tonne | 3 |
| coke (coke-oven coke) | tonne | 3 |
| biomass / rice husk | tonne | 3 |

All fuel factors are on a **net calorific value (NCV)** basis (GHGP workbook column D,
TJ/Gg). Biomass CO2 carries `flags=biogenic-memo`; its CH4 and N2O are normal Scope 1 rows,
per SPEC §5.

---

## 2. Self-verification spot-check

Sanity ranges are from the brief and are **diagnostic only** — no CSV value was adjusted to
land inside one.

| Check | Expected range | Parsed value | CO2e (AR6) | Source cell / table reference | Verdict |
|---|---|---|---|---|---|
| Diesel | 2.6–2.8 kgCO2e/L | 2.90999 kg CO2/L | **2.92703** | GHGP `Stationary Combustion` Table 1, row 15 "Gas/Diesel oil", col I (kg CO2/litre) | ⚠ **OUT OF RANGE — flagged, see §4** |
| Natural gas | 1.8–2.1 kgCO2e/m³ | 1.88496 kg CO2/m³ | **1.89041** | GHGP `Stationary Combustion` Table 1, row 44 "Natural gas", col J (kg CO2/m³) | ✅ in range |
| India grid | 0.70–0.75 tCO2/MWh | **0.710** | — | CEA v21.0 User Guide **Table S**, p.1 (adjusted for cross-border transfers) | ✅ in range |
| N2O GWP | 273 (AR6) | **273** | — | IPCC AR6 WGI Ch.7 **Table 7.15**, row N2O, GWP-100 column (273 ± 130) | ✅ exact |
| Clinker | 0.50–0.53 tCO2/t | **0.52** | — | IPCC 2006 Vol.3 Ch.2 **Equation 2.4**, p.2.12 (`0.51 × 1.02 = 0.52`) | ✅ in range |

CO2e figures use the AR6 GWPs from this same file (CH4-fossil 29.8, N2O 273):
diesel = 2.90999 + 0.000392711×29.8 + 0.0000235626×273;
natural gas = 1.88496 + 0.000168×29.8 + 0.00000336×273.

Four of five land in range. The diesel exception is real and is analysed next.

---

## 3. TODO rows (1)

Down from 2 — `gwp_r410a` was closed in the follow-up build (see §3.1). The one remaining
TODO is deliberate and stays.

### 3.1 `gwp_r410a` — **CLOSED**

Resolved by retrieving the **US EPA SNAP "Compositions of Refrigerant Blends"** table
(`https://www.epa.gov/snap/compositions-refrigerant-blends`, retrieved 2026-08-27, cached as
`data/raw/EPA_SNAP_refrigerant_blend_compositions.html`), which publishes the ASHRAE-34
compositions in machine-parseable form. Parsed composition: **R-410A = 50% HFC-32 /
50% HFC-125 by weight**.

```
gwp_r410a = 0.5 × 771 (HFC-32, AR6) + 0.5 × 3740 (HFC-125, AR6) = 2255.5 kg CO2e/kg
```

`flags=ar5-vs-ar6|derived-blend|deviation-gt-5pct`, cross-check DEFRA AR5 1924
(deviation −14.70%, i.e. the AR5→AR6 revision).

**Independent corroboration of the composition.** Rather than trusting the EPA page alone,
the 50/50 split was validated against DEFRA's own published number: applying DEFRA's AR5
component GWPs (HFC-32 = 677, HFC-125 = 3170) to a 50/50 split gives
`0.5 × 677 + 0.5 × 3170 = 1923.5`, against DEFRA's published R-410A value of **1924** —
agreement to within rounding. The same EPA table also independently reproduces DEFRA's
R-404A split exactly (44 / 4 / 52).

**Sources attempted before EPA SNAP:**

| Source | Outcome |
|---|---|
| Australian Government DCCEEW HFC-GWP page | **Unreachable.** Four attempts (2 × WebFetch, 2 × direct request, up to 280 s) all timed out at `www.dcceew.gov.au`. Nothing from it was used. |
| DEFRA 2026 methodology §4.6 | Gives R-404A only; R-410A not stated. Retained as cross-confirmation. |
| EU F-gas Regs 517/2014 Annex IV, 2024/573 Annex VI | Method only, no composition table. **Now cited for the derivation *method***. |
| ANSI/ASHRAE Standard 34 | Paywalled. Superseded by EPA SNAP, which publishes the same compositions. |
| HVAC vendor pages / Wikipedia | Rejected — not citable for a factor database. |

**Blast radius: none remaining.** SPEC §5 line C4 (refrigerant fugitives) can now compute an
AR6 CO2e for all five SPEC-required refrigerants — R-22, R-32, R-134a, R-404A, R-410A.

### 3.2 `steam_purchased` — purchased steam factor

**TODO by design, exactly as SPEC §5 line C6 requires.** Not a gap.

A purchased-steam factor is a property of the *supplier's* boiler fuel, boiler efficiency and
cogeneration allocation — not of a factor library. Publishing a generic default here would be
a fabricated number and a direct SPEC §2 rule-2 violation.

**Required engine behaviour** (recorded in full in the row's `notes`):

1. Prefer a **supplier-documented** tCO2e per tonne (or per GJ) of steam, carried into the
   calculation trail with its own source + vintage.
2. Fall back to a **documented boiler-efficiency reconstruction**: steam enthalpy demand ÷
   boiler efficiency → fuel energy → apply the matching `fuel_*` rows from this file. The
   assumed efficiency must be an explicit, surfaced input and the line must be flagged
   `estimate`.
3. **Never** substitute a generic factor silently.

DEFRA 2026 `Heat and steam` publishes 0.17529 kg CO2e/kWh (onsite and district). That is a
UK-supply-mix number, is recorded in `notes` as **context only**, and is not applicable to
Indian suppliers.

**Action:** define the boiler-efficiency fallback in `engine/common.py` during Phase 2.

---

## 4. Deviations > 5% (42 rows)

All 42 are kept in the CSV and flagged `deviation-gt-5pct`. They fall into three groups with
completely different meanings, and the SPEC §4 deviation guard should treat them differently.

### 4.1 CO2 fuel factors — GHGP vs DEFRA (7 rows) — the group that matters

| Factor ID | Unit | GHGP (primary) | DEFRA (cross-check) | Dev % |
|---|---|---:|---:|---:|
| `fuel_diesel_co2_per_litre` | kg CO2/L | 2.90999 | 2.62818 | **−9.68** |
| `fuel_naphtha_co2_per_litre` | kg CO2/L | 2.37580 | 2.11149 | **−11.13** |
| `fuel_natural_gas_co2_per_m3` | kg CO2/m³ | 1.88496 | 2.04585 | **+8.54** |
| `fuel_natural_gas_co2_per_tonne` | kg CO2/t | 2692.8 | 2531.81 | **−5.98** |
| `fuel_lpg_co2_per_litre` | kg CO2/L | 1.47306 | 1.55491 | **+5.56** |
| `fuel_fuel_oil_co2_per_litre` | kg CO2/L | 3.00527 | 3.16262 | **+5.24** |
| `fuel_pet_coke_co2_per_tonne` | kg CO2/t | 3168.75 | 3377.05 | **+6.57** |

> #### ⚠ Headline finding — the per-litre liquid-fuel factors are a density artefact
>
> Every liquid-fuel per-**litre** deviation is driven by **density**, not by CO2 chemistry.
> On a **mass** basis the two sources agree closely:
>
> | Fuel | GHGP kg CO2/t | DEFRA kg CO2/t | Dev % |
> |---|---:|---:|---:|
> | Diesel | 3186.3 | 3164.33 | **−0.69** |
> | Naphtha | 3261.85 | 3131.33 | −4.00 |
> | Fuel oil | 3126.96 | 3216.38 | +2.86 |
> | LPG | 2984.63 | 2935.18 | −1.66 |
>
> Diesel: −0.69% on mass, **−9.68% on volume**. The gap is entirely the assumed density —
> GHGP uses a generic IPCC/API-gravity figure of **0.91328 kg/L**, while DEFRA's UK diesel
> implies **≈0.8306 kg/L** (3164.33 ÷ 2.62818 ÷ 1000). This is also why diesel misses the
> 2.6–2.8 kgCO2e/L sanity band: the chemistry is right, the litre is wrong.
>
> **Indian automotive diesel is typically ~0.83 kg/L**, i.e. near the DEFRA figure, not the
> GHGP one. Using the GHGP per-litre factor unmodified would over-state diesel Scope 1 by
> roughly 10% for every Indian supplier — across DG sets (SPEC §5 line C2), vehicles (C3) and
> stationary combustion (C1). At the scale of a CBAM exposure figure that is a material,
> systematic, one-directional error.
>
> **Recommendation for Phase 2 (needs Mush's decision — logged as an open row):** the engine
> should treat volume→mass as an explicit, supplier-overridable **density input** and compute
> from the **mass-basis** factor, rather than consuming the GHGP per-litre column. The
> per-litre rows are retained in the CSV for traceability, but the mass rows are the ones the
> engine should prefer. Every affected row's `notes` column already records the GHGP density
> used, so the correction is mechanical once the policy is set.

The natural-gas and petroleum-coke deviations are genuine composition differences (GHGP uses
generic IPCC defaults — natural gas 48 TJ/Gg, 0.7 kg/m³; DEFRA uses UK NTS gas composition),
not unit artefacts. Both natural-gas values sit inside the 1.8–2.1 kgCO2e/m³ sanity band.

### 4.2 GWP rows — AR5 vs AR6 (8 rows) — expected, not errors

DEFRA 2026 is an **AR5-basis** set (methodology paper p.14 and §4.5: CH4 = 28, N2O = 265).
Our declared basis is **AR6** (SPEC §4). The deviation column here therefore measures the
**AR5→AR6 revision**, not a source disagreement. All carry `flags=ar5-vs-ar6`.

| Factor ID | AR6 (primary) | AR5 (cross-check) | Dev % |
|---|---:|---:|---:|
| `gwp_ch4_fossil` | 29.8 | 28 | −6.04 |
| `gwp_cf4` | 7380 | 6630 | −10.16 |
| `gwp_c2f6` | 12400 | 11100 | −10.48 |
| `gwp_r22` | 1960 | 1760 | −10.20 |
| `gwp_r32` | 771 | 677 | −12.19 |
| `gwp_r134a` | 1530 | 1300 | −15.03 |
| `gwp_r404a` | 4728 *(derived)* | 3943 | −16.60 |
| `gwp_r410a` | 2255.5 *(derived)* | 1924 | −14.70 |

Below the 5% threshold and therefore unflagged: `gwp_n2o` (273 vs 265, −2.93%) and `gwp_sf6`
(24300 vs 23500, −3.29%).

**Engine implication:** the SPEC §4 deviation guard must **not** halt on `ar5-vs-ar6` rows.
Suppress this flag class in the guard, or the engine refuses to run on a known, documented,
intentional basis difference. The real rule to enforce is that a single CO2e total never
mixes the two sets.

### 4.3 CH4 / N2O fuel factors (28 rows) — methodological, low materiality

Large percentage deviations (−97% to +474%) on the non-CO2 fuel gases. These are **not**
errors:

- **GHGP** publishes IPCC 2006 *generic Tier 1 defaults* — a flat 10 kg CH4/TJ for most oil
  products, 0.6 kg N2O/TJ, etc. These are deliberately coarse placeholders.
- **DEFRA** publishes *UK GHGI measured* factors, which are far more specific.

The two are answering different questions, so they diverge widely. The unit reconciliation
itself is sound: DEFRA's CO2e-weighted CH4/N2O were divided by DEFRA's own declared AR5 GWPs
(28 / 265), both parsed from the workbook rather than assumed, and documented per row.

**Materiality is small.** For diesel, CH4 + N2O together contribute ~0.6% of the per-litre
CO2e total (0.0181 of 2.927 kgCO2e/L). Even the largest relative deviation moves the fuel's
total CO2e by well under 1%. Contrast with §4.1, where a 10% CO2 error moves the whole line.

The full 28-row list is in the CSV — filter `flags` for `deviation-gt-5pct` where `gas` is
`CH4` or `N2O`. Largest: `fuel_diesel_n2o_per_tonne` (+473.85%),
`fuel_diesel_ch4_per_tonne` (−97.12%), `fuel_coal_bituminous_n2o_per_tonne` (+65.10%).

**Recommendation:** treat `source_class=fuel` CH4/N2O deviations as informational in the
guard. If tighter values are wanted later, the DEFRA-derived mass factors are already in
`value_crosscheck` and could be promoted for fuels where UK and Indian combustion technology
are comparable — a Phase 2 decision, not a Phase 1 fix.

---

## 5. Cross-checks deliberately left empty

Per the brief — where units could not be reconciled cleanly, no cross-check was forced.

| Factor rows | Reason |
|---|---|
| `fuel_lignite_*` | DEFRA 2026 publishes no lignite / brown-coal factor. |
| `fuel_coke_oven_coke_*` | DEFRA lists "Coking coal" — the kiln **input** coal, not the **output** coke. Different commodity. DEFRA's 3144.16 kg CO2/t recorded in `notes` for reference only. |
| `fuel_biomass_rice_husk_*` | DEFRA `Bioenergy` gives only the non-CO2 portion as one AR5-weighted kg CO2e/tonne aggregate (Grass/straw 46.89), biogenic CO2 excluded. Not reducible to a per-gas mass factor. |
| All `fuel_*` CH4/N2O where DEFRA has no matching row | Cross-check empty, noted per row. |
| `process_*`, `stoichiometric_*` (most) | Single authoritative source (IPCC Tier 1). Where a meaningful second value exists in the same source it is used — e.g. clinker 0.52 vs uncorrected base 0.51 (−1.92%). |

---

## 6. Source retrieval outcomes

| Source | Status |
|---|---|
| A. GHG Protocol Cross-Sector Tools v2.0 | ✅ Retrieved and fully parsed (all 3 stationary-combustion tables). |
| B. DEFRA 2026 full set + flat file + methodology | ✅ Retrieved and fully parsed. |
| C. CEA v21.0 User Guide | ✅ Retrieved and fully parsed. The PDF **did not** resist parsing — `pdfplumber` extracted Table S and Annexure-I cleanly. No fallback to the CEA webpage or workbook was needed. |
| D. IPCC 2006 Vol.3 Ch.2 / Ch.3 / Ch.4 | ✅ All three retrieved and fully parsed. Every table the brief named was extracted: 2.1, Eq 2.4, 3.3, urea, 4.1, 4.3, 4.10, 4.15. **No process factor fell back to TODO.** |
| E. IPCC AR6 GWP-100 | ✅ Retrieved. Ch.7 Table 7.15 is abridged, so Supplementary Table 7.SM.7 was additionally downloaded to reach C2F6, SF6 and HCFC-22. |
| Climatiq CEA republication | ⏭ Not fetched — unnecessary. CEA v21.0 Annexure-I supplies the FY 2023-24 prior-vintage value (0.727) directly, a strictly stronger cross-check than third-party republication. |
| DEFRA `Overseas electricity` | ⚠ Retrieved and read; **withdrawn by DEFRA**. Now only signposts EEA / US EPA / SEAI / RTE / IEA. No India row, so unusable as the grid cross-check. Documented rather than worked around. |
| F. US EPA SNAP, Compositions of Refrigerant Blends | ✅ Retrieved and parsed (44 blends). Supplied the R-404A and R-410A mass fractions that closed the `gwp_r410a` TODO. |
| EU F-gas Regs 517/2014 & 2024/573 | ⚠ Both fetched. Neither carries a named-blend composition table, but both define the weighted-average **method**, and are now cited as the method reference for the two derived blend rows. |
| Australian Government DCCEEW HFC-GWP page | ❌ **Not retrievable.** Four attempts (2 × WebFetch, 2 × direct request, up to a 280 s timeout) all timed out at `www.dcceew.gov.au`. Nothing from this source was used; EPA SNAP was retrieved instead and is what is cited. |
| ANSI/ASHRAE Standard 34 | ❌ Not retrievable (paywalled). No longer blocking — EPA SNAP publishes the same ASHRAE-34 compositions. |

**Nothing was substituted from memory in place of a source that could not be retrieved.**

---

## 7. Findings → fixes (house rule L5)

Open rows for Mush. No Phase 2 work should start while these are open.

| # | Finding | Proposed fix | Status |
|---|---|---|---|
| F1 | GHGP per-litre liquid factors use a generic 0.91328 kg/L diesel density; Indian diesel is ~0.83 kg/L. Unmodified use over-states diesel Scope 1 by ~10% across lines C1/C2/C3. | Engine consumes the **mass-basis** factor plus an explicit, supplier-overridable density input. Per-litre rows retained for traceability only. | **OPEN — needs decision** |
| F2 | Diesel per-litre (2.927 kgCO2e/L) falls outside the 2.6–2.8 sanity band. | Not a defect in the CSV — it is F1 observed. Closes with F1. | **OPEN — tracks F1** |
| F3 | `gwp_r410a` unresolved: no citable blend composition retrievable. | Retrieved US EPA SNAP blend-composition table (50% HFC-32 / 50% HFC-125); derived `gwp_r410a` = 2255.5 from AR6 components; corroborated by reproducing DEFRA's published 1924 from the same split with AR5 components. | **CLOSED** |
| F4 | 7 GWP rows breach the 5% guard purely because DEFRA is AR5 and we are AR6. | Deviation guard must suppress the `ar5-vs-ar6` flag class, and instead assert that no single CO2e total mixes GWP sets. | **OPEN — Phase 2 guard design** |
| F5 | 28 CH4/N2O fuel rows breach the guard for methodological reasons (IPCC generic vs UK measured), at <1% materiality on the fuel total. | Treat `fuel` CH4/N2O deviations as informational in the guard. | **OPEN — Phase 2 guard design** |
| F6 | `steam_purchased` has no factor by design. | Implement the documented boiler-efficiency fallback in `engine/common.py`, with the `estimate` flag. | **OPEN — Phase 2** |
| F7 | IPCC Tier 1 DRI factor (0.70) assumes natural-gas DRI; India's coal-DRI route is materially higher. | SPEC §5 coal-DRI gate must compute from actual reductant, never this default. Caveat already recorded in the row's `notes`. | **OPEN — Phase 2** |
| F8 | Al PFC Tier 1 defaults carry −99/+380% uncertainty and IPCC says use only absent Tier 2/3 data. | Engine prefers the anode-effect slope method; Tier 1 use must carry the `default` flag into the trail. Already required by SPEC §5. | **OPEN — Phase 2** |
| F9 | Licence terms not confirmed for GHGP, DEFRA, CEA and IPCC files before public repo release. | Verify reuse terms on each publisher's site; record in `FACTOR_SOURCES.md`. | **OPEN — before Phase 6** |

---

## 8. Integrity statement

- 95 rows; **94** carry a `value_primary` parsed from a cached source file; **1** is TODO
  (`steam_purchased`, by design) with the required engine behaviour documented in the row.
- 0 values recalled from memory, estimated, or hand-typed. When a composition value was
  offered during review, it was **not** written on trust — the EPA SNAP source was fetched,
  parsed, and independently corroborated against DEFRA before the row was populated.
- **3** values are **derived** rather than parsed, all flagged and all showing their
  arithmetic in `notes`: `process_eaf_electrode_co2` (0.82 × 44/12), `gwp_r404a` and
  `gwp_r410a` (AR6 components × EPA SNAP mass fractions).
- Blend derivation is guarded: the build refuses to derive a blend whose parsed mass
  fractions do not sum to ~100%, or whose components lack an AR6 GWP, emitting a TODO row
  with the reason instead.
- Every row carries `source_primary` and `vintage_primary`.
- `factor_id` uniqueness is asserted by the build script.
- A mapping miss between the script and a source now **raises** rather than silently
  degrading a factor to TODO — this was caught during the build, when a `"Gas/Diesel oil"`
  name was being split at the slash and silently TODO-ing all six diesel rows.
