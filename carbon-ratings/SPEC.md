# SPEC — India–EU Carbon Ratings Platform
*Frozen build specification · planned 27 Aug 2026 · Fable (design) → Opus (execution) → Fable (review)*

## 1. The story

The India–EU FTA (concluded 27 Jan 2026) takes tariffs on India's biggest export
sectors to zero. CBAM's definitive regime prices carbon at the EU border for
steel, aluminium, cement and fertilisers. EU textile EPR (operational Apr 2028)
eco-modulates fees on everything else.

> **"The FTA removed the tariffs. Carbon is the tariff that's left."**

An AI-assisted pipeline that measures **Scope 1 + 2 emissions of Indian
suppliers** in the FTA's winning sectors and rates each product's carbon
exposure for the EU market.

## 2. Hard rules (non-negotiable)

1. **AI never does arithmetic.** All calculation is deterministic, tested Python.
2. **No invented numbers.** Every factor has `source + vintage`; every benchmark cited.
3. **Estimates are labelled.** AI gap-fills carry confidence + flag, never silent.
4. **Synthetic data is watermarked.** No real company names; every sample doc marked SYNTHETIC.
5. **Secrets hygiene.** OpenAI key via `.env` only; `.gitignore` from commit #1; never in chat.
6. **Traders are not manufacturers.** `supplier_role` gates the rating type (see §6).

## 3. Scope

**Sectors (6):** textiles & apparel · leather & footwear · iron & steel ·
aluminium · cement · fertilisers.
Electricity = every supplier's Scope 2 (not a sector). Hydrogen parked for v2.

**Out of scope v1:** Scope 3, product LCA, real supplier onboarding, auth/portal,
live web app (Streamlit is a v2 option), CBAM filing outputs (indicative exposure only).

## 4. Factor library (`data/factors.csv`)

| Class | Primary source | Cross-check |
|---|---|---|
| India grid Scope 2 | CEA CO₂ Baseline Database **v21.0** (Nov 2025, FY 2024-25) — value pulled from workbook at build | Climatiq-republished CEA |
| Fuels (S1) | GHG Protocol Cross-Sector Tools workbook **v2.0** (IPCC 2006 basis) | UK DESNZ/DEFRA **2026** factors (pub. 11 Jun 2026) |
| Process (calcination, anodes, PFC, N₂O) | IPCC 2006 Vol.3 Tier 1 (+ GHGP India cement tool) | Stoichiometry where exact |
| Refrigerant GWPs | DEFRA 2026 / IPCC **AR6 GWP-100** | — |

Schema: `factor_id · source_class · value_primary · unit · source_primary ·
vintage · value_crosscheck · source_crosscheck · deviation_pct · notes`

**Deviation guard:** engine refuses to run silently if primary vs cross-check
deviate > 5% — surfaces the discrepancy in the trail instead.
*Guard whitelist:* rows flagged `ar5-vs-ar6` are exempt (known, intentional
GWP-set difference — DEFRA 2026 is AR5; our declared basis is AR6). CH₄/N₂O
fuel-row deviations (generic IPCC vs UK-measured) are reported but non-blocking
(< 1% materiality of fuel CO₂e).

**Liquid-fuel basis rule (finding F1 from the factor build):** the engine
consumes liquid-fuel factors on the **mass basis** (kg CO₂/t), converting via a
**supplier-overridable density** field. Rationale: GHGP's per-litre column
embeds a generic 0.913 kg/L diesel density; Indian diesel is ≈ 0.83 kg/L, so
per-litre factors would overstate diesel Scope 1 by ~10% across lines C1/C2/C3.
Default densities documented in METHODOLOGY.md with source.

Pinned stoichiometric constants (exact chemistry, safe to hard-code):
limestone 0.440 tCO₂/t · dolomite 0.477 · urea uptake −0.733 · C→CO₂ = 44/12.

## 5. Calculation engine (21 line items)

### Common block — all sectors (`engine/common.py`)
| ID | Line | Formula | Scope |
|---|---|---|---|
| C1 | Stationary combustion | fuel qty × NCV × EF per gas | 1 |
| C2 | DG sets (own prompt — India) | diesel L × EF | 1 |
| C3 | Vehicles/forklifts | fuel L × EF | 1 |
| C4 | Refrigerant fugitives | kg refilled × AR6 GWP | 1 |
| C5 | Grid electricity (location-based) | kWh × CEA v21 factor; market-based line if REC/PPA | 2 |
| C6 | Purchased steam | t × documented factor | 2 |
| C7 | Captive generation | captive fuel × EF → **Scope 1** | 1 |

### Sector modules (`engine/sectors/*.py`, templates in `sectors/*.yaml`)
- **Steel** — route gate (BF-BOF / grid-EAF / captive-EAF / coal-DRI): reductant ×
  EF; flux (0.440/0.477); electrodes × EF. Intensity /t crude steel, benchmarked per route.
- **Aluminium** — smelter/downstream gate: anode C × 44/12; **PFC** via
  anode-effect slope or Tier 1 default (flagged); downstream = common block only.
- **Cement** — clinker t × IPCC EF (plant CaO preferred); kiln fuels with AFR
  biomass → memo; WHRS modelled as reduced purchased kWh. Clinker ratio surfaced.
- **Fertilisers** — feedstock CO₂ (C × 44/12) split from fuel; nitric-acid N₂O
  with/without abatement × GWP 273; urea −0.733 explicit negative line.
- **Textiles** — segment gate (spinning/wet-processing/garmenting); husk boilers →
  biogenic CO₂ memo, CH₄/N₂O stay S1. Intensity /t yarn · /kg fabric · /1k garments.
