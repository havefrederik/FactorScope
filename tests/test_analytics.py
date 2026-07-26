from __future__ import annotations

import pandas as pd

from factorscope.analytics import (
    stock_return_attribution,
    portfolio_exposures,
    scenario_impact,
)


def test_stock_attribution_reconciles_daily():
    df = pd.DataFrame({
        "date": ["2024-01-02", "2024-01-02", "2024-01-03", "2024-01-03"],
        "ticker": ["ABC"] * 4,
        "factor": ["MKT", "HML", "MKT", "HML"],
        "contribution": [0.01, 0.002, -0.004, 0.001],
        "actual_return": [0.015, 0.015, -0.001, -0.001],
        "specific_return": [0.003, 0.003, 0.002, 0.002],
    })
    result = stock_return_attribution(df, "ABC", "2024-01-01", "2024-01-31")
    assert round(result.factor_return, 8) == 0.009
    assert round(result.specific_return, 8) == 0.005


def test_portfolio_exposure_weighting():
    exp = pd.DataFrame({
        "ticker": ["A", "A", "B", "B"],
        "factor": ["MKT", "HML", "MKT", "HML"],
        "exposure": [1.0, 0.5, 0.8, -0.5],
    })
    portfolio = pd.DataFrame({"ticker": ["A", "B"], "weight": [0.25, 0.75]})
    out = portfolio_exposures(exp, portfolio).set_index("factor")
    assert round(out.loc["MKT", "exposure"], 8) == 0.85
    assert round(out.loc["HML", "exposure"], 8) == -0.25


def test_scenario_impact():
    exp = pd.DataFrame({"factor": ["MKT", "HML"], "exposure": [1.2, -0.4]})
    out = scenario_impact(exp, {"MKT": -0.1, "HML": 0.05})
    assert round(out["estimated_return_impact"].sum(), 8) == -0.14
