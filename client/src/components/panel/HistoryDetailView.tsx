import { useState } from 'react';
import {
  IconActivity,
  IconClock,
  IconFileDescription,
  IconHistory,
  IconTarget,
  IconUser,
} from '@tabler/icons-react';
import { AppIcon } from '../AppIcon';
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

export function HistoryDetailCell({
  detail,
  payload,
  t,
  onOpen,
}: HistoryDetailCellProps) {
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

export function HistoryDetailModal({
  payload,
  onClose,
  t,
}: HistoryDetailModalProps) {
  const [copiedForPayload, setCopiedForPayload] =
    useState<HistoryDetailPayload | null>(null);
  const copied = Boolean(payload && copiedForPayload === payload);

  const actionTitle = String(payload?.title || '').trim();
  const actor = String(payload?.actor || '').trim();
  const date = String(payload?.date || '').trim();
  const target = String(payload?.target || '').trim();
  const detail = String(payload?.detail || '').trim();
  const hasMeta = Boolean(actionTitle || actor || date);

  const handleCopyDetail = () => {
    if (!payload || !detail || !navigator.clipboard) return;
    const targetPayload = payload;
    void navigator.clipboard.writeText(detail).then(() => {
      setCopiedForPayload(targetPayload);
      window.setTimeout(() => {
        setCopiedForPayload((cur) => (cur === targetPayload ? null : cur));
      }, 1600);
    });
  };

  return (
    <ModalBackdrop
      open={!!payload}
      id="historyDetailBackdrop"
      onClose={onClose}
    >
      <div
        className="fu-modal history-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="historyDetailHeading"
      >
        <div className="mod-install-dialog__header">
          <div className="mod-install-dialog__header-main">
            <div
              className="mod-install-dialog__header-icon-wrap"
              aria-hidden="true"
            >
              <IconHistory size={18} stroke={1.9} />
            </div>
            <div className="mod-install-dialog__header-titles">
              <h2
                className="mod-install-dialog__title"
                id="historyDetailHeading"
              >
                {t('history_detail_modal_title')}
              </h2>
            </div>
          </div>
          <div className="mod-install-dialog__header-right">
            <button
              type="button"
              className="mod-install-dialog__close"
              aria-label={t('close')}
              title={t('close')}
              onClick={onClose}
            >
              <AppIcon name="close" size={18} />
            </button>
          </div>
        </div>

        <div className="fu-modal__body history-detail-modal__body">
          {hasMeta ? (
            <div className="history-detail-modal__meta-grid">
              {actionTitle ? (
                <div className="history-detail-modal__meta-card">
                  <span className="history-detail-modal__meta-head">
                    <IconActivity
                      size={14}
                      stroke={2}
                      className="history-detail-modal__meta-icon"
                      aria-hidden="true"
                    />
                    <span>{t('action')}</span>
                  </span>
                  <span className="history-detail-modal__meta-value">
                    {actionTitle}
                  </span>
                </div>
              ) : null}
              {actor ? (
                <div className="history-detail-modal__meta-card">
                  <span className="history-detail-modal__meta-head">
                    <IconUser
                      size={14}
                      stroke={2}
                      className="history-detail-modal__meta-icon"
                      aria-hidden="true"
                    />
                    <span>{t('actor_column')}</span>
                  </span>
                  <span className="history-detail-modal__meta-value">
                    {actor}
                  </span>
                </div>
              ) : null}
              {date ? (
                <div className="history-detail-modal__meta-card">
                  <span className="history-detail-modal__meta-head">
                    <IconClock
                      size={14}
                      stroke={2}
                      className="history-detail-modal__meta-icon"
                      aria-hidden="true"
                    />
                    <span>{t('ban_date_column')}</span>
                  </span>
                  <span className="history-detail-modal__meta-value history-detail-modal__meta-value--mono">
                    {date}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {target ? (
            <section className="history-detail-modal__card">
              <div className="history-detail-modal__card-head">
                <h3 className="history-detail-modal__section-title">
                  <IconTarget
                    size={14}
                    stroke={2}
                    className="history-detail-modal__meta-icon"
                    aria-hidden="true"
                  />
                  <span>{t('history_target_column')}</span>
                </h3>
              </div>
              <pre className="log-view history-detail-modal__text history-detail-modal__text--target">
                {target}
              </pre>
            </section>
          ) : null}

          {detail ? (
            <section className="history-detail-modal__card">
              <div className="history-detail-modal__card-head">
                <h3 className="history-detail-modal__section-title">
                  <IconFileDescription
                    size={14}
                    stroke={2}
                    className="history-detail-modal__meta-icon"
                    aria-hidden="true"
                  />
                  <span>{t('history_detail_column')}</span>
                </h3>
                <button
                  type="button"
                  className={
                    'history-detail-modal__copy-btn' +
                    (copied ? ' is-copied' : '')
                  }
                  onClick={handleCopyDetail}
                >
                  <AppIcon name={copied ? 'check' : 'file_copy'} size={13} />
                  <span>
                    {copied
                      ? t('about_system_info_copied')
                      : t('map_gen_exchange_copy_btn')}
                  </span>
                </button>
              </div>
              <pre className="log-view history-detail-modal__text">
                {detail}
              </pre>
            </section>
          ) : null}
        </div>
      </div>
    </ModalBackdrop>
  );
}
