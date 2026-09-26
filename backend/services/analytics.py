import numpy as np
import pandas as pd

from backend.core.config import LONG_RUN_MAX_SLOWER_THAN_FASTEST_PCT, LONG_RUN_MIN_LAPS
from backend.utils.filters import (
    classify_lap,
    long_run_candidate_laps,
    valid_push_laps,
    valid_timed_laps,
)
from backend.utils.formatting import rounded_or_none, seconds_or_none, value_or_none


def lap_summary(lap, top_speed=None, driver_fastest_seconds=None):
    lap_time = seconds_or_none(lap.get("LapTime"))
    return {
        "driver": value_or_none(lap.get("Driver")),
        "driver_number": value_or_none(lap.get("DriverNumber")),
        "team": value_or_none(lap.get("Team")),
        "lap_number": value_or_none(lap.get("LapNumber")),
        "lap_time_seconds": lap_time,
        "sector_1_seconds": seconds_or_none(lap.get("Sector1Time")),
        "sector_2_seconds": seconds_or_none(lap.get("Sector2Time")),
        "sector_3_seconds": seconds_or_none(lap.get("Sector3Time")),
        "compound": value_or_none(lap.get("Compound")),
        "tyre_life": value_or_none(lap.get("TyreLife")),
        "fresh_tyres": value_or_none(lap.get("FreshTyre")),
        "stint": value_or_none(lap.get("Stint")),
        "pit_in": not pd.isna(lap.get("PitInTime")),
        "pit_out": not pd.isna(lap.get("PitOutTime")),
        "deleted": bool(lap.get("Deleted")) if not pd.isna(lap.get("Deleted")) else False,
        "top_speed": top_speed,
        "classification": classify_lap(lap, driver_fastest_seconds),
    }


def telemetry_for_lap(lap, sample_size=None):
    telemetry = lap.get_car_data().add_distance()
    try:
        position = lap.get_pos_data()
        if (
            isinstance(position, pd.DataFrame)
            and {"Time", "X", "Y"}.issubset(position.columns)
            and "Time" in telemetry.columns
        ):
            telemetry = pd.merge_asof(
                telemetry.sort_values("Time"),
                position[["Time", "X", "Y"]].sort_values("Time"),
                on="Time",
                direction="nearest",
            )
    except Exception:
        # Position samples are optional in FastF1; timing telemetry remains useful without them.
        pass
    columns = ["Distance", "Speed", "RPM", "nGear", "Throttle", "Brake", "DRS", "X", "Y"]
    columns = [column for column in columns if column in telemetry.columns]
    telemetry = telemetry[columns].dropna(subset=["Distance"])

    if sample_size and len(telemetry) > sample_size:
        indices = np.linspace(0, len(telemetry) - 1, sample_size, dtype=int)
        telemetry = telemetry.iloc[indices]

    return [
        {
            "distance": rounded_or_none(row["Distance"]),
            "speed": value_or_none(row["Speed"]),
            "rpm": value_or_none(row["RPM"]),
            "gear": value_or_none(row["nGear"]),
            "throttle": value_or_none(row["Throttle"]),
            "brake": value_or_none(row["Brake"]),
            "drs": value_or_none(row["DRS"]),
            "x": rounded_or_none(row.get("X")),
            "y": rounded_or_none(row.get("Y")),
        }
        for row in telemetry.to_dict(orient="records")
    ]


def track_layout_for_session(laps, sample_size=500):
    """Return a representative lap's raw position trace for the circuit map."""
    candidates = valid_timed_laps(laps)
    if candidates.empty:
        return []

    fastest = candidates.pick_fastest()
    if fastest is None:
        return []

    try:
        positions = fastest.get_pos_data()
        if not isinstance(positions, pd.DataFrame) or not {"X", "Y"}.issubset(positions.columns):
            return []
        positions = positions[["X", "Y"]].dropna()
        if sample_size and len(positions) > sample_size:
            indices = np.linspace(0, len(positions) - 1, sample_size, dtype=int)
            positions = positions.iloc[indices]
        total = max(1, len(positions) - 1)
        return [
            {"x": rounded_or_none(row["X"]), "y": rounded_or_none(row["Y"]), "progress": round(index / total, 6)}
            for index, row in enumerate(positions.to_dict(orient="records"))
        ]
    except Exception:
        return []


