# `site/` — the India–EU Carbon Ratings web app

A static, dependency-free site. An Indian supplier enters their operations; the page
computes a Scope 1 + Scope 2 inventory and shows the full calculation trail, with
every line carrying the emission factor it used, that factor's source and its vintage.

No build step, no framework, no bundler. Four files ship, one of them generated.

```
site/
├── index.html        the three screens
├── styles.css        deep-forest theme, responsive, no JS dependencies
├── app.js            the deterministic engine + all UI logic
├── data.js           GENERATED — the factor database and the CBAM defaults
└── README-site.md    this file
```

---

## 1. How it works

The flow is in two phases: a short **wizard** that collects, then a persistent
**board** the supplier lands on and keeps coming back to.

### Phase A — onboarding (the wizard)

| Step | What it collects |
|---|---|
| **1 — Who you are** | sector, role (manufacturer / trader), Indian state, reporting year, production output + per-sector unit |
| **2 — Your activity data** | the common block (fuels, DG sets, vehicles, refrigerants, electricity, purchased steam) plus one sector process block; optionally pre-filled by the AI panel |

"Open my board →" hands off to Phase B. It does **not** compute — the board decides when.

### Phase B — the board

The board is the workspace. It has three parts:

**Profile bar.** Supplier · sector · role · state · FY · production output, with an
**✎ Edit details** button that returns to the wizard. The wizard sections are only
`hidden`, never destroyed, so **nothing entered is ever lost** on the round trip — verified
in the browser by snapshotting every field before and after.

**Task cards.** Each card carries a title, a plain-language info blurb explaining what the
task is and why it matters to an Indian supplier exporting to the EU, a status, and — once
calculated — its headline number and an expandable trail showing *only that card's lines*.

| Card | Shown when | Headline |
|---|---|---|
| **Scope 1 — direct emissions** | always | tCO₂e direct (fuels, DG, vehicles, refrigerants, captive fuel and process lines rolled in) |
| **Scope 2 — purchased electricity** | always | tCO₂e location-based; market-based context note if a PPA/REC is declared; steam note if steam was entered |
| **Process emissions** | steel / aluminium / cement / fertilisers, manufacturers only | tCO₂e process, with a per-sector info blurb and an explicit "already inside Scope 1 — focused view, not an addition" note |
| **Intensity & benchmark** | always | tCO₂e per output unit |
| **CBAM exposure check** | CBAM sectors only | CN-code select + below/above the India default value |
| **Biogenic memo** | only when a biomass fuel is present | tCO₂ memo, outside the scopes |
| **Export** | always | trail CSV + summary JSON buttons |

**Statuses** are `Ready` · `Needs input` · `Done` · `Not applicable`. A `Needs input` card
**names the exact field and where to find it** — e.g. *"clinker produced, in tonnes
(step 2 → Cement)"*, *"production output on a TONNES basis — CBAM default values are per
tonne of good (step 1 → Production output unit)"*. A card that needs input shows no
headline number at all, so a status and a figure can never contradict each other.

**Calculate all** runs `compute()` once and populates every card. Each computed card also
carries a **Recalculate** button, which is the same call. Under the cards, a **Full
calculation trail** section expands to the complete line-by-line table plus the per-gas
breakdown.

**Stale-result guard.** A result is only valid for the inputs that produced it. The board
stores a snapshot of the input alongside the result; if the supplier edits anything and
returns, the old figures are **cleared rather than left on screen**, an amber banner
explains why, and the cards drop back to `Ready`. A number that no longer matches its
inputs is an invented number, so it does not get displayed.

**Trader role.** The board headline stays *"Operations footprint — not a product
footprint"*, the Process card is not rendered at all, and the Intensity and CBAM cards
switch to `Not applicable` with the traceability-grade explanation (A = full pass-through
to a rated manufacturer, D = origin unknown) instead of computing a product figure.

### The four rules the code is built around

**1. No factor value is ever written in `app.js`.**
Every number that enters a calculation is read out of `FACTORS` by `factor_id`. The only
numeric literals in the engine are unit conversions (kg→t, kWh→MWh) and the
`44/12`-style ratios that are themselves *stored as factor rows* and looked up. If you
grep `app.js` for a factor value you will not find one — you will find a `factor_id`.

**2. Every computed line carries its source.**
`mkLine()` is the only constructor for a trail line, and it can only be called with a
`factor_id`. It copies `source_primary` and `vintage_primary` onto the line, so a line
that appears in the trail without a source is structurally impossible.

**3. The AI never does arithmetic.**
The AI path calls OpenAI with a strict JSON schema that mirrors the *form fields*. It
returns quantities and selections, nothing else. Those values are written into the form,
highlighted, and left for the user to review. The deterministic engine then computes from
the form, exactly as it would have if the user had typed the values.

