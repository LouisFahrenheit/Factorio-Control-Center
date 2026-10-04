import {
  IconCheck,
  IconClock,
  IconFile,
  IconMinus,
  IconUpload,
  IconDownload,
  IconX,
  IconAlertTriangle,
  IconMaximize,
} from '@tabler/icons-react';
import { useUploadProgress } from '../../context/UploadProgressContext';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import { useLocale } from '../../i18n/LocaleProvider';
import {
  formatBytes,
  formatEta,
  formatSpeed,
} from '../../api/uploadWithProgress';
import { resolveApiErrorMessage } from '../../lib/networkErrors';

export function UploadProgressModal() {
  const {
    open,
    minimized,
    isUploading,
    operationKind,
    title,
    files,
    currentIndex,
    currentFile,
    currentPercent,
    currentLoaded,
    currentTotal,
    currentSpeed,
    remainingSeconds,
    isServerProcessing,
    overallPercent,
    overallLoaded,
    overallTotal,
    cancelUpload,
    minimize,
    maximize,
    closeModal,
  } = useUploadProgress();

  const { t } = useLocale();

  if (!open) return null;

  const isMulti = files.length > 1;
  const isCurrentError = currentFile?.status === 'error';
  const currentErrorText = currentFile?.error
    ? resolveApiErrorMessage(currentFile.error, t)
    : '';
  const modalTitle = title || t('upload_progress_title');

  if (minimized) {
    return (
      <div
        className="upload-floating-widget"
        role="region"
        aria-live="polite"
        onClick={maximize}
        title={t('upload_progress_maximize_tip') || 'Click to expand'}
      >
        <div className="upload-floating-widget__head">
          <div className="upload-floating-widget__info">
            <span
              className={
                'upload-modal__header-icon ' +
                (isUploading
                  ? operationKind === 'download'
                    ? 'is-downloading'
                    : 'is-uploading'
                  : '')
              }
              style={{ width: 22, height: 22 }}
            >
              {operationKind === 'download' ? <IconDownload size={14} /> : <IconUpload size={14} />}
            </span>
            <span className="upload-floating-widget__name">
              {currentFile?.name || modalTitle}
            </span>
          </div>
          <span
            className={
              'upload-floating-widget__percent' +
              (isCurrentError
                ? ' is-error'
                : isServerProcessing
                  ? ' is-processing'
                  : '')
            }
          >
            {isCurrentError
              ? t('error_title') || 'Ошибка'
              : isServerProcessing
                ? operationKind === 'download'
                  ? t('download_progress_preparing_badge') || 'Подготовка'
                  : t('upload_progress_processing_badge') || 'Обработка'
                : isMulti
                  ? `${overallPercent}%`
                  : `${currentPercent}%`}
          </span>
          <div
            className="upload-floating-widget__actions"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="upload-modal__head-btn"
              onClick={maximize}
              title={t('upload_progress_maximize_tip') || 'Expand'}
              aria-label="Expand"
            >
              <IconMaximize size={14} />
            </button>
            {isUploading ? (
              <button
                type="button"
                className="upload-modal__head-btn"
                onClick={cancelUpload}
                title={t('upload_progress_cancel_btn') || 'Cancel'}
                aria-label="Cancel"
              >
                <IconX size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="upload-modal__head-btn"
                onClick={closeModal}
                title={t('close')}
                aria-label={t('close')}
              >
                <IconX size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="upload-modal__track" style={{ height: 6 }}>
          <div
            className={
              'upload-modal__fill' +
              (isCurrentError
                ? ' is-error'
                : isServerProcessing
                  ? ' is-processing'
                  : isUploading
                    ? ' is-active'
                    : ' is-done')
            }
            style={{
              width:
                isCurrentError || isServerProcessing
                  ? '100%'
                  : `${isMulti ? overallPercent : currentPercent}%`,
            }}
          />
        </div>

        <div className="upload-floating-widget__meta">
          <span>
            {isCurrentError
              ? currentErrorText || t('mod_upload_failed') || 'Ошибка загрузки'
              : isServerProcessing
                ? operationKind === 'download'
                  ? t('download_progress_preparing') || 'Подготовка файла…'
                  : t('upload_progress_processing') || 'Processing…'
                : isMulti
                  ? `${currentIndex + 1}/${files.length} • ${formatBytes(overallLoaded)}/${formatBytes(overallTotal)}`
                  : `${formatBytes(currentLoaded)} / ${formatBytes(currentTotal)}`}
          </span>
          {!isCurrentError && !isServerProcessing && isUploading && currentSpeed > 0 && (
            <span>{formatSpeed(currentSpeed)}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <ModalBackdrop
      open
      id="uploadProgressBackdrop"
      backdropClassName="upload-modal-backdrop"
      closeOnBackdropClick={false}
      closeOnEscape={false}
      onClose={isUploading ? () => {} : closeModal}
    >
      <div
        className="upload-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="uploadModalTitle"
      >
        <div className="upload-modal__header">
          <div className="upload-modal__header-left">
            <span
              className={
                'upload-modal__header-icon ' +
                (isUploading
                  ? operationKind === 'download'
                    ? 'is-downloading'
                    : 'is-uploading'
                  : '')
              }
            >
              {operationKind === 'download' ? <IconDownload size={17} /> : <IconUpload size={17} />}
            </span>
            <span className="upload-modal__title" id="uploadModalTitle">
              {modalTitle}
            </span>
          </div>
          <div className="upload-modal__header-actions">
            <button
              type="button"
              className="upload-modal__head-btn"
              onClick={minimize}
              title={t('upload_progress_minimize_btn') || 'Minimize'}
              aria-label="Minimize"
            >
              <IconMinus size={16} />
            </button>
            {isUploading ? (
              <button
                type="button"
                className="upload-modal__head-btn"
                onClick={cancelUpload}
                title={t('upload_progress_cancel_btn') || 'Cancel'}
                aria-label="Cancel"
              >
                <IconX size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="upload-modal__head-btn"
                onClick={closeModal}
                title={t('close')}
                aria-label={t('close')}
              >
                <IconX size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="upload-modal__body">
          {/* Multi-file overall progress section */}
          {isMulti && (
            <div className="upload-modal__overall">
              <div className="upload-modal__overall-header">
                <span>
                  {t(
                    'upload_progress_file_counter',
                    String(currentIndex + 1),
                    String(files.length),
                  ) || `File ${currentIndex + 1} of ${files.length}`}
                </span>
                <span>
                  {formatBytes(overallLoaded)} / {formatBytes(overallTotal)} (
                  {overallPercent}%)
                </span>
              </div>
              <div className="upload-modal__overall-track">
                <div
                  className="upload-modal__overall-fill"
                  style={{ width: `${overallPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Active file card */}
          <div className="upload-modal__file-card">
            <div className="upload-modal__file-row">
              <div className="upload-modal__file-name-wrap">
                <IconFile size={18} className="upload-modal__file-icon" />
                <span
                  className="upload-modal__file-name"
                  title={currentFile?.name}
                >
                  {currentFile?.name || '—'}
                </span>
              </div>
              <span
                className={
                  'upload-modal__percent-badge' +
                  (isCurrentError
                    ? ' is-error-badge'
                    : isServerProcessing
                      ? ' is-processing-badge'
                      : '')
                }
              >
                {isCurrentError
                  ? t('error_title') || 'Ошибка'
                  : isServerProcessing
                    ? operationKind === 'download'
                      ? t('download_progress_preparing_badge') || 'Подготовка'
                      : t('upload_progress_processing_badge') || 'Обработка'
                    : `${currentPercent}%`}
              </span>
            </div>

            <div className="upload-modal__track">
              <div
                className={
                  'upload-modal__fill' +
                  (isCurrentError
                    ? ' is-error'
                    : isServerProcessing
                      ? ' is-processing'
                      : isUploading
                        ? ' is-active'
                        : currentPercent === 100
                          ? ' is-done'
                          : '')
                }
                style={{
                  width: isCurrentError || isServerProcessing ? '100%' : `${currentPercent}%`,
                }}
              />
            </div>

            <div className="upload-modal__stats">
              <div className="upload-modal__stats-left">
                {isCurrentError ? (
                  <span className="upload-modal__error-desc">
                    <IconAlertTriangle size={15} style={{ flexShrink: 0 }} />
                    <span>{currentErrorText || t('mod_upload_failed') || 'Ошибка загрузки'}</span>
                  </span>
                ) : isServerProcessing ? (
                  <span className="upload-modal__processing-indicator">
                    <span className="spinner spinner--sm" />
                    {operationKind === 'download'
                      ? t('download_progress_preparing') || 'Подготовка файла…'
                      : t('upload_progress_processing') || 'Processing on server…'}
                  </span>
                ) : (
                  <span>
                    {currentTotal > 0
                      ? `${formatBytes(currentLoaded)} / ${formatBytes(currentTotal)}`
                      : formatBytes(currentLoaded)}
                  </span>
                )}
              </div>

              {!isCurrentError && !isServerProcessing && isUploading && (
                <div className="upload-modal__stats-right">
                  {currentSpeed > 0 && (
                    <span className="upload-modal__stat-item">
                      ⚡ {formatSpeed(currentSpeed)}
                    </span>
                  )}
                  {remainingSeconds != null && (
                    <span className="upload-modal__stat-item">
                      ⏱ {formatEta(remainingSeconds)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Multi-file queue list */}
          {isMulti && (
            <div
              className="upload-modal__file-list"
              role="list"
              aria-label="Upload queue"
            >
              {files.map((item, idx) => {
                const isCur = idx === currentIndex;
                return (
                  <div
                    key={item.id}
                    className={
                      'upload-modal__queue-item' + (isCur ? ' is-current' : '')
                    }
                  >
                    <span className="upload-modal__queue-name" title={item.name}>
                      {item.name} ({formatBytes(item.size)})
                      {item.status === 'error' && item.error && (
                        <span className="upload-modal__queue-error">
                          {resolveApiErrorMessage(item.error, t)}
                        </span>
                      )}
                    </span>
                    <span
                      className={`upload-modal__queue-status upload-modal__queue-status--${item.status}`}
                    >
                      {item.status === 'done' && (
                        <>
                          <IconCheck size={14} />
                          {t('done') || 'Done'}
                        </>
                      )}
                      {item.status === 'uploading' && (
                        <>
                          <span className="spinner spinner--sm" />
                          {item.percent}%
                        </>
                      )}
                      {item.status === 'processing' && (
                        <>
                          <span className="spinner spinner--sm" />
                          {t('processing') || 'Processing…'}
                        </>
                      )}
                      {item.status === 'pending' && (
                        <>
                          <IconClock size={14} />
                          {t('pending') || 'Queued'}
                        </>
                      )}
                      {item.status === 'error' && (
                        <>
                          <IconAlertTriangle size={14} />
                          {t('error_title') || 'Error'}
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="upload-modal__footer">
          <button
            type="button"
            className="btn btn--secondary btn--compact"
            onClick={minimize}
          >
            {t('upload_progress_minimize_btn') || 'Minimize'}
          </button>
          {isUploading ? (
            <button
              type="button"
              className="btn btn--danger btn--compact"
              onClick={cancelUpload}
            >
              {t('upload_progress_cancel_btn') || 'Cancel'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--compact"
              onClick={closeModal}
            >
              {t('close')}
            </button>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}
