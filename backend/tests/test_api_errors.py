import threading
import time
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from fastf1.exceptions import DataNotLoadedError

from backend.app import app
from backend.core.errors import NotFoundError
from backend.services.fastf1_client import _load_session_cached, load_session

PARAMS = {"year": 2025, "race": "Australian Grand Prix", "session": "FP1"}


def loaded_session(delay=0.0):
    session = Mock()
    session.load.side_effect = lambda **_: time.sleep(delay)
    return session


class ApiErrorTests(unittest.TestCase):
    def setUp(self):
        _load_session_cached.cache_clear()
        patcher = patch("backend.services.fastf1_client.configure_fastf1")
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = TestClient(app, raise_server_exceptions=False)

    def test_unknown_session_is_bad_request_without_loading(self):
        with patch("fastf1.get_session") as get_session:
            response = self.client.get("/api/session-analysis", params={**PARAMS, "session": "FP9"})
        self.assertEqual(response.status_code, 400)
        get_session.assert_not_called()

    def test_out_of_range_year_is_bad_request(self):
        response = self.client.get("/api/races", params={"year": 1990})
        self.assertEqual(response.status_code, 400)

    def test_unknown_event_is_not_found(self):
        with patch("fastf1.get_session", side_effect=ValueError("Invalid round")):
            response = self.client.get("/api/drivers", params=PARAMS)
        self.assertEqual(response.status_code, 404)

    def test_failed_load_is_unavailable_and_not_cached(self):
        broken = Mock()
        broken.date = None
        type(broken).laps = property(lambda _: (_ for _ in ()).throw(DataNotLoadedError("no laps")))
        with patch("fastf1.get_session", side_effect=[broken, loaded_session()]) as get_session:
            first = self.client.get("/api/drivers", params=PARAMS)
            self.assertEqual(first.status_code, 503)
            load_session(2025, "Australian Grand Prix", "FP1")
        self.assertEqual(get_session.call_count, 2)

    def test_missing_lap_is_not_found(self):
        with patch("backend.app.load_session"), \
                patch("backend.app.find_lap", side_effect=NotFoundError("No lap 99 found for HAM")):
            response = self.client.get("/api/lap-telemetry", params={**PARAMS, "driver": "HAM", "lap": 99})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "No lap 99 found for HAM")

    def test_unexpected_error_is_500_without_leaking_details(self):
        with patch("backend.app.analyze_session", side_effect=KeyError("secret internals")), \
                self.assertLogs("backend.app", level="ERROR"):
            response = self.client.get("/api/session-analysis", params=PARAMS)
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("secret", response.text)

    def test_invalid_driver_code_is_rejected(self):
        response = self.client.get("/api/driver-analysis", params={**PARAMS, "driver": "HAMILTON"})
        self.assertEqual(response.status_code, 422)

    def test_long_run_comparison_honours_min_laps(self):
        with patch("backend.app.compare_long_runs", return_value={}) as compare:
            self.client.get("/api/long-run-comparison", params={
                **PARAMS, "driver_a": "HAM", "stint_a": 1, "driver_b": "LEC", "stint_b": 2, "min_laps": 6})
        self.assertEqual(compare.call_args.args[-1], 6)

    def test_concurrent_requests_load_session_once(self):
        with patch("fastf1.get_session", return_value=loaded_session(delay=0.2)) as get_session:
            threads = [threading.Thread(target=load_session, args=(2025, "Australian Grand Prix", "FP1"))
                       for _ in range(5)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
        self.assertEqual(get_session.call_count, 1)


if __name__ == "__main__":
    unittest.main()
