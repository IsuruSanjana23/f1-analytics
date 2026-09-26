from backend.core.config import DEFAULT_TELEMETRY_SAMPLES
from backend.services.analytics import lap_summary, telemetry_for_lap
from backend.services.fastf1_client import event_summary, load_session, session_summary
from backend.utils.formatting import rounded_or_none


def compare_laps(
    year,
    race,
    session_name,
    driver_a,
    lap_a,
    driver_b,
    lap_b,
    telemetry_samples=DEFAULT_TELEMETRY_SAMPLES,
):
    session = load_session(year, race, session_name, telemetry=True)
    first_lap = find_lap(session.laps, driver_a, lap_a)
    second_lap = find_lap(session.laps, driver_b, lap_b)

    first_summary = lap_summary(first_lap)
    second_summary = lap_summary(second_lap)

    return {
        "event": event_summary(session),
        "session": session_summary(session),
        "lap_a": {
            "summary": first_summary,
            "telemetry": telemetry_for_lap(first_lap, telemetry_samples),
        },
        "lap_b": {
            "summary": second_summary,
            "telemetry": telemetry_for_lap(second_lap, telemetry_samples),
        },
        "delta": {
            "lap_time_seconds": rounded_or_none(
                second_summary["lap_time_seconds"] - first_summary["lap_time_seconds"]
            )
            if first_summary["lap_time_seconds"] and second_summary["lap_time_seconds"]
            else None
        },
    }


def compare_long_runs(year, race, session_name, driver_a, stint_a, driver_b, stint_b):
    from backend.services.analytics import long_run_pace

    session = load_session(year, race, session_name, telemetry=False)
    runs = long_run_pace(session.laps)
    first_run = find_run(runs, driver_a, stint_a)
    second_run = find_run(runs, driver_b, stint_b)

    return {
        "event": event_summary(session),
        "session": session_summary(session),
        "run_a": first_run,
        "run_b": second_run,
        "delta": {
            "average_pace_seconds": rounded_or_none(
                second_run["average_pace_seconds"] - first_run["average_pace_seconds"]
            ),
            "median_pace_seconds": rounded_or_none(
                second_run["median_pace_seconds"] - first_run["median_pace_seconds"]
            ),
            "pace_dropoff_per_lap": rounded_or_none(
                second_run["pace_dropoff_per_lap"] - first_run["pace_dropoff_per_lap"]
            )
            if second_run["pace_dropoff_per_lap"] is not None
            and first_run["pace_dropoff_per_lap"] is not None
            else None,
        },
    }


def find_lap(laps, driver, lap_number):
    matches = laps.pick_drivers(driver)
    matches = matches[matches["LapNumber"] == float(lap_number)]
    if matches.empty:
        raise ValueError(f"No lap {lap_number} found for {driver}")
    return matches.iloc[0]


def find_run(runs, driver, stint):
    for run in runs:
        if run["driver"] == driver and int(run["stint"]) == int(stint):
            return run
    raise ValueError(f"No long run found for {driver} stint {stint}")

