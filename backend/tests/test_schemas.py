import unittest
from unittest.mock import Mock, patch

import pandas as pd
from fastapi.testclient import TestClient
from fastf1.core import Laps

from backend import schemas
from backend.app import app
from backend.services.analytics import (
    driver_laps,
    fastest_laps,
    long_run_overview,
    long_run_pace,
    telemetry_for_lap,
    top_speeds,
    tyre_summary,
)
from backend.services.driver_analysis import performance_summary
from backend.services.session_analysis import qualifying_attempts, segment_classification
from backend.tests.fixtures import make_laps


def assert_same_shape(test, parsed, raw, path="$"):
    """The response model must neither drop nor add keys anywhere in the payload."""
    if isinstance(raw, dict):
        test.assertEqual(set(parsed), set(raw), f"keys differ at {path}")
        for key in raw:
            assert_same_shape(test, parsed[key], raw[key], f"{path}.{key}")
    elif isinstance(raw, list):
        test.assertEqual(len(parsed), len(raw), f"length differs at {path}")
        for index, (item, raw_item) in enumerate(zip(parsed, raw, strict=True)):
            assert_same_shape(test, item, raw_item, f"{path}[{index}]")


class SchemaFitTests(unittest.TestCase):
    def fits(self, model, data):
        parsed = model.model_validate(data).model_dump()
        assert_same_shape(self, parsed, data)

    def test_lap_payloads(self):
        laps = make_laps()
        for item in fastest_laps(laps):
            self.fits(schemas.RankedLap, item)
        for item in top_speeds(laps):
            self.fits(schemas.TopSpeed, item)
        for item in driver_laps(laps, "LEC"):
            self.fits(schemas.LapSummary, item)
        for item in tyre_summary(laps):
            self.fits(schemas.TyreStint, item)
        self.fits(schemas.PerformanceSummary, performance_summary(laps.pick_drivers("LEC")))

    def test_long_run_payloads(self):
        laps = make_laps()
        runs = long_run_pace(laps)
        self.assertTrue(runs)
        for run in runs:
            self.fits(schemas.LongRun, run)
        overview = long_run_overview(laps, min_laps=4)
        payload = {"event": {"year": 2024, "race": "Italian Grand Prix"}, "session": "FP2",
                   "selected_drivers": [], "min_laps": 4, **overview}
        self.fits(schemas.LongRunOverview, payload)

    def test_qualifying_payloads(self):
        laps = make_laps("Qualifying")

        def split(self):
            return [self[self["LapNumber"].isin(numbers)] for numbers in ([1, 2, 3], [4, 5, 6], [7, 8])]

        with patch.object(Laps, "split_qualifying_sessions", split):
            attempts = qualifying_attempts(laps)
        self.assertTrue(attempts)
        for attempt in attempts:
            self.fits(schemas.QualifyingAttempt, attempt)
        for segment in segment_classification(attempts):
            self.fits(schemas.QualifyingSegment, segment)

    def test_telemetry_payload(self):
        data = pd.DataFrame({"Distance": [0.0, 10.0], "Speed": [200.0, 210.0], "RPM": [10000.0, 10100.0],
                             "nGear": [6, 7], "Throttle": [100.0, 99.0], "Brake": [False, True], "DRS": [0, 12]})
        lap = Mock()
        lap.get_car_data.return_value.add_distance.return_value = data
        lap.get_pos_data.side_effect = RuntimeError("no position data")
        for sample in telemetry_for_lap(lap):
            self.fits(schemas.TelemetrySample, sample)


class ResponseModelTests(unittest.TestCase):
    def test_long_runs_endpoint_serializes_through_model(self):
        session = Mock()
        session.laps = make_laps()
        with patch("backend.app.load_session", return_value=session):
            response = TestClient(app).get("/api/long-runs", params={
                "year": 2024, "race": "Italian Grand Prix", "session": "FP2", "drivers": "LEC,NOR"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["selected_drivers"], ["LEC", "NOR"])
        self.assertIsInstance(body["runs"][0]["laps"][0]["lap_number"], int)

    def test_every_route_declares_a_response_model(self):
        missing = [route.path for route in app.routes
                   if getattr(route, "path", "").startswith("/api/") and getattr(route, "response_model", None) is None]
        self.assertEqual(missing, [])


if __name__ == "__main__":
    unittest.main()
