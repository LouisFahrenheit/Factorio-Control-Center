import { motion } from 'motion/react';
import { useRef, type MouseEvent, type RefObject } from 'react';
import { formatUptime, instanceMaintenanceManualMode } from '../../lib/instanceUtils';
import type { InstanceSortColumn } from '../../lib/instanceListUtils';
import {
  LIST_CONTAINER_VARIANTS,
  LIST_ROW_VARIANTS,
  listWrapVariants,
} from '../../lib/motionPresets';
import { useServerListIconsProbe } from '../../lib/serverListIcons';
import { useUserShowServerListModBadges } from '../../hooks/useUserShowServerListModBadges';
import { webEffectsReduced } from '../../theme/webEffects';
import { AppIcon } from '../AppIcon';
import { InstanceGameVersionCell } from './InstanceGameVersionCell';
import { InstanceListBadges } from './InstanceListBadges';
import type { InstanceItem } from '../../types/instance';

const SORTABLE_COLUMNS: { key: InstanceSortColumn; labelKey: string }[] = [
  { key: 'name', labelKey: 'instances_col_name' },
  { key: 'port', labelKey: 'instances_col_server_port' },
  { key: 'rconPort', labelKey: 'instances_col_rcon_port' },
  { key: 'version', labelKey: 'instances_col_version' },
  { key: 'mods', labelKey: 'mods_btn' },
  { key: 'online', labelKey: 'instances_col_online' },
  { key: 'uptime', labelKey: 'server_uptime' },
  { key: 'status', labelKey: 'instances_col_status' },
];

function SortableTh({
  col,
  sortColumn,
  sortAsc,
  onSortColumn,
  t,
}: {
  col: (typeof SORTABLE_COLUMNS)[number];
  sortColumn: InstanceSortColumn;
  sortAsc: boolean;
  onSortColumn: (col: InstanceSortColumn) => void;
  t: (key: string) => string;
}) {
  const active = sortColumn === col.key;
  const className = [
    'instances-sort-th',
    active ? 'instances-sort-th--active' : '',
    active && sortAsc ? 'instances-sort-th--asc' : '',
    active && !sortAsc ? 'instances-sort-th--desc' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <th
      data-instances-sort={col.key}
      className={className}
      onClick={() => onSortColumn(col.key)}
    >
      {t(col.labelKey)}
    </th>
  );
}

