"""Extract India-specific CBAM definitive-period default values into a clean,
sourced Excel workbook.

Source: Annex I to Commission Implementing Regulation (EU) 2025/2621, as
corrected by Implementing Regulation (EU) 2026/1740 (applies retroactively from
1 Jan 2026). Excel published by the European Commission (v. 2026-02-04),
downloaded from the CBAM definitive regime page.
"""
import datetime
import pandas as pd

RAW = "data/raw/CBAM_default_values_definitive_v20260204.xlsx"
OUT = "data/CBAM_India_default_values_2026.xlsx"
SRC_URL = ("https://taxation-customs.ec.europa.eu/document/download/"
           "1c05d211-80cb-4aaa-8ef0-e08005a95d7e_en"
           "?filename=DVs%20as%20adopted_v20260204%20.xlsx")
PAGE_URL = ("https://taxation-customs.ec.europa.eu/"
            "carbon-border-adjustment-mechanism/cbam-definitive-regime_en")

SECTORS = {"Cement", "Fertilisers", "Iron and Steel", "Iron and steel",
           "Aluminium", "Hydrogen", "Electricity"}


def to_num(x):
    """European decimal comma -> float; '-' or blank -> None."""
    s = str(x).strip()
    if s in {"-", "", "nan", "see below"}:
        return None
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return None


def main():
    df = pd.read_excel(RAW, sheet_name="India", header=None)
    rows, sector = [], None
    for _, r in df.iterrows():
        c0 = str(r[0]).strip() if pd.notna(r[0]) else ""
        if not c0 or c0 == "India" or c0.startswith("Product CN"):
            continue
        if c0 in SECTORS or (pd.isna(r[2]) and pd.isna(r[1]) and len(c0) < 40
                             and not any(ch.isdigit() for ch in c0)):
            sector = c0
            continue
        rows.append({
            "sector": sector,
            "cn_code": c0,
            "description": str(r[1]).strip() if pd.notna(r[1]) else "",
            "dv_direct_tCO2e_per_t": to_num(r[2]),
            "dv_indirect_tCO2e_per_t": to_num(r[3]),
            "dv_total_tCO2e_per_t": to_num(r[4]),
            "production_route": str(r[5]).strip() if pd.notna(r[5]) else "",
        })
    india = pd.DataFrame(rows)

    sources = pd.DataFrame([
        ["Legal basis", "Commission Implementing Regulation (EU) 2025/2621, "
         "Annex I — default values for the CBAM definitive period"],
        ["Correction", "Commission Implementing Regulation (EU) 2026/1740 "
         "(published 31 Jul 2026), applies retroactively from 1 Jan 2026"],
        ["File version", "DVs as adopted, v. 2026-02-04 (Commission Excel, "
         "informational; the regulation text is legally binding)"],
        ["Download URL", SRC_URL],
        ["Landing page", PAGE_URL],
        ["Retrieved", datetime.date.today().isoformat()],
        ["Unit", "tCO2e per tonne of product (direct / indirect / total)"],
        ["Mark-up schedule", "Most default values rise +10% in 2026, +20% in "
         "2027, +30% from 2028; fertilisers exempt (+1%/yr instead). See "
         "regulation for the applicable mark-up basis."],
        ["'-' entries", "No default value published for that CN code"],
        ["Scope note", "Values are country-specific for India, per CN code, "
         "assigned to a benchmark production route where marked"],
    ], columns=["field", "value"])

    with pd.ExcelWriter(OUT, engine="openpyxl") as xw:
        sources.to_excel(xw, sheet_name="SOURCES", index=False)
        india.to_excel(xw, sheet_name="India_default_values", index=False)
        for sec, g in india.groupby("sector"):
            safe = str(sec)[:28].replace("/", "-")
            g.to_excel(xw, sheet_name=safe, index=False)

    print(f"rows: {len(india)}")
    print(india.groupby("sector").size())
    print("wrote:", OUT)


if __name__ == "__main__":
    main()
