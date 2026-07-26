from __future__ import annotations

import streamlit as st

from factorscope.demo import ensure_demo_data
from views.stock_analysis import render as render_stock
from views.portfolio_analysis import render as render_portfolio
from views.scenario_analysis import render as render_scenarios
from views.model_diagnostics import render as render_diagnostics
from views.methodology import render as render_methodology

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
    [
        "Stock Analysis",
        "Portfolio Analysis",
        "Scenario Analysis",
        "Model Diagnostics",
        "Methodology",
    ],
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
elif page == "Model Diagnostics":
    render_diagnostics()
else:
    render_methodology()
