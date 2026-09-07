/* India–EU Carbon Ratings — MVP calculator
 * ---------------------------------------------------------------------------
 * HARD RULES, enforced structurally in this file:
 *   1. No emission factor value is ever written here. Every number used in a
 *      calculation is read out of FACTORS (site/data.js, generated from
 *      data/factors.csv by tools/build_site_data.py). The only literals below
 *      are unit conversions (kg->t, kWh->MWh) and factor_id routing strings.
 *   2. Every computed line carries its factor's source_primary + vintage_primary
 *      into the calculation trail.
 *   3. The AI never does arithmetic. It only fills form fields.
 *   4. A missing input means a line does not compute. Nothing is invented.
 * ------------------------------------------------------------------------- */
'use strict';

/* Placeholder — point at the public repo once it exists. */
const REPO_URL = 'https://github.com/mushaha97-droid';

/* ═══════════════════════ factor access ═══════════════════════ */

const BY_ID = new Map(FACTORS.map(f => [f.factor_id, f]));

function F(id) {
  const f = BY_ID.get(id);
  if (!f) throw new Error('Unknown factor_id: ' + id);
  return f;
}
/** A factor row is usable only if it actually carries a primary value. */
function usable(id) {
  const f = BY_ID.get(id);
  return !!(f && typeof f.value_primary === 'number');
}
const flagsOf = f => (f.flags || '').split('|').filter(Boolean);

/** Uncertainty class, derived from the factor row — never assigned per line by hand.
 *  tight    = fuel CO2 and exact stoichiometry
 *  moderate = CH4/N2O from fuel, nitric-acid N2O, anode CO2, clinker, grid, refrigerants
 *  wide     = PFC Tier 1 defaults, and anything flagged as gap-filled/estimated  */
function uncertaintyOf(f) {
  const fl = flagsOf(f);
  if (f.source_class === 'stoichiometric' || fl.includes('stoichiometric')) return 'tight';
  if (f.source_class === 'fuel') return f.gas === 'CO2' ? 'tight' : 'moderate';
  if (f.gas === 'CF4' || f.gas === 'C2F6') return 'wide';
  if (fl.includes('gap-filled') || fl.includes('estimate')) return 'wide';
  return 'moderate';
}

/** Deviation guard (SPEC §4): surface primary-vs-crosscheck disagreements > 5%,
 *  except the whitelisted AR5-vs-AR6 GWP-set difference. */
function deviationWarning(f) {
  const d = f.deviation_pct;
  if (typeof d !== 'number' || Math.abs(d) <= 5) return null;
  if (flagsOf(f).includes('ar5-vs-ar6')) return null;
  return { pct: d, note: firstSentences(f.notes, 2) };
}

function firstSentences(text, n) {
  if (!text) return '';
  const parts = String(text).split(/(?<=\.)\s+/);
  return parts.slice(0, n).join(' ');
}

/* GWP-100, AR6. CO2 = 1 is the definition of the metric, not a factor value;
   every other gas is looked up in the gwp_* rows of FACTORS. */
const GWP_ROW = {
  CH4_fossil: 'gwp_ch4_fossil', CH4_nonfossil: 'gwp_ch4_nonfossil', N2O: 'gwp_n2o',
  CF4: 'gwp_cf4', C2F6: 'gwp_c2f6', SF6: 'gwp_sf6',
  'R-22': 'gwp_r22', 'R-32': 'gwp_r32', 'R-134a': 'gwp_r134a',
  'R-404A': 'gwp_r404a', 'R-410A': 'gwp_r410a',
};

function gwpFor(gas, biogenic) {
  if (gas === 'CO2') {
    return { value: 1, id: null, source: 'Definition of CO₂-equivalent (CO₂ GWP-100 = 1)', vintage: 'AR6 (2021) GWP-100' };
  }
  const key = gas === 'CH4' ? (biogenic ? 'CH4_nonfossil' : 'CH4_fossil') : gas;
  const row = F(GWP_ROW[key]);
  return { value: row.value_primary, id: row.factor_id, source: row.source_primary, vintage: row.vintage_primary };
}

/* ═══════════════════════ fuel catalogue (derived from FACTORS) ═══════════════════════ */

const FUEL_ID_RE = /^fuel_(.+)_(co2|ch4|n2o)_per_(litre|m3|tonne)$/;

const FUELS = (() => {
  const m = new Map();
  for (const f of FACTORS) {
    if (f.source_class !== 'fuel') continue;
    const mm = FUEL_ID_RE.exec(f.factor_id);
    if (!mm) continue;
    const [, key, gas, unit] = mm;
    if (!m.has(key)) m.set(key, { key, activity: f.activity, units: new Set(), ids: {}, biogenic: false });
    const e = m.get(key);
    e.units.add(unit);
    e.ids[unit + '|' + gas] = f.factor_id;
    if (gas === 'co2' && flagsOf(f).includes('biogenic-memo')) e.biogenic = true;
  }
  return [...m.values()].map(e => ({
    ...e,
    units: ['tonne', 'litre', 'm3'].filter(u => e.units.has(u)),
    density: FUEL_DENSITY[e.key] || null,
  }));
})();

const fuel = key => FUELS.find(f => f.key === key);
const UNIT_LABEL = { tonne: 't', litre: 'L', m3: 'm³' };
const LIQUID_FUELS = FUELS.filter(f => f.units.includes('litre'));
const SOLID_REDUCTANTS = ['coke_oven_coke', 'coal_bituminous', 'lignite', 'pet_coke']
  .filter(k => fuel(k)).map(fuel);

/* Refrigerants offered = exactly the R-* GWP rows present in FACTORS. */
const REFRIGERANTS = FACTORS.filter(f => f.source_class === 'gwp' && /^R-/.test(f.gas || ''))
  .map(f => ({ gas: f.gas, factor_id: f.factor_id }));

/* Nitric-acid plant classes = the five process_hno3_* rows, labelled from the data. */
const HNO3_CLASSES = FACTORS.filter(f => f.factor_id.startsWith('process_hno3_'))
  .map(f => ({ id: f.factor_id, label: f.activity.replace(/^Nitric acid\s*-\s*/, '') }));

/* Cell technology -> factor_id routing (not values). CWPB/SWPB are prebake anodes,
   VSS/HSS are Søderberg paste — the mapping is stated in IPCC 2006 Vol.3 Ch.4. */
const AL_ANODE = {
  cwpb: 'process_alu_anode_prebake_co2', swpb: 'process_alu_anode_prebake_co2',
  vss: 'process_alu_paste_soderberg_co2', hss: 'process_alu_paste_soderberg_co2',
};
const AL_PFC = {
  cwpb: ['process_alu_cf4_cwpb', 'process_alu_c2f6_cwpb'],
  swpb: ['process_alu_cf4_swpb', 'process_alu_c2f6_swpb'],
  vss: ['process_alu_cf4_vss', 'process_alu_c2f6_vss'],
  hss: ['process_alu_cf4_hss', 'process_alu_c2f6_hss'],
};

const SECTOR_LABEL = {
  textiles: 'Textiles & apparel', leather: 'Leather & footwear', steel: 'Iron & steel',
  aluminium: 'Aluminium', cement: 'Cement', fertilisers: 'Fertilisers',
};
/* Output units per sector. `t` marks the tonnes-of-product basis CBAM needs. */
const OUTPUT_UNITS = {
  textiles: [['t', 'tonnes of yarn'], ['kg', 'kg of fabric'], ['k_pieces', 'thousand garments']],
  leather: [['m2', 'm² of leather'], ['k_pairs', 'thousand pairs']],
  steel: [['t', 'tonnes of crude steel']],
  aluminium: [['t', 'tonnes of aluminium']],
  cement: [['t', 'tonnes of cement']],
  fertilisers: [['t', 'tonnes of product']],
};
const CBAM_SECTOR = { steel: 'Iron and steel', aluminium: 'Aluminium', cement: 'Cement', fertilisers: 'Fertilisers' };

const STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman & Nicobar Islands', 'Chandigarh', 'Dadra & Nagar Haveli and Daman & Diu', 'Delhi',
  'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'];

/* ═══════════════════════ small helpers ═══════════════════════ */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(c => c != null && n.append(c.nodeType ? c : document.createTextNode(c)));
  return n;
};
const numval = node => {
  if (!node) return null;
  const v = parseFloat(String(node.value).replace(/,/g, '').trim());
  return Number.isFinite(v) ? v : null;
};
const fmt = (v, dp = 3) => (v == null || !Number.isFinite(v)) ? '—'
  : v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
/** Factor values printed as stored: no rounding that could hide a digit. */
const fmtFactor = v => (v == null) ? '—'
  : (Math.abs(v) < 0.001 ? v.toExponential(4) : v.toLocaleString('en-US', { maximumFractionDigits: 6 }));

/* ═══════════════════════ the engine ═══════════════════════ */

/** One trail line. Only ever constructed from a real FACTORS row. */
function mkLine(o) {
  const f = F(o.factor_id);
  const g = gwpFor(o.gas || f.gas, !!o.biogenic);
  const gasMassKg = o.gasMassKg;
  const tco2e = (gasMassKg * g.value) / 1000;
  return {
    id: o.id, label: o.label, sublabel: o.sublabel || '',
    scope: o.scope,
    qty: o.qty, qtyUnit: o.qtyUnit,
    factor_id: f.factor_id, factorValue: f.value_primary, factorUnit: f.unit,
    source: f.source_primary, vintage: f.vintage_primary,
    gas: o.gas || f.gas, gasMassKg,
    gwp: g.value, gwpId: g.id, gwpSource: g.source,
    tco2e: o.negative ? -tco2e : tco2e,
    uncertainty: uncertaintyOf(f),
    flags: [...new Set([...flagsOf(f), ...(o.extraFlags || [])])],
    notes: o.notes || [],
    deviation: deviationWarning(f),
  };
}
/** A line that deliberately computes nothing — recorded so the gap is visible. */
function mkNoCalc(o) {
  return {
    id: o.id, label: o.label, sublabel: o.sublabel || '', scope: o.scope || 'none',
    qty: o.qty, qtyUnit: o.qtyUnit, factor_id: o.factor_id || '', factorValue: null,
    factorUnit: '', source: o.source || '', vintage: o.vintage || '', gas: '', gasMassKg: null,
    gwp: null, gwpId: null, gwpSource: '', tco2e: null, uncertainty: '',
    flags: o.flags || [], notes: o.notes || [], deviation: null, noCalc: true,
  };
}

/**
 * Burn a fuel and return its per-gas lines.
 * SPEC §4 liquid-fuel basis rule: litres are converted to tonnes with a
 * supplier-overridable density and the per-TONNE factor rows are used, because
 * the per-litre rows embed a generic ~0.91 kg/L density.
 */
