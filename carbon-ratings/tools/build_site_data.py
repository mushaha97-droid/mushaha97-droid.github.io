"""Generate site/data.js from the sourced factor database + the CBAM India defaults.

This is the ONLY writer of site/data.js. Never hand-edit that file: rerun

    python tools/build_site_data.py

from the repository root instead.

Inputs
  data/factors.csv                                        -> const FACTORS
  data/raw/CBAM_default_values_definitive_v20260204.xlsx  -> const CBAM_DV  (India sheet)

Outputs (site/data.js)
  FACTORS       every row of factors.csv, every column, values untouched.
  CBAM_DV       India default values per CN code (European decimal commas parsed,
                '-' / 'see below' rows dropped).
  FUEL_DENSITY  GHGP generic densities parsed OUT OF the factors.csv notes column
                (never typed by hand) so the app can offer an editable default when
                a supplier enters a liquid fuel in litres. See SPEC 4, finding F1.
  DATA_BUILD    provenance stamp (source files, row counts, build date).
"""
from __future__ import annotations

import csv
import datetime
import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
FACTORS_CSV = ROOT / "data" / "factors.csv"
CBAM_XLSX = ROOT / "data" / "raw" / "CBAM_default_values_definitive_v20260204.xlsx"
OUT_JS = ROOT / "site" / "data.js"

# Section headers inside the India sheet's first column.
SECTORS = {"Cement", "Fertilisers", "Iron and Steel", "Iron and steel",
           "Aluminium", "Hydrogen", "Electricity"}

NUMERIC_FACTOR_COLS = ("value_primary", "value_crosscheck", "deviation_pct")

# "GHGP liquid density 0.91328 kg/litre"  /  "GHGP gas density 0.7 kg/m3"
DENSITY_RE = re.compile(
    r"GHGP\s+(?P<phase>liquid|gas)\s+density\s+(?P<value>[0-9.]+)\s*kg/(?P<per>litre|m3)",
    re.IGNORECASE,
)
# fuel_<key>_<gas>_per_<unit>
FUEL_ID_RE = re.compile(r"^fuel_(?P<key>.+)_(?P<gas>co2|ch4|n2o)_per_(?P<unit>litre|m3|tonne)$")


def num(x):
    """Blank -> None, else float. Values are used verbatim, never rounded."""
    if x is None:
        return None
    s = str(x).strip()
    if s == "" or s.lower() == "nan":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def eu_num(x):
    """European decimal comma -> float; '-', blank, 'see below' -> None."""
    s = str(x).strip()
    if s in {"-", "", "nan", "see below", "See below"}:
        return None
    try:
        return float(s.replace(" ", "").replace(",", "."))
    except ValueError:
        return None


def load_factors() -> list[dict]:
    with FACTORS_CSV.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    for r in rows:
        for col in NUMERIC_FACTOR_COLS:
            r[col] = num(r.get(col))
        for k, v in list(r.items()):
            if isinstance(v, str) and v.strip() == "":
                r[k] = None
    return rows


def derive_fuel_densities(factors: list[dict]) -> dict:
    """Parse the GHGP generic density out of each per-litre / per-m3 fuel row's notes.

    Recorded here rather than hard-coded in app.js so that the default a supplier
    sees for the litres -> tonnes conversion still traces to factors.csv.
    """
    out: dict[str, dict] = {}
    for r in factors:
        m = FUEL_ID_RE.match(r["factor_id"] or "")
        if not m or m.group("unit") == "tonne":
            continue
        note = r.get("notes") or ""
        d = DENSITY_RE.search(note)
        if not d:
            continue
        key = m.group("key")
        if key in out:
            continue
        out[key] = {
            "fuel_key": key,
            "activity": r["activity"],
            "phase": d.group("phase").lower(),
            "kg_per_unit": float(d.group("value")),
            "volume_unit": "L" if d.group("per").lower() == "litre" else "m3",
            "source": r["source_primary"],
            "vintage": r["vintage_primary"],
            "from_factor_id": r["factor_id"],
        }
    return out


def load_cbam() -> list[dict]:
    df = pd.read_excel(CBAM_XLSX, sheet_name="India", header=None)
    rows, sector, skipped = [], None, 0
    for _, r in df.iterrows():
        c0 = str(r[0]).strip() if pd.notna(r[0]) else ""
        if not c0 or c0 == "India" or c0.startswith("Product CN"):
            continue
        if c0 in SECTORS or (pd.isna(r[2]) and pd.isna(r[1]) and len(c0) < 40
                             and not any(ch.isdigit() for ch in c0)):
            sector = c0
            continue
        total = eu_num(r[4])
        if total is None:          # '-' or 'see below' -> no published default
            skipped += 1
            continue
        rows.append({
            "sector": sector,
            "cn_code": c0,
            "description": str(r[1]).strip() if pd.notna(r[1]) else "",
            "dv_direct": eu_num(r[2]),
            "dv_indirect": eu_num(r[3]),
            "dv_total": total,
            "production_route": str(r[5]).strip() if pd.notna(r[5]) else "",
        })
    print(f"CBAM India: {len(rows)} rows kept, {skipped} rows without a published value skipped")
    return rows


def js_const(name: str, payload) -> str:
    return f"const {name} = {json.dumps(payload, ensure_ascii=False, indent=2)};\n\n"


def main() -> int:
    if not FACTORS_CSV.exists():
        print(f"missing {FACTORS_CSV}", file=sys.stderr)
        return 1
    if not CBAM_XLSX.exists():
        print(f"missing {CBAM_XLSX}", file=sys.stderr)
        return 1

    factors = load_factors()
    densities = derive_fuel_densities(factors)
    cbam = load_cbam()

    stamp = {
        "generated": datetime.date.today().isoformat(),
        "generator": "tools/build_site_data.py",
        "factors_source": "data/factors.csv",
        "factors_rows": len(factors),
        "cbam_source": ("data/raw/CBAM_default_values_definitive_v20260204.xlsx "
                        "(sheet 'India')"),
        "cbam_rows": len(cbam),
        "cbam_legal_basis": ("Commission Implementing Regulation (EU) 2025/2621 Annex I, "
                             "as corrected by (EU) 2026/1740"),
        "gwp_basis": "IPCC AR6 (2021) GWP-100",
    }

    header = (
        "// GENERATED FILE - DO NOT EDIT BY HAND.\n"
        "// Written by tools/build_site_data.py from data/factors.csv and\n"
        "// data/raw/CBAM_default_values_definitive_v20260204.xlsx.\n"
        "// Rerun:  python tools/build_site_data.py\n"
        f"// Generated {stamp['generated']} - "
        f"{len(factors)} factor rows, {len(cbam)} CBAM India rows.\n\n"
    )

    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    with OUT_JS.open("w", encoding="utf-8") as fh:
        fh.write(header)
        fh.write(js_const("DATA_BUILD", stamp))
        fh.write(js_const("FACTORS", factors))
        fh.write(js_const("FUEL_DENSITY", densities))
        fh.write(js_const("CBAM_DV", cbam))

    print(f"factors: {len(factors)} rows")
    print(f"densities parsed from notes: {len(densities)} -> "
          + ", ".join(f"{k}={v['kg_per_unit']}kg/{v['volume_unit']}"
                      for k, v in densities.items()))
    print(f"wrote: {OUT_JS} ({OUT_JS.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
