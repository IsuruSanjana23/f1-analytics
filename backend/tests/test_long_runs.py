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
