import { useState, useEffect } from 'react';
import {
  IconPalette,
  IconEye,
  IconEyeOff,
  IconHeading,
  IconFileText,
  IconBrush,
  IconDeviceFloppy,
  IconLoader2,
  IconUsers,
  IconBrandDiscord,
  IconBrandTelegram,
  IconBrandGithub,
  IconWorld,
  IconInfoCircle,
} from '@tabler/icons-react';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import { CancelButton } from '../CancelButton';
import { FccSwitch } from '../FccSwitch';
import { FCC_THEMES } from '../../theme/themes';
import type { useProgramSettings } from '../../hooks/useProgramSettings';
import { notifyOk } from '../../lib/notify';

interface PublicAppearanceModalProps {
  open: boolean;
  onClose: () => void;
  settings: ReturnType<typeof useProgramSettings>;
  t: (key: string, ...args: (string | number)[]) => string;
}

function getContactLinkIcon(url: string) {
  const norm = url.toLowerCase();
  if (norm.includes('discord')) return <IconBrandDiscord size={18} />;
  if (norm.includes('t.me') || norm.includes('telegram'))
    return <IconBrandTelegram size={18} />;
  if (norm.includes('github')) return <IconBrandGithub size={18} />;
  return <IconWorld size={18} />;
}

export function PublicAppearanceModal({
  open,
  onClose,
  settings,
  t,
}: PublicAppearanceModalProps) {
  const [theme, setTheme] = useState('');
  const [hideTitle, setHideTitle] = useState(false);
  const [hideSubtitle, setHideSubtitle] = useState(false);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [showPlayers, setShowPlayers] = useState(false);
  const [contactLink, setContactLink] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTheme(settings.settings.public_page_theme || '');
      setHideTitle(Boolean(settings.settings.public_page_hide_title));
      setHideSubtitle(Boolean(settings.settings.public_page_hide_subtitle));
      setTitle(settings.settings.public_page_title || '');
      setSubtitle(settings.settings.public_page_subtitle || '');
      setShowPlayers(Boolean(settings.settings.public_page_show_players));
      setContactLink(settings.settings.public_page_contact_link || '');
      setIsSaving(false);
    }
  }, [open, settings.settings]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      await Promise.all([
        settings.setPublicPageTheme(theme),
        settings.setPublicPageHideTitle(hideTitle),
        settings.setPublicPageHideSubtitle(hideSubtitle),
        settings.setPublicPageTitle(title.trim()),
        settings.setPublicPageSubtitle(subtitle.trim()),
        settings.setPublicPageShowPlayers(showPlayers),
        settings.setPublicPageContactLink(contactLink.trim()),
      ]);
      notifyOk(
        t('public_page_appearance_title') || 'Оформление страницы',
        t('updated_successfully') || 'Настройки сохранены',
      );
      onClose();
    } catch {
      setIsSaving(false);
    }
  };

  return (
    <ModalBackdrop
      open={open}
      onClose={onClose}
      id="publicAppearanceModalBackdrop"
    >
      <div
        className="fu-modal public-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publicAppearanceModalTitle"
      >
        <div className="fu-modal__header">
          <div className="public-settings-modal__icon">
            <IconPalette size={20} />
          </div>
          <div className="public-settings-modal__title-wrap">
            <span
              id="publicAppearanceModalTitle"
              className="fu-modal__title-text"
            >
              {t('public_page_appearance_title') || 'Оформление страницы'}
            </span>
            <span className="public-settings-modal__subtitle">
              {t('public_page_appearance_subtitle') ||
                'Настройка темы оформления, заголовков и текста публичной страницы'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="fu-modal__body public-settings-modal__body">
            {/* Theme selector */}
            <div className="public-settings-modal__field">
              <label
                htmlFor="selPublicModalTheme"
                className="public-settings-modal__label"
              >
                <IconBrush
                  size={15}
                  className="public-settings-modal__label-icon"
                />
                {t('public_page_theme') || 'Тема страницы'}
              </label>
              <select
                id="selPublicModalTheme"
                className="input public-settings-modal__select"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                <option value="">
                  {t('theme_default') || 'Как в панели (По умолчанию)'}
                </option>
                {FCC_THEMES.map((th) => (
                  <option key={th.id} value={th.id}>
                    {t('ui_theme_' + th.id) || th.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Toggle Card: Hide Title */}
            <div
              className={`public-settings-modal__toggle-card ${hideTitle ? 'public-settings-modal__toggle-card--active' : ''}`}
            >
              <div className="public-settings-modal__toggle-left">
                <div className="public-settings-modal__toggle-badge">
                  {hideTitle ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                </div>
                <div className="public-settings-modal__toggle-info">
                  <span className="public-settings-modal__toggle-title">
                    {t('public_page_hide_title') || 'Скрыть заголовок'}
                  </span>
                  <span className="public-settings-modal__toggle-hint">
                    {hideTitle
                      ? t('public_page_title_hidden_hint') ||
                        'Главный заголовок скрыт с публичной страницы'
                      : t('public_page_title_visible_hint') ||
                        'Главный заголовок отображается в шапке'}
                  </span>
                </div>
              </div>
              <FccSwitch
                id="pubModalHideTitleSwitch"
                checked={hideTitle}
                onChange={setHideTitle}
                label=""
              />
            </div>

            {/* Title Input (only if not hidden) */}
            {!hideTitle && (
              <div className="public-settings-modal__field">
                <label
                  htmlFor="txtPublicModalTitle"
                  className="public-settings-modal__label"
                >
                  <IconHeading
                    size={15}
                    className="public-settings-modal__label-icon"
                  />
                  {t('public_page_title') || 'Заголовок страницы'}
                </label>
                <input
                  id="txtPublicModalTitle"
                  type="text"
                  className="input public-settings-modal__input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    t('public_servers_page_title') || 'Серверы Factorio'
                  }
                />
              </div>
            )}

            {/* Toggle Card: Hide Subtitle */}
            <div
              className={`public-settings-modal__toggle-card ${hideSubtitle ? 'public-settings-modal__toggle-card--active' : ''}`}
            >
              <div className="public-settings-modal__toggle-left">
                <div className="public-settings-modal__toggle-badge">
                  {hideSubtitle ? (
                    <IconEyeOff size={18} />
                  ) : (
                    <IconEye size={18} />
                  )}
                </div>
                <div className="public-settings-modal__toggle-info">
                  <span className="public-settings-modal__toggle-title">
                    {t('public_page_hide_subtitle') || 'Скрыть подзаголовок'}
                  </span>
                  <span className="public-settings-modal__toggle-hint">
                    {hideSubtitle
                      ? t('public_page_subtitle_hidden_hint') ||
                        'Подзаголовок скрыт с публичной страницы'
                      : t('public_page_subtitle_visible_hint') ||
                        'Поясняющий текст отображается под заголовком'}
                  </span>
                </div>
              </div>
              <FccSwitch
                id="pubModalHideSubtitleSwitch"
                checked={hideSubtitle}
                onChange={setHideSubtitle}
                label=""
              />
            </div>

            {/* Subtitle Textarea (only if not hidden) */}
            {!hideSubtitle && (
              <div className="public-settings-modal__field">
                <label
                  htmlFor="txtPublicModalSubtitle"
                  className="public-settings-modal__label"
                >
                  <IconFileText
                    size={15}
                    className="public-settings-modal__label-icon"
                  />
                  {t('public_page_subtitle') || 'Подзаголовок страницы'}
                </label>
                <textarea
                  id="txtPublicModalSubtitle"
                  className="input public-settings-modal__textarea"
                  rows={3}
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder={
                    t('public_servers_page_desc') ||
                    'Выберите сервер, чтобы просмотреть подробности или подключиться.'
                  }
                />
              </div>
            )}

            {/* Toggle Card: Show Players */}
            <div
              className={`public-settings-modal__toggle-card ${showPlayers ? 'public-settings-modal__toggle-card--active' : ''}`}
            >
              <div className="public-settings-modal__toggle-left">
                <div className="public-settings-modal__toggle-badge">
                  <IconUsers size={18} />
                </div>
                <div className="public-settings-modal__toggle-info">
                  <span className="public-settings-modal__toggle-title">
                    {t('public_page_show_players') ||
                      'Показывать список игроков'}
                  </span>
                  <span className="public-settings-modal__toggle-hint">
                    {showPlayers
                      ? t('public_page_players_visible_hint') ||
                        'Список онлайн-игроков отображается на карточках серверов'
                      : t('public_page_players_hidden_hint') ||
                        'Список игроков скрыт с публичной страницы'}
                  </span>
                </div>
              </div>
              <FccSwitch
                id="pubModalShowPlayersSwitch"
                checked={showPlayers}
                onChange={setShowPlayers}
                label=""
              />
            </div>

            {/* External Contact Link Field */}
            <div className="public-settings-modal__field">
              <label
                htmlFor="txtPublicModalContactLink"
                className="public-settings-modal__label"
              >
                <span className="public-settings-modal__label-icon">
                  {getContactLinkIcon(contactLink)}
                </span>
                {t('public_page_contact_link') ||
                  'Ссылка на контакты / сообщество'}
              </label>
              <div className="public-settings-modal__input-with-icon">
                <span className="public-settings-modal__input-icon">
                  {getContactLinkIcon(contactLink)}
                </span>
                <input
                  id="txtPublicModalContactLink"
                  type="text"
                  className="input public-settings-modal__input"
                  value={contactLink}
                  onChange={(e) => setContactLink(e.target.value)}
                  placeholder="https://discord.gg/... или https://t.me/..."
                />
              </div>
              <span className="public-settings-modal__field-hint">
                <IconInfoCircle
                  size={14}
                  className="public-settings-modal__field-hint-icon"
                />
                <span>
                  {t('public_page_contact_link_desc') ||
                    'Ссылка на ваш Discord, Telegram или веб-сайт. Отображается вверху публичной страницы.'}
                </span>
              </span>
            </div>
          </div>

          <div className="fu-modal__footer">
            <CancelButton onClick={onClose} disabled={isSaving} t={t} />
            <button
              type="submit"
              className="btn btn-primary public-settings-modal__save-btn"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <IconLoader2 size={16} className="btn-spinner" />
                  <span>{t('saving') || 'Сохранение...'}</span>
                </>
              ) : (
                <>
                  <IconDeviceFloppy size={16} />
                  <span>{t('save_btn') || 'Сохранить'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}
