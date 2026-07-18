import { useEffect, useRef, useState } from 'react';
import { IconChevronDown, IconPalette } from '@tabler/icons-react';
import { applyTheme, FCC_THEMES, resolveEffectiveTheme, type FccThemeId } from '../theme/themes';
import { useT } from '../i18n/LocaleProvider';

const THEME_I18N: Record<FccThemeId, string> = {
  fcc_classic: 'ui_theme_fcc_classic',
  dark_space: 'ui_theme_dark_space',
  vulcanus: 'ui_theme_vulcanus',
  ion_storm: 'ui_theme_ion_storm',
  cryogenics: 'ui_theme_cryogenics',
};

export function LoginThemePicker() {
  const t = useT();
  const [theme, setTheme] = useState<FccThemeId>(resolveEffectiveTheme);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onApplied = (e: Event) => {
      const detail = (e as CustomEvent<{ theme?: FccThemeId }>).detail?.theme;
      if (detail) setTheme(detail);
    };
    window.addEventListener('fcc-theme-applied', onApplied);
    return () => window.removeEventListener('fcc-theme-applied', onApplied);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(id: FccThemeId) {
    setTheme(id);
    applyTheme(id, { persist: 'user' });
    setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className={`login-theme-picker${open ? ' is-open' : ''}`}
    >
      <button
        type="button"
        className="login-theme-picker__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t('program_theme_label')}
      >
        <IconPalette size={15} stroke={1.6} className="login-theme-picker__icon" aria-hidden="true" />
        <span className="login-theme-picker__swatch" data-theme-chip={theme} aria-hidden="true" />
        <span className="login-theme-picker__current">{t(THEME_I18N[theme])}</span>
        <IconChevronDown size={14} stroke={2} className="login-theme-picker__chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul className="login-theme-picker__menu" role="listbox" aria-label={t('program_theme_label')}>
          {FCC_THEMES.map((item) => (
            <li key={item.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={theme === item.id}
                className={`login-theme-picker__option${theme === item.id ? ' is-active' : ''}`}
                data-theme-chip={item.id}
                onClick={() => pick(item.id)}
              >
                <span className="login-theme-picker__swatch" aria-hidden="true" />
                <span className="login-theme-picker__option-label">{t(THEME_I18N[item.id])}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
