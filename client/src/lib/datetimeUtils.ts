export function panelUiLocale(): string {
  try {
    return document.documentElement.lang || navigator.language || 'en';
  } catch {
    return 'en';
  }
}

/** Parse panel/API timestamps (ISO, `YYYY-MM-DD HH:mm:ss`, bracketed). */
export function parsePanelDateTime(raw: unknown): number | null {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  const bracket = s.match(/^\[(.+)\]$/);
  if (bracket) s = bracket[1].trim();
  // Panel server stamps: UTC `YYYY-MM-DD HH:mm:ss` (no Z).
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    const ms = Date.parse(s.replace(' ', 'T') + 'Z');
    if (Number.isFinite(ms)) return ms;
  }
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

/** Human-readable date/time for the panel UI (locale + local timezone). */
export function formatPanelDateTime(raw: unknown, placeholder = '—'): string {
  const s = String(raw ?? '').trim();
  if (!s) return placeholder;
  const ms = parsePanelDateTime(s);
  if (ms == null) {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}:\d{2}:\d{2})/);
    if (m) return `${m[3]}.${m[2]}.${m[1]}, ${m[4]}`;
    return s;
  }
  try {
    return new Intl.DateTimeFormat(panelUiLocale(), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

/** Date only (mods, modpacks). */
export function formatPanelDateOnly(raw: unknown, placeholder = '—'): string {
  const s = String(raw ?? '').trim();
  if (!s) return placeholder;
  const ms = parsePanelDateTime(s);
  if (ms == null) {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}.${m[2]}.${m[1]}`;
    return s;
  }
  try {
    return new Intl.DateTimeFormat(panelUiLocale(), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleDateString();
  }
}

/** Time-of-day only (event log rows). */
export function formatPanelClock(raw: unknown, placeholder = '—'): string {
  const s = String(raw ?? '').trim();
  if (!s) return placeholder;
  const ms = parsePanelDateTime(s);
  if (ms != null) {
    try {
      return new Intl.DateTimeFormat(panelUiLocale(), {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date(ms));
    } catch {
      /* fall through */
    }
  }
  const m = s.match(/(\d{2}:\d{2}:\d{2})/);
  return m ? m[1] : s.length > 8 ? s.slice(-8) : s;
}
