from __future__ import annotations

import streamlit as st


def render() -> None:
    st.title("Methodology")

    st.markdown(
        r"""
### Purpose

FactorScope is an investor decision-support tool. It helps answer:

1. How much of a stock or portfolio return was associated with common factors?
2. How much was company-specific?
3. What systematic exposures are currently embedded in the portfolio?
4. How might a simple factor shock affect the position?

### Return attribution

For security \(i\):

\[
r_{i,t} = \alpha_i + \beta_i^\top f_t + \epsilon_{i,t}
\]

The application reports daily factor contributions \(\beta_{i} f_t\) and the
residual or specific return \(\epsilon_{i,t}\).

### Portfolio aggregation

For weights \(w_i\):

\[
\beta_p = \sum_i w_i \beta_i
\]

and return contributions are aggregated using the same portfolio weights.

### Interpretation

A high factor contribution does not imply that the investment thesis was wrong.
It shows how much of the observed outcome was shared with broad systematic return
drivers. The specific component is not automatically skill: it also contains
news, measurement error and omitted factors.

### Current limitations

- The included application uses additive attribution over the selected period.
- Long-horizon production reports should use geometric linking.
- Scenario analysis is linear and does not model changing betas or nonlinear payoffs.
- Industry factors can improve interpretation without necessarily improving risk forecasts.
- Results are model-dependent and should be paired with fundamental research.
"""
    )
