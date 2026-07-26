from __future__ import annotations

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go


def attribution_waterfall(contributions: pd.DataFrame, title: str) -> go.Figure:
    data = contributions.copy()
    data = data[data["contribution"].abs() > 1e-12]
    fig = go.Figure(
        go.Waterfall(
            orientation="v",
            measure=["relative"] * len(data) + ["total"],
            x=data["factor"].tolist() + ["Attributed total"],
            y=data["contribution"].tolist() + [0],
            connector={"line": {"width": 1}},
        )
    )
    fig.update_layout(title=title, yaxis_tickformat=".1%", showlegend=False)
    return fig


def contribution_bar(data: pd.DataFrame, x: str, y: str, title: str):
    fig = px.bar(data, x=x, y=y, title=title)
    fig.update_layout(yaxis_tickformat=".1%")
    return fig


def exposure_bar(data: pd.DataFrame, title: str):
    fig = px.bar(data, x="factor", y="exposure", title=title)
    fig.add_hline(y=0, line_width=1)
    return fig


def cumulative_returns(daily: pd.DataFrame, title: str):
    data = daily.copy().sort_values("date")
    for col in ["actual_return", "factor_return", "specific_return"]:
        data[f"cum_{col}"] = (1 + data[col].fillna(0)).cumprod() - 1
    long = data.melt(
        id_vars="date",
        value_vars=["cum_actual_return", "cum_factor_return", "cum_specific_return"],
        var_name="series",
        value_name="return",
    )
    long["series"] = long["series"].str.replace("cum_", "").str.replace("_", " ").str.title()
    fig = px.line(long, x="date", y="return", color="series", title=title)
    fig.update_layout(yaxis_tickformat=".1%")
    return fig
