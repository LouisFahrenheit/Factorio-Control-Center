function hash32(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function formatAxis(axis: 'X' | 'Y', value: number): string {
  const sign = value >= 0 ? '+' : '-';
  const abs = Math.abs(value).toFixed(2).padStart(8, '0');
  return `${axis} ${sign}${abs}`;
}

/** Deterministic surface coordinates from map seed and preview planet. */
export function previewPlanetCoordinates(seed: string, previewPlanet: string): string {
  const seedRaw = String(seed || '').trim();
  const genKey = `${previewPlanet}|${seedRaw || 'random'}`;
  const x = ((hash32(genKey) % 400000) - 200000) / 100;
  const y = ((hash32(`${genKey}:y`) % 400000) - 200000) / 100;
  return `${formatAxis('X', x)}  ${formatAxis('Y', y)}`;
}
