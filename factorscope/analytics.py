from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence
import numpy as np
import pandas as pd

from .schema import resolve_column, normalize_dates, AnalysisWindow


@dataclass
class StockAttributionResult:
    ticker: str
    start: pd.Timestamp
    end: pd.Timestamp
    total_return: float
    factor_return: float
    specific_return: float
    contributions: pd.DataFrame
    daily: pd.DataFrame
    reconciliation_error: float


@dataclass
class RiskResult:
    total_variance: float
    factor_variance: float
    specific_variance: float
    total_volatility: float
    factor_share: float
    specific_share: float
    marginal_contributions: pd.DataFrame


def _compound(values: pd.Series) -> float:
    values = pd.to_numeric(values, errors="coerce").fillna(0.0)
    return float((1.0 + values).prod() - 1.0)


def standardize_long_attribution(df: pd.DataFrame) -> pd.DataFrame:
    """Convert common attribution schemas to date/ticker/factor/contribution form."""
    date_col = resolve_column(df, "date", required=True)
    ticker_col = resolve_column(df, "ticker", required=True)
    factor_col = resolve_column(df, "factor")
    contribution_col = resolve_column(df, "contribution")
    actual_col = resolve_column(df, "actual_return")
    specific_col = resolve_column(df, "specific_return")

    if factor_col and contribution_col:
        out = df.copy()
        rename = {date_col: "date", ticker_col: "ticker",
                  factor_col: "factor", contribution_col: "contribution"}
        if actual_col:
            rename[actual_col] = "actual_return"
        if specific_col:
            rename[specific_col] = "specific_return"
        out = out.rename(columns=rename)
        keep = ["date", "ticker", "factor", "contribution"]
        for c in ["actual_return", "specific_return"]:
            if c in out.columns:
                keep.append(c)
        out = out[keep]
    else:
        identity = {date_col, ticker_col}
        if actual_col:
            identity.add(actual_col)
        if specific_col:
            identity.add(specific_col)

        candidate_cols = []
        for c in df.columns:
            lc = str(c).lower()
            if c in identity:
                continue
            if (
                lc.endswith("_contribution")
                or lc.startswith("contrib_")
                or lc in {"mkt", "smb", "hml", "rmw", "cma", "mom", "strev", "ltrev", "industry"}
            ):
                candidate_cols.append(c)

        if not candidate_cols:
            raise ValueError(
                "Could not infer factor contributions. Supply long-form columns "
                "(date, ticker, factor, contribution) or wide factor contribution columns."
            )

        id_vars = [date_col, ticker_col]
        if actual_col:
            id_vars.append(actual_col)
        if specific_col:
            id_vars.append(specific_col)

        out = df[id_vars + candidate_cols].melt(
            id_vars=id_vars,
            value_vars=candidate_cols,
            var_name="factor",
            value_name="contribution",
        )
        rename = {date_col: "date", ticker_col: "ticker"}
        if actual_col:
            rename[actual_col] = "actual_return"
        if specific_col:
            rename[specific_col] = "specific_return"
        out = out.rename(columns=rename)
        out["factor"] = (
            out["factor"].astype(str)
            .str.replace("_contribution", "", regex=False)
            .str.replace("contrib_", "", regex=False)
            .str.upper()
        )

    out["ticker"] = out["ticker"].astype(str).str.upper().str.strip()
    out["factor"] = out["factor"].astype(str).str.upper().str.strip()
    out["contribution"] = pd.to_numeric(out["contribution"], errors="coerce").fillna(0.0)
    out = normalize_dates(out, ["date"])
    return out.dropna(subset=["date", "ticker"])


def stock_return_attribution(
    attribution: pd.DataFrame,
    ticker: str,
    start: str | pd.Timestamp,
    end: str | pd.Timestamp,
) -> StockAttributionResult:
    data = standardize_long_attribution(attribution)
    ticker = ticker.upper().strip()
    window = AnalysisWindow(pd.Timestamp(start), pd.Timestamp(end))
    window.validate()

    selected = data[
        (data["ticker"] == ticker)
        & (data["date"] >= window.start)
        & (data["date"] <= window.end)
    ].copy()

    if selected.empty:
        raise ValueError(f"No attribution data found for {ticker} in the selected period.")

    factor_daily = selected.groupby(["date", "factor"], as_index=False)["contribution"].sum()
    daily_factor = factor_daily.groupby("date", as_index=False)["contribution"].sum()
    daily_factor = daily_factor.rename(columns={"contribution": "factor_return"})

    metadata_cols = [c for c in ["actual_return", "specific_return"] if c in selected.columns]
    if metadata_cols:
        metadata = selected.groupby("date", as_index=False)[metadata_cols].first()
        daily = daily_factor.merge(metadata, on="date", how="left")
    else:
        daily = daily_factor.copy()

    if "specific_return" not in daily:
        if "actual_return" in daily:
            daily["specific_return"] = daily["actual_return"] - daily["factor_return"]
        else:
            daily["specific_return"] = 0.0

    if "actual_return" not in daily:
        daily["actual_return"] = daily["factor_return"] + daily["specific_return"]

    contributions = (
        factor_daily.groupby("factor", as_index=False)["contribution"].sum()
        .sort_values("contribution", key=lambda s: s.abs(), ascending=False)
    )
    specific = float(daily["specific_return"].sum())
    contributions = pd.concat(
        [contributions, pd.DataFrame({"factor": ["SPECIFIC"], "contribution": [specific]})],
        ignore_index=True,
    )

    total = _compound(daily["actual_return"])
    factor_total = float(daily["factor_return"].sum())
    specific_total = float(daily["specific_return"].sum())
    reconciliation = total - (factor_total + specific_total)

    return StockAttributionResult(
        ticker=ticker,
        start=window.start,
        end=window.end,
        total_return=total,
        factor_return=factor_total,
        specific_return=specific_total,
        contributions=contributions,
        daily=daily.sort_values("date"),
        reconciliation_error=float(reconciliation),
    )


