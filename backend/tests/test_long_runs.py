import unittest

import pandas as pd

from backend.services.analytics import long_run_overview


def lap(driver, stint, compound, number, seconds, tyre_life):
    return {
        "Driver": driver,
        "Stint": stint,
        "Compound": compound,
        "LapNumber": number,
        "LapTime": pd.Timedelta(seconds=seconds),
        "TyreLife": tyre_life,
        "PitInTime": pd.NaT,
        "PitOutTime": pd.NaT,
        "Deleted": False,
    }


class LongRunOverviewTests(unittest.TestCase):
    def test_groups_and_ranks_by_compound(self):
        laps = pd.DataFrame(
            [
                *[lap("HAM", 1, "MEDIUM", number, seconds, number) for number, seconds in enumerate([83, 84, 85, 86], 1)],
                *[lap("RUS", 1, "MEDIUM", number, seconds, number) for number, seconds in enumerate([84, 85, 86, 87], 1)],
                *[lap("HAM", 2, "SOFT", number, seconds, number) for number, seconds in enumerate([82, 83, 84, 85], 12)],
            ]
        )

        overview = long_run_overview(laps, drivers=["HAM", "RUS"], min_laps=4)

        self.assertEqual(len(overview["runs"]), 3)
        medium = next(item for item in overview["tyre_rankings"] if item["compound"] == "MEDIUM")
        self.assertEqual([item["driver"] for item in medium["runs"]], ["HAM", "RUS"])
        self.assertEqual(medium["runs"][1]["gap_to_compound_best"], 1.0)
        self.assertEqual(overview["session_tyre_ranking"][0]["compound"], "SOFT")


    def test_keeps_excluded_lap_visible(self):
        laps = pd.DataFrame(
            [lap("HAM", 1, "HARD", number, seconds, number) for number, seconds in enumerate([90, 91, 92, 93, 100], 1)]
        )

        run = long_run_overview(laps, min_laps=4)["runs"][0]

        self.assertEqual([lap["lap_number"] for lap in run["laps"]], [1, 2, 3, 4, 5])
        self.assertFalse(run["laps"][-1]["default_included"])
        self.assertEqual(run["laps"][-1]["exclusion_reason"], "slower_than_107_percent_of_stint_best")


class LongRunFilterTests(unittest.TestCase):
    def run_for(self, seconds, tyre_life=None):
        tyre_life = tyre_life or list(range(1, len(seconds) + 1))
        laps = pd.DataFrame([lap("LEC", 2, "HARD", number, value, age)
                             for number, (value, age) in enumerate(zip(seconds, tyre_life, strict=True), 10)])
        return long_run_overview(laps, min_laps=4)["runs"][0]

    def reasons(self, run):
        return {item["lap_number"]: item["exclusion_reason"] for item in run["laps"] if item["exclusion_reason"]}

    def test_traffic_lap_is_excluded(self):
        # Within 107% of the best lap (so the old rule kept it), but 2.5 s off the stint trend.
        run = self.run_for([81.0, 81.1, 81.2, 83.8, 81.4, 81.5, 81.6])
        self.assertEqual(self.reasons(run), {13: "slower_than_stint_trend"})
        self.assertEqual(run["lap_count"], 6)

    def test_tow_lap_is_excluded(self):
        run = self.run_for([81.0, 81.1, 79.2, 81.3, 81.4, 81.5])
        self.assertEqual(self.reasons(run), {12: "faster_than_stint_trend"})

    def test_heavy_degradation_is_not_mistaken_for_traffic(self):
        # 0.3 s/lap wear over 15 laps: the late laps are 4 s slower than the early ones.
        run = self.run_for([80 + 0.3 * index for index in range(15)])
        self.assertEqual(self.reasons(run), {})

    def test_cooldown_lap_still_uses_107_percent_rule(self):
        run = self.run_for([81.0, 81.1, 81.2, 81.3, 95.0])
        self.assertEqual(self.reasons(run), {14: "slower_than_107_percent_of_stint_best"})

    def test_fuel_correction_reveals_tyre_wear(self):
        # Raw lap times are flat: fuel burn exactly hides 0.055 s/lap of tyre wear.
        run = self.run_for([81.0] * 8)
        self.assertEqual(run["pace_dropoff_per_lap"], 0.0)
        self.assertAlmostEqual(run["tyre_degradation_per_lap"], 0.055, places=3)

    def test_degradation_uses_tyre_age_on_used_sets(self):
        # Second-hand tyres (age 6-11) still degrade per lap of tyre age.
        run = self.run_for([81.0 + 0.1 * index for index in range(6)], tyre_life=list(range(6, 12)))
        self.assertAlmostEqual(run["tyre_degradation_per_lap"], 0.155, places=3)
        self.assertEqual(run["tyre_life_start"], 6)
