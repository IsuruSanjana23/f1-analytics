import unittest
from unittest.mock import Mock, patch

import pandas as pd
from fastapi.testclient import TestClient

from backend.app import app
from backend.services.analytics import telemetry_for_lap, track_layout_for_session
from backend.services.fastf1_client import _load_session_cached


class TelemetryTests(unittest.TestCase):
    def test_sampling_preserves_finish_line(self):
        data = pd.DataFrame({key: range(319) for key in
                             ["Distance", "Speed", "RPM", "nGear", "Throttle", "Brake", "DRS"]})
        lap = Mock()
        lap.get_car_data.return_value.add_distance.return_value = data
        samples = telemetry_for_lap(lap, 160)
        self.assertEqual(len(samples), 160)
        self.assertEqual(samples[0]["distance"], 0)
        self.assertEqual(samples[-1]["distance"], 318)

    def test_position_data_is_included_when_available(self):
        car_data = pd.DataFrame({
            "Time": pd.to_timedelta([0, 1], unit="s"),
            "Distance": [0, 100], "Speed": [200, 210], "RPM": [10000, 10100],
            "nGear": [6, 7], "Throttle": [100, 100], "Brake": [False, False], "DRS": [0, 1],
        })
        positions = pd.DataFrame({"Time": pd.to_timedelta([0, 1], unit="s"), "X": [12.5, 42.5], "Y": [8.5, 18.5]})
        lap = Mock()
        lap.get_car_data.return_value.add_distance.return_value = car_data
        lap.get_pos_data.return_value = positions

        samples = telemetry_for_lap(lap)

        self.assertEqual(samples[0]["x"], 12.5)
        self.assertEqual(samples[-1]["y"], 18.5)

    def test_track_layout_is_sampled_from_position_data(self):
        positions = pd.DataFrame({"X": range(600), "Y": range(1000, 1600)})
        lap = Mock()
        lap.get_pos_data.return_value = positions
        laps = Mock()
        laps.empty = False
        laps.pick_fastest.return_value = lap

        with patch("backend.services.analytics.valid_timed_laps", return_value=laps):
            layout = track_layout_for_session(laps, sample_size=100)

        self.assertEqual(len(layout), 100)
        self.assertEqual(layout[0], {"x": 0.0, "y": 1000.0, "progress": 0.0})
        self.assertEqual(layout[-1]["progress"], 1.0)

    def test_invalid_lap_rejected_before_loading(self):
        with patch("backend.app.load_session") as load:
            response = TestClient(app).get("/api/lap-telemetry", params={
                "year": 2025, "race": "Australian Grand Prix", "session": "FP1",
                "driver": "HAM", "lap": 0})
            self.assertEqual(response.status_code, 422)
            load.assert_not_called()

    def test_provider_failure_is_service_unavailable(self):
        _load_session_cached.cache_clear()
        with patch("backend.services.fastf1_client.configure_fastf1"), \
                patch("fastf1.get_session", side_effect=ConnectionError("provider offline")):
            response = TestClient(app).get("/api/lap-telemetry", params={
                "year": 2025, "race": "Australian Grand Prix", "session": "FP1",
                "driver": "HAM", "lap": 13})
            self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
