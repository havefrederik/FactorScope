from __future__ import annotations

from pathlib import Path
import pandas as pd
import streamlit as st

from factorscope.config import DEMO_DIR
from factorscope.io import read_table


def load_attribution_widget() -> pd.DataFrame:
    upload = st.sidebar.file_uploader(
        "Daily attribution data",
        type=["csv", "parquet"],
        key="attribution_upload",
        help="Long form: date, ticker, factor, contribution. CSV or Parquet.",
    )
    if upload is not None:
        return read_table(upload, upload.name)
    return pd.read_csv(DEMO_DIR / "daily_attribution.csv")


def load_exposures_widget() -> pd.DataFrame:
    upload = st.sidebar.file_uploader(
        "Exposure estimates",
        type=["csv", "parquet"],
        key="exposure_upload",
        help="Long form: ticker, factor, exposure, and optionally as_of_date.",
    )
    if upload is not None:
        return read_table(upload, upload.name)
    return pd.read_csv(DEMO_DIR / "exposures.csv")
