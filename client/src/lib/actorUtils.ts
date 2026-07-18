import { stripPanelActorPrefix } from '@fcc/shared/panel-actor';

/** Strip "User: " / "System: " prefixes from panel actor strings for display. */
export function formatPanelActorName(
  raw: string | undefined,
  t?: (key: string) => string,
): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const name = stripPanelActorPrefix(s);
  if (name === 'api-token') {
    return t ? t('panel_actor_api_token') : 'API';
  }
  return name;
}

export function formatPanelActorDisplay(raw: string | undefined, t?: (key: string) => string): string {
  const name = formatPanelActorName(raw, t);
  return name || '—';
}