function burnFuel({ fuelKey, qty, unit, density, id, label, sublabel, scope = 1, extraFlags = [] }) {
  const fu = fuel(fuelKey);
  const out = [];
  if (!fu || !(qty > 0)) return out;

  let basisUnit = unit, basisQty = qty;
  const notes = [];

  if (unit === 'litre') {
    if (!(density > 0)) {
      return [mkNoCalc({
        id, label, sublabel, qty, qtyUnit: 'L',
        notes: ['No density supplied — litres cannot be converted to the mass basis, so this line does not compute.'],
      })];
    }
    basisUnit = 'tonne';
    basisQty = (qty * density) / 1000;
    notes.push(`Mass basis (SPEC §4 F1): ${fmt(qty, 2)} L × ${density} kg/L ÷ 1000 = ${fmt(basisQty, 4)} t. ` +
      `Per-litre factor rows embed a generic GHGP density and are not used.`);
  }

  for (const gas of ['co2', 'ch4', 'n2o']) {
    const fid = fu.ids[basisUnit + '|' + gas];
    if (!fid || !usable(fid)) continue;
    const row = F(fid);
    const biogenicCO2 = fu.biogenic && gas === 'co2';
    out.push(mkLine({
      id, label, sublabel: sublabel || fu.activity,
      scope: biogenicCO2 ? 'memo' : scope,
      qty: basisQty, qtyUnit: UNIT_LABEL[basisUnit],
      factor_id: fid, gas: row.gas,
      gasMassKg: basisQty * row.value_primary,
      biogenic: fu.biogenic,
      extraFlags: [...extraFlags, ...(biogenicCO2 ? ['biogenic-memo'] : [])],
      notes: [...notes, ...(biogenicCO2
        ? ['Biogenic CO₂: reported as a memo item and EXCLUDED from the Scope 1 total. The CH₄ and N₂O from the same fuel remain normal Scope 1 lines.']
        : [])],
    }));
  }
  return out;
}

/** Deterministic inventory from a plain input object. This is the whole engine. */
function compute(inp) {
  const lines = [];
  const isTrader = inp.role === 'trader';

  /* ── C1 stationary combustion ───────────────────────────── */
  inp.fuels.forEach((r, i) => lines.push(...burnFuel({
    ...r, id: 'C1.' + (i + 1), label: 'Stationary combustion',
  })));

  /* ── C2 DG sets ─────────────────────────────────────────── */
  if (inp.dgLitres > 0) {
    lines.push(...burnFuel({
      fuelKey: 'diesel', qty: inp.dgLitres, unit: 'litre', density: inp.dgDensity,
      id: 'C2', label: 'DG sets (diesel generators)', extraFlags: ['dg-set'],
    }));
  }

  /* ── C3 vehicles & forklifts ────────────────────────────── */
  inp.vehicles.forEach((r, i) => lines.push(...burnFuel({
    ...r, id: 'C3.' + (i + 1), label: 'Owned vehicles / forklifts',
  })));

  /* ── C4 refrigerant fugitives ───────────────────────────── */
  inp.refrigerants.forEach((r, i) => {
    if (!(r.kg > 0) || !r.gas) return;
    const row = REFRIGERANTS.find(x => x.gas === r.gas);
    if (!row) return;
    lines.push(mkLine({
      id: 'C4.' + (i + 1), label: 'Refrigerant fugitives',
      sublabel: r.gas + ' top-up', scope: 1,
      qty: r.kg, qtyUnit: 'kg', factor_id: row.factor_id, gas: r.gas, gasMassKg: r.kg,
      notes: ['Top-up mass over the year is taken as the leaked mass (GHGP simplified material-balance).'],
    }));
  });

  /* ── C5 / C7 electricity ────────────────────────────────── */
  inp.electricity.forEach((r, i) => {
    const n = i + 1;
    if (r.source === 'grid' && r.kwh > 0) {
      const row = F('grid_india_weighted_avg');   /* weighted average ONLY — never OM/BM/CM */
      lines.push(mkLine({
        id: 'C5.' + n, label: 'Purchased grid electricity',
        sublabel: 'location-based, CEA v21.0 FY 2024-25', scope: 2,
        qty: r.kwh / 1000, qtyUnit: 'MWh', factor_id: row.factor_id, gas: 'CO2',
        gasMassKg: (r.kwh / 1000) * row.value_primary * 1000,
        notes: ['Location-based Scope 2 using the CEA national weighted-average factor. ' +
          'A single national factor hides roughly three orders of magnitude of state-level ' +
          'dispersion — a declared limitation of this method, not a precision claim.'],
      }));
    } else if (r.source === 'captive') {
      if (r.kwh > 0) {
        lines.push(mkNoCalc({
          id: 'C7.' + n + 'a', label: 'Captive electricity generated', qty: r.kwh, qtyUnit: 'kWh',
          scope: 'none', flags: ['captive'],
          notes: ['Self-generated: recorded for context. The emissions are booked from the captive ' +
            'fuel below as Scope 1, not from this kWh figure — booking both would double-count.'],
        }));
      }
      lines.push(...burnFuel({
        fuelKey: r.fuelKey, qty: r.qty, unit: r.unit, density: r.density,
        id: 'C7.' + n, label: 'Captive generation fuel', scope: 1, extraFlags: ['captive'],
      }));
    } else if (r.source === 'ppa' && r.kwh > 0) {
      lines.push(mkNoCalc({
        id: 'C5.' + n + 'm', label: 'PPA / REC-backed electricity', scope: 'context',
        qty: r.kwh, qtyUnit: 'kWh', flags: ['market-based-context'],
        notes: ['Declared contractual instrument. Shown as a market-based CONTEXT line only. ' +
          'It is NOT netted off the location-based Scope 2 total, which remains the rating basis.'],
      }));
    }
  });

  /* ── C6 purchased steam ─────────────────────────────────── */
  if (inp.steamTonnes > 0) {
    const row = F('steam_purchased');
    lines.push(mkNoCalc({
      id: 'C6', label: 'Purchased steam / heat', scope: 'none',
      qty: inp.steamTonnes, qtyUnit: 't', factor_id: row.factor_id,
      source: 'no factor row by design', vintage: '—', flags: flagsOf(row),
      notes: [row.notes],
    }));
  }

  /* ── sector process blocks (manufacturers only) ─────────── */
  if (!isTrader) {
    if (inp.sector === 'steel') lines.push(...steelLines(inp));
    if (inp.sector === 'aluminium') lines.push(...aluminiumLines(inp));
    if (inp.sector === 'cement') lines.push(...cementLines(inp));
    if (inp.sector === 'fertilisers') lines.push(...fertiliserLines(inp));
  }

  /* ── totals ─────────────────────────────────────────────── */
  const sum = pred => lines.filter(l => !l.noCalc && pred(l)).reduce((a, l) => a + l.tco2e, 0);
  const scope1 = sum(l => l.scope === 1);
  const scope2 = sum(l => l.scope === 2);
  const biogenic = sum(l => l.scope === 'memo');
  const combined = scope1 + scope2;

  const byGas = {};
  lines.filter(l => !l.noCalc && (l.scope === 1 || l.scope === 2)).forEach(l => {
    const g = byGas[l.gas] || (byGas[l.gas] = { gas: l.gas, massKg: 0, tco2e: 0 });
    g.massKg += l.gasMassKg; g.tco2e += l.tco2e;
  });

  const ppaKwh = inp.electricity.filter(r => r.source === 'ppa').reduce((a, r) => a + (r.kwh || 0), 0);
  const intensity = (inp.outputQty > 0) ? combined / inp.outputQty : null;

  return {
    lines, scope1, scope2, combined, biogenic, intensity,
    byGas: Object.values(byGas).sort((a, b) => b.tco2e - a.tco2e),
    ppaKwh, isTrader, input: inp,
  };
}

/* ── steel ──────────────────────────────────────────────── */
function steelLines(inp) {
  const s = inp.steel, out = [];
  if (!s) return out;
  const isEAF = s.route === 'eaf_grid' || s.route === 'eaf_captive';

  if (s.reductantQty > 0 && s.reductantKey) {
    out.push(...burnFuel({
      fuelKey: s.reductantKey, qty: s.reductantQty, unit: 'tonne',
      id: 'S1', label: 'Reductant (coke / coal)', scope: 1, extraFlags: ['reductant'],
    }).map(l => ({
      ...l,
      notes: [...l.notes, 'Reductant carbon booked with this fuel\'s GHGP factor, assuming full ' +
        'oxidation. No route-level default is applied on top — that would double-count.'],
    })));
  }
  if (s.limestone > 0) {
    const r = F('stoich_limestone_caco3');
    out.push(mkLine({
      id: 'S2', label: 'Limestone flux calcination', sublabel: r.activity, scope: 1,
      qty: s.limestone, qtyUnit: 't', factor_id: r.factor_id, gas: 'CO2',
      gasMassKg: s.limestone * r.value_primary * 1000,
    }));
  }
  if (s.dolomite > 0) {
    const r = F('stoich_dolomite');
    out.push(mkLine({
      id: 'S3', label: 'Dolomite flux calcination', sublabel: r.activity, scope: 1,
      qty: s.dolomite, qtyUnit: 't', factor_id: r.factor_id, gas: 'CO2',
      gasMassKg: s.dolomite * r.value_primary * 1000,
    }));
  }
  if (isEAF && s.electrode > 0) {
    const r = F('process_eaf_electrode_co2');
    out.push(mkLine({
      id: 'S4', label: 'EAF carbon electrode consumption', sublabel: r.activity, scope: 1,
      qty: s.electrode, qtyUnit: 't', factor_id: r.factor_id, gas: 'CO2',
      gasMassKg: s.electrode * r.value_primary * 1000,
    }));
  }
  if (s.route === 'dri_coal') {
    out.push(mkNoCalc({
      id: 'S0', label: 'Coal-based DRI — no route default applied', scope: 'none',
      qty: null, qtyUnit: '', factor_id: 'process_steel_dri_tier1',
      source: F('process_steel_dri_tier1').source_primary, vintage: F('process_steel_dri_tier1').vintage_primary,
      flags: ['route-gate'],
      notes: [`IPCC's Tier 1 DRI default (${F('process_steel_dri_tier1').value_primary} ` +
        `${F('process_steel_dri_tier1').unit}) assumes a NATURAL-GAS-based plant ` +
        '(12.5 GJ/t at 15.3 kgC/GJ). India\'s coal-DRI route is materially more carbon-intensive, ' +
        'so applying that default here would understate you. This tool therefore computes the DRI ' +
        'route ONLY from the coal / reductant quantities you entered above.'],
    }));
  }
  return out;
}

/* ── aluminium ──────────────────────────────────────────── */
function aluminiumLines(inp) {
  const a = inp.aluminium, out = [];
  if (!a || a.type !== 'smelter' || !(a.tonnes > 0)) return out;

  const an = F(AL_ANODE[a.tech]);
  out.push(mkLine({
    id: 'A1', label: 'Anode / paste consumption', sublabel: an.activity, scope: 1,
    qty: a.tonnes, qtyUnit: 't Al', factor_id: an.factor_id, gas: 'CO2',
    gasMassKg: a.tonnes * an.value_primary * 1000,
    notes: ['Tier 1 technology default. The Tier 2/3 net-anode-consumption route ' +
      '(anode carbon × 44/12) is preferred where plant data exist.'],
  }));

  AL_PFC[a.tech].forEach((fid, k) => {
    const r = F(fid);
    out.push(mkLine({
      id: 'A2.' + (k + 1), label: 'PFC from anode effects', sublabel: r.activity, scope: 1,
      qty: a.tonnes, qtyUnit: 't Al', factor_id: fid, gas: r.gas,
      gasMassKg: a.tonnes * r.value_primary,
      extraFlags: ['tier1-default'],
      notes: ['IPCC Tier 1 default PFC factor — uncertainty is very wide (−99% / +380%). ' +
        'IPCC states these should be used only where no anode-effect (Tier 2/3) data exist.'],
    }));
  });
  return out;
}

