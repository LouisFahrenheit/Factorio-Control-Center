import { useEffect, useRef } from 'react';
import { getLocalLanguageOverride } from '../i18n/locale';
import { playAccessGrantedAnimation } from '../theme/loginGranted';

export { playAccessGrantedAnimation };

function preferredUiLanguage(): string {
  const localOverride = getLocalLanguageOverride();
  if (localOverride) return localOverride;
  return String(document.documentElement.getAttribute('lang') || 'en').trim() || 'en';
}

export function useLoginClock(active: boolean) {
  const clockRef = useRef<HTMLSpanElement>(null);
  const formatRef = useRef<Intl.DateTimeFormat | null>(null);

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (!clockRef.current) return;
      if (!formatRef.current) {
        formatRef.current = new Intl.DateTimeFormat(preferredUiLanguage(), {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
        });
      }
      clockRef.current.textContent = formatRef.current.format(new Date());
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  return clockRef;
}

export async function fetchAppHealth(): Promise<{ version?: string; build?: string } | null> {
  try {
    const r = await fetch('/api/health');
    if (!r.ok) return null;
    const j = (await r.json()) as { ok?: boolean; version?: string; build?: string };
    return j && j.ok ? j : null;
  } catch {
    return null;
  }
}

export function formatLoginHudVersion(h: { version?: string } | null): string {
  if (!h?.version) return '—';
  const v = String(h.version).trim();
  return v || '—';
}