- **Leather/footwear** — segment gate; optional effluent CH₄ (COD × B₀ × MCF,
  flagged estimate). Intensity /m² leather · /1k pairs.

### Calculation trail (every line)
`line_id · supplier · source · qty+unit · factor+source+vintage · gas vector ·
GWP set · CO₂e · scope · uncertainty_class(tight|moderate|wide, per IPCC ranges) ·
flags(default|estimate|biogenic-memo)`
Rationale (docs/RESEARCH_SCOPE12.md): uncertainty is heteroskedastic per
gas/source — fuel CO₂ ±few %, HNO₃ N₂O ±10–40%, Al PFC −99/+380% — so ratings
near band boundaries must surface it. Output wording rule: "indicative
exposure", never "CBAM-compliant". METHODOLOGY.md states the grid-dispersion
limitation (state-level marginal factors span ~3 orders of magnitude).

### Golden test
One hand-computed inventory (a synthetic textile mill) verified three ways:
by hand in the README, by the engine (pytest), by DEFRA's own workbook.

## 6. Ratings (`engine/ratings.py`)

- **CBAM sectors** (steel, aluminium, cement, fertilisers): **absolute** —
  intensity vs CBAM default values → A–E band + indicative €/t exposure
  (carbon price as a parameter, default = current EUA range, sourced).
- **FTA sectors** (textiles, leather): **banded** — published LCA ranges +
  peer percentile within corpus; labelled *indicative*.
- **Traders** (`supplier_role: trader`): **traceability grade** A–D
  (A = full pass-through to a rated manufacturer; D = origin unknown).
  Own S1+S2 computed but labelled "operations footprint — NOT product footprint."
  Trader records link to manufacturer records; product rating flows through.

## 7. AI module (`ai/`, OpenAI API)

| Task | Input → output | Guard |
|---|---|---|
| Extraction | synthetic bills/invoices (PDF/img) → structured activity JSON | eval vs corpus ground truth; field-level accuracy report |
| Classification | free-text product description → sector template + HS hint | confidence threshold; below it → ask, don't guess |
| Gap-filling | missing fields → estimate + range + `estimate` flag | never overwrites provided data |
| Narrative | rating + trail → plain-English supplier summary | template-constrained; no new numbers |

- `PROMPTS.md` documents every prompt (prompt engineering treated as engineering).
- **Cached mode:** all AI outputs for the sample corpus are committed, so the
  public repo runs end-to-end with no key. Live mode activates when
  `OPENAI_API_KEY` is present.

## 8. Synthetic corpus (`data/corpus/`)

~15 suppliers: 2–3 per sector, mixed roles (incl. 2 traders), steel routes and
aluminium smelter/downstream both represented, 3 Indian fiscal years
(FY23-24 → FY25-26). Generator script (`tools/make_corpus.py`) with fixed seed →
ground-truth labels for the AI eval. Every document watermarked **SYNTHETIC**.

## 9. Outputs

- `out/inventory.csv` — every calculation-trail line, all suppliers
- `out/ratings.csv` — one row per supplier: S1, S2, intensity, band/grade, exposure
- `out/supplier_reports/` — per-supplier Markdown report (trail + AI narrative)
- Star-schema-shaped CSVs retained so any BI tool can sit on top later (v2 option).

## 10. Repo layout

```
india-eu-carbon-ratings/
├── README.md                 # story, worked example, screenshots, quickstart
├── docs/ SPEC.md · METHODOLOGY.md · FACTOR_SOURCES.md · PROMPTS.md
├── data/ factors.csv · benchmarks.csv · corpus/ (synthetic docs + ground truth)
├── sectors/ *.yaml           # 6 sector templates (checklists, units, benchmarks)
├── engine/ common.py · sectors/*.py · ratings.py · trail.py · models.py
├── ai/ extract.py · classify.py · gapfill.py · narrate.py · cached/
├── tools/ make_corpus.py · build_factors.py · export_outputs.py
├── tests/ test_golden.py · test_sectors.py · test_factors_guard.py · test_ai_eval.py
├── pipeline.py               # docs → extraction → engine → ratings → PBI CSVs
├── requirements.txt · .env.example · .gitignore (.env, keys)
```

## 11. Build phases & checkpoints

| Phase | Work | Who | Checkpoint (must observe, not assume) |
|---|---|---|---|
| 0 | Create repo, invite `musharraf-a11y`, scaffold | **Mush** + Opus | repo clones; `.env` ignored |
| 1 | Factor library from the 4 verified sources | Opus | every row sourced+vintaged; deviations reviewed in a findings table |
| 2 | Engine: models, common block, 6 sectors, trail, ratings | Opus | **golden test matches hand calculation**; pytest green |
| 3 | Synthetic corpus + generator | Opus | ground truth complete; SYNTHETIC watermark on every doc |
| 4 | AI module + eval + cached outputs | Opus (**needs key**) | accuracy report vs ground truth; cost logged; cached mode runs keyless |
| 5 | Ratings, benchmarks, output CSVs/reports | Opus | ratings reproducible from CLI in one command |
| 6 | Docs, README worked example, portfolio card + case story | Opus + Fable | stranger test: clone → run → understand in 10 min |

Each phase ends with a findings→fixes table; no phase starts while the previous
table has open rows (house rule L5).

## 12. Done when

- [ ] Public repo, all tests green, pipeline runs keyless end-to-end
- [ ] Factor database complete: every row sourced + vintaged + cross-checked
- [ ] Every number traceable to a sourced factor or labelled synthetic/estimate
- [ ] AI eval report published (accuracy + cost)
- [ ] Portfolio site gains project #4 with case story (Question → Method → What the data said)