/* ── cement ─────────────────────────────────────────────── */
function cementLines(inp) {
  const c = inp.cement, out = [];
  if (!c || !(c.clinker > 0)) return out;
  const r = F('process_cement_clinker_co2');
  out.push(mkLine({
    id: 'M1', label: 'Clinker calcination (process CO₂)', sublabel: r.activity, scope: 1,
    qty: c.clinker, qtyUnit: 't clinker', factor_id: r.factor_id, gas: 'CO2',
    gasMassKg: c.clinker * r.value_primary * 1000,
    notes: ['IPCC Tier 1 with the +2% cement-kiln-dust correction. A plant-specific CaO-based ' +
      'Tier 2 factor is preferred where available.' +
      (c.ratio > 0 ? ` Declared clinker-to-cement ratio: ${c.ratio}.` : ' No clinker-to-cement ratio declared.')],
  }));
  return out;
}

/* ── fertilisers ────────────────────────────────────────── */
function fertiliserLines(inp) {
  const f = inp.fertilisers, out = [];
  if (!f) return out;

  if (f.product === 'nitric' && f.hno3Qty > 0 && f.hno3Class) {
    const r = F(f.hno3Class);
    out.push(mkLine({
      id: 'N1', label: 'Nitric acid N₂O', sublabel: r.activity, scope: 1,
      qty: f.hno3Qty, qtyUnit: 't HNO₃ (100%)', factor_id: r.factor_id, gas: 'N2O',
      gasMassKg: f.hno3Qty * r.value_primary,
      notes: ['Tonnage must be on a 100% HNO₃ basis. Abated classes already incorporate the ' +
        'abatement effect — no separate destruction efficiency is applied on top.'],
    }));
  }
  if (f.ureaQty > 0) {
    const r = F('stoich_urea_co2_uptake');
    out.push(mkLine({
      id: 'N2', label: 'Urea production — CO₂ uptake', sublabel: r.activity, scope: 1,
      qty: f.ureaQty, qtyUnit: 't urea', factor_id: r.factor_id, gas: 'CO2',
      gasMassKg: f.ureaQty * r.value_primary * 1000, negative: true,
      extraFlags: ['negative-line'],
      notes: ['CO₂ CONSUMED by urea synthesis — booked as an explicit negative line, never ' +
        'silently absorbed. The CO₂ is re-released when the urea is applied to soil, which is ' +
        'outside this Scope 1+2 boundary.'],
    }));
  }
  return out;
}

/* ═══════════════════════ dynamic form rows ═══════════════════════ */

let rowSeq = 0;

function fuelSelect(id, list = FUELS, selected) {
  return el('select', { id, class: 'r-fuel' },
    ...list.map(f => el('option', { value: f.key, selected: f.key === selected || null }, f.activity)));
}

function unitSelect(id, fuelKey) {
  const fu = fuel(fuelKey) || FUELS[0];
  return el('select', { id, class: 'r-unit' },
    ...fu.units.map(u => el('option', { value: u }, UNIT_LABEL[u])));
}

/** A fuel row: fuel + qty + unit, plus a density sub-field that appears for litres. */
function makeFuelRow(container, opts = {}) {
  const n = ++rowSeq;
  const list = opts.list || FUELS;
  const start = opts.fuelKey || list[0].key;
  const idF = `r${n}-f`, idQ = `r${n}-q`, idU = `r${n}-u`, idD = `r${n}-d`;

  const sel = fuelSelect(idF, list, start);
  const qty = el('input', { id: idQ, type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: '0', class: 'r-qty' });
  const unit = unitSelect(idU, start);
  const dens = el('input', { id: idD, type: 'number', min: '0.3', max: '1.6', step: '0.00001', inputmode: 'decimal', class: 'r-dens' });
  const densField = el('p', { class: 'field sub-field', hidden: true },
    el('label', { for: idD }, 'Density used ', el('span', { class: 'opt' }, 'kg/L')), dens,
    el('span', { class: 'hint' }, 'Indian diesel is typically ~0.82–0.85 kg/L — override with your invoice density.'));

  const row = el('div', { class: 'data-row', 'data-row': 'fuel' },
    el('p', { class: 'field f-main' }, el('label', { for: idF }, opts.label || 'Fuel'), sel),
    el('p', { class: 'field' }, el('label', { for: idQ }, 'Quantity'),
      el('span', { class: 'row-inline' }, qty, unit)),
    el('button', { type: 'button', class: 'row-del', title: 'Remove this row', 'aria-label': 'Remove this row',
      onclick: () => row.remove() }, '×'),
    densField);

  const syncUnits = () => {
    const fu = fuel(sel.value);
    const keep = unit.value;
    unit.replaceChildren(...fu.units.map(u => el('option', { value: u }, UNIT_LABEL[u])));
    unit.value = fu.units.includes(keep) ? keep : fu.units[0];
    syncDensity();
  };
  const syncDensity = () => {
    const showing = unit.value === 'litre';
    densField.hidden = !showing;
    const d = (fuel(sel.value) || {}).density;
    if (showing && !dens.value && d) dens.value = d.kg_per_unit;
  };
  sel.addEventListener('change', syncUnits);
  unit.addEventListener('change', syncDensity);
  syncDensity();

  container.append(row);
  return row;
}

function makeRefRow(container) {
  const n = ++rowSeq, idG = `r${n}-g`, idK = `r${n}-k`;
  const sel = el('select', { id: idG, class: 'r-gas' },
    ...REFRIGERANTS.map(r => el('option', { value: r.gas }, `${r.gas} — GWP ${F(r.factor_id).value_primary}`)));
  const kg = el('input', { id: idK, type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: '0', class: 'r-kg' });
  const row = el('div', { class: 'data-row', 'data-row': 'ref' },
    el('p', { class: 'field f-main' }, el('label', { for: idG }, 'Refrigerant'), sel),
    el('p', { class: 'field' }, el('label', { for: idK }, 'Topped up'),
      el('span', { class: 'row-inline' }, kg, el('span', { class: 'unit-tag' }, 'kg'))),
    el('button', { type: 'button', class: 'row-del', 'aria-label': 'Remove this row', onclick: () => row.remove() }, '×'));
  container.append(row);
  return row;
}

function makeElecRow(container) {
  const n = ++rowSeq;
  const idS = `r${n}-s`, idK = `r${n}-k`, idF = `r${n}-cf`, idQ = `r${n}-cq`, idU = `r${n}-cu`, idD = `r${n}-cd`;

  const src = el('select', { id: idS, class: 'r-src' },
    el('option', { value: 'grid' }, 'Grid (purchased)'),
    el('option', { value: 'captive' }, 'Captive (self-generated)'),
    el('option', { value: 'ppa' }, 'PPA / REC-backed'));
  const kwh = el('input', { id: idK, type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: '0', class: 'r-kwh' });

  const cFuel = fuelSelect(idF);
  const cQty = el('input', { id: idQ, type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: '0', class: 'r-cqty' });
  const cUnit = unitSelect(idU, FUELS[0].key);
  const cDens = el('input', { id: idD, type: 'number', min: '0.3', max: '1.6', step: '0.00001', inputmode: 'decimal', class: 'r-cdens' });
  const cDensField = el('p', { class: 'field', hidden: true },
    el('label', { for: idD }, 'Density ', el('span', { class: 'opt' }, 'kg/L')), cDens);

  const captive = el('div', { class: 'sub-field grid grid-tight', hidden: true },
    el('p', { class: 'field' }, el('label', { for: idF }, 'Captive plant fuel'), cFuel),
    el('p', { class: 'field' }, el('label', { for: idQ }, 'Fuel consumed'),
      el('span', { class: 'row-inline' }, cQty, cUnit)),
    cDensField);

  const note = el('p', { class: 'hint sub-field' });

  const row = el('div', { class: 'data-row', 'data-row': 'elec' },
    el('p', { class: 'field f-main' }, el('label', { for: idS }, 'Source'), src),
    el('p', { class: 'field' }, el('label', { for: idK }, 'Electricity'),
      el('span', { class: 'row-inline' }, kwh, el('span', { class: 'unit-tag' }, 'kWh'))),
    el('button', { type: 'button', class: 'row-del', 'aria-label': 'Remove this row', onclick: () => row.remove() }, '×'),
    captive, note);

  const syncSrc = () => {
    captive.hidden = src.value !== 'captive';
    note.textContent = src.value === 'captive'
      ? 'Captive kWh is recorded for context; the emissions are booked from the fuel as Scope 1.'
      : src.value === 'ppa'
        ? 'Recorded as a market-based context line. It is NOT netted off your location-based Scope 2.'
        : 'Location-based Scope 2, CEA v21.0 national weighted average.';
  };
  const syncCUnits = () => {
    const fu = fuel(cFuel.value), keep = cUnit.value;
    cUnit.replaceChildren(...fu.units.map(u => el('option', { value: u }, UNIT_LABEL[u])));
    cUnit.value = fu.units.includes(keep) ? keep : fu.units[0];
    syncCDens();
  };
  const syncCDens = () => {
    const showing = cUnit.value === 'litre';
    cDensField.hidden = !showing;
    const d = (fuel(cFuel.value) || {}).density;
    if (showing && !cDens.value && d) cDens.value = d.kg_per_unit;
  };
  src.addEventListener('change', syncSrc);
  cFuel.addEventListener('change', syncCUnits);
  cUnit.addEventListener('change', syncCDens);
  syncSrc(); syncCDens();

  container.append(row);
  return row;
}

/* ═══════════════════════ read the form ═══════════════════════ */

function readRow(row) {
  const g = s => row.querySelector(s);
  return {
    fuelKey: g('.r-fuel')?.value, qty: numval(g('.r-qty')),
    unit: g('.r-unit')?.value, density: numval(g('.r-dens')),
  };
}

function readForm() {
  const sector = $('#f-sector').value;
  const role = $('#f-role').value;

  const inp = {
    supplier: $('#f-name').value.trim(),
    sector, role, state: $('#f-state').value, year: $('#f-year').value,
    outputQty: numval($('#f-output')),
    outputUnit: $('#f-output-unit').value,
    outputUnitLabel: $('#f-output-unit').selectedOptions[0]?.textContent || '',
    fuels: $$('#fuel-rows .data-row').map(readRow).filter(r => r.qty > 0),
    dgLitres: numval($('#f-dg')), dgDensity: numval($('#f-dg-density')),
    vehicles: $$('#veh-rows .data-row').map(readRow).filter(r => r.qty > 0),
    refrigerants: $$('#ref-rows .data-row').map(r => ({
      gas: r.querySelector('.r-gas').value, kg: numval(r.querySelector('.r-kg')),
    })).filter(r => r.kg > 0),
    electricity: $$('#elec-rows .data-row').map(r => ({
      source: r.querySelector('.r-src').value,
      kwh: numval(r.querySelector('.r-kwh')),
      fuelKey: r.querySelector('.r-fuel')?.value,
      qty: numval(r.querySelector('.r-cqty')),
      unit: r.querySelector('.r-unit')?.value,
      density: numval(r.querySelector('.r-cdens')),
    })).filter(r => r.kwh > 0 || r.qty > 0),
    steamTonnes: numval($('#f-steam')),
  };

  if (role !== 'trader') {
    if (sector === 'steel') inp.steel = {
      route: $('#st-route').value, reductantKey: $('#st-red-type').value,
      reductantQty: numval($('#st-red-qty')), limestone: numval($('#st-limestone')),
      dolomite: numval($('#st-dolomite')), electrode: numval($('#st-electrode')),
    };
    if (sector === 'aluminium') inp.aluminium = {
      type: $('#al-type').value, tonnes: numval($('#al-tonnes')), tech: $('#al-tech').value,
    };
    if (sector === 'cement') inp.cement = {
      clinker: numval($('#cm-clinker')), ratio: numval($('#cm-ratio')),
    };
    if (sector === 'fertilisers') inp.fertilisers = {
      product: $('#ft-product').value, hno3Class: $('#ft-hno3-class').value,
      hno3Qty: numval($('#ft-hno3-qty')), ureaQty: numval($('#ft-urea-qty')),
    };
    if (sector === 'textiles') inp.segment = $('#tx-segment').value;
    if (sector === 'leather') inp.segment = $('#lt-segment').value;
  }
  return inp;
}