def top_speeds_by_lap(laps):
    """Map (driver, lap_number) to the lap's top speed.

    Scans each driver's session car data once instead of slicing it per lap
    via ``Lap.get_car_data()``, which dominated request time. Lap windows are
    the same closed [LapStartTime, Time] interval FastF1 uses when slicing.
    """
    speeds = {}
    try:
        car_data = laps.session.car_data
    except Exception:
        return speeds

    required = {"Driver", "DriverNumber", "LapNumber", "LapStartTime", "Time"}
    if not required.issubset(laps.columns):
        return speeds

    for driver_number, driver_laps in laps.groupby("DriverNumber"):
        data = car_data.get(str(driver_number))
        if data is None or data.empty or not {"SessionTime", "Speed"}.issubset(data.columns):
            continue
        data = data.dropna(subset=["SessionTime"]).sort_values("SessionTime")
        times = data["SessionTime"].to_numpy()
        values = data["Speed"].to_numpy()

        windows = driver_laps.dropna(subset=["LapStartTime", "Time"])
        starts = np.searchsorted(times, windows["LapStartTime"].to_numpy(), side="left")
        ends = np.searchsorted(times, windows["Time"].to_numpy(), side="right")
        for driver, lap_number, start, end in zip(windows["Driver"], windows["LapNumber"], starts, ends, strict=True):
            if end > start:
                speeds[(driver, lap_number)] = value_or_none(np.nanmax(values[start:end]))

    return speeds


def lap_top_speed(lap, speeds):
    return speeds.get((lap.get("Driver"), lap.get("LapNumber")))


def driver_fastest_seconds(laps, driver):
    driver_laps = valid_push_laps(laps.pick_drivers(driver))
    if driver_laps.empty:
        return None
    fastest = driver_laps["LapTime"].min()
    return seconds_or_none(fastest)


def fastest_laps(laps, speeds=None):
    speeds = top_speeds_by_lap(laps) if speeds is None else speeds
    summaries = []

    for driver in sorted(laps["Driver"].dropna().unique()):
        driver_laps = valid_push_laps(laps.pick_drivers(driver))
        if driver_laps.empty:
            continue

        fastest = driver_laps.pick_fastest()
        if fastest is None or pd.isna(fastest.get("LapTime")):
            continue

        summaries.append(lap_summary(fastest, lap_top_speed(fastest, speeds)))

    summaries = sorted(summaries, key=lambda item: item["lap_time_seconds"])
    if not summaries:
        return []

    best_time = summaries[0]["lap_time_seconds"]
    for index, item in enumerate(summaries, start=1):
        item["position"] = index
        item["gap_to_fastest"] = round(item["lap_time_seconds"] - best_time, 3)

    return summaries


def top_speeds(laps, speeds=None):
    speeds = top_speeds_by_lap(laps) if speeds is None else speeds
    timed = valid_timed_laps(laps)
    best = {}

    for driver, lap_number in zip(timed["Driver"], timed["LapNumber"], strict=True):
        lap_speed = speeds.get((driver, lap_number))
        if lap_speed is not None and (driver not in best or lap_speed > best[driver]["top_speed"]):
            best[driver] = {
                "driver": driver,
                "top_speed": lap_speed,
                "lap_number": value_or_none(lap_number),
            }

    return sorted(best.values(), key=lambda item: item["top_speed"], reverse=True)


def tyre_summary(laps):
    summaries = []
    grouped = valid_timed_laps(laps).groupby(["Driver", "Stint", "Compound"], dropna=True)

    for (driver, stint, compound), group in grouped:
        summaries.append(
            {
                "driver": value_or_none(driver),
                "stint": value_or_none(stint),
                "compound": value_or_none(compound),
                "lap_count": int(len(group)),
                "tyre_life_start": value_or_none(group["TyreLife"].min()),
                "tyre_life_end": value_or_none(group["TyreLife"].max()),
            }
        )

    return summaries


