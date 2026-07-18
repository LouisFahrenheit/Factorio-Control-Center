export type ServerListModBadgeId =
  | 'krastorio'
  | 'nullius'
  | 'space_exploration'
  | 'ultracube'
  | 'pyanodons'
  | 'angels';

/** Display order for mod badges in the server list version column. */
export const SERVER_LIST_MOD_BADGE_ORDER: readonly ServerListModBadgeId[] = [
  'krastorio',
  'nullius',
  'space_exploration',
  'ultracube',
  'pyanodons',
  'angels',
];

const PYANODONS_MODS = new Set<string>([
  'pyalienlife',
  'pyalienlifegraphics',
  'pyalienlifegraphics2',
  'pyalienlifegraphics3',
  'pyalternativeenergy',
  'pyalternativeenergygraphics',
  'pycoalprocessing',
  'pycoalprocessinggraphics',
  'pyfusionenergy',
  'pyfusionenergygraphics',
  'pyhightech',
  'pyhightechgraphics',
  'pyindustry',
  'pyindustrygraphics',
  'pypetroleumhandling',
  'pypetroleumhandlinggraphics',
  'pypostprocessing',
  'pyrawores',
  'pyraworesgraphics',
]);

/** Any enabled mod whose name starts with `angels` (Angel's mod suite). */
const ANGELS_MOD_RE = /^angels/i;

export function normalizeModNameForBadge(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

function modMatchesBadge(
  normalized: string,
  badge: ServerListModBadgeId,
): boolean {
  switch (badge) {
    case 'krastorio':
      return normalized === 'krastorio2';
    case 'nullius':
      return normalized === 'nullius';
    case 'space_exploration':
      return normalized === 'space-exploration';
    case 'ultracube':
      return normalized === 'ultracube';
    case 'pyanodons':
      return PYANODONS_MODS.has(normalized);
    case 'angels':
      return ANGELS_MOD_RE.test(normalized);
    default:
      return false;
  }
}

/** Returns badge ids for enabled overhaul mods present in the mod list. */
export function detectServerListModBadges(
  enabledModNames: Iterable<string>,
): ServerListModBadgeId[] {
  const normalized = new Set<string>();
  for (const name of enabledModNames) {
    const n = normalizeModNameForBadge(name);
    if (n) normalized.add(n);
  }

  const found = new Set<ServerListModBadgeId>();
  for (const n of normalized) {
    for (const badge of SERVER_LIST_MOD_BADGE_ORDER) {
      if (modMatchesBadge(n, badge)) found.add(badge);
    }
  }

  return SERVER_LIST_MOD_BADGE_ORDER.filter((b) => found.has(b));
}