**4. Missing input means the line does not compute.**
There is no gap-filling in this MVP. Purchased steam has no factor row *by design* and
renders the honest "supplier-specific factor required" note straight out of the factor
database. Litres with no density produce a non-computing line that says why.

### Engine rules implemented

| Rule | Where | Behaviour |
|---|---|---|
| **Liquid-fuel mass basis** (SPEC §4 F1) | `burnFuel()` | Litres are converted to tonnes with an editable density and the **per-tonne** factor rows are used. The per-litre rows are never used for computation, because they embed a generic ~0.913 kg/L GHGP density. The conversion is written into the trail: `18,000.00 L × 0.91328 kg/L ÷ 1000 = 16.4390 t`. |
| **Density defaults** | `FUEL_DENSITY` in `data.js` | Parsed out of the *notes column of `factors.csv`* by the build script, not typed by hand. Default shown, editable, helper text points at the real Indian range (~0.82–0.85 kg/L for diesel). |
| **Gas fuels** | `burnFuel()` | m³ uses the `per_m3` rows directly; tonnes uses `per_tonne`. |
| **CO₂e** | `gwpFor()` | Per-gas mass × AR6 GWP read from the `gwp_*` rows. Fossil CH₄ (29.8) vs non-fossil CH₄ (27.0) is selected from the fuel's own `biogenic-memo` flag, not hard-coded. CO₂ = 1 is the definition of the metric, and is labelled as such. |
| **Grid electricity** | `compute()` C5 | `kWh ÷ 1000 × grid_india_weighted_avg`. **Only** the weighted-average row is used — never OM / BM / CM. Labelled "location-based, CEA v21.0 FY 2024-25", with the national-dispersion limitation stated on the line. |
| **Captive** | `compute()` C7 | The captive kWh is recorded as a non-computing context line (booking both would double-count); the captive **fuel** produces the Scope 1 lines, tagged `captive`. |
| **PPA / REC** | `compute()` C5m | Recorded as a market-based **context** line. Never netted off location-based Scope 2. |
| **Stoichiometric lines** | `steelLines()`, `fertiliserLines()` | limestone × `stoich_limestone_caco3`, dolomite × `stoich_dolomite`, electrode × `process_eaf_electrode_co2`, urea × `stoich_urea_co2_uptake` as an explicit **negative** line. |
| **Steel route gate** | `syncSector()` + `steelLines()` | BF-BOF hides the electrode field. Coal-DRI shows a prominent note and applies **no** route default — IPCC's DRI default is gas-based, so the tool computes only from the user's actual reductant input (RESEARCH_SCOPE12 nuance 1). |
| **Trader role** | `compute()` | Sector process blocks are hidden and skipped entirely. Results are headlined "Operations footprint — not a product footprint". |
| **Deviation guard** | `deviationWarning()` | A used factor row with `|deviation_pct| > 5` shows a ⚠ and the note in the trail — unless it is flagged `ar5-vs-ar6`, which is the whitelisted, intentional GWP-set difference. |
| **Uncertainty class** | `uncertaintyOf()` | Derived from the factor row, never assigned per line: `tight` = fuel CO₂ and exact stoichiometry; `moderate` = fuel CH₄/N₂O, nitric-acid N₂O, anode CO₂, clinker, grid, refrigerants; `wide` = PFC Tier 1 defaults and anything flagged gap-filled/estimate. |
| **Biogenic split** | `burnFuel()` | Biomass CO₂ is a memo line **excluded** from the Scope 1 total; the CH₄ and N₂O from the same fuel stay in Scope 1 and the CH₄ uses the non-fossil GWP. |

### CBAM panel

Shown only for steel / aluminium / cement / fertilisers, only for manufacturers, and only
computes a comparison when production output is on a **tonnes** basis (the CBAM defaults
are per tonne of good). The CN-code list is filtered from `CBAM_DV` by sector. The verdict
is "below / above the India default value" against `dv_total`.

The 2026 mark-up is **noted, not applied**: most goods rise +10% in 2026, +20% in 2027 and
+30% from 2028, but fertilisers are exempt and rise +1%/yr instead, so a blanket ×1.10
would be wrong. The panel states the schedule and compares against the published value.

Wording is fixed as **"indicative exposure — not a CBAM filing"**, and the panel states
that a corporate Scope 1+2 intensity and a product-level embedded-emissions default are
not the same boundary.

### API key handling