def standardize_exposures(df: pd.DataFrame) -> pd.DataFrame:
    if {"asof_date", "permno", "exposure_model"}.issubset(df.columns) and any(
        str(c).startswith("beta_") for c in df.columns
    ):
        from .v9_adapter import adapt_v9_exposures
        models = set(df["exposure_model"].astype(str))
        preferred = "EWLS_126" if "EWLS_126" in models else str(df["exposure_model"].iloc[0])
        return adapt_v9_exposures(df, exposure_model=preferred)

    ticker_col = resolve_column(df, "ticker", required=True)
    factor_col = resolve_column(df, "factor")
    exposure_col = resolve_column(df, "exposure")
    date_col = resolve_column(df, "as_of_date") or resolve_column(df, "date")

    if factor_col and exposure_col:
        out = df.rename(columns={
            ticker_col: "ticker",
            factor_col: "factor",
            exposure_col: "exposure",
            **({date_col: "as_of_date"} if date_col else {}),
        }).copy()
        keep = ["ticker", "factor", "exposure"]
        if "as_of_date" in out:
            keep.append("as_of_date")
        out = out[keep]
    else:
        id_cols = [ticker_col] + ([date_col] if date_col else [])
        numeric = [c for c in df.columns if c not in id_cols and pd.api.types.is_numeric_dtype(df[c])]
        if not numeric:
            raise ValueError("Could not infer exposure columns.")
        out = df[id_cols + numeric].melt(id_vars=id_cols, var_name="factor", value_name="exposure")
        out = out.rename(columns={ticker_col: "ticker"})
        if date_col:
            out = out.rename(columns={date_col: "as_of_date"})

    out["ticker"] = out["ticker"].astype(str).str.upper().str.strip()
    out["factor"] = out["factor"].astype(str).str.upper().str.strip()
    out["exposure"] = pd.to_numeric(out["exposure"], errors="coerce")
    if "as_of_date" in out:
        out["as_of_date"] = pd.to_datetime(out["as_of_date"], errors="coerce")
    return out.dropna(subset=["ticker", "factor", "exposure"])


def latest_exposures(df: pd.DataFrame, tickers: Sequence[str]) -> pd.DataFrame:
    out = standardize_exposures(df)
    tickers = [t.upper() for t in tickers]
    out = out[out["ticker"].isin(tickers)].copy()
    if "as_of_date" in out and out["as_of_date"].notna().any():
        latest = out.groupby("ticker")["as_of_date"].transform("max")
        out = out[out["as_of_date"] == latest]
    return out


def portfolio_exposures(exposures: pd.DataFrame, portfolio: pd.DataFrame) -> pd.DataFrame:
    exp = latest_exposures(exposures, portfolio["ticker"].tolist())
    merged = exp.merge(portfolio, on="ticker", how="inner")
    if merged.empty:
        raise ValueError("No portfolio tickers matched the exposure data.")
    merged["weighted_exposure"] = merged["exposure"] * merged["weight"]
    return (
        merged.groupby("factor", as_index=False)["weighted_exposure"].sum()
        .rename(columns={"weighted_exposure": "exposure"})
        .sort_values("exposure", key=lambda s: s.abs(), ascending=False)
    )


def portfolio_return_attribution(
    attribution: pd.DataFrame,
    portfolio: pd.DataFrame,
    start: str | pd.Timestamp,
    end: str | pd.Timestamp,
) -> pd.DataFrame:
    rows = []
    for row in portfolio.itertuples(index=False):
        result = stock_return_attribution(attribution, row.ticker, start, end)
        temp = result.contributions.copy()
        temp["ticker"] = row.ticker
        temp["weight"] = row.weight
        temp["weighted_contribution"] = temp["contribution"] * row.weight
        rows.append(temp)
    detail = pd.concat(rows, ignore_index=True)
    return detail


def risk_decomposition(
    exposure_vector: Mapping[str, float],
    factor_covariance: pd.DataFrame,
    specific_variance: float,
) -> RiskResult:
    factors = [f for f in exposure_vector if f in factor_covariance.index and f in factor_covariance.columns]
    if not factors:
        raise ValueError("No exposure factors matched the covariance matrix.")

    beta = np.array([exposure_vector[f] for f in factors], dtype=float)
    cov = factor_covariance.loc[factors, factors].astype(float).to_numpy()
    factor_variance = float(beta @ cov @ beta)
    specific_variance = max(float(specific_variance), 0.0)
    total_variance = max(factor_variance + specific_variance, 0.0)

    marginal = beta * (cov @ beta)
    contributions = pd.DataFrame({"factor": factors, "variance_contribution": marginal})
    contributions = contributions.sort_values(
        "variance_contribution", key=lambda s: s.abs(), ascending=False
    )

    return RiskResult(
        total_variance=total_variance,
        factor_variance=factor_variance,
        specific_variance=specific_variance,
        total_volatility=float(np.sqrt(total_variance)),
        factor_share=factor_variance / total_variance if total_variance else 0.0,
        specific_share=specific_variance / total_variance if total_variance else 0.0,
        marginal_contributions=contributions,
    )


def scenario_impact(exposures: pd.DataFrame, shocks: Mapping[str, float]) -> pd.DataFrame:
    out = exposures.copy()
    out["shock"] = out["factor"].map({str(k).upper(): v for k, v in shocks.items()}).fillna(0.0)
    out["estimated_return_impact"] = out["exposure"] * out["shock"]
    return out.sort_values("estimated_return_impact", key=lambda s: s.abs(), ascending=False)