/* ═══════════════════════ the board ═══════════════════════
 * Phase B of the flow. The wizard (steps 1–2) collects; the board is the
 * persistent workspace the supplier lands on and comes back to.
 *
 * The board is a RENDERING layer only. It reads the same `compute()` result the
 * previous results screen read, and slices it into cards. No engine logic, no
 * factor lookup and no arithmetic lives below this line — every number a card
 * shows is a field of a trail line built by mkLine() from a real FACTORS row.
 * ------------------------------------------------------------------------- */

let LAST = null;          /* last compute() result, or null before Calculate all */
let LAST_AT = null;       /* when it was computed */
let LAST_KEY = null;      /* snapshot of the inputs it was computed from */

/* A result is only valid for the inputs that produced it. If the supplier goes
   back to the wizard and changes anything, every card number on the board is
   stale — and a stale number is an invented number. The board detects that and
   refuses to display the old figures until Calculate all is pressed again. */
const inputKey = inp => JSON.stringify(inp);
const isStale = inp => LAST !== null && inputKey(inp) !== LAST_KEY;

/* Which trail lines belong to which card. Line ids are assigned in compute():
   C1–C7 are the common block, S* steel, A* aluminium, M* cement, N* fertilisers. */
const CARD_LINES = {
  scope1: l => l.scope === 1 || (l.noCalc && /^C7/.test(l.id)),
  scope2: l => l.scope === 2 || l.scope === 'context' || l.id === 'C6',
  process: l => /^[SAMN]/.test(l.id),
  biogenic: l => l.scope === 'memo',
};

/* Plain-language info blurbs. Domain-accurate; every factual claim here is one
   the factor database or the research synthesis already supports. */
const CARD_INFO = {
  scope1: 'Scope 1 is everything you burn or release on your own site — boiler and kiln fuel, ' +
    'DG sets, your own vehicles, refrigerant leaks, and process chemistry. Under the GHG Protocol ' +
    'captive power books here, not in Scope 2, because you own the combustion.',
  scope2: 'Scope 2 is the electricity you buy. This uses the location-based method with the CEA ' +
    'v21.0 national weighted average for FY 2024-25 — the vintage an EU buyer will expect you to ' +
    'name. One national factor hides roughly three orders of magnitude of state-level dispersion: ' +
    'a declared limitation, not a precision claim.',
  intensity: 'Absolute tonnes reward being small. Intensity — tCO₂e per tonne of product — is the ' +
    'comparator an EU buyer or a CBAM declarant actually uses, and it is what lets an efficient ' +
    'Indian plant beat a bigger, dirtier competitor on paper.',
  cbam: 'The EU publishes India-specific default values per CN code for the CBAM definitive ' +
    'period. Where your measured intensity beats the default, that gap is money at the border. ' +
    'This is an indicative exposure check — not a CBAM filing.',
  biogenic: 'CO₂ from burning biomass such as rice husk sits outside the scopes: that carbon came ' +
    'out of the atmosphere within this growing cycle, so counting it would double-count. It is ' +
    'reported as a memo line. The CH₄ and N₂O from the same fuel are not biogenic and stay in Scope 1.',
  export: 'Take the whole calculation trail with you. The CSV is one row per line item with its ' +
    'factor, source and vintage; the JSON is a structured summary with the same trail attached.',
};

const PROCESS_INFO = {
  steel: 'Steel\'s process CO₂ comes from the carbon you add on purpose — coke or coal as ' +
    'reductant, limestone and dolomite flux, and EAF electrodes. Your route decides this number ' +
    'more than anything else you do: Indian intensity spans roughly 0.7 to over 3 tCO₂ per tonne ' +
    'across BF-BOF, EAF and coal-DRI.',
  aluminium: 'A primary smelter emits CO₂ from the carbon anode consumed in the cell, plus ' +
    'perfluorocarbons (CF₄ and C₂F₆) released during anode effects. PFCs are tiny by mass and ' +
    'enormous by warming potential, so they routinely matter far more than they look.',
  cement: 'Calcination — driving CO₂ out of limestone to make clinker — is chemistry, not fuel, ' +
    'and it is typically more than half a cement plant\'s footprint. You cannot burn your way out ' +
    'of it: the lever is the clinker-to-cement ratio.',
  fertilisers: 'Two things dominate fertiliser process emissions: N₂O vented from nitric acid ' +
    'plants, which swings sharply by plant class and abatement, and the CO₂ that urea synthesis ' +
    'consumes, which is booked here as an explicit negative line rather than silently absorbed.',
};

const PROCESS_TITLE = {
  steel: 'Process emissions — reductant, flux &amp; electrodes',
  aluminium: 'Process emissions — anode CO₂ &amp; PFCs',
  cement: 'Process emissions — clinker calcination',
  fertilisers: 'Process emissions — nitric acid N₂O &amp; urea uptake',
};

const TRADER_TRACEABILITY =
  'You filed as a trader / wholesaler, so this card does not compute. Intensity and CBAM exposure ' +
  'are properties of a PRODUCT, and the product was made by someone else — presenting your own ' +
  'operations footprint as a product figure would be a false claim. What a trader can carry is a ' +
  'traceability grade (A–D): A means full pass-through to a rated manufacturer, D means the origin ' +
  'is unknown. Get your manufacturer rated, link the record, and the product rating flows through ' +
  'to you.';

/* ── does this input have anything for a given card? ───────── */

function hasProcessInput(inp) {
  const s = inp.steel, a = inp.aluminium, c = inp.cement, f = inp.fertilisers;
  if (s) return (s.reductantQty > 0 || s.limestone > 0 || s.dolomite > 0 || s.electrode > 0);
  if (a) return a.type === 'smelter' && a.tonnes > 0;
  if (c) return c.clinker > 0;
  if (f) return (f.product === 'nitric' && f.hno3Qty > 0) || f.ureaQty > 0;
  return false;
}

/** Liquid-fuel rows entered in litres with no density: those lines cannot compute. */
function missingDensities(inp) {
  const rows = [...inp.fuels, ...inp.vehicles,
    ...inp.electricity.filter(r => r.source === 'captive' && r.qty > 0)];
  return [...new Set(rows.filter(r => r.unit === 'litre' && !(r.density > 0))
    .map(r => (fuel(r.fuelKey) || {}).activity).filter(Boolean))];
}

function hasBiogenicInput(inp) {
  return [...inp.fuels, ...inp.vehicles, ...inp.electricity]
    .some(r => r.fuelKey && (fuel(r.fuelKey) || {}).biogenic && r.qty > 0);
}

/* ── card status ───────────────────────────────────────────
   'needs' means a required input is missing and is named. 'done' means the card
   computed. 'ready' means it has what it needs but has not been run yet.
   'na' means the card deliberately does not compute for this user. */
function statusFor(key, inp, res) {
  const isTrader = inp.role === 'trader';
  const done = (n) => res ? { kind: n > 0 || n < 0 ? 'done' : 'done', label: 'Done' } : { kind: 'ready', label: 'Ready' };
  const needs = field => ({ kind: 'needs', label: 'Needs input', field });

  switch (key) {
    case 'scope1': {
      const any = inp.fuels.length || inp.dgLitres > 0 || inp.vehicles.length ||
        inp.refrigerants.length || inp.electricity.some(r => r.source === 'captive' && r.qty > 0) ||
        (!isTrader && hasProcessInput(inp));
      if (!any) return needs('at least one Scope 1 activity — fuels burned on site, DG-set diesel, ' +
        'vehicle fuel, refrigerant top-ups, or captive plant fuel (step 2 → common block)');
      return done();
    }
    case 'scope2': {
      const any = inp.electricity.some(r => (r.source === 'grid' || r.source === 'ppa') && r.kwh > 0);
      if (!any) return needs('electricity in kWh with source “Grid (purchased)” (step 2 → Electricity)');
      return done();
    }
    case 'process': {
      if (inp.aluminium && inp.aluminium.type === 'downstream') {
        return { kind: 'na', label: 'Not applicable' };
      }
      if (inp.fertilisers && ['ammonia', 'other'].includes(inp.fertilisers.product) && !(inp.fertilisers.ureaQty > 0)) {
        return { kind: 'na', label: 'Not applicable' };
      }
      if (!hasProcessInput(inp)) {
        const f = {
          steel: 'at least one process input — reductant tonnes, limestone, dolomite, or ' +
            'electrode tonnes (step 2 → Iron & steel)',
          aluminium: 'tonnes of aluminium produced (step 2 → Aluminium)',
          cement: 'clinker produced, in tonnes (step 2 → Cement)',
          fertilisers: inp.fertilisers && inp.fertilisers.product === 'nitric'
            ? 'nitric acid produced, in tonnes on a 100% HNO₃ basis (step 2 → Fertilisers)'
            : 'urea produced, in tonnes (step 2 → Fertilisers)',
        }[inp.sector];
        return needs(f);
      }
      return done();
    }
    case 'intensity': {
      if (isTrader) return { kind: 'na', label: 'Not applicable' };
      if (!(inp.outputQty > 0)) return needs('production output quantity (step 1 → Production output)');
      if (!res) return { kind: 'ready', label: 'Ready' };
      return { kind: 'done', label: 'Done' };
    }
    case 'cbam': {
      if (isTrader) return { kind: 'na', label: 'Not applicable' };
      if (!(inp.outputQty > 0)) return needs('production output quantity (step 1 → Production output)');
      if (inp.outputUnit !== 't') return needs('production output on a TONNES basis — CBAM default ' +
        'values are per tonne of good (step 1 → Production output unit)');
      if (!res) return { kind: 'ready', label: 'Ready' };
      return { kind: 'done', label: 'Done' };
    }
    case 'biogenic':
      return res ? { kind: 'done', label: 'Done' } : { kind: 'ready', label: 'Ready' };
    case 'export':
      if (!res) return needs('run “Calculate all” first — there is nothing to export yet');
      return { kind: 'done', label: 'Done' };
  }
  return { kind: 'ready', label: 'Ready' };
}

/* ── card shell ────────────────────────────────────────────── */

function cardShell({ key, title, info, status, span }) {
  const c = el('div', { class: 'card' + (span ? ' span-2' : ''), 'data-card': key },
    el('div', { class: 'card-head' },
      el('h3', { html: title }),
      el('span', { class: 'card-status st-' + status.kind }, status.label)),
    el('p', { class: 'card-info' }, info));
  if (status.field) {
    c.append(el('p', { class: 'card-needs' }, el('strong', {}, 'Missing: '), status.field));
  }
  return c;
}

function headline(value, unit, opts = {}) {
  return el('p', { class: 'card-headline' + (opts.neutral ? ' neutral' : '') + (opts.small ? ' small' : '') },
    value, unit ? el('span', { class: 'u' }, unit) : null);
}

function detailFor(lines, label) {
  if (!lines.length) return null;
  return el('details', { class: 'card-detail' },
    el('summary', {}, label || `Show this card's calculation trail (${lines.length} line${lines.length === 1 ? '' : 's'})`),
    trailTable(lines));
}

