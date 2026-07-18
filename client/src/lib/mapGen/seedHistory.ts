const STORAGE_KEY = 'fcc_map_gen_seed_history';
export const MAP_GEN_SEED_HISTORY_SIZE = 4;
const MAX_SEEDS = MAP_GEN_SEED_HISTORY_SIZE;

export function readSeedHistory(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => String(v || '').trim())
      .filter((v) => v.length > 0 && /^\d+$/.test(v))
      .slice(0, MAX_SEEDS);
  } catch {
    return [];
  }
}

export function pushSeedHistory(seed: string): string[] {
  const trimmed = String(seed || '').trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return readSeedHistory();
  const current = readSeedHistory();
  if (current.includes(trimmed)) return current;
  const next = [trimmed, ...current].slice(0, MAX_SEEDS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}
