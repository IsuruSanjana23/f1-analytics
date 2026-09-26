from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import DEFAULT_TELEMETRY_SAMPLES
from backend.services.comparisons import compare_laps, compare_long_runs, find_lap
from backend.services.circuit_registry import official_circuit_url
from backend.services.analytics import lap_summary, long_run_overview, telemetry_for_lap, track_layout_for_session
from backend.services.driver_analysis import analyze_driver
from backend.services.fastf1_client import (
    get_available_seasons,
    get_races,
    get_sessions,
    load_session,
)
from backend.services.session_analysis import (
    analyze_qualifying,
    analyze_session,
    available_drivers,
)


app = FastAPI(title="F1 Analytics API", version="0.1.0")


@app.get("/api/lap-telemetry")
def lap_telemetry(
    year: int,
    race: str,
    session: str,
    driver: str = Query(min_length=3, max_length=3),
    lap: int = Query(ge=1),
    telemetry_samples: int = Query(DEFAULT_TELEMETRY_SAMPLES, ge=20, le=1000),
):
    try:
        loaded = load_session(year, race, session, telemetry=True, weather=False)
        selected = find_lap(loaded.laps, driver.upper(), lap)
        return {"summary": lap_summary(selected), "telemetry": telemetry_for_lap(selected, telemetry_samples)}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=503, detail="Telemetry is temporarily unavailable") from error


@app.get("/api/track-layout")
def track_layout(year: int, race: str, session: str):
    try:
        loaded = load_session(year, race, session, telemetry=True, weather=False)
        return {
            "year": year,
            "race": race,
            "session": session,
            "official_circuit_url": official_circuit_url(year, race),
            "points": track_layout_for_session(loaded.laps),
        }
    except Exception as error:
        raise HTTPException(status_code=503, detail="Track position data is temporarily unavailable") from error

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/seasons")
def seasons():
    return {"seasons": get_available_seasons()}


@app.get("/api/races")
def races(year: int):
    return {"year": year, "races": get_races(year)}


@app.get("/api/sessions")
def sessions(year: int, race: str):
    return {"year": year, "race": race, "sessions": get_sessions(year, race)}


@app.get("/api/drivers")
def drivers(year: int, race: str, session: str):
    try:
        loaded_session = load_session(year, race, session, telemetry=False)
        return {
            "year": year,
            "race": race,
            "session": loaded_session.name,
            "drivers": available_drivers(loaded_session),
        }
    except Exception as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/session-analysis")
def session_analysis(year: int, race: str, session: str):
    try:
        return analyze_session(year, race, session)
    except Exception as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/qualifying-analysis")
def qualifying_analysis(year: int, race: str, session: str = "Q"):
    try:
        return analyze_qualifying(year, race, session)
    except Exception as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/driver-analysis")
def driver_analysis(year: int, race: str, session: str, driver: str):
    try:
        return analyze_driver(year, race, session, driver.upper())
    except Exception as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/lap-comparison")
def lap_comparison(
    year: int,
    race: str,
    session: str,
    driver_a: str,
    lap_a: int,
    driver_b: str,
    lap_b: int,
    telemetry_samples: int = Query(DEFAULT_TELEMETRY_SAMPLES, ge=20, le=1000),
):
    try:
        return compare_laps(
            year,
            race,
            session,
            driver_a.upper(),
            lap_a,
            driver_b.upper(),
            lap_b,
            telemetry_samples,
        )
    except Exception as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/long-run-comparison")
def long_run_comparison(
    year: int,
    race: str,
    session: str,
    driver_a: str,
    stint_a: int,
    driver_b: str,
    stint_b: int,
):
    try:
        return compare_long_runs(
            year,
            race,
            session,
            driver_a.upper(),
            stint_a,
            driver_b.upper(),
            stint_b,
        )
    except Exception as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/long-runs")
def long_runs(
    year: int,
    race: str,
    session: str,
    drivers: str = "",
    min_laps: int = Query(4, ge=2, le=30),
):
    try:
        loaded = load_session(year, race, session, telemetry=False)
        selected_drivers = [driver.strip().upper() for driver in drivers.split(",") if driver.strip()]
        overview = long_run_overview(loaded.laps, selected_drivers or None, min_laps)
        return {
            "event": {"year": year, "race": race},
            "session": session,
            "selected_drivers": selected_drivers,
            "min_laps": min_laps,
            **overview,
        }
    except Exception as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
