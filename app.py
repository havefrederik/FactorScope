from __future__ import annotations

import streamlit as st

from factorscope.demo import ensure_demo_data
from pages.stock_analysis import render as render_stock
from pages.portfolio_analysis import render as render_portfolio
from pages.scenario_analysis import render as render_scenarios
from pages.methodology import render as render_methodology

st.set_page_config(
    page_title="FactorScope",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded",
)

ensure_demo_data()

st.sidebar.title("FactorScope")
st.sidebar.caption("Factor and idiosyncratic return intelligence for fundamental investors")

page = st.sidebar.radio(
    "Navigate",
    ["Stock Analysis", "Portfolio Analysis", "Scenario Analysis", "Methodology"],
)

st.sidebar.divider()
st.sidebar.caption(
    "Investor decision-support only. Results depend on the selected model, "
    "factor definitions, data quality and estimation window."
)

if page == "Stock Analysis":
    render_stock()
elif page == "Portfolio Analysis":
    render_portfolio()
elif page == "Scenario Analysis":
    render_scenarios()
else:
    render_methodology()
