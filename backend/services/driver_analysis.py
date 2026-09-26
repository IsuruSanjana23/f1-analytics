import pandas as pd

from backend.services.analytics import driver_laps, long_run_pace
from backend.services.fastf1_client import event_summary, load_session, session_summary
from backend.utils.filters import valid_push_laps, valid_timed_laps
from backend.utils.formatting import rounded_or_none, seconds_or_none, value_or_none


def analyze_driver(year, race, session_name, driver):
    session = load_session(year, race, session_name, telemetry=True)
    laps = session.laps.pick_drivers(driver)

    if laps.empty:
        raise ValueError(f"No laps found for driver {driver}")

    return {
        "driver": driver_summary(session, laps, driver),
        "event": event_summary(session),
        "session": session_summary(session),
        "summary": performance_summary(laps),
        "laps": driver_laps(session.laps, driver),
        "long_runs": long_run_pace(laps) if session_summary(session)["type"] == "race_pace" else [],
    }


def driver_summary(session, laps, driver):
    result = None
    try:
        driver_rows = session.results
    except Exception:
        driver_rows = None

    if driver_rows is not None and not driver_rows.empty:
        matches = driver_rows[driver_rows["Abbreviation"] == driver]
        if not matches.empty:
            result = matches.iloc[0]

    first_lap = laps.iloc[0]
    return {
        "code": driver,
        "number": value_or_none(
            result.get("DriverNumber") if result is not None else first_lap.get("DriverNumber")
        ),
        "full_name": value_or_none(result.get("FullName")) if result is not None else None,
        "team": value_or_none(
            result.get("TeamName") if result is not None else first_lap.get("Team")
        ),
    }


def performance_summary(laps):
    timed_laps = valid_timed_laps(laps)
    push_laps = valid_push_laps(laps)

    if timed_laps.empty:
        return {
            "lap_count": 0,
            "timed_lap_count": 0,
            "fastest_lap_seconds": None,
            "average_lap_seconds": None,
            "median_lap_seconds": None,
            "best_sector_1_seconds": None,
            "best_sector_2_seconds": None,
            "best_sector_3_seconds": None,
        }

    base = push_laps if not push_laps.empty else timed_laps
    lap_seconds = base["LapTime"].dt.total_seconds()

    return {
        "lap_count": int(len(laps)),
        "timed_lap_count": int(len(timed_laps)),
        "fastest_lap_seconds": rounded_or_none(lap_seconds.min()),
        "average_lap_seconds": rounded_or_none(lap_seconds.mean()),
        "median_lap_seconds": rounded_or_none(lap_seconds.median()),
        "best_sector_1_seconds": seconds_or_none(base["Sector1Time"].min()),
        "best_sector_2_seconds": seconds_or_none(base["Sector2Time"].min()),
        "best_sector_3_seconds": seconds_or_none(base["Sector3Time"].min()),
    }
