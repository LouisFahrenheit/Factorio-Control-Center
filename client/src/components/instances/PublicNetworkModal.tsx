import { useState, useEffect } from 'react';
import {
  IconNetwork,
  IconWorld,
  IconInfoCircle,
  IconDeviceFloppy,
  IconLoader2,
  IconDownload,
} from '@tabler/icons-react';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import { CancelButton } from '../CancelButton';
import { FccSwitch } from '../FccSwitch';
import type { useProgramSettings } from '../../hooks/useProgramSettings';
import { notifyOk } from '../../lib/notify';

interface PublicNetworkModalProps {
  open: boolean;
  onClose: () => void;
  settings: ReturnType<typeof useProgramSettings>;
  currentRoute: string;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function PublicNetworkModal({
  open,
  onClose,
  settings,
  currentRoute,
  t,
}: PublicNetworkModalProps) {
  const [route, setRoute] = useState('/servers');
  const [host, setHost] = useState('');
  const [allowModDownloads, setAllowModDownloads] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRoute(
        settings.settings.public_page_route || currentRoute || '/servers',
      );
      setHost(settings.settings.public_host || '');
      setAllowModDownloads(
        Boolean(settings.settings.public_page_allow_mod_downloads),
      );
      setIsSaving(false);
    }
  }, [open, settings.settings, currentRoute]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    let normalizedRoute = route.trim();
    if (!normalizedRoute) {
      normalizedRoute = '/servers';
    } else if (!normalizedRoute.startsWith('/')) {
      normalizedRoute = '/' + normalizedRoute;
    }
    try {
      await Promise.all([
        settings.setPublicPageRoute(normalizedRoute),
        settings.setPublicHost(host.trim()),
        settings.setPublicPageAllowModDownloads(allowModDownloads),
      ]);
      notifyOk(
        t('public_page_network_title') || 'Сеть',
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
      id="publicNetworkModalBackdrop"
    >
      <div
        className="fu-modal public-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publicNetworkModalTitle"
      >
        <div className="fu-modal__header">
          <div className="public-settings-modal__icon">
            <IconNetwork size={20} />
          </div>
          <div className="public-settings-modal__title-wrap">
            <span id="publicNetworkModalTitle" className="fu-modal__title-text">
              {t('public_page_network_title') || 'Сеть'}
            </span>
            <span className="public-settings-modal__subtitle">
              {t('public_page_network_subtitle') ||
                'Маршрут страницы, адрес подключения и скачивание модов'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="fu-modal__body public-settings-modal__body">
            {/* Route field */}
            <div className="public-settings-modal__field">
              <label
                htmlFor="txtPublicModalRoute"
                className="public-settings-modal__label"
              >
                <IconWorld
                  size={15}
                  className="public-settings-modal__label-icon"
                />
                {t('public_page_route') || 'Маршрут публичной страницы'}
              </label>
              <input
                id="txtPublicModalRoute"
                type="text"
                className="input public-settings-modal__input"
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                placeholder="/servers"
              />
              <span className="public-settings-modal__field-hint">
                <IconInfoCircle
                  size={14}
                  className="public-settings-modal__field-hint-icon"
                />
                <span>
                  {t('public_page_route_hint') ||
                    'Относительный путь, по которому будет доступна страница (например: /servers или /public)'}
                </span>
              </span>
            </div>

            {/* Connection Address field */}
            <div className="public-settings-modal__field">
              <label
                htmlFor="txtPublicModalHost"
                className="public-settings-modal__label"
              >
                <IconNetwork
                  size={15}
                  className="public-settings-modal__label-icon"
                />
                {t('default_connection_address') ||
                  'Общий IP-адрес для подключения'}
              </label>
              <input
                id="txtPublicModalHost"
                type="text"
                className="input public-settings-modal__input"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder={t('auto') || 'auto'}
              />
              <span className="public-settings-modal__field-hint">
                <IconInfoCircle
                  size={14}
                  className="public-settings-modal__field-hint-icon"
                />
                <span>
                  {t('default_connection_address_desc') ||
                    'Будет использоваться, если локальный IP-адрес сервера 0.0.0.0. Оставьте пустым, чтобы подставлялся адрес, по которому открыта текущая страница.'}
                </span>
              </span>
            </div>

            {/* Toggle Card: Allow Mod Downloads */}
            <div
              className={`public-settings-modal__toggle-card ${allowModDownloads ? 'public-settings-modal__toggle-card--active' : ''}`}
            >
              <div className="public-settings-modal__toggle-left">
                <div className="public-settings-modal__toggle-badge">
                  <IconDownload size={18} />
                </div>
                <div className="public-settings-modal__toggle-info">
                  <span className="public-settings-modal__toggle-title">
                    {t('public_page_allow_mod_downloads') ||
                      'Разрешить скачивание модов'}
                  </span>
                  <span className="public-settings-modal__toggle-hint">
                    {allowModDownloads
                      ? t('public_page_mod_downloads_enabled_hint') ||
                        'Посетители могут скачивать сборки модов серверов'
                      : t('public_page_mod_downloads_disabled_hint') ||
                        'Прямое скачивание модов с публичной страницы отключено'}
                  </span>
                </div>
              </div>
              <FccSwitch
                id="pubModalAllowModDownloadsSwitch"
                checked={allowModDownloads}
                onChange={setAllowModDownloads}
                label=""
              />
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
