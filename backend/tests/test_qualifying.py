import unittest
from types import SimpleNamespace
from unittest.mock import patch

import pandas as pd
from fastf1.core import Laps

from backend.services.session_analysis import qualifying_attempts, segment_classification


def quali_laps(session_name="Qualifying"):
    rows = []
    # (driver, lap number, seconds): laps 1-2 run in Q1, 3-4 in Q2, 5-6 in Q3.
    times = {"LEC": [80.9, 80.6, 80.4, 80.3, 80.1, 80.2], "NOR": [80.7, 80.8, 80.5, 80.35, 80.0, 80.4]}
    for driver, laps in times.items():
        for number, seconds in enumerate(laps, start=1):
            rows.append({
                "Driver": driver, "DriverNumber": "16" if driver == "LEC" else "4", "Team": "T",
                "LapNumber": float(number), "LapTime": pd.Timedelta(seconds=seconds),
                "Sector1Time": pd.NaT, "Sector2Time": pd.NaT, "Sector3Time": pd.NaT,
                "Compound": "SOFT", "TyreLife": 1.0, "FreshTyre": True, "Stint": 1.0,
                "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "Deleted": False, "IsAccurate": True,
                "LapStartTime": pd.Timedelta(minutes=number * 5),
            })
    return Laps(pd.DataFrame(rows), session=SimpleNamespace(name=session_name, car_data={}))


def split(self):
    return [self[self["LapNumber"].isin(numbers)] for numbers in ([1, 2], [3, 4], [5, 6])]


class QualifyingSegmentTests(unittest.TestCase):
    def test_attempts_are_tagged_with_segment_and_gap(self):
        with patch.object(Laps, "split_qualifying_sessions", split):
            attempts = qualifying_attempts(quali_laps(), speeds={})

        by_lap = {(a["driver"], a["lap_number"]): a for a in attempts}
        self.assertEqual(by_lap[("LEC", 2)]["segment"], "Q1")
        self.assertEqual(by_lap[("NOR", 5)]["segment"], "Q3")
        self.assertEqual(by_lap[("LEC", 5)]["gap_to_segment_best"], 0.1)
        self.assertEqual(by_lap[("LEC", 5)]["gap_to_session_best"], 0.1)
        self.assertEqual(by_lap[("LEC", 1)]["gap_to_segment_best"], 0.3)

    def test_segment_classification_ranks_best_lap_per_driver(self):
        with patch.object(Laps, "split_qualifying_sessions", split):
            segments = segment_classification(qualifying_attempts(quali_laps(), speeds={}))

        self.assertEqual([s["segment"] for s in segments], ["Q1", "Q2", "Q3"])
        q2 = segments[1]["results"]
        self.assertEqual([(r["driver"], r["lap_number"], r["gap_to_segment_best"]) for r in q2],
                         [("LEC", 4, 0.0), ("NOR", 4, 0.05)])

    def test_sprint_qualifying_uses_sq_labels(self):
        with patch.object(Laps, "split_qualifying_sessions", split):
            attempts = qualifying_attempts(quali_laps("Sprint Qualifying"), speeds={})
        self.assertEqual({a["segment"] for a in attempts}, {"SQ1", "SQ2", "SQ3"})

    def test_missing_session_status_leaves_segments_empty(self):
        with patch.object(Laps, "split_qualifying_sessions", side_effect=ValueError("no status")):
            attempts = qualifying_attempts(quali_laps(), speeds={})
        self.assertTrue(attempts)
        self.assertTrue(all(a["segment"] is None and a["gap_to_segment_best"] is None for a in attempts))
        self.assertEqual(segment_classification(attempts), [])


if __name__ == "__main__":
    unittest.main()
