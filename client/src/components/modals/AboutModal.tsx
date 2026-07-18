import { useEffect, useState } from 'react';
import { fetchAppHealth } from '../../hooks/useLoginScreen';
import {
  MATERIAL_SYMBOLS_LICENSE_URL,
  MATERIAL_SYMBOLS_SOURCE_URL,
  MIT_LICENSE_URL,
  NSSM_URL,
  TABLER_ICONS_URL,
} from '../../lib/appIcons';
import { AppIcon } from '../AppIcon';
import { ModalBackdrop } from './ModalBackdrop';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function AboutModal({ open, onClose, t }: AboutModalProps) {
  const [version, setVersion] = useState('—');
  const [build, setBuild] = useState('—');

  useEffect(() => {
    if (!open) return;
    void fetchAppHealth().then((h) => {
      setVersion(String(h?.version || '—'));
      const b = String(h?.build || '').trim();
      setBuild(b || '—');
    });
  }, [open]);

  return (
    <ModalBackdrop open={open} onClose={onClose} id="aboutModalBackdrop">
      <div className="fu-modal about-modal" role="dialog" aria-modal="true" aria-labelledby="aboutModalTitle">
        <div className="fu-modal__header" id="aboutModalTitle">
          {t('about_title')}
        </div>
        <div className="fu-modal__body about-modal__body">
          <section className="about-modal__hero">
            <div className="about-modal__brand" aria-hidden="true">
              FCC
            </div>
            <div className="about-modal__hero-main">
              <h2 className="about-modal__product" id="aboutProductName">
                {t('window_title')}
              </h2>
              <p className="about-modal__desc" id="aboutDesc">
                {t('about_description')}
              </p>
            </div>
          </section>

          <div className="about-modal__stats">
            <div className="about-modal__stat">
              <span className="about-modal__stat-label">{t('about_version_label')}</span>
              <span className="about-modal__stat-value" id="aboutVerLine">
                {version}
              </span>
            </div>
            <div className="about-modal__stat">
              <span className="about-modal__stat-label">{t('about_build_label')}</span>
              <span className="about-modal__stat-value about-modal__stat-value--muted" id="aboutBuildLine">
                {build}
              </span>
            </div>
            <a
              className="about-modal__stat about-modal__stat--link"
              href="https://github.com/LouisFahrenheit"
              target="_blank"
              rel="noopener noreferrer"
              id="aboutGithubLink"
            >
              <span className="about-modal__stat-label">{t('about_github')}</span>
              <span className="about-modal__stat-value">LouisFahrenheit</span>
            </a>
          </div>

          <section className="about-modal__section about-modal__section--credits">
            <h3 className="about-modal__section-title">{t('about_credits_section')}</h3>
            <div className="about-modal__credits">
              <article className="about-modal__credit-card">
                <h4 className="about-modal__credit-card-title">{t('window_title')}</h4>
                <p className="about-modal__credit-card-body" id="aboutAppLicense">
                  {t('about_app_license_credit_intro')}
                  <a href={MIT_LICENSE_URL} target="_blank" rel="noopener noreferrer">
                    MIT License
                  </a>
                  {t('about_app_license_credit_outro')}
                </p>
              </article>

              <article className="about-modal__credit-card about-modal__credit-card--legal">
                <h4 className="about-modal__credit-card-title">{t('about_factorio_block_label')}</h4>
                <ul className="about-modal__credit-list" id="aboutFactorioSprites">
                  <li>{t('about_factorio_assets_map_gen')}</li>
                  <li>{t('about_factorio_assets_sa_badge')}</li>
                </ul>
                <p className="about-modal__credit-card-body about-modal__credit-card-body--attribution">
                  {t('about_factorio_assets_permission')}
                  {t('about_factorio_assets_wube_images')}
                </p>
                <p className="about-modal__credit-card-body about-modal__credit-card-body--trademark" id="aboutLegal">
                  {t('about_trademark_notice')}
                </p>
              </article>

              <article className="about-modal__credit-card">
                <h4 className="about-modal__credit-card-title">{t('about_ui_icons_label')}</h4>
                <p className="about-modal__credit-card-body" id="aboutIconsCredit">
                  {t('about_ui_icons_credit_intro')}
                  <a href={MATERIAL_SYMBOLS_SOURCE_URL} target="_blank" rel="noopener noreferrer">
                    Material Symbols
                  </a>
                  {t('about_material_icons_credit_suffix')}
                  <a href={MATERIAL_SYMBOLS_LICENSE_URL} target="_blank" rel="noopener noreferrer">
                    Apache License 2.0
                  </a>
                  {t('about_ui_icons_credit_outro')}
                </p>
              </article>

              <article className="about-modal__credit-card">
                <h4 className="about-modal__credit-card-title">{t('about_tabler_icons_label')}</h4>
                <p className="about-modal__credit-card-body" id="aboutTablerIconsCredit">
                  <a href={TABLER_ICONS_URL} target="_blank" rel="noopener noreferrer">
                    Tabler Icons
                  </a>
                  {t('about_tabler_icons_credit')}
                </p>
              </article>

              <article className="about-modal__credit-card">
                <h4 className="about-modal__credit-card-title">{t('about_nssm_label')}</h4>
                <p className="about-modal__credit-card-body" id="aboutNssmCredit">
                  <a href={NSSM_URL} target="_blank" rel="noopener noreferrer">
                    NSSM
                  </a>
                  {t('about_nssm_credit')}
                </p>
              </article>
            </div>
          </section>
        </div>
        <div className="fu-modal__footer">
          <button type="button" className="btn btn--with-icon" id="aboutModalClose" onClick={onClose}>
            <AppIcon name="close" size={16} />
            {t('close')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
