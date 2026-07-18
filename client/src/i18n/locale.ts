export type LocaleStrings = Record<string, string>;

export function getLocalLanguageOverride(): string {
  try {
    return String(localStorage.getItem('fcc_lang') || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

export function setLocalLanguageOverride(code: string): void {
  try {
    const v = String(code || '').trim().toLowerCase();
    if (v) localStorage.setItem('fcc_lang', v);
    else localStorage.removeItem('fcc_lang');
  } catch {
    /* ignore */
  }
}

export function translate(strings: LocaleStrings, key: string, ...args: (string | number)[]): string {
  let s = (strings && typeof strings[key] === 'string' && strings[key]) || key;
  args.forEach((a, i) => {
    s = s.split(`{${i}}`).join(String(a));
  });
  if (args.length && /\{\}/.test(s)) {
    s = s.replace('{}', String(args[0]));
  }
  return s;
}

export function applyI18nToDocument(strings: LocaleStrings, t: (key: string, ...args: (string | number)[]) => string): void {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    if (el.hasAttribute('data-i18n-dynamic')) return;
    // React buttons with AppIcon keep label via {t(...)}; textContent would remove the icon.
    if (el.querySelector('.app-icon')) return;
    const k = el.getAttribute('data-i18n');
    if (k) el.textContent = t(k);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const k = el.getAttribute('data-i18n-placeholder');
    if (k) el.setAttribute('placeholder', t(k));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const k = el.getAttribute('data-i18n-title');
    if (k) {
      const title = t(k);
      el.setAttribute('title', title);
      if (el.tagName === 'BUTTON' && !el.getAttribute('aria-label')) {
        el.setAttribute('aria-label', title);
      }
    }
  });
  if (strings.window_title) {
    document.title = strings.window_title;
  }
}
