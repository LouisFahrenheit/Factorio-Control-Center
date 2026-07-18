/** Prefer RFC 5987 ``filename*`` over legacy ``filename=`` (ASCII fallback with ``?``). */
export function parseContentDispositionFilename(header: string, fallback: string): string {
  const cd = String(header || '');
  if (!cd) return fallback;

  const starMatches = [...cd.matchAll(/filename\*=(?:UTF-8|utf-8)''([^;]+)/gi)];
  for (let i = starMatches.length - 1; i >= 0; i--) {
    const raw = starMatches[i][1]?.trim();
    if (!raw) continue;
    try {
      return decodeURIComponent(raw.replace(/\+/g, '%20'));
    } catch {
      /* try next */
    }
  }

  const quoted = cd.match(/filename="([^"]*)"/i);
  if (quoted?.[1]) return quoted[1];

  const plain = cd.match(/filename=([^;]+)/i);
  if (plain?.[1]) return plain[1].trim().replace(/^["']|["']$/g, '');

  return fallback;
}

export function modsArchiveDownloadName(instanceName: string): string {
  const base = String(instanceName || '').trim() || 'server';
  return `${base}-mods.zip`;
}
