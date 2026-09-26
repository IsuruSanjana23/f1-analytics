from backend.services.analytics import (
    fastest_laps,
    lap_summary,
    long_run_pace,
    top_speed_for_lap,
    top_speeds,
    tyre_summary,
)
from backend.services.fastf1_client import event_summary, load_session, session_summary
from backend.utils.filters import valid_push_laps
from backend.utils.formatting import value_or_none


def analyze_session(year, race, session_name):
    session = load_session(year, race, session_name, telemetry=True)

    return {
        "event": event_summary(session),
        "session": session_summary(session),
        "drivers": available_drivers(session),
        "fastest_laps": fastest_laps(session.laps),
        "top_speeds": top_speeds(session.laps),
        "long_runs": long_run_pace(session.laps),
        "tyre_summary": tyre_summary(session.laps),
    }


def analyze_qualifying(year, race, session_name):
    session = load_session(year, race, session_name, telemetry=True)
    attempts = qualifying_attempts(session.laps)

    return {
        "event": event_summary(session),
        "session": session_summary(session),
        "drivers": available_drivers(session),
        "best_laps": fastest_laps(session.laps),
        "top_speeds": top_speeds(session.laps),
        "attempts": attempts,
    }


def qualifying_attempts(laps):
    attempts = []
    quick_laps = valid_push_laps(laps).sort_values(["Driver", "LapTime"])

    if quick_laps.empty:
        return attempts

    session_best = quick_laps["LapTime"].min().total_seconds()

    for _, lap in quick_laps.iterlaps():
        summary = lap_summary(lap, top_speed_for_lap(lap))
        summary["gap_to_session_best"] = round(
            summary["lap_time_seconds"] - session_best,
            3,
        )
        attempts.append(summary)

    return attempts


def available_drivers(session):
    drivers = []
    # Some completed sessions have complete lap timing before FastF1 exposes
    # the separate results dataset. Laps still contain enough driver metadata.
    try:
        driver_rows = session.results
    except Exception:
        driver_rows = None

    if driver_rows is not None and not driver_rows.empty:
        for _, driver in driver_rows.iterrows():
            drivers.append(
                {
                    "code": value_or_none(driver.get("Abbreviation")),
                    "number": value_or_none(driver.get("DriverNumber")),
                    "full_name": value_or_none(driver.get("FullName")),
                    "team": value_or_none(driver.get("TeamName")),
                }
            )
        return drivers

    for driver_code in sorted(session.laps["Driver"].dropna().unique()):
        driver_laps = session.laps.pick_drivers(driver_code)
        first_lap = driver_laps.iloc[0]
        drivers.append(
            {
                "code": value_or_none(driver_code),
                "number": value_or_none(first_lap.get("DriverNumber")),
                "full_name": None,
                "team": value_or_none(first_lap.get("Team")),
            }
        )

    return drivers