const recalcBtn = () => el('button', { type: 'button', class: 'btn btn-add', onclick: calculateAll }, 'Recalculate');

/* ── the trail table, shared by the cards and the full trail ── */

function trailTable(lines) {
  const head = ['Line', 'Activity', 'Factor', 'Source · vintage', 'Gas → mass', '× GWP', 'tCO₂e', 'Scope', 'Class · flags'];
  const body = lines.map(l => {
    const cls = [l.scope === 'memo' ? 'memo' : '', l.tco2e < 0 ? 'negative' : '',
      l.scope === 'context' ? 'context' : '', l.noCalc ? 'nocalc' : ''].filter(Boolean).join(' ');

    const noteNodes = [...(l.notes || [])].filter(Boolean).map(n => el('span', { class: 't-sub' }, n));
    if (l.deviation) {
      noteNodes.push(el('span', { class: 'warn-note' },
        `⚠ primary vs cross-check deviate ${fmt(l.deviation.pct, 2)}% — ${l.deviation.note}`));
    }

    return el('tr', { class: cls },
      el('td', {}, el('span', { class: 't-line' }, l.label),
        l.sublabel ? el('span', { class: 't-sub' }, l.sublabel) : null,
        l.factor_id ? el('span', { class: 'fid' }, l.factor_id) : null,
        ...noteNodes),
      el('td', { class: 'n' }, l.qty == null ? '—' : `${fmt(l.qty, 3)} ${l.qtyUnit}`),
      el('td', { class: 'n' }, l.factorValue == null ? 'no factor'
        : el('span', {}, fmtFactor(l.factorValue), el('span', { class: 't-sub' }, l.factorUnit))),
      el('td', { class: 't-src' }, l.source || '—',
        l.vintage ? el('span', { class: 'vint' }, l.vintage) : null),
      el('td', { class: 'n' }, l.gasMassKg == null ? '—'
        : el('span', {}, l.gas, el('span', { class: 't-sub' }, fmt(l.gasMassKg, 3) + ' kg'))),
      el('td', { class: 'n' }, l.gwp == null ? '—'
        : el('span', {}, '× ' + l.gwp,
          l.gwpId ? el('span', { class: 'fid' }, l.gwpId) : el('span', { class: 't-sub' }, 'definition'))),
      el('td', { class: 'n co2e' }, l.tco2e == null ? '—' : fmt(l.tco2e, 4)),
      el('td', {}, l.scope === 1 ? el('span', { class: 'pill s1' }, 'Scope 1')
        : l.scope === 2 ? el('span', { class: 'pill s2' }, 'Scope 2')
          : l.scope === 'memo' ? el('span', { class: 'pill' }, 'memo')
            : l.scope === 'context' ? el('span', { class: 'pill' }, 'context')
              : el('span', { class: 'pill' }, 'not counted')),
      el('td', {},
        l.uncertainty ? el('span', { class: 'pill u-' + l.uncertainty }, l.uncertainty) : null,
        l.deviation ? el('span', { class: 'warn', title: l.deviation.note }, ' ⚠') : null,
        ...(l.flags || []).map(f => el('span', { class: 'pill' }, f))));
  });

  return el('div', { class: 'tbl-scroll' }, el('table', {},
    el('thead', {}, el('tr', {}, ...head.map(h => el('th', { class: /tCO|GWP|Factor|Activity|mass/.test(h) ? 'n' : '' }, h)))),
    el('tbody', {}, ...body)));
}

/* ── individual cards ──────────────────────────────────────── */

function cardScope1(inp, res) {
  const st = statusFor('scope1', inp, res);
  const c = cardShell({ key: 'scope1', title: 'Scope 1 — direct emissions', info: CARD_INFO.scope1, status: st });

  const gaps = missingDensities(inp);
  if (gaps.length) {
    c.append(el('p', { class: 'card-needs' },
      el('strong', {}, 'Density needed: '),
      `${gaps.join(', ')} — entered in litres with no density, so those lines will not compute. ` +
      'Liquid fuels are computed on a mass basis (step 2 → the fuel row).'));
  }

  if (res && st.kind !== 'needs') {
    const lines = res.lines.filter(CARD_LINES.scope1);
    c.append(headline(fmt(res.scope1, 3), 'tCO₂e · direct'));
    if (inp.electricity.some(r => r.source === 'captive' && r.qty > 0)) {
      c.append(el('p', { class: 'card-note' }, el('strong', {}, 'Captive power booked here. '),
        'Your self-generated electricity appears as Scope 1 fuel, not Scope 2. The captive kWh ' +
        'figure itself is recorded but not costed — booking both would double-count.'));
    }
    c.append(detailFor(lines), el('div', { class: 'card-foot' }, recalcBtn()));
  }
  return c;
}

function cardScope2(inp, res) {
  const st = statusFor('scope2', inp, res);
  const c = cardShell({ key: 'scope2', title: 'Scope 2 — purchased electricity', info: CARD_INFO.scope2, status: st });

  if (res && st.kind !== 'needs') {
    const lines = res.lines.filter(CARD_LINES.scope2);
    c.append(headline(fmt(res.scope2, 3), 'tCO₂e · location-based'));
    if (res.ppaKwh > 0) {
      c.append(el('p', { class: 'card-note amber' },
        el('strong', {}, `Market-based context: ${fmt(res.ppaKwh, 0)} kWh declared as PPA / REC-backed. `),
        'Recorded because you declared it. It is NOT netted off the location-based figure above, ' +
        'which stays the rating basis — netting would require instrument-level quality criteria ' +
        'this MVP does not verify.'));
    }
    if (inp.steamTonnes > 0) {
      c.append(el('p', { class: 'card-note amber' }, el('strong', {}, 'Purchased steam computes nothing — on purpose. '),
        'Its emission factor depends on your supplier\'s boiler fuel, efficiency and cogeneration ' +
        'allocation. Substituting a generic factor would be inventing a number. See the trail line.'));
    }
    c.append(detailFor(lines), el('div', { class: 'card-foot' }, recalcBtn()));
  }
  return c;
}

function cardProcess(inp, res) {
  const st = statusFor('process', inp, res);
  const c = cardShell({
    key: 'process', title: PROCESS_TITLE[inp.sector] || 'Process emissions',
    info: PROCESS_INFO[inp.sector] || '', status: st,
  });

  if (st.kind === 'na') {
    c.append(el('p', { class: 'card-note' },
      inp.aluminium && inp.aluminium.type === 'downstream'
        ? el('span', {}, el('strong', {}, 'Downstream plant — nothing to book here. '),
          'Anode CO₂ and PFCs are emitted in the electrolysis cell, which you do not operate. ' +
          'Your footprint is the common block: furnace fuels, electricity, refrigerants.')
        : el('span', {}, el('strong', {}, 'No process lines for this product. '),
          'Ammonia feedstock carbon is captured through the fuels you entered in the common block, ' +
          'so your total is right — SPEC §5\'s separate feedstock line is a full-engine feature.')));
    return c;
  }

  if (inp.steel && inp.steel.route === 'dri_coal') {
    c.append(el('p', { class: 'card-note amber' },
      el('strong', {}, 'Coal-DRI: no route default is applied. '),
      `IPCC's Tier 1 DRI default (${F('process_steel_dri_tier1').value_primary} ` +
      `${F('process_steel_dri_tier1').unit}) assumes a natural-gas plant, so it would understate ` +
      'an Indian coal route. This card computes only from the reductant quantity you entered.'));
  }

  if (res && st.kind !== 'needs') {
    const lines = res.lines.filter(CARD_LINES.process);
    const total = lines.filter(l => !l.noCalc).reduce((a, l) => a + l.tco2e, 0);
    c.append(headline(fmt(total, 3), 'tCO₂e · process'));
    c.append(el('p', { class: 'card-note' }, el('strong', {}, 'Already inside Scope 1. '),
      'This card is a focused view of the process lines, not an addition to them — they are ' +
      'counted once, in the Scope 1 total.'));
    if (res.input.cement && res.input.cement.ratio > 0) {
      c.append(el('p', { class: 'card-note' },
        el('strong', {}, `Clinker-to-cement ratio declared: ${res.input.cement.ratio}. `),
        'The dominant intensity lever in cement — a per-tonne-of-cement rating without this ratio ' +
        'penalises exactly the plants that blend most.'));
    }
    c.append(detailFor(lines), el('div', { class: 'card-foot' }, recalcBtn()));
  }
  return c;
}

function cardIntensity(inp, res) {
  const st = statusFor('intensity', inp, res);
  const c = cardShell({ key: 'intensity', title: 'Intensity &amp; benchmark', info: CARD_INFO.intensity, status: st });

  if (st.kind === 'na') {
    c.append(el('p', { class: 'card-note amber' }, el('strong', {}, 'Traders do not get a product intensity. '),
      TRADER_TRACEABILITY));
    return c;
  }
  if (res && res.intensity != null) {
    c.append(headline(fmt(res.intensity, 4), `tCO₂e per ${inp.outputUnitLabel || 'unit'}`));
    c.append(el('p', { class: 'card-note' },
      `${fmt(res.combined, 3)} tCO₂e (Scope 1 + 2) ÷ ${fmt(inp.outputQty, 3)} ${inp.outputUnitLabel}. ` +
      'This is an explicit allocation of a corporate inventory to output — a documented step, not ' +
      'a product LCA. Published sector benchmark bands are a full-engine feature and are not shown ' +
      'here rather than guessed at.'));
    c.append(el('div', { class: 'card-foot' }, recalcBtn()));
  }
  return c;
}

function cardCbam(inp, res) {
  const st = statusFor('cbam', inp, res);
  const c = cardShell({ key: 'cbam', title: 'CBAM exposure check', info: CARD_INFO.cbam, status: st, span: true });

  if (st.kind === 'na') {
    c.append(el('p', { class: 'card-note amber' }, el('strong', {}, 'Traders do not get a CBAM comparison. '),
      TRADER_TRACEABILITY));
    return c;
  }
  if (!res) return c;

  const rows = CBAM_DV.filter(r => r.sector === CBAM_SECTOR[inp.sector]);
  const sel = el('select', { id: 'cbam-cn' },
    el('option', { value: '' }, '— select your CN code —'),
    ...rows.map((r, i) => el('option', { value: String(i) }, `${r.cn_code} — ${r.description.slice(0, 90)}`)));

  const verdict = el('div', { class: 'verdict' }, 'Select your CN code to see the indicative comparison.');
  const intensity = inp.outputUnit === 't' ? res.intensity : null;

  const update = () => {
    const r = rows[Number(sel.value)];
    if (!r) {
      verdict.className = 'verdict';
      verdict.replaceChildren('Select your CN code to see the indicative comparison.');
      return;
    }
    if (intensity == null) {
      verdict.className = 'verdict';
      verdict.replaceChildren(el('span', {}, 'Cannot compare — no production output in tonnes.',
        el('span', { class: 'sub' }, 'The CBAM default values are per tonne of good. Enter your ' +
          'production output in tonnes in step 1 and recalculate. No estimate is substituted.')));
      return;
    }
    const below = intensity < r.dv_total;
    verdict.className = 'verdict ' + (below ? 'below' : 'above');
    verdict.replaceChildren(
      el('span', {}, `${fmt(intensity, 3)} vs ${fmt(r.dv_total, 3)} tCO₂e/t — ` +
        (below ? 'BELOW the India default value' : 'ABOVE the India default value'),
        el('span', { class: 'sub' },
          `Published India default for ${r.cn_code}: direct ${fmt(r.dv_direct, 3)} + indirect ` +
          `${fmt(r.dv_indirect, 3)} = total ${fmt(r.dv_total, 3)} tCO₂e/t` +
          (r.production_route ? ` · benchmark route ${r.production_route}` : '') + '. ' +
          'A mark-up applies on top of most published default values in the definitive period ' +
          '(+10% in 2026, +20% in 2027, +30% from 2028; fertilisers +1%/yr instead) — noted, not ' +
          'applied here, because the applicable basis depends on the good. ' +
          'This compares a corporate Scope 1+2 intensity against a product-level embedded-emissions ' +
          'default: the two boundaries are not identical, so read the direction of travel, not the decimal.')));
  };
  sel.addEventListener('change', update);

  c.append(
    el('p', { class: 'hint' }, 'Indicative exposure — not a CBAM filing, not a compliance ' +
      'statement, and not verified. Default values from Commission Implementing Regulation ' +
      '(EU) 2025/2621 Annex I, as corrected by (EU) 2026/1740, India column.'),
    el('div', { class: 'cbam-controls' },
      el('p', { class: 'field' }, el('label', { for: 'cbam-cn' }, 'Your CN code'), sel),
      el('p', { class: 'field' }, el('label', {}, 'Your computed intensity'),
        el('span', { class: 'unit-tag', style: 'justify-content:flex-start' },
          intensity == null ? 'needs output in tonnes' : `${fmt(intensity, 4)} tCO₂e/t`))),
    verdict,
    el('div', { class: 'card-foot' }, recalcBtn()));
  update();
  return c;
}

