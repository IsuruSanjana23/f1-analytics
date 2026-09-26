// Keyed by normalized event name (see normalizeEventName).
const circuitAssets: Record<string, string> = {
  "australian grand prix": "melbourne-2.svg",
  "chinese grand prix": "shanghai-1.svg",
  "japanese grand prix": "suzuka-2.svg",
  "bahrain grand prix": "bahrain-1.svg",
  "saudi arabian grand prix": "jeddah-1.svg",
  "miami grand prix": "miami-1.svg",
  "monaco grand prix": "monaco-6.svg",
  "barcelona-catalunya grand prix": "catalunya-6.svg",
  "canadian grand prix": "montreal-6.svg",
  "austrian grand prix": "spielberg-3.svg",
  "styrian grand prix": "spielberg-3.svg",
  "british grand prix": "silverstone-8.svg",
  "70th anniversary grand prix": "silverstone-8.svg",
  "belgian grand prix": "spa-francorchamps-4.svg",
  "hungarian grand prix": "hungaroring-3.svg",
  "dutch grand prix": "zandvoort-5.svg",
  "italian grand prix": "monza-7.svg",
  "azerbaijan grand prix": "baku-1.svg",
  "singapore grand prix": "marina-bay-4.svg",
  "united states grand prix": "austin-1.svg",
  "mexico city grand prix": "mexico-city-3.svg",
  "mexican grand prix": "mexico-city-3.svg",
  "sao paulo grand prix": "interlagos-2.svg",
  "brazilian grand prix": "interlagos-2.svg",
  "las vegas grand prix": "las-vegas-1.svg",
  "qatar grand prix": "lusail-1.svg",
  "abu dhabi grand prix": "yas-marina-2.svg",
};

/** Lower-case and strip accents so "São Paulo Grand Prix" matches "sao paulo grand prix". */
function normalizeEventName(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export function circuitAssetForRace(race: string, year: number) {
  const name = normalizeEventName(race);
  // The Spanish Grand Prix moved from Barcelona to Madrid in 2026.
  const asset = name === "spanish grand prix" ? (year >= 2026 ? "madring-1.svg" : "catalunya-6.svg") : circuitAssets[name];
  return asset ? `/circuits/${asset}` : null;
}
