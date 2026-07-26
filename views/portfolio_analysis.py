from __future__ import annotations

import pandas as pd
import streamlit as st

from factorscope.analytics import (
    portfolio_exposures,
    portfolio_return_attribution,
)
from factorscope.charts import contribution_bar, exposure_bar
from factorscope.config import DEMO_DIR
from factorscope.io import read_portfolio
from .common import load_attribution_widget, load_exposures_widget


def render() -> None:
    st.title("Portfolio Analysis")
    st.write(
        "Reveal hidden common-factor bets and separate portfolio return contribution "
        "from company-specific contribution."
    )

    attribution = load_attribution_widget()
    exposures = load_exposures_widget()

    upload = st.sidebar.file_uploader(
        "Portfolio holdings",
        type=["csv"],
        key="portfolio_upload",
        help="CSV columns: ticker, weight. Weights are normalized automatically.",
    )
    portfolio = read_portfolio(upload) if upload is not None else pd.read_csv(
        DEMO_DIR / "sample_portfolio.csv"
    )

    dates = pd.to_datetime(attribution["date"], errors="coerce")
    c1, c2 = st.columns(2)
    start = c1.date_input("Start", dates.min().date(), key="pstart")
    end = c2.date_input("End", dates.max().date(), key="pend")

    try:
        exposure_summary = portfolio_exposures(exposures, portfolio)
        detail = portfolio_return_attribution(attribution, portfolio, start, end)
    except Exception as exc:
        st.error(str(exc))
        return

    factor_summary = (
        detail.groupby("factor", as_index=False)["weighted_contribution"].sum()
        .sort_values("weighted_contribution", key=lambda s: s.abs(), ascending=False)
    )
    position_summary = (
        detail.groupby("ticker", as_index=False)["weighted_contribution"].sum()
        .sort_values("weighted_contribution", key=lambda s: s.abs(), ascending=False)
    )

    factor_total = factor_summary.loc[
        factor_summary["factor"] != "SPECIFIC", "weighted_contribution"
    ].sum()
    specific_total = factor_summary.loc[
        factor_summary["factor"] == "SPECIFIC", "weighted_contribution"
    ].sum()

    k1, k2, k3 = st.columns(3)
    k1.metric("Attributed portfolio return", f"{factor_summary['weighted_contribution'].sum():.1%}")
    k2.metric("Factor contribution", f"{factor_total:.1%}")
    k3.metric("Specific contribution", f"{specific_total:.1%}")

    left, right = st.columns(2)
    left.plotly_chart(
        exposure_bar(exposure_summary, "Portfolio factor exposures"),
        use_container_width=True,
    )
    right.plotly_chart(
        contribution_bar(
            factor_summary,
            "factor",
            "weighted_contribution",
            "Portfolio return attribution",
        ),
        use_container_width=True,
    )

    st.plotly_chart(
        contribution_bar(
            position_summary,
            "ticker",
            "weighted_contribution",
            "Position-level contribution",
        ),
        use_container_width=True,
    )

    st.subheader("Current holdings")
    holdings = portfolio.copy()
    holdings["weight"] = holdings["weight"].map(lambda x: f"{x:.1%}")
    st.dataframe(holdings, use_container_width=True, hide_index=True)

    st.subheader("Detailed attribution")
    st.dataframe(detail, use_container_width=True, hide_index=True)

    st.download_button(
        "Download attribution CSV",
        detail.to_csv(index=False).encode(),
        file_name="portfolio_attribution.csv",
        mime="text/csv",
    )
