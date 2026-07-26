from __future__ import annotations

import pandas as pd
import streamlit as st

from factorscope.analytics import (
    latest_exposures,
    stock_return_attribution,
)
from factorscope.charts import attribution_waterfall, cumulative_returns, exposure_bar
from .common import load_attribution_widget, load_exposures_widget


def render() -> None:
    st.title("Stock Analysis")
    st.write(
        "Separate a stock's realized return into systematic factor contribution "
        "and company-specific return."
    )

    attribution = load_attribution_widget()
    exposures = load_exposures_widget()

    tickers = sorted(attribution["ticker"].astype(str).str.upper().unique())
    c1, c2, c3 = st.columns([1, 1, 1])
    ticker = c1.selectbox("Ticker", tickers)
    dates = pd.to_datetime(attribution["date"], errors="coerce")
    start = c2.date_input("Start", dates.min().date())
    end = c3.date_input("End", dates.max().date())

    try:
        result = stock_return_attribution(attribution, ticker, start, end)
        current_exp = latest_exposures(exposures, [ticker])
    except Exception as exc:
        st.error(str(exc))
        return

    k1, k2, k3, k4 = st.columns(4)
    k1.metric("Realized return", f"{result.total_return:.1%}")
    k2.metric("Factor attribution", f"{result.factor_return:.1%}")
    k3.metric("Specific attribution", f"{result.specific_return:.1%}")
    explained = abs(result.factor_return) / (
        abs(result.factor_return) + abs(result.specific_return) + 1e-12
    )
    k4.metric("Absolute attribution share: factors", f"{explained:.0%}")

    st.plotly_chart(
        attribution_waterfall(result.contributions, f"{ticker}: return attribution"),
        use_container_width=True,
    )

    left, right = st.columns(2)
    left.plotly_chart(
        cumulative_returns(result.daily, f"{ticker}: cumulative return paths"),
        use_container_width=True,
    )
    right.plotly_chart(
        exposure_bar(current_exp[["factor", "exposure"]], f"{ticker}: latest factor exposures"),
        use_container_width=True,
    )

    st.subheader("Attribution detail")
    display = result.contributions.copy()
    display["contribution"] = display["contribution"].map(lambda x: f"{x:.2%}")
    st.dataframe(display, use_container_width=True, hide_index=True)

    if abs(result.reconciliation_error) > 0.005:
        st.warning(
            "The compounded realized return and additive attribution do not fully reconcile. "
            "This is expected when daily arithmetic contributions are aggregated across a long period. "
            "A production version should use geometric linking."
        )