function cardBiogenic(inp, res) {
  const st = statusFor('biogenic', inp, res);
  const c = cardShell({ key: 'biogenic', title: 'Biogenic memo', info: CARD_INFO.biogenic, status: st });
  if (res) {
    const lines = res.lines.filter(CARD_LINES.biogenic);
    c.append(headline(fmt(res.biogenic, 3), 'tCO₂ · memo, outside the scopes', { neutral: true }));
    c.append(el('p', { class: 'card-note' }, el('strong', {}, 'Excluded from the Scope 1 total. '),
      'The CH₄ and N₂O from the same biomass ARE inside Scope 1, and their CH₄ uses the AR6 ' +
      'non-fossil global warming potential rather than the fossil one.'));
    c.append(detailFor(lines), el('div', { class: 'card-foot' }, recalcBtn()));
  }
  return c;
}

function cardExport(inp, res) {
  const st = statusFor('export', inp, res);
  const c = cardShell({ key: 'export', title: 'Export', info: CARD_INFO.export, status: st });
  if (res) {
    c.append(el('div', { class: 'card-foot' },
      el('button', { type: 'button', class: 'btn btn-primary', onclick: () => exportCsv(LAST) }, 'Download trail (CSV)'),
      el('button', { type: 'button', class: 'btn btn-primary', onclick: () => exportJson(LAST) }, 'Download summary (JSON)')));
  }
  return c;
}

/* ── profile bar ───────────────────────────────────────────── */

function renderProfile(inp) {
  const pf = (k, v, mono) => el('div', { class: 'pf' },
    el('dt', {}, k), el('dd', { class: mono ? 'mono' : '' }, v || '—'));

  $('#profile-bar').replaceChildren(
    el('dl', {},
      pf('Supplier', inp.supplier || 'Unnamed'),
      pf('Sector', SECTOR_LABEL[inp.sector]),
      pf('Role', inp.role === 'trader' ? 'Trader / wholesaler' : 'Manufacturer'),
      pf('State', inp.state),
      pf('Reporting year', inp.year, true),
      pf('Production output', inp.outputQty > 0
        ? `${fmt(inp.outputQty, 0)} ${inp.outputUnitLabel}` : 'not entered', true)),
    el('div', { class: 'pf-edit' },
      el('button', {
        type: 'button', class: 'btn',
        title: 'Return to the wizard. Nothing you entered is cleared.',
        onclick: () => goto(1),
      }, '✎ Edit details')));
}

/* ── the board ─────────────────────────────────────────────── */

function renderBoard() {
  const inp = readForm();
  const stale = isStale(inp);
  const res = stale ? null : LAST;      /* stale results are never displayed */

  renderProfile(inp);

  /* headline strip */
  const head = [];
  head.push(el('div', { class: 'result-banner' + (inp.role === 'trader' ? ' trader' : '') },
    el('h3', {}, inp.role === 'trader'
      ? 'Operations footprint — not a product footprint'
      : `${SECTOR_LABEL[inp.sector]} · Scope 1 + Scope 2 inventory`),
    el('p', {}, inp.role === 'trader'
      ? 'These are the emissions of your own operations only. They are not the embedded emissions ' +
        'of the goods you sell and must not be presented as such — a product rating requires the ' +
        'manufacturer\'s own activity data.'
      : `${inp.state || 'India'} · ${inp.year} · AR6 GWP-100 · location-based Scope 2 · ` +
        'indicative exposure, not a CBAM filing')));

  if (stale) {
    head.push(el('div', { class: 'notice notice-amber' },
      el('strong', {}, 'Your inputs changed since the last calculation.'),
      el('p', {}, 'The previous figures have been cleared rather than left on screen, because a ' +
        'number that no longer matches its inputs is an invented number. Press “Calculate all” to ' +
        'refresh the board.')));
  }

  if (res) {
    head.push(el('div', { class: 'totals' },
      ...[['Scope 1', res.scope1, 'tCO₂e · direct', false],
        ['Scope 2', res.scope2, 'tCO₂e · location-based', false],
        ['Scope 1 + 2', res.combined, 'tCO₂e', true]]
        .map(([k, v, u, hero]) => el('div', { class: 'tot' + (hero ? ' hero' : '') },
          el('p', { class: 'k' }, k),
          el('p', { class: 'v' }, fmt(v, 3), el('span', { class: 'u' }, u))))));
  }
  $('#board-headline').replaceChildren(...head);

  /* cards */
  const cards = [cardScope1(inp, res), cardScope2(inp, res)];
  if (inp.role !== 'trader' && PROCESS_INFO[inp.sector]) cards.push(cardProcess(inp, res));
  cards.push(cardIntensity(inp, res));
  if (CBAM_SECTOR[inp.sector]) cards.push(cardCbam(inp, res));
  if (hasBiogenicInput(inp) || (res && res.biogenic > 0)) cards.push(cardBiogenic(inp, res));
  cards.push(cardExport(inp, res));
  $('#cards').replaceChildren(...cards);

  /* full trail + per-gas */
  if (res && res.byGas.length) {
    $('#gas-breakdown').replaceChildren(
      el('h3', { class: 'block-h' }, 'Per-gas breakdown ',
        el('span', { class: 'block-sub' }, 'Scope 1 + 2 only; biogenic CO₂ excluded')),
      el('div', { class: 'tbl-scroll' }, el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Gas'), el('th', { class: 'n' }, 'Mass (kg)'),
          el('th', { class: 'n' }, 'tCO₂e'), el('th', { class: 'n' }, 'Share'))),
        el('tbody', {}, ...res.byGas.map(g => el('tr', {},
          el('td', {}, g.gas),
          el('td', { class: 'n' }, fmt(g.massKg, 3)),
          el('td', { class: 'n' }, fmt(g.tco2e, 4)),
          el('td', { class: 'n' }, res.combined ? fmt(100 * g.tco2e / res.combined, 1) + '%' : '—')))))));
  } else $('#gas-breakdown').replaceChildren();

  $('#trail').replaceChildren(res && res.lines.length
    ? trailTable(res.lines)
    : el('div', { class: 'notice notice-amber' }, el('strong', {}, 'Nothing computed yet.'),
      el('p', {}, res
        ? 'No activity quantities were entered, so no lines were produced. This tool does not fill ' +
          'gaps with assumptions — use the “Needs input” cards above to see exactly what is missing.'
        : 'Press “Calculate all” to run the engine against what you have entered.')));

  $('#calc-stamp').textContent = res
    ? `Calculated ${LAST_AT.toLocaleTimeString()} · ${res.lines.length} trail line${res.lines.length === 1 ? '' : 's'} · ` +
      `factors built ${DATA_BUILD.generated}`
    : stale
      ? 'Your inputs changed since the last calculation — the old figures have been cleared. Press “Calculate all”.'
      : 'Nothing calculated yet. Cards show what they still need.';
}

function calculateAll() {
  try {
    const inp = readForm();
    LAST = compute(inp);
    LAST_KEY = inputKey(inp);
    LAST_AT = new Date();
    renderBoard();
  } catch (e) {
    console.error(e);
    alert('Could not compute: ' + e.message);
  }
}

/* ═══════════════════════ exports ═══════════════════════ */

