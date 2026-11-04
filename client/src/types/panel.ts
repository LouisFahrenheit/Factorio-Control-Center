export type StatusKind =
  | 'running'
  | 'starting'
  | 'stopping'
  | 'stopped'
  | 'error'
  | 'maintenance'
  | 'maintenance_manual';

export interface PanelStatus {
  server_running?: boolean;
  server_starting?: boolean;
  server_stopping?: boolean;
  status_kind?: string;
  game_bind?: string;
  game_version?: string;
  uptime_seconds?: number;
  online_players?: unknown[];
  visibility_lan?: boolean;
  visibility_public?: boolean;
  require_user_verification?: boolean;
  last_exit_code?: number;
  last_start_failed?: boolean;
  missing_startup_dependencies?: string[];
  mod_job_running?: boolean;
}

export function resolveStatusKind(s: PanelStatus | null | undefined): StatusKind {
  const k = String(s?.status_kind || '').trim();
  if (
    k === 'running' ||
    k === 'starting' ||
    k === 'stopping' ||
    k === 'stopped' ||
    k === 'error' ||
    k === 'maintenance' ||
    k === 'maintenance_manual'
  ) {
    return k;
  }
  if (s?.server_starting) return 'starting';
  if (s?.server_stopping) return 'stopping';
  if (s?.server_running) return 'running';
  return 'stopped';
}

export function formatDashboardGameVersion(raw: string | undefined, placeholder: string): string {
  const src = String(raw || '').trim();
  if (!src) return placeholder;
  const hasSpaceAge = /space\s*age/i.test(src);
  const vers = src.match(/\d+\.\d+(?:\.\d+)*/g);
  let out = vers && vers.length ? String(vers[vers.length - 1] || '') : src;
  if (!out) out = src;
  if (hasSpaceAge && !/\bSA\b/i.test(out)) out += ' SA';
  return out;
}

export function statusLabel(
  s: PanelStatus | null | undefined,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  const kind = resolveStatusKind(s);
  const labelByKind: Record<string, string> = {
    running: t('status_running'),
    starting: t('status_starting'),
    stopping: t('status_stopping'),
    stopped: t('status_stopped'),
    error: t('status_error'),
    maintenance: t('status_maintenance'),
    maintenance_manual: t('status_maintenance_manual'),
  };
  return labelByKind[kind] || labelByKind.stopped;
}

export function statusTooltip(
  s: PanelStatus | null | undefined,
  t: (key: string, ...args: (string | number)[]) => string,
): string | undefined {
  if (!s) return undefined;
  const kind = resolveStatusKind(s);
  if (kind === 'error') {
    const parts: string[] = [];
    if (typeof s.last_exit_code === 'number' && s.last_exit_code !== 0) {
      parts.push(t('status_error_with_code', s.last_exit_code));
    } else {
      parts.push(t('status_error'));
    }
    if (
      Array.isArray(s.missing_startup_dependencies) &&
      s.missing_startup_dependencies.length > 0
    ) {
      parts.push(
        `${t('server_start_missing_deps_title')}: ${s.missing_startup_dependencies.join(', ')}`,
      );
    }
    return parts.join('\n');
  }
  return undefined;
}
