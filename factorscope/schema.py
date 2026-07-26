from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable
import pandas as pd


ALIASES = {
    "date": ["date", "dt", "timestamp", "return_date", "period"],
    "ticker": ["ticker", "symbol", "security", "security_id", "permno"],
    "as_of_date": ["as_of_date", "asof", "estimation_date"],
    "actual_return": ["actual_return", "stock_return", "return", "ret", "realized_return"],
    "specific_return": ["specific_return", "idio_return", "residual", "epsilon", "resid"],
    "factor": ["factor", "factor_name"],
    "factor_return": ["factor_return", "factor_ret", "factor_value"],
    "exposure": ["exposure", "beta", "loading"],
    "contribution": ["contribution", "factor_contribution", "return_contribution"],
    "specific_variance": ["specific_variance", "idio_variance", "residual_variance"],
    "predicted_variance": ["predicted_variance", "forecast_variance", "total_variance"],
    "industry": ["industry", "industry_name", "ff12_industry"],
}


def resolve_column(df: pd.DataFrame, canonical: str, required: bool = False) -> str | None:
    lower = {str(c).lower(): str(c) for c in df.columns}
    for alias in ALIASES.get(canonical, [canonical]):
        if alias.lower() in lower:
            return lower[alias.lower()]
    if required:
        raise ValueError(
            f"Required column '{canonical}' was not found. "
            f"Available columns: {list(df.columns)}"
        )
    return None


def normalize_dates(df: pd.DataFrame, columns: Iterable[str]) -> pd.DataFrame:
    out = df.copy()
    for col in columns:
        if col in out.columns:
            out[col] = pd.to_datetime(out[col], errors="coerce")
    return out


@dataclass(frozen=True)
class AnalysisWindow:
    start: pd.Timestamp
    end: pd.Timestamp

    def validate(self) -> None:
        if self.start > self.end:
            raise ValueError("Start date must be before or equal to end date.")
