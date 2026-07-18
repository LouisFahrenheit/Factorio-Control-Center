import { AppIcon } from '../AppIcon';
import { formatInstanceGameVersion, formatUptime } from '../../lib/instanceUtils';
import type { InstanceItem } from '../../types/instance';

interface MobileServerCardProps {
  item: InstanceItem;
  status: string;
  busy: boolean;
  t: (key: string, ...args: (string | number)[]) => string;
  onStart: () => void;
  onStop: () => void;
  onKill: () => void;
}

function statusClass(status: string): string {
  const s = String(status || 'stopped');
  if (s === 'running') return 'running';
  if (s === 'starting' || s === 'stopping') return s;
  if (s === 'error') return 'error';
  return 'stopped';
}

export function MobileServerCard({
  item,
  status,
  busy,
  t,
  onStart,
  onStop,
  onKill,
}: MobileServerCardProps) {
  const name = String(item.name || item.id || '?');
  const stClass = statusClass(status);
  const statusKey = 'instances_status_' + String(status || 'ready');
  const statusText = t(statusKey);
  const online = Number.isFinite(Number(item.onlineCount)) ? Number(item.onlineCount) : 0;
  const port = String(item.port || '—');
  const rconPort = String(item.rconPort || '').trim();
  const placeholder = '—';
  const version = formatInstanceGameVersion(item.gameVersion, placeholder);
  const modsCount = Number(item.modsCount || 0);
  const modsText = modsCount > 0 ? String(modsCount) : t('instances_mods_none');
  const runningLike = ['running', 'starting', 'stopping'].includes(String(status || ''));
  const uptimeText =
    typeof item.uptimeSeconds === 'number' && item.uptimeSeconds >= 0
      ? formatUptime(item.uptimeSeconds, placeholder)
      : placeholder;
  const showUptime = runningLike && uptimeText !== placeholder;

  return (
    <article className={`mobile-server-row mobile-server-row--${stClass}`}>
      <div className="mobile-server-row__head">
        <div className="mobile-server-row__identity">
          <span className="mobile-status-dot" aria-hidden="true" />
          <h3 className="mobile-server-row__name">{name}</h3>
        </div>
        <div className="mobile-server-row__actions" role="group" aria-label={name}>
          <button
            type="button"
            className="instance-servers-toolbar__btn"
            disabled={busy || runningLike}
            title={t('start_btn')}
            aria-label={t('start_btn')}
            onClick={onStart}
          >
            <AppIcon name="start" size={18} />
          </button>
          <button
            type="button"
            className="instance-servers-toolbar__btn instance-servers-toolbar__btn--danger"
            disabled={busy || !runningLike}
            title={t('stop_btn')}
            aria-label={t('stop_btn')}
            onClick={onStop}
          >
            <AppIcon name="stop" size={18} />
          </button>
          <button
            type="button"
            className="instance-servers-toolbar__btn instance-servers-toolbar__btn--danger"
            disabled={busy || !runningLike}
            title={t('kill_btn')}
            aria-label={t('kill_btn')}
            onClick={onKill}
          >
            <AppIcon name="kill" size={18} />
          </button>
        </div>
        <span className={`mobile-status-pill mobile-status-pill--${stClass}`}>{statusText}</span>
      </div>

      <div className="mobile-server-row__details">
        <span className="mobile-detail">
          <AppIcon name="users" size={13} />
          <span className="mobile-detail__label">{t('instances_col_online')}</span>
          <strong>{online}</strong>
        </span>
        <span className="mobile-detail">
          <AppIcon name="lan" size={13} />
          <span className="mobile-detail__label">{t('instances_col_port')}</span>
          <strong>{port}</strong>
        </span>
        {rconPort && (
          <span className="mobile-detail">
            <AppIcon name="terminal" size={13} />
            <span className="mobile-detail__label">{t('instances_col_rcon_port')}</span>
            <strong>{rconPort}</strong>
          </span>
        )}
        <span className="mobile-detail">
          <AppIcon name="update" size={13} />
          <span className="mobile-detail__label">{t('instances_col_version')}</span>
          <strong>{version}</strong>
        </span>
        <span className="mobile-detail">
          <AppIcon name="engineering" size={13} />
          <span className="mobile-detail__label">{t('mods_btn')}</span>
          <strong>{modsText}</strong>
        </span>
        {showUptime && (
          <span className="mobile-detail">
            <AppIcon name="history" size={13} />
            <span className="mobile-detail__label">{t('instances_col_uptime')}</span>
            <strong>{uptimeText}</strong>
          </span>
        )}
      </div>
    </article>
  );
}
