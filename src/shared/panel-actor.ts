/** Strip stored panel actor prefixes (`User:`, `System:`). */
export function stripPanelActorPrefix(raw: string | undefined): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s.replace(/^(User|System):\s*/i, '').trim() || s;
}

/** Plain-text actor label for server logs (no i18n). */
export function panelActorLogLabel(
  raw: string | undefined,
  fallback = 'system',
): string {
  const name = stripPanelActorPrefix(raw);
  if (!name) return fallback;
  if (name === 'api-token') return 'API';
  return name;
}
