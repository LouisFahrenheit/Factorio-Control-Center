import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { applyEffectiveTheme } from '../theme/themes';
import { initUiScaleFromStorage } from '../theme/uiScale';
import { setDefaultToastDurationSec } from '../lib/userPrefs';
import {
  applyI18nToDocument,
  getLocalLanguageOverride,
  translate,
  type LocaleStrings,
} from './locale';

interface LocaleBootstrapPayload {
  ok?: boolean;
  lang?: string;
  strings?: LocaleStrings;
  theme?: string;
  web_disable_effects?: boolean;
  default_web_credentials?: boolean;
  available_languages?: string[];
  default_toast_duration_sec?: number;
  panel_default_language?: string;
  public_page_enabled?: boolean;
  public_page_route?: string;
  public_page_title?: string;
  public_page_subtitle?: string;
  public_page_theme?: string;
  public_page_hide_title?: boolean;
  public_page_hide_subtitle?: boolean;
  public_page_allow_mod_downloads?: boolean;
  public_page_show_players?: boolean;
  public_page_contact_link?: string;
}

interface LocaleContextValue {
  ready: boolean;
  strings: LocaleStrings;
  availableLanguages: string[];
  panelDefaultLanguage: string;
  defaultWebCredentialsActive: boolean;
  publicPageEnabled: boolean;
  publicPageRoute: string;
  publicPageTitle: string;
  publicPageSubtitle: string;
  publicPageTheme: string;
  publicPageHideTitle: boolean;
  publicPageHideSubtitle: boolean;
  publicPageAllowModDownloads: boolean;
  publicPageShowPlayers: boolean;
  publicPageContactLink: string;
  t: (key: string, ...args: (string | number)[]) => string;
  reload: () => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue>({
  ready: false,
  strings: {},
  availableLanguages: [],
  panelDefaultLanguage: 'en',
  defaultWebCredentialsActive: false,
  publicPageEnabled: false,
  publicPageRoute: '/servers',
  publicPageTitle: '',
  publicPageSubtitle: '',
  publicPageTheme: '',
  publicPageHideTitle: false,
  publicPageHideSubtitle: false,
  publicPageAllowModDownloads: false,
  publicPageShowPlayers: false,
  publicPageContactLink: '',
  t: (key) => key,
  reload: async () => {},
});

export function useLocale() {
  return useContext(LocaleContext);
}

export function useT() {
  return useContext(LocaleContext).t;
}

function syncWebDisableEffects(on: boolean): void {
  if (on) document.documentElement.setAttribute('data-web-disable-effects', '1');
  else document.documentElement.removeAttribute('data-web-disable-effects');
}

async function fetchLocaleBootstrap(): Promise<LocaleBootstrapPayload> {
  const preferred = getLocalLanguageOverride();
  const q = preferred ? `?lang=${encodeURIComponent(preferred)}` : '';
  const res = await fetch(`/api/locale-bootstrap${q}`);
  if (!res.ok) throw new Error('locale_bootstrap_failed');
  return (await res.json()) as LocaleBootstrapPayload;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [strings, setStrings] = useState<LocaleStrings>({});
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [panelDefaultLanguage, setPanelDefaultLanguage] = useState('en');
  const [defaultWebCredentialsActive, setDefaultWebCredentialsActive] = useState(false);
  const [publicPageEnabled, setPublicPageEnabled] = useState(false);
  const [publicPageRoute, setPublicPageRoute] = useState('/servers');
  const [publicPageTitle, setPublicPageTitle] = useState('');
  const [publicPageSubtitle, setPublicPageSubtitle] = useState('');
  const [publicPageTheme, setPublicPageTheme] = useState('');
  const [publicPageHideTitle, setPublicPageHideTitle] = useState(false);
  const [publicPageHideSubtitle, setPublicPageHideSubtitle] = useState(false);
  const [publicPageAllowModDownloads, setPublicPageAllowModDownloads] = useState(false);
  const [publicPageShowPlayers, setPublicPageShowPlayers] = useState(false);
  const [publicPageContactLink, setPublicPageContactLink] = useState('');

  const load = useCallback(async () => {
    initUiScaleFromStorage();
    try {
      const j = await fetchLocaleBootstrap();
      const next = j.strings || {};
      setStrings(next);
      setAvailableLanguages(
        Array.isArray(j.available_languages)
          ? j.available_languages.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
          : [],
      );
      setPanelDefaultLanguage(String(j.panel_default_language || 'en').trim().toLowerCase() || 'en');
      if (typeof j.default_toast_duration_sec === 'number') {
        setDefaultToastDurationSec(j.default_toast_duration_sec);
      }
      if (j.theme && typeof j.theme === 'string') {
        applyEffectiveTheme(j.theme);
      }
      if (typeof j.web_disable_effects === 'boolean') {
        syncWebDisableEffects(j.web_disable_effects);
      }
      setDefaultWebCredentialsActive(j.default_web_credentials === true);
      setPublicPageEnabled(j.public_page_enabled === true);
      if (j.public_page_route) setPublicPageRoute(j.public_page_route);
      setPublicPageTitle(j.public_page_title || '');
      setPublicPageSubtitle(j.public_page_subtitle || '');
      setPublicPageTheme(j.public_page_theme || '');
      setPublicPageHideTitle(j.public_page_hide_title === true);
      setPublicPageHideSubtitle(j.public_page_hide_subtitle === true);
      setPublicPageAllowModDownloads(j.public_page_allow_mod_downloads === true);
      setPublicPageShowPlayers(j.public_page_show_players === true);
      setPublicPageContactLink(j.public_page_contact_link || '');
      if (j.lang) {
        document.documentElement.lang = j.lang;
      }
    } finally {
      document.documentElement.classList.remove('locale-booting');
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Never leave login blocked if locale-bootstrap hangs.
  useEffect(() => {
    const bootFailsafe = window.setTimeout(() => {
      document.documentElement.classList.remove('locale-booting');
    }, 8000);
    return () => window.clearTimeout(bootFailsafe);
  }, []);

  const t = useCallback(
    (key: string, ...args: (string | number)[]) => translate(strings, key, ...args),
    [strings],
  );

  useEffect(() => {
    if (!ready) return;
    applyI18nToDocument(strings, t);
  }, [ready, strings, t]);

  const value = useMemo(
    () => ({
      ready,
      strings,
      availableLanguages,
      panelDefaultLanguage,
      defaultWebCredentialsActive,
      publicPageEnabled,
      publicPageRoute,
      publicPageTitle,
      publicPageSubtitle,
      publicPageTheme,
      publicPageHideTitle,
      publicPageHideSubtitle,
      publicPageAllowModDownloads,
      publicPageShowPlayers,
      publicPageContactLink,
      t,
      reload: load,
    }),
    [ready, strings, availableLanguages, panelDefaultLanguage, defaultWebCredentialsActive, publicPageEnabled, publicPageRoute, publicPageTitle, publicPageSubtitle, publicPageTheme, publicPageHideTitle, publicPageHideSubtitle, publicPageAllowModDownloads, publicPageShowPlayers, publicPageContactLink, t, load],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
