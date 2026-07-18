import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useLocale } from '../../i18n/LocaleProvider';
import { applyUiScale, getStoredUiScale, type FccUiScale } from '../../theme/uiScale';
import {
  applyEffectiveTheme,
  FCC_THEMES,
  getLocalThemeOverride,
  getProgramDefaultTheme,
  setLocalThemeOverride,
} from '../../theme/themes';
import { getLocalLanguageOverride, setLocalLanguageOverride } from '../../i18n/locale';
import { readUserToastDurationSec, readUserShowServerListModBadges, setUserShowServerListModBadges, setUserToastDurationSec } from '../../lib/userPrefs';
import type { ProgramSettings } from '../../types/programSettings';
import { AppIcon } from '../AppIcon';
import { FccSwitch } from '../FccSwitch';
import { ModalBackdrop } from './ModalBackdrop';

interface UserSettingsModalProps {
  open: boolean;
  onClose: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function UserSettingsModal({ open, onClose, t }: UserSettingsModalProps) {
  const qc = useQueryClient();
  const { availableLanguages } = useLocale();
  const [theme, setTheme] = useState('');
  const [uiScale, setScale] = useState('auto');
  const [lang, setLang] = useState('');
  const [toastSec, setToastSec] = useState('5');
  const [disableEffects, setDisableEffects] = useState(false);
  const [translateModNames, setTranslateModNames] = useState(true);
  const [showModBadges, setShowModBadges] = useState(true);

  useEffect(() => {
    if (!open) return;
    setTheme(getLocalThemeOverride());
    setScale(getStoredUiScale());
    setLang(getLocalLanguageOverride());
    setToastSec(readUserToastDurationSec());
    setDisableEffects(localStorage.getItem('fcc_user_web_disable_effects') === '1');
    setShowModBadges(readUserShowServerListModBadges());
    void api<ProgramSettings>('/api/config/program')
      .then((r) => {
        setTranslateModNames(r.translate_mod_names !== false);
      })
      .catch(() => {
        /* keep default */
      });
  }, [open]);

  async function saveTranslateModNames(checked: boolean) {
    const prev = translateModNames;
    setTranslateModNames(checked);
    try {
      await api('/api/config/program', {
        method: 'PUT',
        body: JSON.stringify({ translate_mod_names: checked }),
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['program', 'settings'] }),
        qc.invalidateQueries({ queryKey: ['mods'] }),
        qc.invalidateQueries({ queryKey: ['modpacks'] }),
      ]);
    } catch {
      setTranslateModNames(prev);
    }
  }

  function applyAndClose() {
    const prevLang = getLocalLanguageOverride();
    setLocalThemeOverride(theme);
    applyEffectiveTheme(getProgramDefaultTheme());
    applyUiScale(uiScale as FccUiScale);
    setLocalLanguageOverride(lang);
    setUserToastDurationSec(toastSec);
    if (disableEffects) document.documentElement.setAttribute('data-web-disable-effects', '1');
    else document.documentElement.removeAttribute('data-web-disable-effects');
    localStorage.setItem('fcc_user_web_disable_effects', disableEffects ? '1' : '0');
    setUserShowServerListModBadges(showModBadges);
    onClose();
    if (prevLang !== String(lang || '').trim().toLowerCase()) {
      window.location.reload();
    }
  }

  function languageLabel(code: string): string {
    const key = `lang_name_${code}`;
    const label = t(key);
    return label !== key ? label : code.toUpperCase();
  }

  return (
    <ModalBackdrop open={open} onClose={onClose} id="userSettingsBackdrop">
      <div className="fu-modal user-settings-modal" role="dialog" aria-modal="true" aria-labelledby="userSettingsHeading">
        <div className="fu-modal__header fu-modal__header--with-icon" id="userSettingsHeading">
          <AppIcon name="settings_account" size={20} />
          {t('web_user_settings_title')}
        </div>
        <div className="fu-modal__body user-settings-modal__body">
          <section className="user-settings-modal__hero">
            <div className="user-settings-modal__brand" aria-hidden="true">
              <AppIcon name="settings_account" size={22} />
            </div>
            <p className="user-settings-modal__intro">{t('web_user_settings_intro')}</p>
          </section>

          <section className="user-settings-modal__section">
            <h3 className="user-settings-modal__section-title">{t('web_user_settings_section_appearance')}</h3>
            <div className="user-settings-grid user-settings-grid--appearance">
              {availableLanguages.length > 0 ? (
                <label className="user-settings-field user-settings-field--select" htmlFor="selLanguage">
                  <span className="user-settings-field__label">{t('program_language_label')}</span>
                  <select id="selLanguage" className="input input--narrow" value={lang} onChange={(e) => setLang(e.target.value)}>
                    <option value="">{t('program_language_default_user')}</option>
                    {availableLanguages.map((code) => (
                      <option key={code} value={code}>
                        {languageLabel(code)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="user-settings-field user-settings-field--select" htmlFor="selTheme">
                <span className="user-settings-field__label">{t('program_theme_label')}</span>
                <select
                  id="selTheme"
                  className="input input--narrow"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                >
                  <option value="">{t('program_language_panel_default_tip') || 'Default'}</option>
                  {FCC_THEMES.map((th) => (
                    <option key={th.id} value={th.id}>
                      {t('ui_theme_' + th.id) || th.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="user-settings-field user-settings-field--select" htmlFor="selUiScale">
                <span className="user-settings-field__label">{t('program_ui_scale_label')}</span>
                <select id="selUiScale" className="input input--narrow" value={uiScale} onChange={(e) => setScale(e.target.value)}>
                  <option value="auto">{t('ui_scale_auto')}</option>
                  <option value="1">100%</option>
                  <option value="1.25">125%</option>
                  <option value="1.5">150%</option>
                  <option value="1.75">175%</option>
                  <option value="2">200%</option>
                </select>
              </label>
            </div>
          </section>

          <section className="user-settings-modal__section user-settings-modal__section--interface">
            <h3 className="user-settings-modal__section-title">{t('web_user_settings_section_interface')}</h3>
            <div className="user-settings-grid user-settings-grid--interface">
              <label className="user-settings-field user-settings-field--select" htmlFor="inpToastDurationSec">
                <span className="user-settings-field__label">{t('program_toast_duration_sec_label')}</span>
                <input
                  type="number"
                  id="inpToastDurationSec"
                  className="input input--narrow"
                  min={1}
                  max={20}
                  step={1}
                  value={toastSec}
                  onChange={(e) => setToastSec(e.target.value)}
                />
                <span className="user-settings-field__hint">{t('program_toast_duration_sec_tip')}</span>
              </label>
              <div
                className="user-settings-field user-settings-field--switch"
                title={t('program_translate_mod_names_tip')}
              >
                <FccSwitch
                  id="cbTranslateModNames"
                  className="user-settings-field__switch"
                  labelClassName="user-settings-field__switch-label"
                  checked={translateModNames}
                  onChange={(checked) => void saveTranslateModNames(checked)}
                  label={t('program_translate_mod_names_cb')}
                />
              </div>
              <div className="user-settings-field user-settings-field--switch">
                <FccSwitch
                  id="cbWebDisableEffects"
                  className="user-settings-field__switch"
                  labelClassName="user-settings-field__switch-label"
                  checked={disableEffects}
                  onChange={setDisableEffects}
                  label={t('program_web_disable_effects_cb')}
                />
              </div>
              <div
                className="user-settings-field user-settings-field--switch"
                title={t('program_show_server_list_mod_badges_tip')}
              >
                <FccSwitch
                  id="cbShowServerListModBadges"
                  className="user-settings-field__switch"
                  labelClassName="user-settings-field__switch-label"
                  checked={showModBadges}
                  onChange={setShowModBadges}
                  label={t('program_show_server_list_mod_badges_cb')}
                />
              </div>
            </div>
          </section>
        </div>
        <div className="fu-modal__footer">
          <button type="button" className="btn btn--primary btn--with-icon" id="btnUserSettingsClose" onClick={applyAndClose}>
            <AppIcon name="save" size={16} />
            {t('save_btn')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
