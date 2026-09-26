import unittest
from types import SimpleNamespace

import numpy as np
import pandas as pd
from fastf1.core import Laps, Telemetry

from backend.services.analytics import fastest_laps, top_speeds, top_speeds_by_lap


def build_laps():
    rng = np.random.default_rng(7)
    session = SimpleNamespace()
    car_data = {}
    rows = []
    for driver, number in [("HAM", "44"), ("LEC", "16")]:
        times = pd.to_timedelta(np.arange(0, 400, 0.27), unit="s")
        car_data[number] = Telemetry(
            {"SessionTime": times, "Speed": rng.uniform(80, 340, len(times))}, session=session
        )
        for lap_number in range(1, 5):
            start = pd.Timedelta(seconds=10 + 90 * (lap_number - 1))
            rows.append({
                "Driver": driver,
                "DriverNumber": number,
                "LapNumber": float(lap_number),
                "LapStartTime": start,
                "Time": start + pd.Timedelta(seconds=88),
                "LapTime": pd.Timedelta(seconds=88 + lap_number * 0.1),
                "Deleted": False,
                "IsPersonalBest": lap_number == 1,
                "PitInTime": pd.NaT,
                "PitOutTime": pd.NaT,
            })
    session.car_data = car_data
    return Laps(pd.DataFrame(rows), session=session)


class TopSpeedTests(unittest.TestCase):
    def test_single_pass_matches_per_lap_slicing(self):
        laps = build_laps()
        speeds = top_speeds_by_lap(laps)

        self.assertEqual(len(speeds), len(laps))
        for _, lap in laps.iterlaps():
            expected = lap.get_car_data()["Speed"].max()
            self.assertAlmostEqual(speeds[(lap["Driver"], lap["LapNumber"])], expected)

    def test_top_speeds_picks_each_drivers_best_lap(self):
        laps = build_laps()
        speeds = top_speeds_by_lap(laps)

        result = {item["driver"]: item for item in top_speeds(laps, speeds)}

        for driver in ("HAM", "LEC"):
            best = max((value, lap) for (drv, lap), value in speeds.items() if drv == driver)
            self.assertEqual(result[driver]["top_speed"], best[0])
            self.assertEqual(result[driver]["lap_number"], best[1])

    def test_fastest_laps_carry_top_speed(self):
        laps = build_laps()
        speeds = top_speeds_by_lap(laps)

        for item in fastest_laps(laps, speeds):
            self.assertEqual(item["top_speed"], speeds[(item["driver"], item["lap_number"])])

    def test_missing_car_data_yields_no_speeds(self):
        laps = build_laps()
        laps.session.car_data = {}
        self.assertEqual(top_speeds_by_lap(laps), {})


if __name__ == "__main__":
    unittest.main()
