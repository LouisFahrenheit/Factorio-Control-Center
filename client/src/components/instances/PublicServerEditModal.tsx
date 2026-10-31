import { useState, useEffect } from 'react';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import { CancelButton } from '../CancelButton';
import { FccSwitch } from '../FccSwitch';
import { AppIcon } from '../AppIcon';
import type { InstanceItem } from '../../types/instance';

interface PublicServerEditModalProps {
  server: InstanceItem | null;
  onClose: () => void;
  onSave: (
    server: InstanceItem,
    isPublic: boolean,
    description: string,
    address: string,
  ) => Promise<void>;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function PublicServerEditModal({
  server,
  onClose,
  onSave,
  t,
}: PublicServerEditModalProps) {
  const [isPublic, setIsPublic] = useState(false);
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (server) {
      setIsPublic(Boolean(server.isPublic));
      setDescription(server.publicDescription || '');
      setAddress(server.publicConnectionAddress || '');
      setIsSaving(false);
    }
  }, [server]);

  if (!server) return null;

  const isRunning = server.status === 'running';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSave(server, isPublic, description.trim(), address.trim());
      onClose();
    } catch {
      setIsSaving(false);
    }
  };

  const defaultIpPlaceholder =
    server.ip === '0.0.0.0'
      ? t('auto') || 'Auto (0.0.0.0)'
      : server.ip || '0.0.0.0';

  return (
    <ModalBackdrop
      open={Boolean(server)}
      onClose={onClose}
      id="publicServerEditBackdrop"
    >
      <div
        className="fu-modal public-server-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publicServerEditTitle"
      >
        <div className="fu-modal__header fu-modal__header--with-icon">
          <AppIcon name="edit" size={18} />
          <div className="public-server-edit-modal__title-wrap">
            <span id="publicServerEditTitle" className="fu-modal__title-text">
              {t('public_server_edit_title') || 'Настройки отображения сервера'}
            </span>
            <span className="public-server-edit-modal__server-name">
              <span
                className={`instance-run-dot ${isRunning ? 'instance-run-dot--on' : ''}`}
              />
              {server.name}
            </span>
          </div>
          <button
            type="button"
            className="fu-modal__close"
            onClick={onClose}
            aria-label={t('close_btn') || 'Закрыть'}
            title={t('close_btn') || 'Закрыть'}
          >
            <AppIcon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="fu-modal__body public-server-edit-modal__body">
            {/* Visibility Toggle Card */}
            <div
              className={`public-server-edit-modal__visibility-card ${isPublic ? 'public-server-edit-modal__visibility-card--active' : ''}`}
            >
              <div className="public-server-edit-modal__visibility-info">
                <span className="public-server-edit-modal__visibility-title">
                  {t('public_server_visible_label') ||
                    'Отображать на публичной странице'}
                </span>
                <span className="public-server-edit-modal__visibility-hint">
                  {isPublic
                    ? t('public_server_visible_desc_on') ||
                      'Сервер виден всем посетителям публичной страницы'
                    : t('public_server_visible_desc_off') ||
                      'Сервер скрыт и не будет отображаться в общем списке'}
                </span>
              </div>
              <FccSwitch
                id="editServerIsPublic"
                checked={isPublic}
                onChange={setIsPublic}
                label=""
              />
            </div>

            {/* Custom Connection Address Override */}
            <div className="public-server-edit-modal__field">
              <label
                htmlFor="editServerAddr"
                className="public-server-edit-modal__label"
              >
                {t('connection_address') || 'IP-адрес для подключения'}
              </label>
              <input
                id="editServerAddr"
                type="text"
                className="input public-server-edit-modal__input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={`${defaultIpPlaceholder}:${server.port || 34197}`}
              />
              <span className="public-server-edit-modal__field-hint">
                {t('public_server_addr_hint') ||
                  'Оставьте пустым для автоматического определения. Укажите домен или внешний IP с портом (например: play.domain.com:34197), если требуется переопределить адрес.'}
              </span>
            </div>

            {/* Public Description */}
            <div className="public-server-edit-modal__field">
              <label
                htmlFor="editServerDesc"
                className="public-server-edit-modal__label"
              >
                {t('description') || 'Описание на публичной странице'}
              </label>
              <textarea
                id="editServerDesc"
                className="input public-server-edit-modal__textarea"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  t('public_description_placeholder') ||
                  'Введите описание сервера, особенности, правила или установленные моды...'
                }
              />
              <span className="public-server-edit-modal__field-hint">
                {t('public_server_desc_hint') ||
                  'Отображается на карточке сервера для игроков. Поддерживает краткую информацию о карте и расписании.'}
              </span>
            </div>
          </div>

          <div className="fu-modal__footer">
            <CancelButton
              id="btnCancelEditPublicServer"
              onClick={onClose}
              disabled={isSaving}
              t={t}
            />
            <button
              type="submit"
              className="btn btn--primary"
              disabled={isSaving}
            >
              <AppIcon name="save" size={16} />
              <span>
                {isSaving
                  ? t('saving') || 'Сохранение...'
                  : t('save_btn') || 'Сохранить'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}
