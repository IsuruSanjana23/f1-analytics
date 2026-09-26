import threading
from collections import defaultdict
from datetime import datetime
from functools import lru_cache

import fastf1
import pandas as pd
from fastf1.exceptions import DataNotLoadedError, NoLapDataError

from backend.core.config import CACHE_DIR, DEFAULT_START_YEAR, SESSION_CACHE_SIZE
from backend.core.errors import DataUnavailableError, InvalidRequestError, NotFoundError
from backend.utils.formatting import value_or_none


SESSION_ALIASES = {
    "practice 1": "FP1",
    "fp1": "FP1",
    "practice 2": "FP2",
    "fp2": "FP2",
    "practice 3": "FP3",
    "fp3": "FP3",
    "sprint shootout": "SS",
    "sprint qualifying": "SQ",
    "sq": "SQ",
    "ss": "SS",
    "sprint": "S",
    "qualifying": "Q",
    "q": "Q",
    "race": "R",
    "r": "R",
}
SESSION_KEYS = {"FP1", "FP2", "FP3", "SS", "SQ", "S", "Q", "R"}

_session_locks = defaultdict(threading.Lock)
_session_locks_guard = threading.Lock()


def configure_fastf1():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(CACHE_DIR))
    fastf1.set_log_level("WARNING")


def normalize_session_name(session_name):
    return SESSION_ALIASES.get(session_name.lower(), session_name)


def get_available_seasons():
    current_year = datetime.now().year
    return list(range(current_year, DEFAULT_START_YEAR - 1, -1))


def validate_year(year):
    seasons = get_available_seasons()
    if year not in seasons:
        raise InvalidRequestError(f"Season must be between {seasons[-1]} and {seasons[0]}")


def validate_session_name(session_name):
    normalized = normalize_session_name(session_name)
    if normalized not in SESSION_KEYS:
        raise InvalidRequestError(f"Unknown session '{session_name}'")
    return normalized


def get_races(year):
    validate_year(year)
    configure_fastf1()
    try:
        schedule = fastf1.get_event_schedule(year)
    except Exception as error:
        raise DataUnavailableError(f"Schedule for {year} is temporarily unavailable") from error
    races = []

    for _, event in schedule.iterrows():
        event_name = value_or_none(event.get("EventName"))
        if not event_name or event_name == "Pre-Season Testing":
            continue

        races.append(
            {
                "round": value_or_none(event.get("RoundNumber")),
                "name": event_name,
                "official_name": value_or_none(event.get("OfficialEventName")),
                "location": value_or_none(event.get("Location")),
                "country": value_or_none(event.get("Country")),
                "date": str(value_or_none(event.get("EventDate"))),
            }
        )

    return races


def get_sessions(year, race):
    validate_year(year)
    configure_fastf1()
    try:
        event = fastf1.get_event(year, race)
    except ValueError as error:
        raise NotFoundError(f"No event '{race}' found in {year}") from error
    except Exception as error:
        raise DataUnavailableError(f"Schedule for {year} is temporarily unavailable") from error
    if event is None:
        raise NotFoundError(f"No event '{race}' found in {year}")
    sessions = []

    for index in range(1, 6):
        session_name = value_or_none(event.get(f"Session{index}"))
        session_date = value_or_none(event.get(f"Session{index}Date"))
        if not session_name:
            continue

        sessions.append(
            {
                "name": session_name,
                "key": normalize_session_name(session_name),
                "date": str(session_date) if session_date is not None else None,
                "type": session_type(session_name),
            }
        )

    return sessions


def session_type(session_name):
    normalized = normalize_session_name(session_name)
    if normalized in {"FP1", "FP2", "FP3", "S", "R"}:
        return "race_pace"
    if normalized in {"Q", "SQ", "SS"}:
        return "qualifying"
    return "unknown"


@lru_cache(maxsize=SESSION_CACHE_SIZE)
def _load_session_cached(year, race, normalized_session):
    configure_fastf1()
    try:
        session = fastf1.get_session(year, race, normalized_session)
    except ValueError as error:
        raise NotFoundError(f"No {normalized_session} session found for {race} {year}") from error
    except Exception as error:
        raise DataUnavailableError("F1 timing data is temporarily unavailable") from error

    # Always load the full superset (laps + telemetry + weather) so every
    # caller can share this one cached Session object instead of triggering
    # its own reparse of the session.
    try:
        session.load(laps=True, telemetry=True, weather=True, messages=False)
        session.laps  # FastF1 logs load failures and only raises on access.
    except NoLapDataError as error:
        raise NotFoundError(f"No lap data available for {race} {year} {normalized_session}") from error
    except DataNotLoadedError as error:
        if session_not_started(session):
            raise NotFoundError(f"{race} {year} {normalized_session} has not taken place yet") from error
        # Raising keeps lru_cache from pinning a half-loaded session.
        raise DataUnavailableError("F1 timing data is temporarily unavailable") from error
    except Exception as error:
        raise DataUnavailableError("F1 timing data is temporarily unavailable") from error
    return session


def session_not_started(session):
    try:
        start = pd.Timestamp(session.date)
    except Exception:
        return False
    if pd.isna(start):
        return False
    # FastF1 session dates are naive UTC.
    now = pd.Timestamp.now(tz="UTC")
    return start > (now if start.tz else now.tz_localize(None))


def load_session(year, race, session_name):
    validate_year(year)
    key = (year, race, validate_session_name(session_name))
    # lru_cache does not stop concurrent misses for the same key from each
    # running the multi-second load, so serialise loads per session.
    with _session_locks_guard:
        lock = _session_locks[key]
    with lock:
        return _load_session_cached(*key)


def event_summary(session):
    return {
        "year": int(session.event.year),
        "name": value_or_none(session.event.get("EventName")),
        "official_name": value_or_none(session.event.get("OfficialEventName")),
        "round": value_or_none(session.event.get("RoundNumber")),
        "circuit": value_or_none(session.event.get("Location")),
        "country": value_or_none(session.event.get("Country")),
    }


def session_summary(session):
    return {
        "name": value_or_none(session.name),
        "type": session_type(str(session.name)),
        "date": str(value_or_none(session.date)),
    }

