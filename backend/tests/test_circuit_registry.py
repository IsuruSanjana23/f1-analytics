import unittest

from backend.services.circuit_registry import official_circuit_url


class CircuitRegistryTests(unittest.TestCase):
    def test_accented_event_names_match(self):
        self.assertEqual(official_circuit_url(2024, "São Paulo Grand Prix"), "https://www.formula1.com/en/racing/2024/brazil")
        self.assertEqual(official_circuit_url(2019, "Brazilian Grand Prix"), "https://www.formula1.com/en/racing/2019/brazil")

    def test_barcelona_is_not_linked_to_madrid_from_2026(self):
        self.assertEqual(official_circuit_url(2025, "Barcelona-Catalunya Grand Prix"), "https://www.formula1.com/en/racing/2025/spain")
        self.assertIsNone(official_circuit_url(2026, "Barcelona-Catalunya Grand Prix"))
        self.assertEqual(official_circuit_url(2026, "Spanish Grand Prix"), "https://www.formula1.com/en/racing/2026/spain")

    def test_unknown_event_has_no_link(self):
        self.assertIsNone(official_circuit_url(2020, "Tuscan Grand Prix"))


if __name__ == "__main__":
    unittest.main()
