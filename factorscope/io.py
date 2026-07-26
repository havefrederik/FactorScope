from __future__ import annotations

from pathlib import Path
from typing import BinaryIO
import pandas as pd


def read_table(source: str | Path | BinaryIO, filename: str | None = None) -> pd.DataFrame:
    """Read CSV or Parquet from a path or Streamlit upload."""
    name = filename or getattr(source, "name", "") or str(source)
    suffix = Path(name).suffix.lower()

    if suffix == ".csv":
        return pd.read_csv(source)
    if suffix in {".parquet", ".pq"}:
        return pd.read_parquet(source)
    raise ValueError("Only CSV and Parquet files are supported.")


def read_portfolio(source: str | Path | BinaryIO) -> pd.DataFrame:
    df = read_table(source)
    columns = {str(c).strip().lower(): c for c in df.columns}
    ticker_col = columns.get("ticker") or columns.get("symbol")
    weight_col = columns.get("weight") or columns.get("portfolio_weight")

    if ticker_col is None or weight_col is None:
        raise ValueError("Portfolio file must contain ticker and weight columns.")

    out = df[[ticker_col, weight_col]].copy()
    out.columns = ["ticker", "weight"]
    out["ticker"] = out["ticker"].astype(str).str.upper().str.strip()
    out["weight"] = pd.to_numeric(out["weight"], errors="coerce")
    out = out.dropna().groupby("ticker", as_index=False)["weight"].sum()

    total = out["weight"].sum()
    if total == 0:
        raise ValueError("Portfolio weights sum to zero.")
    out["weight"] = out["weight"] / total
    return out
