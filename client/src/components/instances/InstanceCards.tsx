import { motion } from 'motion/react';
import { useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from 'react';
import { IconClock, IconPackage, IconServer, IconUsers } from '@tabler/icons-react';
import {
  formatUptime,
  instanceMaintenanceManualMode,
  runningInstanceBlocked,
} from '../../lib/instanceUtils';
import {
  LIST_CONTAINER_VARIANTS,
  LIST_ROW_VARIANTS,
  listWrapVariants,
} from '../../lib/motionPresets';
import { useServerListIconsProbe } from '../../lib/serverListIcons';
import { useUserShowServerListModBadges } from '../../hooks/useUserShowServerListModBadges';
import { useUserShowServerListSpaceAgeBadge } from '../../hooks/useUserShowServerListSpaceAgeBadge';
import { webEffectsReduced } from '../../theme/webEffects';
import { AppIcon } from '../AppIcon';
import { InstanceListBadges } from './InstanceListBadges';
import { InstancePeekModal, type InstancePeekModalState } from './InstancePeekModal';
import type { InstanceItem } from '../../types/instance';

interface InstanceCardsProps {
  rows: InstanceItem[];
  enterKey: string;
  listEnterDelay?: number;
  getEffectiveStatus: (item: InstanceItem) => string;
  selectedRowId?: string;
  onOpenPanel: (item: InstanceItem) => void;
  onStart: (item: InstanceItem) => void;
  onStop: (item: InstanceItem) => void;
  onRestart: (item: InstanceItem) => void;
  onEdit: (item: InstanceItem) => void;
  onRowClick: (item: InstanceItem, rowEl: HTMLElement, ev: MouseEvent) => void;
  cardsWrapRef?: RefObject<HTMLDivElement | null>;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceCards({
  rows,
  enterKey,
  listEnterDelay = 0,
  getEffectiveStatus,
  selectedRowId,
  onOpenPanel,
  onStart,
  onStop,
  onRestart,
  onEdit,
  onRowClick,
  cardsWrapRef,
  t,
}: InstanceCardsProps) {
  const placeholder = t('server_uptime_placeholder');
  const { ready: listIconsReady, isAvailable: isListIconAvailable } = useServerListIconsProbe();
  const showModBadges = useUserShowServerListModBadges();
  const showSABadge = useUserShowServerListSpaceAgeBadge();
  const reduced = webEffectsReduced();
  const wrapVariants = reduced ? undefined : listWrapVariants(listEnterDelay);
  const clickTimerRef = useRef<number | null>(null);
  const [peekModal, setPeekModal] = useState<InstancePeekModalState | null>(null);

  const handleCardClick = (item: InstanceItem, el: HTMLElement, ev: MouseEvent) => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      onRowClick(item, el, ev);
    }, 240);
  };

  const handleCardDoubleClick = (item: InstanceItem, ev: MouseEvent) => {
    ev.preventDefault();
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    onOpenPanel(item);
  };

  const handleKeyDown = (item: InstanceItem, ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      onOpenPanel(item);
    }
  };

  return (
    <motion.div
      className="table-wrap table-wrap--motion-list instance-cards-wrap"
      ref={cardsWrapRef}
      variants={wrapVariants}
      initial={reduced ? false : 'hidden'}
      animate={reduced ? undefined : 'show'}
      key={enterKey}
    >
      <motion.div
        className="instance-cards"
        id="instanceCardsGrid"
        variants={reduced ? undefined : LIST_CONTAINER_VARIANTS}
        initial={reduced ? false : 'hidden'}
        animate={reduced ? undefined : 'show'}
      >
        {rows.map((it) => {
          const statusRaw = getEffectiveStatus(it);
          const isRunning = statusRaw === 'running';
          const isActive =
            statusRaw === 'running' || statusRaw === 'starting' || statusRaw === 'stopping';
          const rowStatus = t('instances_status_' + String(statusRaw || 'ready'));
          const modsCount = Number(it.modsCount || 0);
          const isMaintLocked = statusRaw === 'maintenance' || !!it.maintenanceLock;
          const isMaintManual = instanceMaintenanceManualMode(it, getEffectiveStatus);
          const isMaint = isMaintLocked || isMaintManual;
          const blocked = runningInstanceBlocked(it, getEffectiveStatus);
          const nameText = String(it.name || '');
          const uptimeText =
            typeof it.uptimeSeconds === 'number' && it.uptimeSeconds >= 0
              ? formatUptime(it.uptimeSeconds, placeholder)
              : placeholder;

          const maintDotClass = isMaintManual
            ? ' instance-run-dot--maintenance-manual'
            : isMaintLocked
              ? ' instance-run-dot--maintenance'
              : '';

          const isSelected = selectedRowId && String(it.id) === selectedRowId;

          const cardClass = [
            'instance-card',
            isSelected ? 'instance-card--selected' : '',
            isRunning ? 'instance-card--running' : '',
            isMaintLocked ? 'instance-card--maintenance' : '',
            isMaintManual ? 'instance-card--maintenance-manual' : '',
          ]
            .filter(Boolean)
            .join(' ');

          const statusPillClass = [
            'instance-status-pill',
            isRunning ? 'instance-status-pill--running' : '',
            isMaintManual ? 'instance-status-pill--maintenance-manual' : '',
            isMaintLocked ? 'instance-status-pill--maintenance' : '',
            !isRunning && !isMaint ? 'instance-status-pill--stopped' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <motion.div
              key={it.id}
              className={cardClass}
              variants={reduced ? undefined : LIST_ROW_VARIANTS}
              onClick={(ev) => handleCardClick(it, ev.currentTarget, ev)}
              onDoubleClick={(ev) => handleCardDoubleClick(it, ev)}
              onContextMenu={(ev) => {
                ev.preventDefault();
                onRowClick(it, ev.currentTarget, ev);
              }}
              onKeyDown={(ev) => handleKeyDown(it, ev)}
              tabIndex={0}
              role="region"
              aria-label={nameText}
            >
              {/* Top Accent Indicator */}
              <div className="instance-card__glow-bar" />

              {/* 1. Card Header: Status Dot, Name, Inline Badges | Status Pill */}
              <div className="instance-card__header">
                <div className="instance-card__header-left">
                  <span
                    className={
                      'instance-run-dot' +
                      (isRunning ? ' instance-run-dot--on' : '') +
                      maintDotClass
                    }
                  />
                  {isMaint ? (
                    <span
                      className={
                        'instance-maint-badge' +
                        (isMaintManual
                          ? ' instance-maint-badge--manual'
                          : ' instance-maint-badge--locked')
                      }
                      title={
                        isMaintManual
                          ? t('instances_maint_badge_manual')
                          : t('instances_maint_badge_locked')
                      }
                      aria-label={
                        isMaintManual
                          ? t('instances_maint_badge_manual')
                          : t('instances_maint_badge_locked')
                      }
                    >
                      <AppIcon name="maintenance" size={15} />
                    </span>
                  ) : null}
                  <h3 className="instance-card__title" title={nameText}>
                    {nameText}
                  </h3>
                  <div className="instance-card__badges-inline">
                    <InstanceListBadges
                      hasSpaceAge={it.hasSpaceAge}
                      modBadges={it.modBadges}
                      showModBadges={showModBadges}
                      showSpaceAgeBadge={showSABadge}
                      iconsReady={listIconsReady}
                      isIconAvailable={isListIconAvailable}
                      t={t}
                    />
                  </div>
                  {it.autostartServer && (
                    <span
                      className="instance-name-mark-icon"
                      title={t('instances_autostart_icon_title')}
                      aria-label={t('instances_autostart_icon_title')}
                    >
                      <AppIcon name="autostart" size={16} />
                    </span>
                  )}
                  {it.autoEnterPanel && (
                    <span
                      className="instance-name-mark-icon"
                      title={t('instances_auto_enter_icon_title')}
                      aria-label={t('instances_auto_enter_icon_title')}
                    >
                      <AppIcon name="favorite" size={16} />
                    </span>
                  )}
                  {it.blockUpdates && (
                    <span
                      className="instance-name-mark-icon"
                      title={t('instances_block_updates_icon_title')}
                      aria-label={t('instances_block_updates_icon_title')}
                    >
                      <AppIcon name="update_disabled" size={16} />
                    </span>
                  )}
                </div>

                <div className="instance-card__header-right">
                  <span className={statusPillClass}>{rowStatus}</span>
                </div>
              </div>

              {/* 2. Connection & Version Meta Line */}
              <div className="instance-card__meta-bar">
                <div className="instance-card__meta-left">
                  <span className="instance-card__meta-chip" title={t('instances_col_server_port')}>
                    <IconServer size={16} className="instance-card__meta-icon" />
                    <span>{String(it.port || '—')}</span>
                  </span>
                  <span
                    className="instance-card__version-pill instance-card__version-pill--clickable"
                    title={t('instances_peek_server_details')}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPeekModal({ type: 'info', item: it });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        setPeekModal({ type: 'info', item: it });
                      }
                    }}
                  >
                    {it.gameVersion ? `v${it.gameVersion}` : placeholder}
                  </span>
                </div>

                <div className="instance-card__meta-right" title={t('instances_col_access')}>
                  <span className="status-flags status-flags--side">
                    <span className={'status-flag' + (it.visibilityLan ? ' status-flag--on' : '')}>
                      LAN
                    </span>
                    <span
                      className={'status-flag' + (it.visibilityPublic ? ' status-flag--on' : '')}
                    >
                      PUB
                    </span>
                    <span
                      className={
                        'status-flag' + (it.requireUserVerification ? ' status-flag--on' : '')
                      }
                    >
                      RUV
                    </span>
                  </span>
                </div>
              </div>

              {/* 3. Core Metrics Section (3 balanced, equal-width tiles) */}
              <div className="instance-card__stats-grid">
                {(() => {
                  const hasPlayers = (it.onlineCount || 0) > 0;
                  return (
                    <div
                      className={`instance-card__stat-tile ${
                        hasPlayers ? 'instance-card__stat-tile--active-players' : ''
                      }`}
                      title={
                        hasPlayers
                          ? `${t('online_players')} (${it.onlineCount})`
                          : t('instances_col_online')
                      }
                      role={hasPlayers ? 'button' : undefined}
                      tabIndex={hasPlayers ? 0 : undefined}
                      onClick={(e) => {
                        if (hasPlayers) {
                          e.stopPropagation();
                          setPeekModal({ type: 'players', item: it });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (hasPlayers && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          e.stopPropagation();
                          setPeekModal({ type: 'players', item: it });
                        }
                      }}
                    >
                      <div className="instance-card__stat-value-row">
                        <IconUsers size={15} className="instance-card__stat-icon" />
                        <span className="instance-card__stat-value">{String(it.onlineCount || 0)}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="instance-card__stat-tile" title={t('server_uptime')}>
                  <div className="instance-card__stat-value-row">
                    <IconClock size={15} className="instance-card__stat-icon" />
                    <span className="instance-card__stat-value">{uptimeText}</span>
                  </div>
                </div>

                <div
                  className={`instance-card__stat-tile ${
                    modsCount > 0 ? 'instance-card__stat-tile--clickable' : ''
                  }`}
                  title={modsCount > 0 ? `${t('mods_btn')} (${modsCount})` : t('mods_btn')}
                  role={modsCount > 0 ? 'button' : undefined}
                  tabIndex={modsCount > 0 ? 0 : undefined}
                  onClick={(e) => {
                    if (modsCount > 0) {
                      e.stopPropagation();
                      setPeekModal({ type: 'mods', item: it });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (modsCount > 0 && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      e.stopPropagation();
                      setPeekModal({ type: 'mods', item: it });
                    }
                  }}
                >
                  <div className="instance-card__stat-value-row">
                    <IconPackage size={15} className="instance-card__stat-icon" />
                    <span className="instance-card__stat-value">
                      {modsCount > 0 ? String(modsCount) : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. Action Buttons (Icon-Only, Uniform, with Restart) */}
              <div className="instance-card__actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="btn instance-card__action-btn instance-card__action-btn--open"
                  title={t('instances_open_btn')}
                  aria-label={t('instances_open_btn')}
                  onClick={() => onOpenPanel(it)}
                >
                  <AppIcon name="open_panel" size={18} />
                </button>

                {isActive ? (
                  <button
                    type="button"
                    className="btn instance-card__action-btn instance-card__action-btn--stop"
                    title={t('stop_btn')}
                    aria-label={t('stop_btn')}
                    onClick={() => onStop(it)}
                  >
                    <AppIcon name="stop" size={18} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn instance-card__action-btn instance-card__action-btn--start"
                    disabled={isMaintLocked}
                    title={t('start_btn')}
                    aria-label={t('start_btn')}
                    onClick={() => onStart(it)}
                  >
                    <AppIcon name="start" size={18} />
                  </button>
                )}

                <button
                  type="button"
                  className="btn instance-card__action-btn instance-card__action-btn--restart"
                  disabled={!isActive || isMaintLocked}
                  title={t('restart_btn')}
                  aria-label={t('restart_btn')}
                  onClick={() => onRestart(it)}
                >
                  <AppIcon name="restart" size={18} />
                </button>

                <button
                  type="button"
                  className="btn instance-card__action-btn instance-card__action-btn--edit"
                  disabled={blocked}
                  title={t('instances_edit_btn')}
                  aria-label={t('instances_edit_btn')}
                  onClick={() => onEdit(it)}
                >
                  <AppIcon name="edit" size={18} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      <InstancePeekModal
        open={!!peekModal}
        state={peekModal}
        onClose={() => setPeekModal(null)}
        t={t}
      />
    </motion.div>
  );
}
