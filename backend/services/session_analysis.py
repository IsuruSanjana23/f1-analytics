from backend.services.analytics import (
    fastest_laps,
    lap_summary,
    lap_top_speed,
    long_run_pace,
    top_speeds,
    top_speeds_by_lap,
    tyre_summary,
)
from backend.services.fastf1_client import event_summary, load_session, session_summary
from backend.utils.filters import valid_push_laps
from backend.utils.formatting import value_or_none


def analyze_session(year, race, session_name):
    session = load_session(year, race, session_name)
    speeds = top_speeds_by_lap(session.laps)

    return {
        "event": event_summary(session),
        "session": session_summary(session),
        "drivers": available_drivers(session),
        "fastest_laps": fastest_laps(session.laps, speeds),
        "top_speeds": top_speeds(session.laps, speeds),
        "long_runs": long_run_pace(session.laps),
        "tyre_summary": tyre_summary(session.laps),
    }


def analyze_qualifying(year, race, session_name):
    session = load_session(year, race, session_name)
    speeds = top_speeds_by_lap(session.laps)
    attempts = qualifying_attempts(session.laps, speeds)

    return {
        "event": event_summary(session),
        "session": session_summary(session),
        "drivers": available_drivers(session),
        "best_laps": fastest_laps(session.laps, speeds),
        "top_speeds": top_speeds(session.laps, speeds),
        "segments": segment_classification(attempts),
        "attempts": attempts,
    }


def qualifying_segment_labels(laps):
    """Map each lap's index to its segment ("Q1".."Q3", or "SQ1".."SQ3" for sprint qualifying).

    Returns an empty mapping when FastF1 cannot split the session (missing
    session status data, or not a qualifying session).
    """
    try:
        parts = laps.split_qualifying_sessions()
    except Exception:
        return {}
    prefix = "SQ" if "sprint" in str(laps.session.name).lower() else "Q"
    labels = {}
    for number, part in enumerate(parts, start=1):
        if part is not None:
            labels.update(dict.fromkeys(part.index, f"{prefix}{number}"))
    return labels


def qualifying_attempts(laps, speeds=None):
    speeds = top_speeds_by_lap(laps) if speeds is None else speeds
    attempts = []
    quick_laps = valid_push_laps(laps).sort_values(["Driver", "LapTime"])

    if quick_laps.empty:
        return attempts

    session_best = quick_laps["LapTime"].min().total_seconds()
    segments = qualifying_segment_labels(laps)
    segment_best = {}
    for index, lap in quick_laps.iterrows():
        segment = segments.get(index)
        if segment:
            seconds = lap["LapTime"].total_seconds()
            segment_best[segment] = min(seconds, segment_best.get(segment, seconds))

    for index, lap in quick_laps.iterlaps():
        summary = lap_summary(lap, lap_top_speed(lap, speeds))
        summary["gap_to_session_best"] = round(summary["lap_time_seconds"] - session_best, 3)
        summary["segment"] = segments.get(index)
        summary["gap_to_segment_best"] = (
            round(summary["lap_time_seconds"] - segment_best[summary["segment"]], 3)
            if summary["segment"] in segment_best
            else None
        )
        attempts.append(summary)

    return attempts


def segment_classification(attempts):
    """Rank each driver's best attempt within every qualifying segment."""
    best = {}
    for attempt in attempts:
        segment = attempt["segment"]
        if not segment:
            continue
        current = best.setdefault(segment, {}).get(attempt["driver"])
        if current is None or attempt["lap_time_seconds"] < current["lap_time_seconds"]:
            best[segment][attempt["driver"]] = attempt

    classification = []
    for segment in sorted(best):
        ranked = sorted(best[segment].values(), key=lambda item: item["lap_time_seconds"])
        leader = ranked[0]["lap_time_seconds"]
        classification.append(
            {
                "segment": segment,
                "results": [
                    {
                        "position": position,
                        "driver": attempt["driver"],
                        "team": attempt["team"],
                        "lap_number": attempt["lap_number"],
                        "lap_time_seconds": attempt["lap_time_seconds"],
                        "gap_to_segment_best": round(attempt["lap_time_seconds"] - leader, 3),
                        "compound": attempt["compound"],
                    }
                    for position, attempt in enumerate(ranked, start=1)
                ],
            }
        )
    return classification


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
