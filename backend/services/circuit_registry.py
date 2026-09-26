"""Official Formula 1 race-page references for the circuit map metadata."""

RACE_SLUGS = {
    "Australian Grand Prix": "australia",
    "Chinese Grand Prix": "china",
    "Japanese Grand Prix": "japan",
    "Bahrain Grand Prix": "bahrain",
    "Saudi Arabian Grand Prix": "saudi-arabia",
    "Miami Grand Prix": "miami",
    "Emilia Romagna Grand Prix": "emilia-romagna",
    "Monaco Grand Prix": "monaco",
    "Spanish Grand Prix": "spain",
    "Barcelona-Catalunya Grand Prix": "spain",
    "Canadian Grand Prix": "canada",
    "Austrian Grand Prix": "austria",
    "British Grand Prix": "great-britain",
    "Belgian Grand Prix": "belgium",
    "Hungarian Grand Prix": "hungary",
    "Dutch Grand Prix": "netherlands",
    "Italian Grand Prix": "italy",
    "Azerbaijan Grand Prix": "azerbaijan",
    "Singapore Grand Prix": "singapore",
    "United States Grand Prix": "united-states",
    "Mexico City Grand Prix": "mexico",
    "Sao Paulo Grand Prix": "brazil",
    "Las Vegas Grand Prix": "las-vegas",
    "Qatar Grand Prix": "qatar",
    "Abu Dhabi Grand Prix": "abu-dhabi",
}


def official_circuit_url(year: int, race: str):
    slug = RACE_SLUGS.get(race)
    return f"https://www.formula1.com/en/racing/{year}/{slug}" if slug else None
