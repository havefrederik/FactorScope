# Upgrade to FactorScope Web v2

1. Delete the old `pages/` folder from the GitHub repository.
2. Upload every file and folder from this release into the repository root.
3. Allow GitHub to replace files with matching names.
4. Commit with: `Upgrade FactorScope website to v2`.
5. Streamlit Community Cloud should redeploy automatically.

## Improvements

- Removes Streamlit's unwanted automatic page list.
- Keeps one controlled navigation menu.
- Adds a Model Diagnostics page.
- Supports the actual V9 wide exposure output.
- Supports the actual V9 walk-forward evaluation output.
- Defaults to EWLS-126 when that model is available.
- Keeps licensed and proprietary research data upload-only.
