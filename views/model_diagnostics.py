from __future__ import annotations

import pandas as pd
import plotly.express as px
import streamlit as st

from factorscope.io import read_table
from factorscope.v9_adapter import (
    V9Selection,
    adapt_v9_exposures,
    available_values,
    filter_v9_walk_forward,
)


def choose(label: str, values: list[str], preferred: str, key: str) -> str:
    if not values:
        return preferred
    index = values.index(preferred) if preferred in values else 0
    return st.selectbox(label, values, index=index, key=key)


def render() -> None:
    st.title("Model Diagnostics")
    st.write(
        "Upload the actual FactorScope V9 outputs to inspect exposure history "
        "and forecast-versus-realized volatility."
    )

    exposure_upload = st.file_uploader(
        "V9 exposure estimates",
        type=["csv", "parquet"],
        help="Use exposure_estimates.csv or exposure_estimates.parquet.",
    )
    walk_upload = st.file_uploader(
        "V9 walk-forward evaluation",
        type=["csv", "parquet"],
        help="Use walk_forward_evaluation.csv or walk_forward_evaluation.parquet.",
    )

    if exposure_upload is None:
        st.info(
            "Upload the V9 exposure file to activate this page. "
            "Research data stays out of the public repository."
        )
        return

    try:
        raw_exp = read_table(exposure_upload, exposure_upload.name)
        exposure_model = choose(
            "Exposure model",
            available_values(raw_exp, "exposure_model"),
            "EWLS_126",
            "v9_exposure_model",
        )
        industry_model = choose(
            "Industry layer",
            available_values(raw_exp, "industry_model"),
            "NO_INDUSTRY",
            "v9_industry_model",
        )
        exp = adapt_v9_exposures(raw_exp, exposure_model, industry_model)
    except Exception as exc:
        st.error(str(exc))
        return

    wf = None
    if walk_upload is not None:
        try:
            raw_wf = read_table(walk_upload, walk_upload.name)
            c1, c2, c3 = st.columns(3)
            with c1:
                covariance_model = choose(
                    "Covariance model",
                    available_values(raw_wf, "covariance_model"),
                    "EWMA_126",
                    "v9_covariance",
                )
            with c2:
                specific_model = choose(
                    "Specific-risk model",
                    available_values(raw_wf, "specific_risk_model"),
                    "SPEC_STRESS_EWMA_126",
                    "v9_specific",
                )
            with c3:
                overlay = choose(
                    "Risk overlay",
                    available_values(raw_wf, "risk_overlay"),
                    "FACTOR_STRESS_OVERLAY",
                    "v9_overlay",
                )
            wf = filter_v9_walk_forward(
                raw_wf,
                V9Selection(
                    exposure_model=exposure_model,
                    industry_model=industry_model,
                    covariance_model=covariance_model,
                    specific_risk_model=specific_model,
                    risk_overlay=overlay,
                ),
                industry_model,
            )
        except Exception as exc:
            st.warning(f"Walk-forward output could not be loaded: {exc}")

    securities = sorted(exp["ticker"].astype(str).unique())
    security = st.selectbox("Security identifier (PERMNO)", securities)
    history = exp[exp["ticker"].astype(str) == str(security)].sort_values("asof_date")
    latest_date = history["asof_date"].max()
    current = history[history["asof_date"] == latest_date]

    r2 = current["r2"].dropna().iloc[0] if "r2" in current and current["r2"].notna().any() else None
    specific_vol = (
        current["specific_vol_annualized"].dropna().iloc[0]
        if "specific_vol_annualized" in current
        and current["specific_vol_annualized"].notna().any()
        else None
    )

    predicted_vol = None
    realized_vol = None
    sec_wf = pd.DataFrame()
    if wf is not None and not wf.empty:
        sec_wf = wf[wf["permno"].astype(str) == str(security)].sort_values("asof_date")
        if not sec_wf.empty:
            last = sec_wf.iloc[-1]
            predicted_vol = last.get("predicted_vol_annualized")
            realized_vol = last.get("realized_vol_annualized")

    k1, k2, k3, k4 = st.columns(4)
    k1.metric("As-of date", latest_date.strftime("%Y-%m-%d"))
    k2.metric("Regression R²", "—" if r2 is None else f"{float(r2):.1%}")
    k3.metric("Specific volatility", "—" if specific_vol is None else f"{float(specific_vol):.1%}")
    k4.metric("Predicted volatility", "—" if predicted_vol is None else f"{float(predicted_vol):.1%}")

    current_fig = px.bar(
        current,
        x="factor",
        y="exposure",
        title=f"{security}: current factor exposures",
    )
    current_fig.add_hline(y=0, line_width=1)
    st.plotly_chart(current_fig, use_container_width=True)

    history_fig = px.line(
        history,
        x="asof_date",
        y="exposure",
        color="factor",
        title=f"{security}: exposure history",
    )
    st.plotly_chart(history_fig, use_container_width=True)

    if not sec_wf.empty:
        vol_cols = [
            c for c in [
                "predicted_systematic_vol_annualized",
                "predicted_specific_vol_annualized",
                "predicted_vol_annualized",
                "realized_vol_annualized",
            ] if c in sec_wf.columns
        ]
        long = sec_wf.melt(
            id_vars="asof_date",
            value_vars=vol_cols,
            var_name="series",
            value_name="volatility",
        )
        long["series"] = (
            long["series"].str.replace("_annualized", "", regex=False)
            .str.replace("_", " ", regex=False).str.title()
        )
        vol_fig = px.line(
            long,
            x="asof_date",
            y="volatility",
            color="series",
            title=f"{security}: forecast versus realized volatility",
        )
        vol_fig.update_layout(yaxis_tickformat=".1%")
        st.plotly_chart(vol_fig, use_container_width=True)
        st.dataframe(sec_wf, use_container_width=True, hide_index=True)
    else:
        st.info("Upload the V9 walk-forward file to add volatility calibration diagnostics.")

    st.subheader("Exposure history data")
    st.dataframe(history, use_container_width=True, hide_index=True)
