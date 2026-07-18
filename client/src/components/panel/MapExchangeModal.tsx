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

  return (
    <ModalBackdrop
      open
      id="mapExchangeBackdrop"
      backdropClassName="fu-modal-backdrop--stacked"
      onClose={cs.closeExchangeDialog}
      closeOnBackdropClick={!cs.exchangeDialogBusy}
    >
      <div
        className="fu-modal create-save-exchange-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mapExchangeDlgHeading"
      >
        <div className="fu-modal__header" id="mapExchangeDlgHeading">
          {title}
        </div>
        <div className="fu-modal__body">
          <label className="modpack-import-dialog__field" htmlFor="mapExchangeDlgText">
            <span>{t('map_gen_exchange_label')}</span>
            <textarea
              id="mapExchangeDlgText"
              className="input create-save__exchange-input"
              rows={8}
              spellCheck={false}
              readOnly={!isImport}
              disabled={cs.exchangeDialogBusy}
              value={cs.exchangeString}
              onChange={(e) => cs.setExchangeString(e.target.value)}
              placeholder={t('map_gen_exchange_placeholder')}
            />
          </label>
          {!isImport && (
            <p className="create-save__help muted">{t('map_gen_exchange_export_help')}</p>
          )}
          {isImport && (
            <p className="create-save__help muted">{t('map_gen_exchange_help')}</p>
          )}
          <p className="modpack-import-dialog__error" aria-live="polite">
            {cs.exchangeDialogError}
          </p>
        </div>
        <div className="fu-modal__footer">
          <CancelButton disabled={cs.exchangeDialogBusy} onClick={cs.closeExchangeDialog} t={t} />
          {isImport ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={cs.exchangeDialogBusy}
              onClick={() => void cs.applyExchangeImport()}
            >
              {t('map_gen_exchange_apply_btn')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              disabled={cs.exchangeDialogBusy || !cs.exchangeString.trim()}
              onClick={() => void cs.copyExchangeFromDialog()}
            >
              {t('map_gen_exchange_copy_btn')}
            </button>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}
