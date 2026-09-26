import argparse
import json
import sys
from pathlib import Path

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.core.config import DEFAULT_TELEMETRY_SAMPLES
from backend.services.comparisons import compare_laps
from backend.services.session_analysis import analyze_session


def parse_args():
    parser = argparse.ArgumentParser(
        description="Fetch F1 session analysis from the backend services."
    )
    parser.add_argument("--year", type=int, default=2025)
    parser.add_argument("--race", default="Australian Grand Prix")
    parser.add_argument("--session", default="FP1")
    parser.add_argument("--drivers", nargs="+", default=["HAM", "LEC"])
    parser.add_argument("--telemetry-samples", type=int, default=DEFAULT_TELEMETRY_SAMPLES)
    return parser.parse_args()


def main():
    args = parse_args()

    try:
        payload = analyze_session(args.year, args.race, args.session)
        if len(args.drivers) >= 2 and payload["fastest_laps"]:
            driver_laps = {
                item["driver"]: item["lap_number"] for item in payload["fastest_laps"]
            }
            driver_a, driver_b = [driver.upper() for driver in args.drivers[:2]]
            if driver_a in driver_laps and driver_b in driver_laps:
                payload["comparison"] = compare_laps(
                    args.year,
                    args.race,
                    args.session,
                    driver_a,
                    int(driver_laps[driver_a]),
                    driver_b,
                    int(driver_laps[driver_b]),
                    args.telemetry_samples,
                )
    except Exception as error:
        raise SystemExit(f"Could not load F1 data: {error}") from error

    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
