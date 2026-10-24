import { AppIcon } from './AppIcon';
import { roleLabel, userRoleClass } from '../lib/webUserUtils';
import { formatDashboardGameVersion, resolveStatusKind, statusLabel, type PanelStatus } from '../types/panel';
import { formatRamGb, formatUptime } from '../lib/instanceUtils';
import type { AuthUser, HostCpuInfo, HostDiskInfo, HostMemoryInfo } from '../types/instance';

interface AppStatusBarProps {
  mode: 'instances' | 'panel';
  user: AuthUser | null;
  status?: PanelStatus | null;
  serverName?: string;
  dashboard?: {
    total: number;
    running: number;
    stopped: number;
    online: number;
    hostRam?: HostMemoryInfo;
    hostCpu?: HostCpuInfo;
    hostDisk?: HostDiskInfo;
  };
  onLogout: () => void;
  onServers?: () => void;
  onAbout?: () => void;
  onUserSettings?: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function AppStatusBar({
  mode,
  user,
  status,
  serverName,
  dashboard,
  onLogout,
  onServers,
  onAbout,
  onUserSettings,
  t,
}: AppStatusBarProps) {
  const isInstances = mode === 'instances';
  const placeholder = t('server_uptime_placeholder');
  const panelServerName = String(serverName || '').trim() || placeholder;
  const kind = resolveStatusKind(status);
  const roleText = user ? roleLabel(user.role, t) : '';
  const statusIcon =
    kind === 'running'
      ? 'start'
      : kind === 'starting'
        ? 'autostart'
        : kind === 'maintenance' || kind === 'maintenance_manual'
          ? 'maintenance'
          : kind === 'stopping' || kind === 'stopped' || kind === 'error'
            ? 'stop'
            : 'info';

  return (
    <section
      className={
        'status-bar status-bar--top' +
        (isInstances ? ' status-bar--instances' : ' status-bar--panel')
      }
      aria-label="status"
    >
      {!isInstances && onServers ? (
        <button
          type="button"
          className="status-bar__back instance-dashboard-stat status-bar__back--nav"
          id="btnServers"
          title={t('web_back_to_servers')}
          aria-label={t('web_back_to_servers')}
          onClick={onServers}
        >
          <span className="instance-dashboard-stat__icon" aria-hidden="true">
            <AppIcon name="arrow_back" size={16} title={t('web_back_to_servers')} />
          </span>
          <div className="instance-dashboard-stat__body">
            <span className="instance-dashboard-stat__label" data-i18n="instances_tab_servers">
              {t('instances_tab_servers')}
            </span>
            <span className="instance-dashboard-stat__value" data-i18n="web_back">
              {t('web_back')}
            </span>
          </div>
        </button>
      ) : null}
      <div className="status-main">
        {isInstances ? (
          <div id="serversTopDash" className="instance-dashboard-top">
            <div className="instance-dashboard-stat instance-dashboard-stat--total">
              <span className="instance-dashboard-stat__icon" aria-hidden="true">
                <AppIcon name="server" size={14} />
              </span>
              <div className="instance-dashboard-stat__body">
                <span className="instance-dashboard-stat__label" data-i18n="instances_total_servers">
                  {t('instances_total_servers')}
                </span>
                <span className="instance-dashboard-stat__value" id="instancesTotalTop">
                  {dashboard?.total ?? 0}
                </span>
              </div>
            </div>
            <div className="instance-dashboard-stat instance-dashboard-stat--running">
              <span className="instance-dashboard-stat__icon" aria-hidden="true">
                <AppIcon name="start" size={18} />
              </span>
              <div className="instance-dashboard-stat__body">
                <span className="instance-dashboard-stat__label" data-i18n="instances_running_servers">
                  {t('instances_running_servers')}
                </span>
                <span className="instance-dashboard-stat__value" id="instancesRunningTop">
                  {dashboard?.running ?? 0}
                </span>
              </div>
            </div>
            <div className="instance-dashboard-stat instance-dashboard-stat--online">
              <span className="instance-dashboard-stat__icon" aria-hidden="true">
                <AppIcon name="users" size={16} />
              </span>
              <div className="instance-dashboard-stat__body">
                <span className="instance-dashboard-stat__label" data-i18n="instances_online_all">
                  {t('instances_online_all')}
                </span>
                <span className="instance-dashboard-stat__value" id="instancesOnlineTop">
                  {dashboard?.online ?? 0}
                </span>
              </div>
            </div>
            <div className="instance-dashboard-stat instance-dashboard-stat--stopped">
              <span className="instance-dashboard-stat__icon" aria-hidden="true">
                <AppIcon name="stop" size={18} />
              </span>
              <div className="instance-dashboard-stat__body">
                <span className="instance-dashboard-stat__label" data-i18n="instances_stopped_servers">
                  {t('instances_stopped_servers')}
                </span>
                <span className="instance-dashboard-stat__value" id="instancesStoppedTop">
                  {dashboard?.stopped ?? 0}
                </span>
              </div>
            </div>
            {dashboard?.hostCpu || dashboard?.hostRam || dashboard?.hostDisk ? (
              <div className="instance-dashboard-top__divider" aria-hidden="true" />
            ) : null}
            {dashboard?.hostCpu ? (() => {
              const pct = Math.max(0, Math.min(100, Math.round(dashboard.hostCpu.percent)));
              const isCpuDanger = pct >= 90;
              const isCpuWarn = !isCpuDanger && pct >= 75;
              const cpuTitle = t('instances_host_cpu_title', pct, dashboard.hostCpu.cores);
              return (
                <div
                  className={
                    'instance-dashboard-stat instance-dashboard-stat--cpu' +
                    (isCpuDanger
                      ? ' instance-dashboard-stat--cpu-danger'
                      : isCpuWarn
                        ? ' instance-dashboard-stat--cpu-warn'
                        : '')
                  }
                  title={cpuTitle}
                >
                  <span className="instance-dashboard-stat__icon" aria-hidden="true">
                    <AppIcon name="cpu" size={16} />
                  </span>
                  <div className="instance-dashboard-stat__body">
                    <span className="instance-dashboard-stat__label" data-i18n="instances_host_cpu">
                      {t('instances_host_cpu')}
                    </span>
                    <span className="instance-dashboard-stat__value" id="instancesCpuTop">
                      {pct}<span className="instance-dashboard-stat__unit">%</span>
                    </span>
                  </div>
                </div>
              );
            })() : null}
            {dashboard?.hostRam ? (() => {
              const usedGb = formatRamGb(dashboard.hostRam.used);
              const totalGb = formatRamGb(dashboard.hostRam.total);
              const freeGb = formatRamGb(dashboard.hostRam.free);
              const pct =
                dashboard.hostRam.total > 0
                  ? Math.round((dashboard.hostRam.used / dashboard.hostRam.total) * 100)
                  : 0;
              const isRamDanger = pct >= 90 || dashboard.hostRam.free < 1.5 * 1024 * 1024 * 1024;
              const isRamWarn = !isRamDanger && pct >= 75;
              const ramTitle = t('instances_host_ram_title', usedGb, totalGb, pct, freeGb);
              return (
                <div
                  className={
                    'instance-dashboard-stat instance-dashboard-stat--ram' +
                    (isRamDanger
                      ? ' instance-dashboard-stat--ram-danger'
                      : isRamWarn
                        ? ' instance-dashboard-stat--ram-warn'
                        : '')
                  }
                  title={ramTitle}
                >
                  <span className="instance-dashboard-stat__icon" aria-hidden="true">
                    <AppIcon name="memory" size={16} />
                  </span>
                  <div className="instance-dashboard-stat__body">
                    <span className="instance-dashboard-stat__label" data-i18n="instances_host_ram">
                      {t('instances_host_ram')}
                    </span>
                    <span
                      className="instance-dashboard-stat__value instance-dashboard-stat__value--compact-stat"
                      id="instancesRamTop"
                    >
                      {usedGb} / {totalGb} <span className="instance-dashboard-stat__unit">GB</span>
                    </span>
                  </div>
                </div>
              );
            })() : null}
            {dashboard?.hostDisk ? (() => {
              const usedGb = formatRamGb(dashboard.hostDisk.used);
              const totalGb = formatRamGb(dashboard.hostDisk.total);
              const freeGb = formatRamGb(dashboard.hostDisk.free);
              const pct =
                dashboard.hostDisk.total > 0
                  ? Math.round((dashboard.hostDisk.used / dashboard.hostDisk.total) * 100)
                  : 0;
              const isDiskDanger =
                pct >= 90 || dashboard.hostDisk.free < 10 * 1024 * 1024 * 1024;
              const isDiskWarn =
                !isDiskDanger &&
                (pct >= 80 || dashboard.hostDisk.free < 25 * 1024 * 1024 * 1024);
              const diskTitle = t('instances_host_disk_title', usedGb, totalGb, pct, freeGb);
              return (
                <div
                  className={
                    'instance-dashboard-stat instance-dashboard-stat--disk' +
                    (isDiskDanger
                      ? ' instance-dashboard-stat--disk-danger'
                      : isDiskWarn
                        ? ' instance-dashboard-stat--disk-warn'
                        : '')
                  }
                  title={diskTitle}
                >
                  <span className="instance-dashboard-stat__icon" aria-hidden="true">
                    <AppIcon name="disk" size={16} />
                  </span>
                  <div className="instance-dashboard-stat__body">
                    <span className="instance-dashboard-stat__label" data-i18n="instances_host_disk">
                      {t('instances_host_disk')}
                    </span>
                    <span
                      className="instance-dashboard-stat__value instance-dashboard-stat__value--compact-stat"
                      id="instancesDiskTop"
                    >
                      {usedGb} / {totalGb} <span className="instance-dashboard-stat__unit">GB</span>
                    </span>
                  </div>
                </div>
              );
            })() : null}
          </div>
        ) : (
          <>
            <div className="panel-dashboard-top">
              <div className="instance-dashboard-stat panel-dashboard-stat--name">
                <span className="instance-dashboard-stat__icon" aria-hidden="true">
                  <AppIcon name="open_panel" size={16} />
                </span>
                <div className="instance-dashboard-stat__body">
                  <span className="instance-dashboard-stat__label" data-i18n="dashboard_server_name_label">
                    {t('dashboard_server_name_label')}
                  </span>
                  <span
                    id="panelServerName"
                    className="instance-dashboard-stat__value instance-dashboard-stat__value--compact"
                    title={panelServerName}
                  >
                    {panelServerName}
                  </span>
                </div>
              </div>
              <div className={'instance-dashboard-stat panel-dashboard-stat--status panel-dashboard-stat--' + kind}>
                <span className="instance-dashboard-stat__icon" aria-hidden="true">
                  <AppIcon name={statusIcon} size={16} />
                </span>
                <div className="instance-dashboard-stat__body">
                  <span className="instance-dashboard-stat__label" data-i18n="server_status">
                    {t('server_status')}
                  </span>
                  <span
                    id="statusLed"
                    className={'instance-dashboard-stat__value panel-dashboard-stat__value panel-dashboard-stat__value--' + kind}
                  >
                    {status ? statusLabel(status, t) : '—'}
                  </span>
                </div>
              </div>
              <div className="instance-dashboard-stat panel-dashboard-stat--meta">
                <span className="instance-dashboard-stat__icon" aria-hidden="true">
                  <AppIcon name="open_portal" size={16} />
                </span>
                <div className="instance-dashboard-stat__body">
                  <span className="instance-dashboard-stat__label" data-i18n="dashboard_ip_port_label">
                    {t('dashboard_ip_port_label')}
                  </span>
                  <span id="bindDisplay" className="instance-dashboard-stat__value instance-dashboard-stat__value--compact">
                    {status?.game_bind || placeholder}
                  </span>
                </div>
              </div>
              <div className="instance-dashboard-stat panel-dashboard-stat--flags">
                <span className="instance-dashboard-stat__icon" aria-hidden="true">
                  <AppIcon name="open_portal" size={16} />
                </span>
                <div className="instance-dashboard-stat__body">
                  <span className="instance-dashboard-stat__label">{t('web_panel_visibility_label')}</span>
                  <div className="panel-dashboard-flags" title={t('web_panel_visibility_label')}>
                    <span
                      id="flagLan"
                      className={'panel-dashboard-flag' + (status?.visibility_lan ? ' panel-dashboard-flag--on' : '')}
                    >
                      LAN
                    </span>
                    <span
                      id="flagPub"
                      className={'panel-dashboard-flag' + (status?.visibility_public ? ' panel-dashboard-flag--on' : '')}
                    >
                      PUB
                    </span>
                    <span
                      id="flagRuv"
                      className={
                        'panel-dashboard-flag' +
                        (status?.require_user_verification ? ' panel-dashboard-flag--on' : '')
                      }
                    >
                      RUV
                    </span>
                  </div>
                </div>
              </div>
              <div className="instance-dashboard-stat panel-dashboard-stat--meta">
                <span className="instance-dashboard-stat__icon" aria-hidden="true">
                  <AppIcon name="update" size={16} />
                </span>
                <div className="instance-dashboard-stat__body">
                  <span className="instance-dashboard-stat__label">{t('web_panel_game_version_label')}</span>
                  <span id="gameVersion" className="instance-dashboard-stat__value instance-dashboard-stat__value--compact">
                    {formatDashboardGameVersion(status?.game_version, placeholder)}
                  </span>
                </div>
              </div>
              <div className="instance-dashboard-stat panel-dashboard-stat--online">
                <span className="instance-dashboard-stat__icon" aria-hidden="true">
                  <AppIcon name="users" size={16} />
                </span>
                <div className="instance-dashboard-stat__body">
                  <span className="instance-dashboard-stat__label" data-i18n="players_online">
                    {t('players_online')}
                  </span>
                  <span id="onlineVal" className="instance-dashboard-stat__value">
                    {String(status?.online_players?.length ?? 0)}
                  </span>
                </div>
              </div>
              <div className="instance-dashboard-stat panel-dashboard-stat--uptime">
                <span className="instance-dashboard-stat__icon" aria-hidden="true">
                  <AppIcon name="history" size={16} />
                </span>
                <div className="instance-dashboard-stat__body">
                  <span className="instance-dashboard-stat__label" data-i18n="server_uptime">
                    {t('server_uptime')}
                  </span>
                  <span id="uptimeVal" className="instance-dashboard-stat__value">
                    {status?.server_running
                      ? formatUptime(status.uptime_seconds, placeholder)
                      : placeholder}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="status-meta status-meta--right">
        {user && isInstances ? (
          <div
            id="authUserInfo"
            className="instance-dashboard-user"
            title={t('web_auth_user_info', user.username || '?', roleText)}
          >
            <span className="instance-dashboard-user__avatar" aria-hidden="true">
              <AppIcon name="badge" size={18} />
            </span>
            <div className="instance-dashboard-user__body">
              <span className="instance-dashboard-user__name">{user.username || '?'}</span>
              <span className={'access-users-role instance-dashboard-user__role ' + userRoleClass(user.role)}>
                {roleText}
              </span>
            </div>
          </div>
        ) : null}
        <div className="instance-dashboard-toolbar status-meta__actions status-meta__toolbar-icons">
          <button
            type="button"
            className="instance-dashboard-toolbar__btn"
            id="btnAbout"
            data-i18n-title="about_title"
            title={t('about_title')}
            aria-label={t('about_title')}
            onClick={onAbout}
          >
            <AppIcon name="info" size={18} />
          </button>
          <button
            type="button"
            className="instance-dashboard-toolbar__btn"
            id="btnUserSettings"
            data-i18n-title="web_user_settings_title"
            title={t('web_user_settings_title')}
            aria-label={t('web_user_settings_title')}
            onClick={onUserSettings}
          >
            <AppIcon name="settings_account" size={18} />
          </button>
          <button
            type="button"
            className="instance-dashboard-toolbar__btn instance-dashboard-toolbar__btn--logout"
            id="btnLogout"
            data-i18n-title="web_logout_btn"
            title={t('web_logout_btn')}
            aria-label={t('web_logout_btn')}
            onClick={onLogout}
          >
            <AppIcon name="logout" size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