def long_run_pace(laps, min_laps=LONG_RUN_MIN_LAPS):
    runs = []

    for (driver, stint, compound), group in long_run_candidate_laps(laps).groupby(
        ["Driver", "Stint", "Compound"], dropna=True
    ):
        group = group.sort_values("LapNumber")
        fastest = group["LapTime"].min().total_seconds()
        pace_limit = fastest * LONG_RUN_MAX_SLOWER_THAN_FASTEST_PCT

        used = group[group["LapTime"].dt.total_seconds() <= pace_limit].copy()
        excluded = group[group["LapTime"].dt.total_seconds() > pace_limit].copy()

        if len(used) < min_laps:
            continue

        lap_seconds = used["LapTime"].dt.total_seconds()
        tyre_life = used["TyreLife"].dropna()
        degradation = None
        if len(used) >= 3:
            x = used["LapNumber"].astype(float).to_numpy()
            y = lap_seconds.to_numpy()
            degradation = float(np.polyfit(x, y, 1)[0])

        runs.append(
            {
                "run_id": f"{value_or_none(driver)}:{value_or_none(stint)}:{value_or_none(compound)}",
                "driver": value_or_none(driver),
                "stint": value_or_none(stint),
                "compound": value_or_none(compound),
                "lap_count": int(len(used)),
                "average_pace_seconds": rounded_or_none(lap_seconds.mean()),
                "median_pace_seconds": rounded_or_none(lap_seconds.median()),
                "best_lap_seconds": rounded_or_none(lap_seconds.min()),
                "worst_lap_seconds": rounded_or_none(lap_seconds.max()),
                "pace_dropoff_per_lap": rounded_or_none(degradation),
                "tyre_life_start": value_or_none(tyre_life.min()) if not tyre_life.empty else None,
                "tyre_life_end": value_or_none(tyre_life.max()) if not tyre_life.empty else None,
                "laps_used": [value_or_none(lap) for lap in used["LapNumber"].tolist()],
                "laps_excluded": [
                    {
                        "lap_number": value_or_none(lap.get("LapNumber")),
                        "reason": "slower_than_107_percent_of_stint_best",
                    }
                    for _, lap in excluded.iterrows()
                ],
                "laps": [
                    {
                        "lap_number": value_or_none(lap.get("LapNumber")),
                        "lap_time_seconds": seconds_or_none(lap.get("LapTime")),
                        "tyre_life": value_or_none(lap.get("TyreLife")),
                        "default_included": bool(
                            lap.get("LapTime").total_seconds() <= pace_limit
                        ),
                        "exclusion_reason": (
                            None
                            if lap.get("LapTime").total_seconds() <= pace_limit
                            else "slower_than_107_percent_of_stint_best"
                        ),
                    }
                    for _, lap in group.iterrows()
                ],
            }
        )

    return sorted(runs, key=lambda item: item["average_pace_seconds"])


def long_run_overview(laps, drivers=None, min_laps=LONG_RUN_MIN_LAPS):
    """Return default long-run rankings while retaining every candidate lap for review."""
    if drivers:
        requested = {driver.upper() for driver in drivers}
        laps = laps[laps["Driver"].isin(requested)]

    runs = long_run_pace(laps, min_laps=min_laps)
    by_compound = {}
    for run in runs:
        by_compound.setdefault(run["compound"], []).append(run)

    tyre_rankings = []
    for compound, compound_runs in by_compound.items():
        ranked = sorted(compound_runs, key=lambda run: run["average_pace_seconds"])
        best_pace = ranked[0]["average_pace_seconds"]
        entries = []
        for position, run in enumerate(ranked, start=1):
            entries.append(
                {
                    "run_id": run["run_id"],
                    "position": position,
                    "driver": run["driver"],
                    "stint": run["stint"],
                    "average_pace_seconds": run["average_pace_seconds"],
                    "gap_to_compound_best": rounded_or_none(
                        run["average_pace_seconds"] - best_pace
                    ),
                }
            )
        tyre_rankings.append(
            {
                "compound": compound,
                "best_average_pace_seconds": best_pace,
                "runs": entries,
            }
        )

    tyre_rankings.sort(key=lambda ranking: ranking["best_average_pace_seconds"])
    session_tyre_ranking = [
        {
            "position": position,
            "compound": ranking["compound"],
            "best_average_pace_seconds": ranking["best_average_pace_seconds"],
            "gap_to_session_best": rounded_or_none(
                ranking["best_average_pace_seconds"]
                - tyre_rankings[0]["best_average_pace_seconds"]
            ),
            "fastest_run": ranking["runs"][0],
        }
        for position, ranking in enumerate(tyre_rankings, start=1)
    ]

    return {
        "runs": runs,
        "tyre_rankings": tyre_rankings,
        "session_tyre_ranking": session_tyre_ranking,
    }


def driver_laps(laps, driver):
    driver_all_laps = laps.pick_drivers(driver).sort_values("LapNumber")
    fastest_seconds = driver_fastest_seconds(laps, driver)
    speeds = top_speeds_by_lap(driver_all_laps)
    summaries = []

    for _, lap in driver_all_laps.iterlaps():
        summaries.append(
            lap_summary(
                lap,
                top_speed=lap_top_speed(lap, speeds),
                driver_fastest_seconds=fastest_seconds,
            )
        )

    return summaries
