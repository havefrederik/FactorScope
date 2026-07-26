from __future__ import annotations

import pandas as pd
import streamlit as st

from factorscope.analytics import latest_exposures, scenario_impact
from factorscope.charts import contribution_bar
from .common import load_exposures_widget


PRESETS = {
    "Market drawdown": {"MKT": -0.10},
    "Momentum reversal": {"MOM": -0.08},
    "Value rally": {"HML": 0.06},
    "Small-cap selloff": {"SMB": -0.07},
}


def render() -> None:
    st.title("Scenario Analysis")
    st.write(
        "Estimate first-order return sensitivity to factor shocks. "
        "This is a linear exposure-based scenario, not a full repricing model."
    )

    exposures = load_exposures_widget()
    tickers = sorted(exposures["ticker"].astype(str).str.upper().unique())
    ticker = st.selectbox("Ticker", tickers, key="scenario_ticker")
    preset = st.selectbox("Preset", list(PRESETS) + ["Custom"])

    current = latest_exposures(exposures, [ticker])[["factor", "exposure"]]

    if preset == "Custom":
        shocks = {}
        cols = st.columns(3)
        for i, factor in enumerate(current["factor"].tolist()):
            shocks[factor] = cols[i % 3].number_input(
                f"{factor} shock",
                value=0.0,
                step=0.01,
                format="%.3f",
            )
    else:
        shocks = PRESETS[preset]

    result = scenario_impact(current, shocks)
    total = result["estimated_return_impact"].sum()

    st.metric("Estimated return impact", f"{total:.1%}")
    st.plotly_chart(
        contribution_bar(
            result,
            "factor",
            "estimated_return_impact",
            f"{ticker}: scenario contribution",
        ),
        use_container_width=True,
    )
    st.dataframe(result, use_container_width=True, hide_index=True)
