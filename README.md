# FactorScope

FactorScope is a web-based factor and idiosyncratic return intelligence tool for
fundamental investors.

It helps distinguish between:

- return associated with broad systematic factors;
- company-specific or residual return;
- hidden factor concentration across a portfolio;
- first-order exposure to market and style-factor scenarios.

## Current status

This repository is the first deployable website release. It includes:

- stock return attribution;
- portfolio return attribution;
- portfolio factor exposures;
- factor-shock scenarios;
- demo data;
- CSV/Parquet uploads;
- tests;
- a Streamlit interface.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
streamlit run app.py
```

## Data contracts

### Daily attribution

Preferred long format:

```csv
date,ticker,factor,contribution,actual_return,specific_return
2024-01-02,AAPL,MKT,0.004,0.012,0.006
2024-01-02,AAPL,MOM,0.002,0.012,0.006
```

The `actual_return` and `specific_return` values may repeat across factor rows
for the same security/date.

### Exposures

```csv
as_of_date,ticker,factor,exposure
2024-12-31,AAPL,MKT,1.10
2024-12-31,AAPL,HML,-0.45
```

### Portfolio

```csv
ticker,weight
AAPL,0.30
MSFT,0.25
```

Weights are normalized automatically.

## Deploy free on Streamlit Community Cloud

1. Create a public GitHub repository.
2. Push this project.
3. Sign in to Streamlit Community Cloud using GitHub.
4. Select the repository, branch and `app.py`.
5. Deploy.

No paid service is required for an employer-facing demonstration using the
included demo data.

## Next engineering milestones

1. Add an adapter for the exact FactorScope V9 output schema.
2. Implement geometric multi-period attribution.
3. Add factor and specific risk decomposition from stored covariance estimates.
4. Add historical exposure charts and confidence diagnostics.
5. Add caching and a data manifest.
6. Add CI with GitHub Actions.
7. Add a polished landing page and project case study.

## Important interpretation note

Specific return is not automatically investor skill. It can contain company
news, omitted factors, model misspecification and noise. FactorScope supports
fundamental judgment; it does not replace it.
