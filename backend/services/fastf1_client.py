from datetime import datetime
from functools import lru_cache

import fastf1

from backend.core.config import CACHE_DIR, DEFAULT_START_YEAR
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


def configure_fastf1():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(CACHE_DIR))
    fastf1.set_log_level("WARNING")


def normalize_session_name(session_name):
    return SESSION_ALIASES.get(session_name.lower(), session_name)


def get_available_seasons():
    current_year = datetime.now().year
    return list(range(current_year, DEFAULT_START_YEAR - 1, -1))


def get_races(year):
    configure_fastf1()
    schedule = fastf1.get_event_schedule(year)
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
    configure_fastf1()
    event = fastf1.get_event(year, race)
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


@lru_cache(maxsize=16)
def _load_session_cached(year, race, normalized_session):
    configure_fastf1()
    session = fastf1.get_session(year, race, normalized_session)
    # Always load the full superset (laps + telemetry + weather) so every
    # caller, regardless of what it asked for, can share this one cached
    # Session object instead of triggering its own reparse of the session.
    session.load(laps=True, telemetry=True, weather=True, messages=False)
    return session


def load_session(year, race, session_name, telemetry=False, weather=True):
    normalized_session = normalize_session_name(session_name)
    return _load_session_cached(year, race, normalized_session)


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

