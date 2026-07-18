import { ModalBackdrop } from '../modals/ModalBackdrop';

export interface HistoryDetailPayload {
  title: string;
  target?: string;
  detail: string;
  actor?: string;
  date?: string;
}

interface HistoryDetailCellProps {
  detail: string;
  payload: HistoryDetailPayload;
  t: (key: string, ...args: (string | number)[]) => string;
  onOpen: (payload: HistoryDetailPayload) => void;
}

export function HistoryDetailCell({ detail, payload, t, onOpen }: HistoryDetailCellProps) {
  const text = String(detail || '').trim();
  if (!text) return <>—</>;

  return (
    <button
      type="button"
      className="history-detail-link"
      onClick={() => onOpen({ ...payload, detail: text })}
    >
      {t('history_view_details')}
    </button>
  );
}

interface HistoryDetailModalProps {
  payload: HistoryDetailPayload | null;
  onClose: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function HistoryDetailModal({ payload, onClose, t }: HistoryDetailModalProps) {
  const target = String(payload?.target || '').trim();
  const detail = String(payload?.detail || '').trim();

  return (
    <ModalBackdrop open={!!payload} id="historyDetailBackdrop" onClose={onClose}>
      <div
        className="fu-modal history-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="historyDetailHeading"
      >
        <div className="fu-modal__header" id="historyDetailHeading">
          {t('history_detail_modal_title')}
        </div>
        <div className="fu-modal__body history-detail-modal__body">
          {payload?.title ? (
            <div className="history-detail-modal__meta">
              <span className="history-detail-modal__meta-label">{t('action')}</span>
              <span>{payload.title}</span>
            </div>
          ) : null}
          {payload?.date ? (
            <div className="history-detail-modal__meta">
              <span className="history-detail-modal__meta-label">{t('ban_date_column')}</span>
              <span>{payload.date}</span>
            </div>
          ) : null}
          {payload?.actor ? (
            <div className="history-detail-modal__meta">
              <span className="history-detail-modal__meta-label">{t('actor_column')}</span>
              <span>{payload.actor}</span>
            </div>
          ) : null}
          {target ? (
            <section className="history-detail-modal__section">
              <h3 className="history-detail-modal__section-title">{t('history_target_column')}</h3>
              <pre className="history-detail-modal__text">{target}</pre>
            </section>
          ) : null}
          {detail ? (
            <section className="history-detail-modal__section">
              <h3 className="history-detail-modal__section-title">{t('history_detail_column')}</h3>
              <pre className="history-detail-modal__text">{detail}</pre>
            </section>
          ) : null}
        </div>
        <div className="fu-modal__footer">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            {t('close')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
