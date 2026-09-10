"""Export data/factors.csv to a multi-sheet Excel workbook with a SOURCES sheet.

Rerun any time factors.csv changes: python tools/export_factors_xlsx.py
"""
import datetime
import pandas as pd

CSV = "data/factors.csv"
OUT = "data/emission_factors_database.xlsx"

CLASS_SHEETS = {
    "fuel": "Fuels_Scope1",
    "process": "Process_Scope1",
    "gwp": "GWPs_AR6",
    "grid": "Grid_India_Scope2",
    "stoichiometric": "Stoichiometric",
    "steam": "Steam_note",
}


def main():
    df = pd.read_csv(CSV)

    # SOURCES sheet: metadata header + unique source/vintage pairs from the data
    meta = pd.DataFrame([
        ["Database", "Emission-factor database - Scope 1 & 2, Indian suppliers"],
        ["Project", "India-EU Carbon Ratings (see docs/SPEC.md)"],
        ["Generated", datetime.date.today().isoformat()],
        ["Basis", "GWP-100, IPCC AR6 (2021); location-based Scope 2"],
        ["Rows", str(len(df))],
        ["Full citations", "docs/FACTOR_SOURCES.md (URLs, retrieval dates, licensing)"],
        ["Deviation guard", "deviation_pct = primary vs cross-check; rows flagged "
         "ar5-vs-ar6 are a known GWP-set difference, not an error"],
        ["Open TODOs", "; ".join(df[df["flags"].fillna('').str.contains('TODO')]
                                 ["factor_id"].tolist()) or "none"],
        ["", ""],
    ], columns=["field", "value"])

    srcs = (df.groupby(["source_primary", "vintage_primary"], dropna=False)
              .agg(rows=("factor_id", "count"),
                   classes=("source_class", lambda s: ", ".join(sorted(set(s)))))
              .reset_index()
              .rename(columns={"source_primary": "source",
                               "vintage_primary": "vintage"}))

    with pd.ExcelWriter(OUT, engine="openpyxl") as xw:
        meta.to_excel(xw, sheet_name="SOURCES", index=False, header=False)
        srcs.to_excel(xw, sheet_name="SOURCES", index=False,
                      startrow=len(meta) + 1)
        df.to_excel(xw, sheet_name="ALL_FACTORS", index=False)
        for cls, sheet in CLASS_SHEETS.items():
            sub = df[df.source_class == cls]
            if len(sub):
                sub.to_excel(xw, sheet_name=sheet, index=False)

    print("wrote", OUT, "-", len(df), "rows,",
          2 + sum(1 for c in CLASS_SHEETS if (df.source_class == c).any()),
          "sheets")


if __name__ == "__main__":
    main()