interface InstanceTableProps {
  rows: InstanceItem[];
  /** Changes when the list should play its enter animation (tab focus, rows set). */
  enterKey: string;
  /** Extra delay before the list wrapper fades in (e.g. post-login shell reveal). */
  listEnterDelay?: number;
  getEffectiveStatus: (item: InstanceItem) => string;
  selectedRowId?: string;
  sortColumn: InstanceSortColumn;
  sortAsc: boolean;
  onSortColumn: (col: InstanceSortColumn) => void;
  onRowClick: (item: InstanceItem, rowEl: HTMLTableRowElement, ev: MouseEvent) => void;
  onRowDoubleClick: (item: InstanceItem, ev: MouseEvent) => void;
  tableWrapRef?: RefObject<HTMLDivElement | null>;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceTable({
  rows,
  enterKey,
  listEnterDelay = 0,
  getEffectiveStatus,
  selectedRowId,
  sortColumn,
  sortAsc,
  onSortColumn,
  onRowClick,
  onRowDoubleClick,
  tableWrapRef,
  t,
}: InstanceTableProps) {
  const placeholder = t('server_uptime_placeholder');
  const { ready: listIconsReady, isAvailable: isListIconAvailable } = useServerListIconsProbe();
  const showModBadges = useUserShowServerListModBadges();
  const reduced = webEffectsReduced();
  const wrapVariants = reduced ? undefined : listWrapVariants(listEnterDelay);
  const clickTimerRef = useRef<number | null>(null);

  const handleRowClick = (item: InstanceItem, rowEl: HTMLTableRowElement, ev: MouseEvent) => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      onRowClick(item, rowEl, ev);
    }, 240);
  };

  const handleRowDoubleClick = (item: InstanceItem, ev: MouseEvent) => {
    ev.preventDefault();
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    onRowDoubleClick(item, ev);
  };

  return (
    <motion.div
      className="table-wrap table-wrap--motion-list"
      ref={tableWrapRef}
      variants={wrapVariants}
      initial={reduced ? false : 'hidden'}
      animate={reduced ? undefined : 'show'}
      key={enterKey}
    >
      <table className="data data--instances" id="tblInstances">
        <thead>
          <tr>
            <SortableTh col={SORTABLE_COLUMNS[0]} sortColumn={sortColumn} sortAsc={sortAsc} onSortColumn={onSortColumn} t={t} />
            <th data-i18n="instances_col_access">{t('instances_col_access')}</th>
            {SORTABLE_COLUMNS.slice(1).map((col) => (
              <SortableTh
                key={col.key}
                col={col}
                sortColumn={sortColumn}
                sortAsc={sortAsc}
                onSortColumn={onSortColumn}
                t={t}
              />
            ))}
          </tr>
        </thead>
        <motion.tbody
          id="tblInstancesBody"
          variants={reduced ? undefined : LIST_CONTAINER_VARIANTS}
          initial={reduced ? false : 'hidden'}
          animate={reduced ? undefined : 'show'}
        >
          {rows.map((it) => {
            const statusRaw = getEffectiveStatus(it);
            const isRunning = statusRaw === 'running';
            const rowStatus = t('instances_status_' + String(statusRaw || 'ready'));
            const modsCount = Number(it.modsCount || 0);
            const modsText = modsCount > 0 ? String(modsCount) : t('instances_mods_none');
            const isMaintLocked = statusRaw === 'maintenance' || !!it.maintenanceLock;
            const isMaintManual = instanceMaintenanceManualMode(it, getEffectiveStatus);
            const isMaintRow = isMaintLocked || isMaintManual;
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

            const rowClass = [
              selectedRowId && String(it.id) === selectedRowId ? 'instance-row-selected' : '',
              isMaintLocked ? 'instance-row--maintenance' : '',
              isMaintManual ? 'instance-row--maintenance-manual' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <motion.tr
                key={it.id}
                className={rowClass || undefined}
                variants={reduced ? undefined : LIST_ROW_VARIANTS}
                onClick={(ev) => handleRowClick(it, ev.currentTarget, ev)}
                onDoubleClick={(ev) => handleRowDoubleClick(it, ev)}
              >
                <td>
                  <span className="instance-name-cell">
                    <span
                      className={
                        'instance-run-dot' +
                        (isRunning ? ' instance-run-dot--on' : '') +
                        maintDotClass
                      }
                    />
                    <span className="instance-name-title">
                      {isMaintRow ? (
                        <span
                          className={
                            'instance-maint-badge' +
                            (isMaintManual ? ' instance-maint-badge--manual' : ' instance-maint-badge--locked')
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
                          <AppIcon name="maintenance" size={16} />
                        </span>
                      ) : null}
                      <span className="instance-name-text">{nameText}</span>
                      <InstanceListBadges
                        hasSpaceAge={it.hasSpaceAge}
                        modBadges={it.modBadges}
                        showModBadges={showModBadges}
                        iconsReady={listIconsReady}
                        isIconAvailable={isListIconAvailable}
                        t={t}
                      />
                      {it.autostartServer && (
                        <span
                          className="instance-name-mark-icon"
                          title={t('instances_autostart_icon_title')}
                          aria-label={t('instances_autostart_icon_title')}
                        >
                          <AppIcon name="autostart" size={18} />
                        </span>
                      )}
                      {it.autoEnterPanel && (
                        <span
                          className="instance-name-mark-icon"
                          title={t('instances_auto_enter_icon_title')}
                          aria-label={t('instances_auto_enter_icon_title')}
                        >
                          <AppIcon name="favorite" size={18} />
                        </span>
                      )}
                      {it.blockUpdates && (
                        <span
                          className="instance-name-mark-icon"
                          title={t('instances_block_updates_icon_title')}
                          aria-label={t('instances_block_updates_icon_title')}
                        >
                          <AppIcon name="update_disabled" size={18} />
                        </span>
                      )}
                    </span>
                  </span>
                </td>
                <td className="instance-access-cell">
                  <span className="status-flags status-flags--side">
                    <span className={'status-flag' + (it.visibilityLan ? ' status-flag--on' : '')}>LAN</span>
                    <span className={'status-flag' + (it.visibilityPublic ? ' status-flag--on' : '')}>PUB</span>
                    <span className={'status-flag' + (it.requireUserVerification ? ' status-flag--on' : '')}>
                      RUV
                    </span>
                  </span>
                </td>
                <td>{String(it.port || '')}</td>
                <td>{String(it.rconPort || '')}</td>
                <td>
                  <InstanceGameVersionCell version={it.gameVersion} placeholder={placeholder} />
                </td>
                <td>{modsText}</td>
                <td>{String(it.onlineCount || 0)}</td>
                <td>{uptimeText}</td>
                <td>
                  <span
                    className={
                      'instance-status-line' + (isMaintRow ? ' instance-status-line--maintenance' : '')
                    }
                  >
                    <span
                      className={
                        'instance-status-text' +
                        (isMaintManual
                          ? ' instance-status-pill instance-status-pill--maintenance-manual'
                          : isMaintLocked
                            ? ' instance-status-pill instance-status-pill--maintenance'
                            : '')
                      }
                    >
                      {rowStatus}
                    </span>
                  </span>
                </td>
              </motion.tr>
            );
          })}
        </motion.tbody>
      </table>
    </motion.div>
  );
}
