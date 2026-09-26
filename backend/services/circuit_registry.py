"""Official Formula 1 race-page references for the circuit map metadata."""

import unicodedata

# Keyed by normalized event name (see ``normalize_event_name``).
RACE_SLUGS = {
    "australian grand prix": "australia",
    "chinese grand prix": "china",
    "japanese grand prix": "japan",
    "bahrain grand prix": "bahrain",
    "saudi arabian grand prix": "saudi-arabia",
    "miami grand prix": "miami",
    "emilia romagna grand prix": "emilia-romagna",
    "monaco grand prix": "monaco",
    "spanish grand prix": "spain",
    "barcelona-catalunya grand prix": "spain",
    "canadian grand prix": "canada",
    "austrian grand prix": "austria",
    "british grand prix": "great-britain",
    "belgian grand prix": "belgium",
    "hungarian grand prix": "hungary",
    "dutch grand prix": "netherlands",
    "italian grand prix": "italy",
    "azerbaijan grand prix": "azerbaijan",
    "singapore grand prix": "singapore",
    "united states grand prix": "united-states",
    "mexico city grand prix": "mexico",
    "mexican grand prix": "mexico",
    "sao paulo grand prix": "brazil",
    "brazilian grand prix": "brazil",
    "las vegas grand prix": "las-vegas",
    "qatar grand prix": "qatar",
    "abu dhabi grand prix": "abu-dhabi",
}

# From 2026 the Spanish Grand Prix moves to Madrid and keeps the "spain" page;
# Barcelona's page slug is not known, so link nothing rather than the wrong race.
SLUG_OVERRIDES = {
    ("barcelona-catalunya grand prix", 2026): None,
}


def normalize_event_name(name: str) -> str:
    """Lower-case and strip accents so "São Paulo Grand Prix" matches "Sao Paulo Grand Prix"."""
    decomposed = unicodedata.normalize("NFKD", name)
    return "".join(char for char in decomposed if not unicodedata.combining(char)).strip().lower()


def official_circuit_url(year: int, race: str):
    name = normalize_event_name(race)
    slug = RACE_SLUGS.get(name)
    for (override_name, from_year), override in SLUG_OVERRIDES.items():
        if name == override_name and year >= from_year:
            slug = override
    return f"https://www.formula1.com/en/racing/{year}/{slug}" if slug else None
