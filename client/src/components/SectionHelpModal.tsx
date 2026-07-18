import { AppIcon } from './AppIcon';
import type { AppIconName } from '../lib/appIcons';
import { ModalBackdrop } from './modals/ModalBackdrop';

export interface HelpSection {
  titleKey: string;
  textKey?: string;
  icon?: AppIconName;
  bulletKeys?: string[];
  tipKey?: string;
}

export interface SectionHelpContent {
  titleKey: string;
  introKey: string;
  sections: HelpSection[];
}

interface SectionHelpModalProps {
  open: boolean;
  onClose: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
  backdropId: string;
  titleId: string;
  closeId: string;
  content: SectionHelpContent;
}

export function SectionHelpModal({
  open,
  onClose,
  t,
  backdropId,
  titleId,
  closeId,
  content,
}: SectionHelpModalProps) {
  return (
    <ModalBackdrop open={open} onClose={onClose} id={backdropId}>
      <div
        className="fu-modal section-help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="fu-modal__header section-help-modal__header" id={titleId}>
          <AppIcon name="help" size={22} className="section-help-modal__header-icon" />
          <span className="section-help-modal__header-title">{t(content.titleKey)}</span>
        </div>
        <div className="fu-modal__body section-help-modal__body">
          <div className="section-help-modal__intro-card">
            <p className="section-help-modal__intro">{t(content.introKey)}</p>
          </div>
          <div className="section-help-modal__sections">
            {content.sections.map((section) => (
              <article key={section.titleKey} className="section-help-modal__card">
                <div className="section-help-modal__card-head">
                  {section.icon ? (
                    <span className="section-help-modal__card-icon" aria-hidden="true">
                      <AppIcon name={section.icon} size={20} />
                    </span>
                  ) : null}
                  <h4 className="section-help-modal__card-title">{t(section.titleKey)}</h4>
                </div>
                {section.textKey ? (
                  <p className="section-help-modal__card-text">{t(section.textKey)}</p>
                ) : null}
                {section.bulletKeys?.length ? (
                  <ul className="section-help-modal__list">
                    {section.bulletKeys.map((key) => (
                      <li key={key}>{t(key)}</li>
                    ))}
                  </ul>
                ) : null}
                {section.tipKey ? (
                  <aside className="section-help-modal__tip">
                    <AppIcon name="info" size={16} className="section-help-modal__tip-icon" />
                    <span>{t(section.tipKey)}</span>
                  </aside>
                ) : null}
              </article>
            ))}
          </div>
        </div>
        <div className="fu-modal__footer section-help-modal__footer">
          <button type="button" className="btn btn--with-icon" id={closeId} onClick={onClose}>
            <AppIcon name="close" size={16} />
            {t('close')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
