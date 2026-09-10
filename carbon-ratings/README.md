# India–EU Carbon Ratings

**The FTA removed the tariffs. Carbon is the tariff that's left.**

The India–EU Free Trade Agreement (concluded 27 January 2026) takes tariffs on
India's biggest export sectors to zero — while CBAM's definitive regime prices
carbon at the EU border for steel, aluminium, cement and fertilisers, and EU
textile EPR (operational April 2028) eco-modulates fees on much of the rest.

This project measures **Scope 1 + Scope 2 emissions of Indian suppliers** in
the FTA's winning sectors and rates each product's carbon exposure for the EU
market — with every number traceable to a public primary source.

**Live calculator:** https://mushaha97-droid.github.io/carbon-ratings/

## How it works

```
supplier details ──▶ onboarding wizard ──▶ deterministic engine ──▶ task board
(sector · role ·     (manual form, or       (activity × factor,      (Scope 1 · Scope 2 ·
 activity data)       AI-fill from plain     full calculation         process · intensity ·
                      language)              trail)                   CBAM exposure · export)
```

- **AI never does arithmetic.** The optional AI-fill step only extracts form
  fields from a plain-language description (visitor's own OpenAI key, kept in
  the browser tab); the calculation engine is deterministic JavaScript.
- **Every factor is sourced.** The engine consumes `data/factors.csv` — 95 rows,
  each carrying `source + vintage + cross-check + deviation`, built
  programmatically from primary documents (nothing typed from memory).
- **Honest by construction.** Stale results are cleared, not kept ("a number
  that no longer matches its inputs is an invented number"); estimates are
  flagged; purchased steam refuses to compute without a supplier-specific
  factor; traders get an operations footprint, never a fake product footprint.

## The factor database

| Class | Rows | Primary source |
|---|---|---|
| Fuels (CO₂/CH₄/N₂O) | 51 | GHG Protocol Cross-Sector Tools workbook v2.0 (IPCC 2006 basis) |
| Process (clinker, steel, anodes, PFCs, N₂O) | 24 | IPCC 2006 Guidelines Vol. 3, Tier 1 tables |
| GWP-100 | 11 | IPCC AR6 (Table 7.15 + 7.SM.7); blends derived via EPA SNAP compositions |
| India grid (Scope 2) | 4 | CEA CO₂ Baseline Database v21.0 (FY 2024-25: 0.710 tCO₂/MWh) |
| Stoichiometric | 4 | Molar-mass identities, parsed from IPCC tables |
| Purchased steam | 1 | Deliberately TODO — a generic default would be a fabricated number |

Cross-checked against the UK DESNZ/DEFRA 2026 factors; deviations > 5% are
flagged and classified (see `docs/FACTOR_BUILD_REPORT.md`). Full provenance —
citations, URLs, retrieval dates, parsed table references, licensing notes —
in `docs/FACTOR_SOURCES.md`.

CBAM benchmark side: `data/CBAM_India_default_values_2026.xlsx` — the
India-specific default values for the CBAM **definitive period** (Implementing
Regulation (EU) 2025/2621 as corrected by (EU) 2026/1740), 256 CN-code rows.

## Repository layout

```
SPEC.md                  frozen build specification (design decisions + rationale)
site/                    the calculator (static; index.html + app.js + generated data.js)
data/factors.csv         the emission-factor database (the single source of truth)
data/*.xlsx              Excel views: factor database · CBAM India default values
docs/FACTOR_SOURCES.md   full provenance for every factor row
docs/FACTOR_BUILD_REPORT.md  build findings (incl. the diesel density finding)
docs/RESEARCH_SCOPE12.md 10-paper academic review feeding the methodology
tools/build_factors.py   rebuilds factors.csv from the primary sources (--refresh re-downloads)
tools/build_site_data.py regenerates site/data.js from factors.csv + CBAM workbook
tools/extract_cbam_india.py · export_factors_xlsx.py
```

`data/raw/` (the downloaded source workbooks) is not committed — redistribution
licences are unverified (see FACTOR_SOURCES.md). `tools/build_factors.py`
re-fetches every source from its recorded URL.

## Run it locally

```bash
python -m http.server 8000 --directory site
# → http://localhost:8000
```

Rebuild the data layer (optional; requires internet):

```bash
python tools/build_factors.py --refresh   # primary sources → data/factors.csv
python tools/build_site_data.py           # factors.csv + CBAM xlsx → site/data.js
```

## Verification

The engine ships with golden checks verified three ways — by hand, by the
engine, and against the source workbooks. Example: 10 t diesel → 31.863 tCO₂
(+ CH₄ 0.128 + N₂O 0.070 = 32.062 tCO₂e); 100,000 kWh grid → 71.000 tCO₂e.
Details in `site/README-site.md`.

## Scope & honesty notes

- Corporate Scope 1+2 ≠ CBAM embedded emissions: the CBAM panel is an
  **indicative exposure check, not a CBAM filing** (allocation is documented).
- The CEA national grid factor hides large state-level dispersion — a declared
  limitation, stated in the app.
- Sample/AI-demo content is synthetic and labelled as such.

---

**Musharraf Hassan** — Rotterdam, NL · [Portfolio](https://mushaha97-droid.github.io) · musharraf@impactofy.org
