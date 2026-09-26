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

# Comma-separated list of browser origins allowed to call the API.
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("F1_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if origin.strip()
]