const csvCell = v => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function download(name, mime, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = s => (s || 'supplier').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'supplier';

function exportCsv(res) {
  const cols = ['line_id', 'label', 'detail', 'scope', 'activity_qty', 'activity_unit', 'factor_id',
    'factor_value', 'factor_unit', 'source_primary', 'vintage_primary', 'gas', 'gas_mass_kg',
    'gwp', 'gwp_factor_id', 'gwp_source', 'tco2e', 'uncertainty_class', 'flags',
    'deviation_pct', 'notes'];
  const lines = [cols.join(',')];
  for (const l of res.lines) {
    lines.push([l.id, l.label, l.sublabel, l.scope, l.qty, l.qtyUnit, l.factor_id, l.factorValue,
      l.factorUnit, l.source, l.vintage, l.gas, l.gasMassKg, l.gwp, l.gwpId, l.gwpSource, l.tco2e,
      l.uncertainty, (l.flags || []).join('|'), l.deviation ? l.deviation.pct : '',
      (l.notes || []).join(' ')].map(csvCell).join(','));
  }
  lines.push('');
  lines.push(csvCell('# GWP basis: ' + DATA_BUILD.gwp_basis));
  lines.push(csvCell('# Factors: ' + DATA_BUILD.factors_source + ' (' + DATA_BUILD.factors_rows +
    ' rows), built ' + DATA_BUILD.generated));
  lines.push(csvCell('# Indicative exposure only — not a CBAM filing.'));
  download(`${slug(res.input.supplier)}-calculation-trail.csv`, 'text/csv;charset=utf-8', lines.join('\n'));
}

function exportJson(res) {
  const inp = res.input;
  const payload = {
    meta: {
      tool: 'India–EU Carbon Ratings — MVP Scope 1+2 calculator',
      generated: new Date().toISOString(),
      gwp_basis: DATA_BUILD.gwp_basis,
      factor_database: { source: DATA_BUILD.factors_source, rows: DATA_BUILD.factors_rows, built: DATA_BUILD.generated },
      scope2_method: 'location-based (CEA v21.0 national weighted average, FY 2024-25)',
      disclaimer: 'Indicative exposure — not a CBAM filing, not verified assurance.',
    },
    supplier: {
      name: inp.supplier || null, sector: inp.sector, sector_label: SECTOR_LABEL[inp.sector],
      role: inp.role, state: inp.state, reporting_year: inp.year,
      output_qty: inp.outputQty, output_unit: inp.outputUnit, output_unit_label: inp.outputUnitLabel,
      segment: inp.segment || null,
    },
    totals: {
      scope1_tco2e: res.scope1, scope2_tco2e: res.scope2, combined_tco2e: res.combined,
      biogenic_co2_memo_tco2: res.biogenic,
      intensity_tco2e_per_output_unit: res.intensity,
      market_based_context_kwh: res.ppaKwh,
      note: res.isTrader ? 'Operations footprint — NOT a product footprint.' : null,
    },
    per_gas: res.byGas,
    trail: res.lines.map(l => ({
      line_id: l.id, label: l.label, detail: l.sublabel, scope: l.scope,
      activity: { qty: l.qty, unit: l.qtyUnit },
      factor: { id: l.factor_id, value: l.factorValue, unit: l.factorUnit, source: l.source, vintage: l.vintage },
      gas: l.gas, gas_mass_kg: l.gasMassKg,
      gwp: { value: l.gwp, factor_id: l.gwpId, source: l.gwpSource },
      tco2e: l.tco2e, uncertainty_class: l.uncertainty, flags: l.flags,
      deviation_guard: l.deviation, notes: l.notes,
    })),
  };
  download(`${slug(inp.supplier)}-inventory.json`, 'application/json', JSON.stringify(payload, null, 2));
}

/* ═══════════════════════ AI fill ═══════════════════════ */

/* The key lives here and nowhere else: a module-scope variable, wiped on reload.
   Never written to localStorage/sessionStorage/cookies, never sent to this host. */
let API_KEY = '';

const AI_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['sector', 'role', 'state', 'reporting_year', 'output_qty', 'fuels', 'dg_diesel_litres',
    'vehicle_fuels', 'refrigerants', 'electricity', 'purchased_steam_tonnes', 'sector_extras', 'flags'],
  properties: {
    sector: { type: ['string', 'null'], enum: ['textiles', 'leather', 'steel', 'aluminium', 'cement', 'fertilisers', null] },
    role: { type: ['string', 'null'], enum: ['manufacturer', 'trader', null] },
    state: { type: ['string', 'null'] },
    reporting_year: { type: ['string', 'null'], enum: ['FY 2023-24', 'FY 2024-25', 'FY 2025-26', null] },
    output_qty: { type: ['number', 'null'] },
    fuels: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['fuel', 'qty', 'unit'],
        properties: {
          fuel: { type: 'string', enum: FUELS.map(f => f.key) },
          qty: { type: 'number' },
          unit: { type: 'string', enum: ['tonne', 'litre', 'm3'] },
        },
      },
    },
    dg_diesel_litres: { type: ['number', 'null'] },
    vehicle_fuels: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['fuel', 'qty', 'unit'],
        properties: {
          fuel: { type: 'string', enum: FUELS.map(f => f.key) },
          qty: { type: 'number' },
          unit: { type: 'string', enum: ['tonne', 'litre', 'm3'] },
        },
      },
    },
    refrigerants: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['gas', 'kg'],
        properties: { gas: { type: 'string', enum: REFRIGERANTS.map(r => r.gas) }, kg: { type: 'number' } },
      },
    },
    electricity: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['source', 'kwh', 'captive_fuel', 'captive_qty', 'captive_unit'],
        properties: {
          source: { type: 'string', enum: ['grid', 'captive', 'ppa'] },
          kwh: { type: ['number', 'null'] },
          captive_fuel: { type: ['string', 'null'], enum: [...FUELS.map(f => f.key), null] },
          captive_qty: { type: ['number', 'null'] },
          captive_unit: { type: ['string', 'null'], enum: ['tonne', 'litre', 'm3', null] },
        },
      },
    },
    purchased_steam_tonnes: { type: ['number', 'null'] },
    sector_extras: {
      type: 'object', additionalProperties: false,
      required: ['steel_route', 'steel_reductant', 'steel_reductant_t', 'limestone_t', 'dolomite_t',
        'electrode_t', 'alu_type', 'alu_tonnes', 'alu_tech', 'clinker_t', 'clinker_ratio',
        'fert_product', 'hno3_class', 'hno3_t', 'urea_t'],
      properties: {
        steel_route: { type: ['string', 'null'], enum: ['bf_bof', 'eaf_grid', 'eaf_captive', 'dri_coal', null] },
        steel_reductant: { type: ['string', 'null'], enum: [...SOLID_REDUCTANTS.map(f => f.key), null] },
        steel_reductant_t: { type: ['number', 'null'] },
        limestone_t: { type: ['number', 'null'] },
        dolomite_t: { type: ['number', 'null'] },
        electrode_t: { type: ['number', 'null'] },
        alu_type: { type: ['string', 'null'], enum: ['smelter', 'downstream', null] },
        alu_tonnes: { type: ['number', 'null'] },
        alu_tech: { type: ['string', 'null'], enum: ['cwpb', 'swpb', 'vss', 'hss', null] },
        clinker_t: { type: ['number', 'null'] },
        clinker_ratio: { type: ['number', 'null'] },
        fert_product: { type: ['string', 'null'], enum: ['ammonia', 'urea', 'nitric', 'other', null] },
        hno3_class: { type: ['string', 'null'], enum: [...HNO3_CLASSES.map(c => c.id), null] },
        hno3_t: { type: ['number', 'null'] },
        urea_t: { type: ['number', 'null'] },
      },
    },
    flags: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['field', 'confidence', 'note'],
        properties: {
          field: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          note: { type: 'string' },
        },
      },
    },
  },
};

const AI_SYSTEM = [
  'You are a data-extraction step in a greenhouse-gas inventory tool.',
  'Your ONLY job is to read a supplier\'s free-text description of their operations and map the',
  'quantities they state into the given JSON schema so a deterministic calculator can use them.',
  '',
  'ABSOLUTE RULES:',
  '- Do NOT calculate emissions. Do NOT convert between units. Do NOT apply emission factors.',
  '- Do NOT invent, estimate or infer any quantity that is not stated in the text. Use null / an',
  '  empty array when a value is absent. A missing number must stay missing.',
  '- Normalise magnitudes that ARE stated in words ("2.4 million units" -> 2400000 kWh;',
  '  "18 thousand litres" -> 18000) but never guess an order of magnitude.',
  '- In India "units" of electricity means kWh.',
  '- For every field where the text was vague, approximate ("about", "roughly"), or where you had to',
  '  choose between readings, add an entry to `flags` with the field name, a confidence level and a',
  '  one-line note. Anything below high confidence MUST be flagged.',
].join('\n');

async function runAi() {
  const text = $('#ai-text').value.trim();
  const status = $('#ai-status');
  if (!text) { status.replaceChildren(el('p', { class: 'err' }, 'Describe your operations first.')); return; }
  API_KEY = $('#ai-key').value.trim();
  if (!API_KEY) {
    status.replaceChildren(el('p', { class: 'err' },
      'No API key entered. Use “Load worked example” to see the same flow run from a bundled, ' +
      'pre-extracted field set without a key.'));
    return;
  }
  const btn = $('#ai-run');
  btn.disabled = true;
  status.replaceChildren(el('p', {}, 'Sending your description to api.openai.com…'));

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API_KEY },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [{ role: 'system', content: AI_SYSTEM }, { role: 'user', content: text }],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'supplier_activity_data', strict: true, schema: AI_SCHEMA },
        },
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`OpenAI returned ${resp.status}. ${body.slice(0, 300)}`);
    }
    const json = await resp.json();
    const data = JSON.parse(json.choices[0].message.content);
    applyExtraction(data);
    status.replaceChildren(
      el('p', {}, '✅ Fields populated and highlighted below. Nothing has been computed yet — ' +
        'review every highlighted field, correct anything wrong, then press “Compute inventory”.'),
      confidenceList(data.flags));
  } catch (e) {
    status.replaceChildren(el('p', { class: 'err' }, 'Extraction failed: ' + e.message));
  } finally {
    API_KEY = '';                 /* not retained beyond the request */
    btn.disabled = false;
  }
}

function confidenceList(flags) {
  if (!flags || !flags.length) return el('p', { class: 'hint' }, 'The model flagged no low-confidence fields.');
  return el('div', {}, el('p', {}, 'Extraction confidence flags:'),
    el('ul', {}, ...flags.map(f => el('li', {},
      el('span', { class: 'conf' }, `[${f.confidence}] `), `${f.field} — ${f.note}`))));
}

/** Write an extracted field set into the form and highlight what changed. */
function applyExtraction(d) {
  const mark = node => { if (node) node.classList.add('ai-filled'); };
  const set = (sel, val) => {
    if (val === null || val === undefined || val === '') return;
    const n = $(sel); if (!n) return;
    n.value = val; n.dispatchEvent(new Event('change', { bubbles: true })); mark(n);
  };

  set('#f-sector', d.sector);
  set('#f-role', d.role);
  set('#f-year', d.reporting_year);
  if (d.state && [...$('#f-state').options].some(o => o.value === d.state)) set('#f-state', d.state);
  syncSector();
  set('#f-output', d.output_qty);

  const fill = (host, rows, maker, apply) => {
    if (!rows || !rows.length) return;
    host.replaceChildren();
    rows.forEach(r => apply(maker(host), r));
  };
  const applyFuel = (row, r) => {
    const s = row.querySelector('.r-fuel'), q = row.querySelector('.r-qty'), u = row.querySelector('.r-unit');
    s.value = r.fuel; s.dispatchEvent(new Event('change'));
    u.value = r.unit; u.dispatchEvent(new Event('change'));
    q.value = r.qty;
    [s, q, u].forEach(mark);
  };
  fill($('#fuel-rows'), d.fuels, h => makeFuelRow(h), applyFuel);
  fill($('#veh-rows'), d.vehicle_fuels, h => makeFuelRow(h, { list: LIQUID_FUELS.concat(fuel('natural_gas') || []), label: 'Vehicle fuel' }), applyFuel);
  fill($('#ref-rows'), d.refrigerants, h => makeRefRow(h), (row, r) => {
    const g = row.querySelector('.r-gas'), k = row.querySelector('.r-kg');
    g.value = r.gas; k.value = r.kg; [g, k].forEach(mark);
  });
  fill($('#elec-rows'), d.electricity, h => makeElecRow(h), (row, r) => {
    const s = row.querySelector('.r-src'), k = row.querySelector('.r-kwh');
    s.value = r.source; s.dispatchEvent(new Event('change'));
    if (r.kwh != null) k.value = r.kwh;
    [s, k].forEach(mark);
    if (r.source === 'captive' && r.captive_fuel) {
      const cf = row.querySelector('.r-fuel'), cq = row.querySelector('.r-cqty'), cu = row.querySelector('.r-unit');
      cf.value = r.captive_fuel; cf.dispatchEvent(new Event('change'));
      if (r.captive_unit) { cu.value = r.captive_unit; cu.dispatchEvent(new Event('change')); }
      if (r.captive_qty != null) cq.value = r.captive_qty;
      [cf, cq, cu].forEach(mark);
    }
  });

  set('#f-dg', d.dg_diesel_litres);
  set('#f-steam', d.purchased_steam_tonnes);

  const x = d.sector_extras || {};
  set('#st-route', x.steel_route); set('#st-red-type', x.steel_reductant);
  set('#st-red-qty', x.steel_reductant_t); set('#st-limestone', x.limestone_t);
  set('#st-dolomite', x.dolomite_t); set('#st-electrode', x.electrode_t);
  set('#al-type', x.alu_type); set('#al-tonnes', x.alu_tonnes); set('#al-tech', x.alu_tech);
  set('#cm-clinker', x.clinker_t); set('#cm-ratio', x.clinker_ratio);
  set('#ft-product', x.fert_product); set('#ft-hno3-class', x.hno3_class);
  set('#ft-hno3-qty', x.hno3_t); set('#ft-urea-qty', x.urea_t);
  syncSector();
}

/* ── bundled worked example: cached-AI mode, keyless ─────
   SYNTHETIC. No real company. The description and the field set below are a
   committed pair, so the extraction flow is demonstrable with no API key. */
