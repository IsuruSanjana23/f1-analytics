import logging
from typing import Annotated

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.core.config import DEFAULT_TELEMETRY_SAMPLES, LONG_RUN_MIN_LAPS
from backend.core.errors import DataUnavailableError, F1DataError
from backend.services.analytics import lap_summary, long_run_overview, telemetry_for_lap, track_layout_for_session
from backend.services.circuit_registry import official_circuit_url
from backend.services.comparisons import compare_laps, compare_long_runs, find_lap
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

logger = logging.getLogger(__name__)

DriverCode = Annotated[str, Query(pattern=r"^[A-Za-z]{3}$")]

app = FastAPI(title="F1 Analytics API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(F1DataError)
def f1_data_error(request: Request, error: F1DataError):
    if isinstance(error, DataUnavailableError):
        logger.warning("%s %s: %s", request.method, request.url.path, error, exc_info=error.__cause__)
    return JSONResponse(status_code=error.status_code, content={"detail": str(error)})


@app.exception_handler(Exception)
def unexpected_error(request: Request, error: Exception):
    # Log the real cause server-side; never leak internals to the client.
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


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
    loaded_session = load_session(year, race, session)
    return {
        "year": year,
        "race": race,
        "session": loaded_session.name,
        "drivers": available_drivers(loaded_session),
    }


@app.get("/api/session-analysis")
def session_analysis(year: int, race: str, session: str):
    return analyze_session(year, race, session)


@app.get("/api/qualifying-analysis")
def qualifying_analysis(year: int, race: str, session: str = "Q"):
    return analyze_qualifying(year, race, session)


@app.get("/api/driver-analysis")
def driver_analysis(year: int, race: str, session: str, driver: DriverCode):
    return analyze_driver(year, race, session, driver.upper())


@app.get("/api/lap-telemetry")
def lap_telemetry(
    year: int,
    race: str,
    session: str,
    driver: DriverCode,
    lap: Annotated[int, Query(ge=1)],
    telemetry_samples: int = Query(DEFAULT_TELEMETRY_SAMPLES, ge=20, le=1000),
):
    loaded = load_session(year, race, session)
    selected = find_lap(loaded.laps, driver.upper(), lap)
    return {"summary": lap_summary(selected), "telemetry": telemetry_for_lap(selected, telemetry_samples)}


@app.get("/api/track-layout")
def track_layout(year: int, race: str, session: str):
    loaded = load_session(year, race, session)
    return {
        "year": year,
        "race": race,
        "session": session,
        "official_circuit_url": official_circuit_url(year, race),
        "points": track_layout_for_session(loaded.laps),
    }


@app.get("/api/lap-comparison")
def lap_comparison(
    year: int,
    race: str,
    session: str,
    driver_a: DriverCode,
    lap_a: Annotated[int, Query(ge=1)],
    driver_b: DriverCode,
    lap_b: Annotated[int, Query(ge=1)],
    telemetry_samples: int = Query(DEFAULT_TELEMETRY_SAMPLES, ge=20, le=1000),
):
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


@app.get("/api/long-run-comparison")
def long_run_comparison(
    year: int,
    race: str,
    session: str,
    driver_a: DriverCode,
    stint_a: Annotated[int, Query(ge=1)],
    driver_b: DriverCode,
    stint_b: Annotated[int, Query(ge=1)],
    min_laps: int = Query(LONG_RUN_MIN_LAPS, ge=2, le=30),
):
    return compare_long_runs(
        year,
        race,
        session,
        driver_a.upper(),
        stint_a,
        driver_b.upper(),
        stint_b,
        min_laps,
    )


@app.get("/api/long-runs")
def long_runs(
    year: int,
    race: str,
    session: str,
    drivers: str = "",
    min_laps: int = Query(LONG_RUN_MIN_LAPS, ge=2, le=30),
):
    loaded = load_session(year, race, session)
    selected_drivers = [driver.strip().upper() for driver in drivers.split(",") if driver.strip()]
    overview = long_run_overview(loaded.laps, selected_drivers or None, min_laps)
    return {
        "event": {"year": year, "race": race},
        "session": session,
        "selected_drivers": selected_drivers,
        "min_laps": min_laps,
        **overview,
    }
