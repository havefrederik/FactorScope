from __future__ import annotations

from pathlib import Path
import numpy as np
import pandas as pd

from .config import DEMO_DIR


TICKERS = ["AAPL", "MSFT", "JPM", "XOM", "WMT"]
FACTORS = ["MKT", "SMB", "HML", "RMW", "CMA", "MOM"]


def ensure_demo_data() -> None:
    DEMO_DIR.mkdir(parents=True, exist_ok=True)
    attr_path = DEMO_DIR / "daily_attribution.csv"
    exp_path = DEMO_DIR / "exposures.csv"
    portfolio_path = DEMO_DIR / "sample_portfolio.csv"
    cov_path = DEMO_DIR / "factor_covariance.csv"

    if all(p.exists() for p in [attr_path, exp_path, portfolio_path, cov_path]):
        return

    rng = np.random.default_rng(42)
    dates = pd.bdate_range("2024-01-02", "2024-12-31")
    factor_returns = pd.DataFrame(
        rng.normal(0.0002, 0.008, size=(len(dates), len(FACTORS))),
        index=dates,
        columns=FACTORS,
    )

    exposure_rows = []
    attr_rows = []
    for i, ticker in enumerate(TICKERS):
        betas = {
            "MKT": 0.8 + 0.15 * i,
            "SMB": -0.3 + 0.15 * i,
            "HML": -0.5 + 0.25 * i,
            "RMW": 0.3 - 0.05 * i,
            "CMA": -0.2 + 0.08 * i,
            "MOM": 0.4 - 0.12 * i,
        }
        for f, beta in betas.items():
            exposure_rows.append({
                "as_of_date": "2024-12-31",
                "ticker": ticker,
                "factor": f,
                "exposure": beta,
            })

        idio = rng.normal(0.0001, 0.012 + i * 0.001, len(dates))
        for j, date in enumerate(dates):
            factor_contribs = {f: betas[f] * factor_returns.loc[date, f] for f in FACTORS}
            actual = sum(factor_contribs.values()) + idio[j]
            for f, contribution in factor_contribs.items():
                attr_rows.append({
                    "date": date,
                    "ticker": ticker,
                    "factor": f,
                    "contribution": contribution,
                    "actual_return": actual,
                    "specific_return": idio[j],
                })

    pd.DataFrame(attr_rows).to_csv(attr_path, index=False)
    pd.DataFrame(exposure_rows).to_csv(exp_path, index=False)
    pd.DataFrame({
        "ticker": TICKERS,
        "weight": [0.30, 0.25, 0.20, 0.15, 0.10],
    }).to_csv(portfolio_path, index=False)

    cov = factor_returns.cov() * 252
    cov.to_csv(cov_path)