const SAMPLE_TEXT =
  '[SYNTHETIC SAMPLE — not a real company]\n\n' +
  'We are Kaveri Spinning Mills, a cotton spinning unit in Tamil Nadu, reporting FY 2024-25. ' +
  'We produced about 4,200 tonnes of yarn last year.\n\n' +
  'Our boiler runs on rice husk — we burned roughly 900 tonnes of it. We also keep some furnace ' +
  'oil for the thermic fluid heater, about 45 tonnes over the year.\n\n' +
  'We bought 2.4 million units of electricity from the state grid, and we have a 1.5 MW solar PPA ' +
  'that supplied another 320,000 units.\n\n' +
  'The DG set took roughly 18,000 litres of diesel during the load-shedding months. Our forklifts ' +
  'and the company truck used about 6,500 litres of diesel.\n\n' +
  'The chillers in the humidification plant were topped up with 12 kg of R-410A, and the office ' +
  'ACs took 4 kg of R-32.';

const SAMPLE_EXTRACTION = {
  sector: 'textiles', role: 'manufacturer', state: 'Tamil Nadu', reporting_year: 'FY 2024-25',
  output_qty: 4200,
  fuels: [
    { fuel: 'biomass_rice_husk', qty: 900, unit: 'tonne' },
    { fuel: 'fuel_oil', qty: 45, unit: 'tonne' },
  ],
  dg_diesel_litres: 18000,
  vehicle_fuels: [{ fuel: 'diesel', qty: 6500, unit: 'litre' }],
  refrigerants: [{ gas: 'R-410A', kg: 12 }, { gas: 'R-32', kg: 4 }],
  electricity: [
    { source: 'grid', kwh: 2400000, captive_fuel: null, captive_qty: null, captive_unit: null },
    { source: 'ppa', kwh: 320000, captive_fuel: null, captive_qty: null, captive_unit: null },
  ],
  purchased_steam_tonnes: null,
  sector_extras: {
    steel_route: null, steel_reductant: null, steel_reductant_t: null, limestone_t: null,
    dolomite_t: null, electrode_t: null, alu_type: null, alu_tonnes: null, alu_tech: null,
    clinker_t: null, clinker_ratio: null, fert_product: null, hno3_class: null, hno3_t: null, urea_t: null,
  },
  flags: [
    { field: 'fuels[0].qty', confidence: 'medium', note: '"roughly 900 tonnes" of rice husk — stated as an approximation, not a metered figure.' },
    { field: 'fuels[1].qty', confidence: 'medium', note: '"about 45 tonnes" of furnace oil — approximate.' },
    { field: 'dg_diesel_litres', confidence: 'medium', note: '"roughly 18,000 litres" — approximate; DG logbook total would be firmer.' },
    { field: 'vehicle_fuels[0].qty', confidence: 'medium', note: '"about 6,500 litres" combines forklifts and one truck.' },
    { field: 'output_qty', confidence: 'medium', note: '"about 4,200 tonnes of yarn" — drives the intensity denominator, so worth confirming.' },
    { field: 'electricity[1]', confidence: 'high', note: 'Solar PPA declared: recorded as market-based context only, never netted off Scope 2.' },
  ],
};

function loadExample() {
  $('#ai-text').value = SAMPLE_TEXT;
  $('#ai-text').classList.add('ai-filled');
  applyExtraction(SAMPLE_EXTRACTION);
  $('#ai-status').replaceChildren(
    el('p', {}, '📦 Loaded the bundled ', el('strong', {}, 'SYNTHETIC'), ' worked example in ' +
      'cached-AI mode — the description above and the field set below are a committed pair, so no ' +
      'API key was used and no network request was made. Review the highlighted fields, then press ' +
      '“Compute inventory”.'),
    confidenceList(SAMPLE_EXTRACTION.flags));
}

/* ═══════════════════════ wiring ═══════════════════════ */

function goto(n) {
  ['1', '2', '3'].forEach(k => { $('#step' + k).hidden = k !== String(n); });
  /* The wizard sections are only hidden, never destroyed, so returning to step 1
     or 2 from the board keeps every entered value. The board re-reads the form on
     every visit so edits are reflected without recomputing. */
  if (String(n) === '3') renderBoard();
  $$('.step-btn').forEach(b => {
    const i = Number(b.dataset.goto);
    b.classList.toggle('is-current', i === Number(n));
    b.classList.toggle('is-done', i < Number(n));
    if (i === Number(n)) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/** Show only the sector block that applies, and gate everything the role forbids. */
function syncSector() {
  const sector = $('#f-sector').value;
  const isTrader = $('#f-role').value === 'trader';

  $('#trader-notice').hidden = !isTrader;
  $('#sector-extras').hidden = isTrader;
  $('#sector-extra-name').textContent = SECTOR_LABEL[sector] || '';
  $$('.sector-block').forEach(b => { b.hidden = isTrader || b.dataset.sector !== sector; });

  /* output unit options */
  const sel = $('#f-output-unit'), keep = sel.value;
  sel.replaceChildren(...(OUTPUT_UNITS[sector] || []).map(([v, l]) => el('option', { value: v }, l)));
  if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
  $('#output-hint').textContent = CBAM_SECTOR[sector] && !isTrader
    ? 'Used for the intensity figure. A tonnes-of-product basis is required for the CBAM comparison.'
    : 'Used for the intensity figure.';

  /* steel route gate */
  const route = $('#st-route').value;
  $('#st-electrode-field').hidden = !(route === 'eaf_grid' || route === 'eaf_captive');
  const dri = $('#st-dri-note');
  dri.hidden = route !== 'dri_coal';
  if (route === 'dri_coal' && !dri.dataset.filled) {
    dri.dataset.filled = '1';
    dri.append(el('strong', {}, 'Coal-based DRI: no route default is applied.'),
      el('p', {}, 'IPCC\'s Tier 1 DRI factor (' + F('process_steel_dri_tier1').value_primary +
        ' tCO₂/t DRI) assumes a natural-gas-based plant. India\'s coal route is materially more ' +
        'carbon-intensive, so using that default would understate you. This tool computes your DRI ' +
        'emissions ONLY from the coal / reductant quantity you enter above — enter it accurately, ' +
        'because nothing fills the gap if you leave it blank.'));
  }

  /* aluminium gate */
  const alSmelter = $('#al-type').value === 'smelter';
  $$('.al-smelter').forEach(n => { n.hidden = !alSmelter; });
  $('#al-downstream-note').hidden = alSmelter;
  const tech = $('#al-tech').value;
  const anode = F(AL_ANODE[tech]);
  $('#al-tech-hint').textContent = `Anode factor: ${anode.activity} (${anode.value_primary} ${anode.unit}).`;
  const pfcNote = $('#al-pfc-note');
  pfcNote.replaceChildren(el('strong', {}, 'PFC lines use IPCC Tier 1 defaults.'),
    el('p', {}, `For ${tech.toUpperCase()}: ` +
      AL_PFC[tech].map(id => `${F(id).gas} ${F(id).value_primary} ${F(id).unit}`).join(', ') +
      '. These carry an uncertainty of roughly −99% / +380% and are flagged “tier1-default” in the ' +
      'trail. Where you have anode-effect minutes, a Tier 2 slope method is the correct route — ' +
      'that is a v2 feature, not something this MVP will guess at.'));

  /* fertiliser gate */
  const isNitric = $('#ft-product').value === 'nitric';
  $$('.ft-nitric').forEach(n => { n.hidden = !isNitric; });
  $$('.ft-urea').forEach(n => { n.hidden = $('#ft-product').value === 'nitric' ? true : false; });
  const ftNote = $('#ft-note');
  const prod = $('#ft-product').value;
  ftNote.replaceChildren(el('strong', {}, 'What this block does and does not cover.'),
    el('p', {}, prod === 'ammonia'
      ? 'Ammonia: the feedstock carbon (natural gas or naphtha) is booked through the common fuels ' +
        'block above. Splitting feedstock CO₂ from fuel CO₂ as separate reported lines is a full-engine ' +
        'feature (SPEC §5) and is not implemented in this MVP — the total is right, the split is not shown.'
      : prod === 'nitric'
        ? 'Nitric acid N₂O uses the IPCC plant-class default you select. Tonnage must be on a 100% HNO₃ basis.'
        : prod === 'urea'
          ? 'Urea CO₂ uptake is booked as an explicit negative line. Any ammonia-plant feedstock carbon ' +
            'belongs in the common fuels block above.'
          : 'No process lines for “other”. Only the common block will compute.'));
}

function boot() {
  /* static selects populated from data */
  $('#f-state').replaceChildren(el('option', { value: '' }, '— select —'),
    ...STATES.map(s => el('option', { value: s }, s)));
  $('#st-red-type').replaceChildren(...SOLID_REDUCTANTS.map(f => el('option', { value: f.key }, f.activity)));
  $('#ft-hno3-class').replaceChildren(...HNO3_CLASSES.map(c => el('option', { value: c.id }, c.label)));

  /* DG density default: the GHGP diesel density parsed out of factors.csv notes */
  const dd = FUEL_DENSITY.diesel;
  if (dd) {
    $('#f-dg-density').value = dd.kg_per_unit;
    $('#f-dg-density').title = `Default ${dd.kg_per_unit} kg/L from ${dd.source} (${dd.vintage}), row ${dd.from_factor_id}`;
  }

  /* steam: the honest note comes straight out of the factor row */
  const steam = F('steam_purchased');
  $('#steam-note').replaceChildren(
    el('strong', {}, 'This line computes nothing — on purpose.'),
    el('p', {}, steam.notes));

  /* one starter row in each repeating block */
  makeFuelRow($('#fuel-rows'));
  makeFuelRow($('#veh-rows'), { list: LIQUID_FUELS.concat(fuel('natural_gas') || []), label: 'Vehicle fuel' });
  makeRefRow($('#ref-rows'));
  makeElecRow($('#elec-rows'));

  /* footer */
  $('#repo-link').href = REPO_URL;
  $('#build-stamp').textContent =
    `Factor data built ${DATA_BUILD.generated} · ${DATA_BUILD.factors_rows} factor rows · ` +
    `${DATA_BUILD.cbam_rows} CBAM India default values · ${DATA_BUILD.gwp_basis}`;

  /* events */
  $$('[data-goto]').forEach(b => b.addEventListener('click', () => goto(b.dataset.goto)));
  $$('[data-add]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.add;
    if (k === 'fuel') makeFuelRow($('#fuel-rows'));
    if (k === 'veh') makeFuelRow($('#veh-rows'), { list: LIQUID_FUELS.concat(fuel('natural_gas') || []), label: 'Vehicle fuel' });
    if (k === 'ref') makeRefRow($('#ref-rows'));
    if (k === 'elec') makeElecRow($('#elec-rows'));
  }));
  ['#f-sector', '#f-role', '#st-route', '#al-type', '#al-tech', '#ft-product']
    .forEach(s => $(s).addEventListener('change', syncSector));

  /* Onboarding hands off to the board; the board does not compute until asked. */
  $('#open-board').addEventListener('click', () => goto(3));
  $('#calc-all').addEventListener('click', calculateAll);
  $('#ai-run').addEventListener('click', runAi);
  $('#ai-example').addEventListener('click', loadExample);

  syncSector();
}

document.addEventListener('DOMContentLoaded', boot);

/* Exposed for the headless golden-check harness (tools/ / node). Harmless in a browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { compute, burnFuel, F, FUELS, FUEL_ID_RE, uncertaintyOf, gwpFor };
}
