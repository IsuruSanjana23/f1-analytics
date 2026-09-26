import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = PROJECT_ROOT / "cache" / "fastf1"

DEFAULT_START_YEAR = 2018
DEFAULT_TELEMETRY_SAMPLES = 160
LONG_RUN_MIN_LAPS = 4
LONG_RUN_MAX_SLOWER_THAN_FASTEST_PCT = 1.07


# Loaded sessions (laps + telemetry) are large; keep the in-memory LRU small.
SESSION_CACHE_SIZE = int(os.getenv("F1_SESSION_CACHE_SIZE", "8"))
