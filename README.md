# mushaha97-droid.github.io

My portfolio — **Strategy. Data. Impact.**

**Live:** https://mushaha97-droid.github.io

Sustainability analytics and impact research: the analysis, the method, and the
repositories behind them.

---

## About the site

A single self-contained `index.html`. No frameworks, no build step, no
dependencies — vanilla JavaScript and inline SVG throughout. The only external
request is one Google Fonts stylesheet.

### Design concept — a dark → light journey

The page opens in a cinematic dark "data world" and resolves into a warm,
editorial light half. One continuous idea: **raw data becomes clear advice.**

| Half | Role |
| --- | --- |
| Dark | The hero and the evidence dashboard — where the numbers live |
| Handoff | A gradient band: *"Raw data becomes clear advice."* |
| Light | Project deep-dives, background, skills, education |
| Dark (bookend) | Contact |

### What it does

- **Animated globe hero** — a Fibonacci point-lattice sphere on `<canvas>`, with a
  precomputed rigid mesh, depth-faded far hemisphere, pulsing live nodes,
  atmospheric glow, and sweeping data streams. The cursor tilts the globe and
  lights the nodes it passes.
- **Interactive evidence dashboard** — a keyboard-accessible lens switcher
  (All · Research · Modelling · Engineering) that re-filters and re-animates the
  metrics, plus an inline-SVG chart with a live hover/tap/keyboard readout.
- **Project deep-dives** — each framed *Question → Method → What the data said*,
  linking to the repository that produced it.
- **Tactile detail** — 3D card tilt, magnetic CTAs, pointer-position ripples,
  copy-to-clipboard on the email.

Every figure shown on the site comes from a public repository listed below. No
number appears that you cannot open and check.

### Accessibility & performance

- Full `prefers-reduced-motion` fallbacks — animation degrades to static frames
- Keyboard operable throughout; semantic landmarks and ARIA on every widget
- WCAG AA contrast in both the dark and light halves
- No horizontal scroll at 375px; touch targets ≥ 44px
- Animation pauses when the hero scrolls out of view or the tab is hidden

---

## The work it showcases

| Project | What it does |
| --- | --- |
| [NL Grid Congestion × Solar Curtailment](https://github.com/mushaha97-droid/dutch-electric-grid-) | Connects Dutch grid-congestion status to the cost of residential solar curtailment, framed around the NL grid rules taking effect 1 July 2026. Spatial layer classifies feed-in congestion from the ACM register; a temporal layer models hourly rooftop PV with pvlib + PVGIS. Ships a Folium choropleth and a Streamlit app. |
| [CSRD / ESRS Compliance](https://github.com/mushaha97-droid/CSRD-compliance-) | Do AI-assisted ESG reporting tools improve ESRS compliance? 38 EU companies (19 AI-platform users vs 19 matched peers) scored against the 12 ESRS standards. The honest answer: no statistically significant difference. |
| [ANBI Funding Structures](https://github.com/mushaha97-droid/ANBI-funding-structure-) | An income-mix benchmark of 14 NGOs in regenerative agriculture and land restoration — what actually funds organisations at each size band. |

---

## Running it locally

No build step. Serve the folder and open it:

```bash
python -m http.server 5510
```

Then visit `http://localhost:5510`.

---

## Contact

**Musharraf Hassan** — Rotterdam, Netherlands

- Email — musharraf@impactofy.org
- GitHub — https://github.com/mushaha97-droid
- LinkedIn — https://www.linkedin.com/in/musharrafhassan
