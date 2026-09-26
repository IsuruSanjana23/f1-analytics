"""Synthetic FastF1 ``Laps`` with car data, shaped like a real session."""

from types import SimpleNamespace

import numpy as np
import pandas as pd
from fastf1.core import Laps, Telemetry


def make_laps(session_name="Practice 2", drivers=(("LEC", "16", "Ferrari"), ("NOR", "4", "McLaren")), laps_per_driver=8):
    rng = np.random.default_rng(3)
    session = SimpleNamespace(name=session_name)
    car_data = {}
    rows = []
    for offset, (driver, number, team) in enumerate(drivers):
        times = pd.to_timedelta(np.arange(0, 100 * (laps_per_driver + 1), 0.27), unit="s")
        car_data[number] = Telemetry({"SessionTime": times, "Speed": rng.uniform(80, 340, len(times))}, session=session)
        for lap_number in range(1, laps_per_driver + 1):
            start = pd.Timedelta(seconds=10 + 95 * (lap_number - 1))
            seconds = 81.0 + 0.1 * offset + 0.05 * lap_number
            rows.append({
                "Driver": driver, "DriverNumber": number, "Team": team,
                "LapNumber": float(lap_number), "LapTime": pd.Timedelta(seconds=seconds),
                "Sector1Time": pd.Timedelta(seconds=26.9), "Sector2Time": pd.Timedelta(seconds=27.1),
                "Sector3Time": pd.Timedelta(seconds=seconds - 54.0),
                "Compound": "SOFT" if lap_number <= 4 else "MEDIUM", "TyreLife": float((lap_number - 1) % 4 + 1),
                "FreshTyre": True, "Stint": 1.0 if lap_number <= 4 else 2.0,
                "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "Deleted": False, "IsAccurate": True,
                "IsPersonalBest": lap_number == 1, "LapStartTime": start, "Time": start + pd.Timedelta(seconds=seconds),
            })
    session.car_data = car_data
    return Laps(pd.DataFrame(rows), session=session)
