from backend.core.config import DEFAULT_TELEMETRY_SAMPLES, LONG_RUN_MIN_LAPS
from backend.core.errors import NotFoundError
from backend.services.analytics import lap_summary, long_run_pace, telemetry_for_lap
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
    session = load_session(year, race, session_name)
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


def compare_long_runs(
    year,
    race,
    session_name,
    driver_a,
    stint_a,
    driver_b,
    stint_b,
    min_laps=LONG_RUN_MIN_LAPS,
):
    session = load_session(year, race, session_name)
    runs = long_run_pace(session.laps, min_laps=min_laps)
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
            "pace_dropoff_per_lap": optional_delta(first_run, second_run, "pace_dropoff_per_lap"),
            "tyre_degradation_per_lap": optional_delta(first_run, second_run, "tyre_degradation_per_lap"),
        },
    }


def optional_delta(first, second, key):
    if first[key] is None or second[key] is None:
        return None
    return rounded_or_none(second[key] - first[key])


def find_lap(laps, driver, lap_number):
    matches = laps.pick_drivers(driver)
    matches = matches[matches["LapNumber"] == float(lap_number)]
    if matches.empty:
        raise NotFoundError(f"No lap {lap_number} found for {driver}")
    return matches.iloc[0]


def find_run(runs, driver, stint):
    for run in runs:
        if run["driver"] == driver and int(run["stint"]) == int(stint):
            return run
    raise NotFoundError(f"No long run found for {driver} stint {stint}")

