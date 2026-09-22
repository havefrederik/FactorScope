"""Preserve the pinned Cvxportfolio observations in a compact browser dataset.

Usage: python3 scripts/prepare-published-dow.py /path/to/original/source/files
Download the two JSON files and LICENSE from SOURCE_COMMIT before running.
No return reconstruction, rescaling, rounding or allocation optimization occurs.
"""
import hashlib
import json
from pathlib import Path
import sys

SOURCE_COMMIT = "351c782b9b8b395c1a5f886b77e0d55f1bc9396e"
source = Path(sys.argv[1])
root = Path(__file__).resolve().parents[1]
names = ["dow30_daily_initial_holdings.json", "dow30_daily_target_weights.json"]
records = [json.loads((source / name).read_text()) for name in names]
tickers = sorted({ticker for record in records for row in record.values() for ticker in row})
data = {
    "sourceCommit": SOURCE_COMMIT,
    "sourceRepository": "https://github.com/cvxgrp/cvxportfolio",
    "sourceFiles": [{"path": "examples/strategies/" + name,
                     "sha256": hashlib.sha256((source / name).read_bytes()).hexdigest()} for name in names],
    "attribution": "Enzo Busseti and the Cvxportfolio authors; GPL-3.0-or-later",
    "conversion": "Original dollar holdings and target fractions, without rounding. Absent ticker entries are zero. Dates are original exchange-opening dates. Source timestamps retained.",
    "tickers": tickers,
}
for record, dates, timestamps, values in zip(records, ["holdingDates", "targetDates"], ["holdingTimestamps", "targetTimestamps"], ["holdings", "targets"]):
    keys = sorted(record)
    data[dates] = [date[:10] for date in keys]
    data[timestamps] = keys
    data[values] = [[record[date].get(ticker, 0) for ticker in tickers] for date in keys]
    assert len(data[dates]) == len(set(data[dates]))
    for date, row in zip(keys, data[values]):
        assert all(row[tickers.index(ticker)] == value for ticker, value in record[date].items())
out = root / "public/data"
out.mkdir(parents=True, exist_ok=True)
(out / "published-dow.json").write_text(json.dumps(data, separators=(",", ":"), allow_nan=False) + "\n")
(out / "cvxportfolio-LICENSE.txt").write_bytes((source / "LICENSE").read_bytes())
print(f"Preserved {len(data['holdingDates'])} holdings and {len(data['targetDates'])} target dates across {len(tickers)} symbols.")
