import { IconArrowsExchange } from '@tabler/icons-react';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { CreateSaveApi } from '../../hooks/useCreateSave';

interface MapExchangeModalProps {
  cs: CreateSaveApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function MapExchangeModal({ cs, t }: MapExchangeModalProps) {
  const mode = cs.exchangeDialog;
  if (!mode) return null;

  const isImport = mode === 'import';
  const title = isImport
    ? t('map_gen_exchange_dialog_import_title')
    : t('map_gen_exchange_dialog_export_title');
  const charCount = cs.exchangeString.trim().length;

  return (
    <ModalBackdrop
      open
      id="mapExchangeBackdrop"
      backdropClassName="fu-modal-backdrop--stacked"
      onClose={cs.closeExchangeDialog}
      closeOnBackdropClick={false}
      closeOnEscape={!cs.exchangeDialogBusy}
    >
      <div
        className="fu-modal modpack-form-dialog create-save-exchange-dialog save-map-modal save-map-modal--exchange"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mapExchangeDlgHeading"
      >
        <div className="mod-install-dialog__header">
          <div className="mod-install-dialog__header-main">
            <div
              className="mod-install-dialog__header-icon-wrap"
              aria-hidden="true"
            >
              <IconArrowsExchange size={18} stroke={1.9} />
            </div>
            <div className="mod-install-dialog__header-titles">
              <h2
                className="mod-install-dialog__title"
                id="mapExchangeDlgHeading"
              >
                {title}
              </h2>
            </div>
          </div>
        </div>

        <div className="fu-modal__body">
          <div className="save-map-modal__hint-card">
            <AppIcon
              name="info"
              size={16}
              className="save-map-modal__hint-icon"
            />
            <p className="save-map-modal__hint-text">
              {isImport
                ? t('map_gen_exchange_help')
                : t('map_gen_exchange_export_help')}
            </p>
          </div>

          <label
            className="modpack-form-dialog__field-card"
            htmlFor="mapExchangeDlgText"
          >
            <span className="save-map-modal__field-head">
              <span className="modpack-form-dialog__field-label">
                {t('map_gen_exchange_label')}
              </span>
              {charCount > 0 ? (
                <span className="save-map-modal__badge">{charCount}</span>
              ) : null}
            </span>
            <textarea
              id="mapExchangeDlgText"
              className="input create-save__exchange-input save-map-modal__exchange-textarea"
              rows={7}
              spellCheck={false}
              readOnly={!isImport}
              disabled={cs.exchangeDialogBusy}
              value={cs.exchangeString}
              onChange={(e) => cs.setExchangeString(e.target.value)}
              placeholder={t('map_gen_exchange_placeholder')}
            />
          </label>

          <p className="save-map-modal__error" aria-live="polite">
            {cs.exchangeDialogError}
          </p>
        </div>

        <div className="fu-modal__footer modpack-form-dialog__footer">
          <CancelButton
            disabled={cs.exchangeDialogBusy}
            onClick={cs.closeExchangeDialog}
            t={t}
          />
          {isImport ? (
            <button
              type="button"
              className="btn btn--primary btn--with-icon"
              disabled={cs.exchangeDialogBusy}
              onClick={() => void cs.applyExchangeImport()}
            >
              <AppIcon name="check" size={16} />
              {t('map_gen_exchange_apply_btn')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--with-icon"
              disabled={cs.exchangeDialogBusy || !charCount}
              onClick={() => void cs.copyExchangeFromDialog()}
            >
              <AppIcon name="file_copy" size={16} />
              {t('map_gen_exchange_copy_btn')}
            </button>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}
