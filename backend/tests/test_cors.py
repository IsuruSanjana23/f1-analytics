import unittest

from fastapi.testclient import TestClient

from backend.app import app


class CorsTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_allowed_origin_is_echoed(self):
        response = self.client.get("/api/health", headers={"Origin": "http://localhost:3000"})
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:3000")

    def test_unknown_origin_is_not_allowed(self):
        response = self.client.get("/api/health", headers={"Origin": "https://evil.example"})
        self.assertNotIn("access-control-allow-origin", response.headers)


if __name__ == "__main__":
    unittest.main()
