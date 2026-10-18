import { useState, useMemo } from 'react';
import {
  IconCheck,
  IconClock,
  IconCopy,
  IconFolder,
  IconNetwork,
  IconPackage,
  IconSearch,
  IconServer,
  IconSettings,
  IconShield,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import { AppIcon } from '../AppIcon';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import { formatUptime } from '../../lib/instanceUtils';
import type { InstanceItem } from '../../types/instance';

export type InstancePeekModalType = 'players' | 'mods' | 'info';

export interface InstancePeekModalState {
  type: InstancePeekModalType;
  item: InstanceItem;
}

interface InstancePeekModalProps {
  open: boolean;
  state: InstancePeekModalState | null;
  onClose: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstancePeekModal({
  open,
  state,
  onClose,
  t,
}: InstancePeekModalProps) {
  const [modFilter, setModFilter] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const item = state?.item ?? null;
  const type = state?.type ?? 'players';

  const players = useMemo(() => {
    if (!item?.publicPlayers) return [];
    return item.publicPlayers.filter(Boolean);
  }, [item?.publicPlayers]);

  const mods = useMemo(() => {
    if (!item?.publicMods) return [];
    return item.publicMods;
  }, [item?.publicMods]);

  const filteredMods = useMemo(() => {
    const q = modFilter.trim().toLowerCase();
    if (!q) return mods;
    return mods.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.title && m.title.toLowerCase().includes(q)),
    );
  }, [mods, modFilter]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    }).catch(() => {
      // ignore
    });
  };

  if (!open || !item) return null;

  const serverName = String(item.name || item.id || '—');
  const placeholder = t('server_uptime_placeholder');
  const uptimeText =
    typeof item.uptimeSeconds === 'number' && item.uptimeSeconds >= 0
      ? formatUptime(item.uptimeSeconds, placeholder)
      : placeholder;

  return (
    <ModalBackdrop open id="instancePeekBackdrop" onClose={onClose}>
      <div
        className={`fu-modal instance-peek-modal ${
          type === 'info' ? 'instance-peek-modal--wide' : ''
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="instancePeekTitle"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="instance-peek-modal__header">
          <div className="instance-peek-modal__header-left">
            <span
              className={`instance-peek-modal__icon-badge instance-peek-modal__icon-badge--${type}`}
            >
              {type === 'players' && <IconUsers size={20} stroke={2} />}
              {type === 'mods' && <IconPackage size={20} stroke={2} />}
              {type === 'info' && <IconSettings size={20} stroke={2} />}
            </span>
            <div className="instance-peek-modal__header-titles">
              <h3 className="instance-peek-modal__title" id="instancePeekTitle">
                {type === 'players' && t('online_players')}
                {type === 'mods' && t('mods_btn')}
                {type === 'info' && t('instances_peek_server_details')}
              </h3>
              <div className="instance-peek-modal__subtitle">
                <IconServer size={13} className="instance-peek-modal__sub-icon" />
                <span className="instance-peek-modal__sub-name">{serverName}</span>
                {type === 'players' && (
                  <span className="instance-peek-modal__count-pill">
                    {players.length} {t('instances_metric_players')}
                  </span>
                )}
                {type === 'mods' && (
                  <span className="instance-peek-modal__count-pill">
                    {mods.length} {t('mods_btn')}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="instance-peek-modal__close-btn"
            onClick={onClose}
            aria-label={t('close')}
            title={t('close')}
          >
            <AppIcon name="close" size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="instance-peek-modal__body">
          {/* 1. PLAYERS LIST VIEW */}
          {type === 'players' && (
            <div className="instance-peek-modal__players-list">
              {players.length === 0 ? (
                <div className="instance-peek-modal__empty">
                  <IconUsers size={32} className="instance-peek-modal__empty-icon" />
                  <span>{t('instances_peek_no_players')}</span>
                </div>
              ) : (
                players.map((name) => (
                  <div key={name} className="instance-peek-modal__player-row">
                    <div className="instance-peek-modal__player-avatar">
                      <IconUser size={15} />
                    </div>
                    <span className="instance-peek-modal__player-name">{name}</span>
                    <span className="instance-peek-modal__player-dot" title="Online" />
                  </div>
                ))
              )}
            </div>
          )}

          {/* 2. MODS LIST VIEW */}
          {type === 'mods' && (
            <div className="instance-peek-modal__mods-content">
              {mods.length > 5 && (
                <div className="instance-peek-modal__search-bar">
                  <IconSearch size={15} className="instance-peek-modal__search-icon" />
                  <input
                    type="text"
                    className="instance-peek-modal__search-input"
                    value={modFilter}
                    onChange={(e) => setModFilter(e.target.value)}
                    placeholder={t('instances_peek_search_mods')}
                    autoFocus
                  />
                  {modFilter && (
                    <button
                      type="button"
                      className="instance-peek-modal__search-clear"
                      onClick={() => setModFilter('')}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              <div className="instance-peek-modal__mods-list">
                {mods.length === 0 ? (
                  <div className="instance-peek-modal__empty">
                    <IconPackage size={32} className="instance-peek-modal__empty-icon" />
                    <span>{t('instances_peek_no_mods')}</span>
                  </div>
                ) : filteredMods.length === 0 ? (
                  <div className="instance-peek-modal__empty">
                    <span>{t('server_logs_empty_search')}</span>
                  </div>
                ) : (
                  filteredMods.map((mod) => (
                    <div key={mod.name} className="instance-peek-modal__mod-row">
                      <div className="instance-peek-modal__mod-main">
                        <span className="instance-peek-modal__mod-title">
                          {mod.title || mod.name}
                        </span>
                        {mod.title && mod.title !== mod.name && (
                          <span className="instance-peek-modal__mod-name">
                            {mod.name}
                          </span>
                        )}
                      </div>
                      {mod.version && (
                        <span className="instance-peek-modal__mod-version">
                          v{mod.version}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 3. DETAILED SERVER INFO VIEW (ADMIN INSPECTOR) */}
          {type === 'info' && (
            <div className="instance-peek-modal__info-sections">
              {/* SECTION 1: Среда и файлы */}
              <div className="instance-peek-modal__section">
                <div className="instance-peek-modal__section-header">
                  <IconFolder size={15} className="instance-peek-modal__section-icon" />
                  <span>{t('instances_peek_sec_env')}</span>
                </div>
                <div className="instance-peek-modal__info-grid">
                  <div className="instance-peek-modal__info-row">
                    <span className="instance-peek-modal__info-label">
                      {t('instances_peek_game_version')}
                    </span>
                    <span className="instance-peek-modal__info-val instance-peek-modal__info-val--accent">
                      {item.gameVersion ? `v${item.gameVersion}` : placeholder}
                    </span>
                  </div>

                  <div className="instance-peek-modal__info-row">
                    <span className="instance-peek-modal__info-label">
                      {t('instances_peek_space_age')}
                    </span>
                    <span
                      className={
                        'instance-peek-modal__info-val ' +
                        (item.hasSpaceAge
                          ? 'instance-peek-modal__info-val--sa'
                          : 'instance-peek-modal__info-val--muted')
                      }
                    >
                      {item.hasSpaceAge ? t('yes') : t('no')}
                    </span>
                  </div>

                  <div className="instance-peek-modal__info-row">
                    <span className="instance-peek-modal__info-label">
                      {t('instances_peek_launch_save')}
                    </span>
                    <span className="instance-peek-modal__info-val">
                      {item.launchSave || 'latest'}
                    </span>
                  </div>

                  <div className="instance-peek-modal__info-row instance-peek-modal__info-row--stack">
                    <div className="instance-peek-modal__info-row-top">
                      <span className="instance-peek-modal__info-label">
                        {t('instances_col_path')}
                      </span>
                      {item.serverPath ? (
                        <button
                          type="button"
                          className="instance-peek-modal__copy-btn"
                          onClick={() => handleCopy(String(item.serverPath), 'path')}
                          title={t('instances_peek_copy_path')}
                        >
                          {copiedKey === 'path' ? (
                            <>
                              <IconCheck size={12} />
                              <span>{t('copied')}</span>
                            </>
                          ) : (
                            <>
                              <IconCopy size={12} />
                              <span>{t('instances_peek_copy_path')}</span>
                            </>
                          )}
                        </button>
                      ) : null}
                    </div>
                    <span className="instance-peek-modal__info-val-code">
                      {item.serverPath || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Сеть и порты */}
              <div className="instance-peek-modal__section">
                <div className="instance-peek-modal__section-header">
                  <IconNetwork size={15} className="instance-peek-modal__section-icon" />
                  <span>{t('instances_peek_sec_network')}</span>
                </div>
                <div className="instance-peek-modal__info-grid">
                  <div className="instance-peek-modal__info-row">
                    <span className="instance-peek-modal__info-label">
                      {t('instances_col_server_port')}
                    </span>
                    <span className="instance-peek-modal__info-val">
                      {String(item.port || '—')}
                      {item.rconPort ? (
                        <span className="instance-card__meta-rcon">
                          {' '}
                          (RCON {item.rconPort})
                        </span>
                      ) : null}
                    </span>
                  </div>

                  <div className="instance-peek-modal__info-row">
                    <span className="instance-peek-modal__info-label">
                      {t('instances_server_ip_label')}
                    </span>
                    <span className="instance-peek-modal__info-val">
                      {item.ip || '0.0.0.0'}
                    </span>
                  </div>

                  {item.publicConnectionAddress ? (
                    <div className="instance-peek-modal__info-row">
                      <span className="instance-peek-modal__info-label">
                        {t('instances_peek_public_addr')}
                      </span>
                      <div className="instance-peek-modal__info-val-with-action">
                        <span className="instance-peek-modal__info-val">
                          {item.publicConnectionAddress}
                        </span>
                        <button
                          type="button"
                          className="instance-peek-modal__copy-btn"
                          onClick={() =>
                            handleCopy(String(item.publicConnectionAddress), 'addr')
                          }
                        >
                          {copiedKey === 'addr' ? (
                            <IconCheck size={12} />
                          ) : (
                            <IconCopy size={12} />
                          )}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="instance-peek-modal__info-row">
                    <span className="instance-peek-modal__info-label">
                      {t('instances_peek_access')}
                    </span>
                    <span className="status-flags status-flags--side">
                      <span
                        className={
                          'status-flag' + (item.visibilityLan ? ' status-flag--on' : '')
                        }
                      >
                        LAN
                      </span>
                      <span
                        className={
                          'status-flag' +
                          (item.visibilityPublic ? ' status-flag--on' : '')
                        }
                      >
                        PUB
                      </span>
                      <span
                        className={
                          'status-flag' +
                          (item.requireUserVerification ? ' status-flag--on' : '')
                        }
                      >
                        RUV
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Управление и автоматизация */}
              <div className="instance-peek-modal__section">
                <div className="instance-peek-modal__section-header">
                  <IconShield size={15} className="instance-peek-modal__section-icon" />
                  <span>{t('instances_peek_sec_automation')}</span>
                </div>
                <div className="instance-peek-modal__info-grid">
                  <div className="instance-peek-modal__info-row">
                    <span className="instance-peek-modal__info-label">
                      {t('program_autostart_server_cb')}
                    </span>
                    <span
                      className={`instance-peek-modal__info-val ${
                        item.autostartServer
                          ? 'instance-peek-modal__info-val--accent'
                          : 'instance-peek-modal__info-val--muted'
                      }`}
                    >
                      {item.autostartServer
                        ? t('instances_peek_enabled')
                        : t('instances_peek_disabled')}
                    </span>
                  </div>

                  <div className="instance-peek-modal__info-row">
                    <span className="instance-peek-modal__info-label">
                      {t('instances_auto_enter_cb')}
                    </span>
                    <span
                      className={`instance-peek-modal__info-val ${
                        item.autoEnterPanel
                          ? 'instance-peek-modal__info-val--accent'
                          : 'instance-peek-modal__info-val--muted'
                      }`}
                    >
                      {item.autoEnterPanel
                        ? t('instances_peek_enabled')
                        : t('instances_peek_disabled')}
                    </span>
                  </div>

                  <div className="instance-peek-modal__info-row">
                    <span className="instance-peek-modal__info-label">
                      {t('instances_block_updates_cb')}
                    </span>
                    <span
                      className={`instance-peek-modal__info-val ${
                        item.blockUpdates
                          ? 'instance-peek-modal__info-val--accent'
                          : 'instance-peek-modal__info-val--muted'
                      }`}
                    >
                      {item.blockUpdates
                        ? t('instances_peek_enabled')
                        : t('instances_peek_disabled')}
                    </span>
                  </div>

                  <div className="instance-peek-modal__info-row">
                    <span className="instance-peek-modal__info-label">
                      {t('instances_collect_game_metrics_cb')}
                    </span>
                    <span
                      className={`instance-peek-modal__info-val ${
                        item.collectGameMetrics
                          ? 'instance-peek-modal__info-val--accent'
                          : 'instance-peek-modal__info-val--muted'
                      }`}
                    >
                      {item.collectGameMetrics
                        ? t('instances_peek_enabled')
                        : t('instances_peek_disabled')}
                    </span>
                  </div>

                  <div className="instance-peek-modal__info-row">
                    <span className="instance-peek-modal__info-label">
                      {t('server_uptime')}
                    </span>
                    <span className="instance-peek-modal__info-val">
                      <IconClock
                        size={13}
                        style={{ marginRight: 5, verticalAlign: 'middle', opacity: 0.7 }}
                      />
                      {uptimeText}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="instance-peek-modal__footer">
          <button
            type="button"
            className="btn btn--with-icon"
            onClick={onClose}
          >
            <AppIcon name="close" size={16} />
            {t('close')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
