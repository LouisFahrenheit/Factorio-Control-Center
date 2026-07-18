import { useMemo } from 'react';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { ModsApi } from '../../hooks/useMods';
import type { ModSavePreviewMod } from '../../types/modJob';

interface ModsFromSaveModalProps {
  mods: ModsApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

function sortModsFromSave(mods: ModSavePreviewMod[]): ModSavePreviewMod[] {
  return [...mods].sort((a, b) => {
    const aMissing = a.installed ? 1 : 0;
    const bMissing = b.installed ? 1 : 0;
    if (aMissing !== bMissing) return aMissing - bMissing;
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  });
}

export function ModsFromSaveModal({ mods, t }: ModsFromSaveModalProps) {
  const st = mods.fromSaveState;
  const sortedMods = useMemo(() => (st ? sortModsFromSave(st.mods) : []), [st]);
  if (!st) return null;

  const totalCount = st.mods.length;
  const missingCount = st.missingCount;
  const canDownload = missingCount > 0 && !st.preparing;

  return (
    <ModalBackdrop
      open
      id="modsFromSaveBackdrop"
      onClose={mods.closeFromSaveDialog}
      closeOnEscape={!st.preparing}
      closeOnBackdropClick={!st.preparing}
    >
      <div
        className="fu-modal mods-from-save-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modsFromSaveHeading"
      >
        <div className="mod-update-all-flow mods-from-save-dialog__flow">
          <div className="mod-update-all-flow__header">
            <AppIcon name="start_save" size={20} className="mod-update-all-flow__header-icon" />
            <div className="mod-update-all-flow__header-text">
              <span className="mod-update-all-flow__header-title" id="modsFromSaveHeading">
                {t('mods_from_save_dialog_title')}
              </span>
              {st.preparing ? (
                <span className="mod-update-all-flow__header-badge">{t('audit_report_open')}</span>
              ) : null}
            </div>
            {!st.preparing ? (
              <button
                type="button"
                className="mod-update-all-flow__close"
                aria-label={t('close')}
                onClick={mods.closeFromSaveDialog}
              >
                <AppIcon name="close" size={16} />
              </button>
            ) : null}
          </div>

          <div className="mod-update-all-flow__body">
            <div className="fcc-confirm-modal__content mod-update-all-flow__panel mods-from-save-dialog__panel">
              <div className="mods-from-save-dialog__stats" aria-label={t('mods_from_save_summary', totalCount, missingCount)}>
                <div className="mods-from-save-dialog__stat">
                  <span className="mods-from-save-dialog__stat-label">{t('mods_from_save_stat_factorio')}</span>
                  <span className="mods-from-save-dialog__stat-value" id="modsFromSaveFactorio">
                    {st.factorio || '—'}
                  </span>
                </div>
                <div className="mods-from-save-dialog__stat">
                  <span className="mods-from-save-dialog__stat-label">{t('mods_from_save_stat_total')}</span>
                  <span className="mods-from-save-dialog__stat-value" id="modsFromSaveTotal">
                    {totalCount}
                  </span>
                </div>
                <div
                  className={
                    'mods-from-save-dialog__stat' +
                    (missingCount > 0 ? ' mods-from-save-dialog__stat--accent' : ' mods-from-save-dialog__stat--ok')
                  }
                >
                  <span className="mods-from-save-dialog__stat-label">{t('mods_from_save_stat_missing')}</span>
                  <span className="mods-from-save-dialog__stat-value" id="modsFromSaveSummary">
                    {missingCount}
                  </span>
                </div>
              </div>

              <div className="mods-from-save-dialog__list-head">
                <span>{t('mods_from_save_list_col_mod')}</span>
                <span>{t('mods_from_save_list_col_version')}</span>
                <span>{t('mods_from_save_list_col_status')}</span>
              </div>

              <div className="mods-from-save-dialog__list-wrap">
                <ul id="modsFromSaveList" className="mods-from-save-dialog__list" role="list" aria-live="polite">
                  {sortedMods.map((m) => {
                    const ver = String(m.version || '').trim();
                    const installed = !!m.installed;
                    return (
                      <li
                        key={m.name}
                        className={
                          'mods-from-save-dialog__row' + (installed ? ' mods-from-save-dialog__row--installed' : '')
                        }
                      >
                        <span className="mods-from-save-dialog__name" title={m.name}>
                          {m.display_name || m.name}
                        </span>
                        <span className="mods-from-save-dialog__version">{ver ? `v${ver}` : '—'}</span>
                        <span
                          className={
                            'mods-from-save-dialog__badge' +
                            (installed
                              ? ' mods-from-save-dialog__badge--installed'
                              : ' mods-from-save-dialog__badge--missing')
                          }
                        >
                          {installed ? (
                            <>
                              <AppIcon name="folder_check" size={14} className="mods-from-save-dialog__badge-icon" />
                              {t('mods_from_save_status_installed')}
                            </>
                          ) : (
                            <>
                              <AppIcon name="download" size={14} className="mods-from-save-dialog__badge-icon" />
                              {t('mods_from_save_status_missing')}
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {st.error ? (
                <div className="fcc-confirm-modal__callout fcc-confirm-modal__callout--danger mods-from-save-dialog__error-wrap">
                  <p id="modsFromSaveError" className="mod-update-all-flow__error" aria-live="polite">
                    {st.error}
                  </p>
                </div>
              ) : null}

              {st.preparing ? (
                <div id="modsFromSavePrepWrap" className="mods-from-save-dialog__prep" aria-hidden="false">
                  <div className="server-update-dialog__status-card server-update-dialog__status-card--preparing">
                    <span className="server-update-dialog__status-icon-wrap" aria-hidden="true">
                      <AppIcon name="search" size={18} className="server-update-dialog__status-icon" />
                    </span>
                    <span className="server-update-dialog__status-text" id="modsFromSavePrepText">
                      {t('mods_from_save_prep_progress')}
                    </span>
                  </div>
                  <div className="server-update-dialog__progress-block">
                    <div
                      className="server-update-dialog__progress-track fu-progress"
                      role="progressbar"
                      aria-busy="true"
                      aria-valuetext={t('mods_from_save_prep_progress')}
                    >
                      <div
                        className="server-update-dialog__bar server-update-dialog__bar--indeterminate"
                        id="modsFromSavePrepBar"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mod-update-all-flow__footer">
            <CancelButton
              id="modsFromSaveCancel"
              disabled={st.preparing}
              onClick={mods.closeFromSaveDialog}
              t={t}
            />
            <button
              type="button"
              className="btn btn--primary btn--with-icon"
              id="modsFromSaveConfirm"
              disabled={!canDownload}
              title={!missingCount ? t('mods_from_save_nothing_to_download') : undefined}
              onClick={() => void mods.confirmFromSaveDialog()}
            >
              <AppIcon name="download" size={16} />
              {t('mods_from_save_confirm_btn')}
            </button>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}
