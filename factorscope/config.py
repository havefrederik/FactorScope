from __future__ import annotations

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
DEMO_DIR = DATA_DIR / "demo"

DEFAULT_TRADING_DAYS = 252
DEFAULT_FACTOR_ORDER = [
    "MKT", "SMB", "HML", "RMW", "CMA", "MOM", "STREV", "LTREV", "INDUSTRY"
]