The visitor may paste **their own** OpenAI key. It is held in a module-scope JavaScript
variable (`API_KEY`), used for one request, and cleared in the `finally` block. It is
explicitly **not** written to `localStorage`, `sessionStorage`, or a cookie, and it is
never sent anywhere except `api.openai.com`. The page says so next to the field. **No key
ships with this app.** Verified in the browser: after a full run, `localStorage.length`
and `sessionStorage.length` are both `0`.

Without a key, **Load worked example** runs the same flow from a bundled, committed
description + pre-extracted field set (cached-AI mode). The sample is labelled
**SYNTHETIC** in its first line and describes no real company.

---

## 2. Rerunning the data build

`site/data.js` is **generated and must never be hand-edited**. It is written by
`tools/build_site_data.py` from the two sourced inputs.

```bash
# from the repository root
python tools/build_site_data.py
```

```
Inputs
  data/factors.csv                                        -> const FACTORS      (95 rows, all columns)
  data/raw/CBAM_default_values_definitive_v20260204.xlsx  -> const CBAM_DV      (India sheet)

Output  site/data.js
  DATA_BUILD    provenance stamp (sources, row counts, build date, GWP basis)
  FACTORS       every row, every column, values untouched
  FUEL_DENSITY  GHGP generic densities regex-parsed out of the factors.csv notes column
  CBAM_DV       India rows: sector, cn_code, description, dv_direct, dv_indirect,
                dv_total, production_route
```

Requires `pandas` and `openpyxl` (for the `.xlsx` read). Nothing else.

Notes on the CBAM parse: European decimal commas (`1,390`) are converted to floats, and
rows whose total is `-` or `see below` are dropped because no default value is published
for them. The current build keeps **256** India rows and skips **27**.

The last run reported:

```
CBAM India: 256 rows kept, 27 rows without a published value skipped
factors: 95 rows
densities parsed from notes: 6 -> diesel=0.91328kg/L, petrol=0.74534kg/L,
  natural_gas=0.7kg/m3, lpg=0.49355kg/L, fuel_oil=0.96108kg/L, naphtha=0.72836kg/L
```

**If you change `data/factors.csv`, rerun the build.** The app derives its fuel list, unit
options, refrigerant list, nitric-acid plant classes and GWP set from `FACTORS` at runtime,
so adding a factor row is usually all that is needed to add a fuel to the form.

---

## 3. Running locally

Because the page loads `data.js` and `app.js` as separate scripts, open it over HTTP
rather than `file://`:

```bash
cd site
python -m http.server 8000
# then open http://127.0.0.1:8000/index.html
```

---

## 4. Deploying to GitHub Pages

The site is fully static with no build step, so Pages can serve it directly.

**Option A — serve from `/docs` on `main`** (simplest):
rename or copy `site/` to `docs/`, then in the repository go to
*Settings → Pages → Build and deployment → Source: Deploy from a branch*,
branch `main`, folder `/docs`.

**Option B — serve `site/` via an Actions workflow** (keeps the folder name):

```yaml
# .github/workflows/pages.yml
name: Deploy site to Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: site
      - id: deployment
        uses: actions/deploy-pages@v4
```

Deploy notes:

- **All paths are relative** (`data.js`, `app.js`, `styles.css`), so the site works from a
  project sub-path such as `https://<user>.github.io/india-eu-carbon-ratings/`.
- **No `.nojekyll` needed** — no underscore-prefixed files are used. Add one if you ever do.
- **Only one external request**: the Google Fonts stylesheet. Everything else is local.
  If you need a zero-third-party deployment, drop the `<link>` in `index.html`; the font
  stacks fall back to system fonts and the layout is unaffected.
- **Update the repo link.** `REPO_URL` at the top of `app.js` is a placeholder pointing at
  `https://github.com/musharraf-a11y/india-eu-carbon-ratings`. Point it at the real
  repository before publishing.
- **Do not commit an API key.** None is present. The key field is visitor-supplied and
  in-memory only.
- The OpenAI call is made from the visitor's browser directly to `api.openai.com`, so the
  Pages host never sees the key or the description text.

---

## 5. Verified behaviour (golden checks)

Hand-computed against `data/factors.csv`, then reproduced by driving the engine.

