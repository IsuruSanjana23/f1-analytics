const circuitAssets: Record<string, string> = {
  "Australian Grand Prix": "melbourne-2.svg",
  "Chinese Grand Prix": "shanghai-1.svg",
  "Japanese Grand Prix": "suzuka-2.svg",
  "Bahrain Grand Prix": "bahrain-1.svg",
  "Saudi Arabian Grand Prix": "jeddah-1.svg",
  "Miami Grand Prix": "miami-1.svg",
  "Monaco Grand Prix": "monaco-6.svg",
  "Spanish Grand Prix": "madring-1.svg",
  "Barcelona-Catalunya Grand Prix": "catalunya-6.svg",
  "Canadian Grand Prix": "montreal-6.svg",
  "Austrian Grand Prix": "spielberg-3.svg",
  "British Grand Prix": "silverstone-8.svg",
  "Belgian Grand Prix": "spa-francorchamps-4.svg",
  "Hungarian Grand Prix": "hungaroring-3.svg",
  "Dutch Grand Prix": "zandvoort-5.svg",
  "Italian Grand Prix": "monza-7.svg",
  "Azerbaijan Grand Prix": "baku-1.svg",
  "Singapore Grand Prix": "marina-bay-4.svg",
  "United States Grand Prix": "austin-1.svg",
  "Mexico City Grand Prix": "mexico-city-3.svg",
  "Sao Paulo Grand Prix": "interlagos-2.svg",
  "Las Vegas Grand Prix": "las-vegas-1.svg",
  "Qatar Grand Prix": "lusail-1.svg",
  "Abu Dhabi Grand Prix": "yas-marina-2.svg",
};

export function circuitAssetForRace(race: string) {
  const asset = circuitAssets[race];
  return asset ? `/circuits/${asset}` : null;
}
