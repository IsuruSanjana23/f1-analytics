from fastapi.testclient import TestClient

from backend.app import app


CHECKS = [
    ("health", "/api/health", {}, ["status"]),
    ("seasons", "/api/seasons", {}, ["seasons"]),
    ("races", "/api/races", {"year": 2025}, ["year", "races"]),
    (
        "sessions",
        "/api/sessions",
        {"year": 2025, "race": "Australian Grand Prix"},
        ["year", "race", "sessions"],
    ),
    (
        "drivers",
        "/api/drivers",
        {"year": 2025, "race": "Australian Grand Prix", "session": "FP1"},
        ["year", "race", "session", "drivers"],
    ),
    (
        "session_analysis",
        "/api/session-analysis",
        {"year": 2025, "race": "Australian Grand Prix", "session": "FP1"},
        ["event", "session", "drivers", "fastest_laps", "top_speeds", "long_runs"],
    ),
    (
        "driver_analysis",
        "/api/driver-analysis",
        {
            "year": 2025,
            "race": "Australian Grand Prix",
            "session": "FP1",
            "driver": "HAM",
        },
        ["driver", "event", "session", "summary", "laps", "long_runs"],
    ),
    (
        "lap_comparison",
        "/api/lap-comparison",
        {
            "year": 2025,
            "race": "Australian Grand Prix",
            "session": "FP1",
            "driver_a": "HAM",
            "lap_a": 13,
            "driver_b": "LEC",
            "lap_b": 12,
            "telemetry_samples": 25,
        },
        ["event", "session", "lap_a", "lap_b", "delta"],
    ),
    (
        "long_run_comparison",
        "/api/long-run-comparison",
        {
            "year": 2025,
            "race": "Australian Grand Prix",
            "session": "FP1",
            "driver_a": "RUS",
            "stint_a": 4,
            "driver_b": "VER",
            "stint_b": 4,
        },
        ["event", "session", "run_a", "run_b", "delta"],
    ),
    (
        "qualifying_analysis",
        "/api/qualifying-analysis",
        {"year": 2025, "race": "Australian Grand Prix", "session": "Q"},
        ["event", "session", "drivers", "best_laps", "top_speeds", "attempts"],
    ),
]


def describe_value(name, value):
    if isinstance(value, list):
        return f"{name}_count={len(value)}"
    if isinstance(value, dict):
        keys = ", ".join(value.keys())
        return f"{name}_keys=[{keys}]"
    return f"{name}={value}"


def main():
    client = TestClient(app)
    failures = []

    for name, path, params, required_keys in CHECKS:
        response = client.get(path, params=params)
        print(f"{name}: {response.status_code}")

        data = response.json()
        if response.status_code != 200:
            print(f"  detail={data}")
            failures.append(name)
            continue

        missing_keys = [key for key in required_keys if key not in data]
        if missing_keys:
            print(f"  missing_keys={missing_keys}")
            failures.append(name)
            continue

        for key in required_keys:
            print(f"  {describe_value(key, data[key])}")

    if failures:
        raise SystemExit(f"Smoke tests failed: {', '.join(failures)}")

    print("All API smoke tests passed.")


if __name__ == "__main__":
    main()