| # | Input | Hand calculation | Computed |
|---|---|---|---|
| 1 | 10 t diesel (mass basis) | CO₂ 10 × 3186.3 = 31 863 kg = **31.863** t; CH₄ 10 × 0.43 = 4.3 kg × 29.8 = **0.12814** t; N₂O 10 × 0.0258 = 0.258 kg × 273 = **0.070434** t; total **32.061574** | 32.061574 ✓ |
| 1b | 10 000 L diesel @ 0.83 kg/L override | 8.3 t → per-tonne rows; CO₂ 8.3 × 3186.3 = **26.44629** t | 26.44629 ✓ |
| 2 | 100 000 kWh grid | 100 MWh × 0.71 = **71.0** tCO₂e Scope 2 | 71.0 ✓ |
| 3 | 1 000 t clinker | 1000 × 0.52 = **520** tCO₂ | 520 ✓ |
| 4 | 100 t urea | 100 × −0.733 = **−73.3** tCO₂ (negative line) | −73.3 ✓ |
| 5 | 50 t rice husk | CO₂ 58.0 t → **biogenic memo, excluded from S1**; CH₄ 174 kg × **27.0**; N₂O 2.32 kg × 273; S1 = **5.33136** t | 5.33136, memo 58.0 ✓ |
| 6 | EAF electrode 5 t | 5 × 3.00667 = **15.03335** tCO₂ | 15.03335 ✓ |
| 7 | Limestone 100 t / dolomite 40 t | 43.971 / 19.0928 tCO₂ | 43.971 / 19.0928 ✓ |
| 8 | 1 000 t Al, CWPB | anode 1000 × 1.6 = **1600** tCO₂; CF4 400 kg × 7380; C2F6 40 kg × 12400 | 1600 / 2952 / 496 ✓ |

Guard checks: diesel CO₂ (−0.69%) is not warned; diesel CH₄ (−97.12%) and N₂O (+473.85%)
are warned; the AR5-vs-AR6 GWP rows (R-410A, R-32, …) are exempt as specified. A PPA
declaration does not reduce Scope 2. BF-BOF hides the electrode field and produces no
electrode line. Coal-DRI produces no `process_steel_dri_tier1` line. Traders produce no
sector process lines.

### Board checks

The board is a rendering layer over the same result, so it is checked for *partition*
rather than arithmetic — a card must not invent, drop or double-count a line.

| Check | Result |
|---|---|
| Scope 1 card total == `res.scope1` | exact |
| Scope 2 card total == `res.scope2` | exact |
| Biogenic card total == `res.biogenic` | exact |
| Scope 1 + Scope 2 card totals == combined | exact |
| Process lines are a strict **subset** of Scope 1 (focused view, not an addition) | 0 strays |
| Every computed line lands on **exactly one** of Scope 1 / Scope 2 / Biogenic | 0 violations |
| No computed line is orphaned from all cards | 0 orphans |
| Steam no-calc line, PPA context line, captive-kWh context line all still surface | present |
| `Needs input` statuses name a real field | 4/4 |
| CBAM refuses a non-tonnes basis and says so | yes |
| Trader → Intensity and CBAM are `Not applicable` | yes |
| Aluminium downstream → Process is `Not applicable` | yes |
| Missing litre density detected and named | yes |
| Biogenic card appears only when biomass is present | yes |

**51/51 checks pass** (27 engine + 24 board). Live click-through additionally confirmed:
the worked example computes identically before and after the restructure (S1 339.406,
S2 1 704.000, combined 2 043.406, intensity 0.4865, biogenic memo 1 044.000, 16 trail
lines = 13 + 2 + 1 across the cards); Edit → wizard → board preserves every field;
at 375 px the cards stack to one column, no page-level horizontal scroll, every table
scrolls inside its own container, and no control is under 44 px.

---

## 6. Known gaps against the full SPEC

Honest list of what this MVP does **not** do.

- **Purchased steam does not compute.** By design — no generic factor is substituted. The
  boiler-efficiency reconstruction fallback described in the `steam_purchased` row is a
  full-engine feature.
- **Aluminium PFCs use Tier 1 defaults only.** The anode-effect slope (Tier 2) method needs
  AE minutes/frequency, which this form does not collect. Lines are flagged `tier1-default`
  and classed `wide`.
- **Fertiliser feedstock CO₂ is not split from fuel CO₂.** Ammonia feedstock carbon is
  captured through the common fuels block, so the total is right, but SPEC §5's separate
  feedstock line is not shown.
- **Leather effluent CH₄ (COD × B₀ × MCF) is not offered** rather than guessed at.
- **Cement Tier 2 (plant CaO) and AFR biomass split, and WHRS-as-reduced-kWh, are not modelled.**
- **Ratings bands (A–E), €/t exposure and the trader traceability grade are not computed.**
  The CBAM panel gives the below/above comparison only; the banding logic is SPEC §6 work.
- **State selection is recorded but not used in the calculation.** Scope 2 is the CEA
  national weighted average, and the state-dispersion limitation is stated on the line.
- **Reductant carbon is booked with the fuel's GHGP combustion factor** assuming full
  oxidation, rather than an IPCC material-balance carbon content. Stated in the line note.
