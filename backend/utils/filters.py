import pandas as pd

from backend.core.config import LONG_RUN_MAX_SLOWER_THAN_FASTEST_PCT


def has_lap_time(lap):
    return "LapTime" in lap and not pd.isna(lap["LapTime"])


def is_deleted_lap(lap):
    if "Deleted" not in lap or pd.isna(lap["Deleted"]):
        return False
    return bool(lap["Deleted"])


def is_in_lap(lap):
    return "PitInTime" in lap and not pd.isna(lap["PitInTime"])


def is_out_lap(lap):
    return "PitOutTime" in lap and not pd.isna(lap["PitOutTime"])


def valid_timed_laps(laps):
    filtered = laps[laps["LapTime"].notna()]

    if "Deleted" in filtered.columns:
        filtered = filtered[~filtered["Deleted"].eq(True)]

    return filtered


def valid_push_laps(laps):
    filtered = valid_timed_laps(laps)

    if "PitInTime" in filtered.columns:
        filtered = filtered[filtered["PitInTime"].isna()]
    if "PitOutTime" in filtered.columns:
        filtered = filtered[filtered["PitOutTime"].isna()]

    try:
        return filtered.pick_quicklaps()
    except Exception:
        return filtered


def classify_lap(lap, driver_fastest_seconds=None):
    if not has_lap_time(lap):
        return "unknown"
    if is_deleted_lap(lap):
        return "deleted_lap"
    if is_out_lap(lap):
        return "out_lap"
    if is_in_lap(lap):
        return "in_lap"

    lap_seconds = lap["LapTime"].total_seconds()
    if driver_fastest_seconds and lap_seconds > (
        driver_fastest_seconds * LONG_RUN_MAX_SLOWER_THAN_FASTEST_PCT
    ):
        return "slow_lap"

    return "push_lap"


def long_run_candidate_laps(laps):
    filtered = valid_timed_laps(laps)

    if "PitInTime" in filtered.columns:
        filtered = filtered[filtered["PitInTime"].isna()]
    if "PitOutTime" in filtered.columns:
        filtered = filtered[filtered["PitOutTime"].isna()]

    return filtered
