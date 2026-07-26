from __future__ import annotations

from dataclasses import dataclass
import pandas as pd


V9_BETA_COLUMNS = {
    "beta_mkt_excess": "MKT",
    "beta_smb": "SMB",
    "beta_hml": "HML",
    "beta_rmw": "RMW",
    "beta_cma": "CMA",
    "beta_mom": "MOM",
    "beta_industry": "INDUSTRY",
}


@dataclass(frozen=True)
class V9Selection:
    exposure_model: str = "EWLS_126"
    industry_model: str = "NO_INDUSTRY"
    covariance_model: str = "EWMA_126"
    specific_risk_model: str = "SPEC_STRESS_EWMA_126"
    risk_overlay: str = "FACTOR_STRESS_OVERLAY"


def is_v9_exposure_frame(df: pd.DataFrame) -> bool:
    return (
        {"asof_date", "permno", "exposure_model"}.issubset(df.columns)
        and any(c in df.columns for c in V9_BETA_COLUMNS)
    )


def adapt_v9_exposures(
    df: pd.DataFrame,
    exposure_model: str = "EWLS_126",
    industry_model: str | None = None,
) -> pd.DataFrame:
    if not is_v9_exposure_frame(df):
        raise ValueError("The uploaded file does not look like a FactorScope V9 exposure file.")

    data = df.copy()
    data["asof_date"] = pd.to_datetime(data["asof_date"], errors="coerce")
    data["permno"] = data["permno"].astype(str)

    if exposure_model and exposure_model in set(data["exposure_model"].astype(str)):
        data = data[data["exposure_model"].astype(str) == exposure_model]
    if (
        industry_model
        and "industry_model" in data
        and industry_model in set(data["industry_model"].astype(str))
    ):
        data = data[data["industry_model"].astype(str) == industry_model]

    beta_cols = [c for c in V9_BETA_COLUMNS if c in data.columns]
    id_cols = [
        c for c in [
            "asof_date", "permno", "ff12_industry", "industry_model",
            "exposure_model", "r2", "specific_vol_annualized"
        ] if c in data.columns
    ]

    out = data[id_cols + beta_cols].melt(
        id_vars=id_cols,
        value_vars=beta_cols,
        var_name="beta_column",
        value_name="exposure",
    )
    out["factor"] = out["beta_column"].map(V9_BETA_COLUMNS)
    out = out.rename(columns={"permno": "ticker"}).drop(columns=["beta_column"])
    out["exposure"] = pd.to_numeric(out["exposure"], errors="coerce")
    return out.dropna(subset=["asof_date", "ticker", "factor", "exposure"])


def available_values(df: pd.DataFrame, column: str) -> list[str]:
    if column not in df.columns:
        return []
    return sorted(df[column].dropna().astype(str).unique().tolist())


def is_v9_walk_forward_frame(df: pd.DataFrame) -> bool:
    return {
        "asof_date", "permno", "exposure_model", "covariance_model",
        "specific_risk_model", "predicted_vol_annualized",
        "realized_vol_annualized",
    }.issubset(df.columns)


def filter_v9_walk_forward(
    df: pd.DataFrame,
    selection: V9Selection,
    industry_model: str | None = None,
) -> pd.DataFrame:
    if not is_v9_walk_forward_frame(df):
        raise ValueError("The uploaded file does not look like a FactorScope V9 walk-forward file.")

    out = df.copy()
    out["asof_date"] = pd.to_datetime(out["asof_date"], errors="coerce")
    filters = {
        "exposure_model": selection.exposure_model,
        "covariance_model": selection.covariance_model,
        "specific_risk_model": selection.specific_risk_model,
        "risk_overlay": selection.risk_overlay,
    }
    if industry_model is not None:
        filters["industry_model"] = industry_model

    for column, value in filters.items():
        if column in out.columns and value in set(out[column].dropna().astype(str)):
            out = out[out[column].astype(str) == value]
    return out.dropna(subset=["asof_date"])
