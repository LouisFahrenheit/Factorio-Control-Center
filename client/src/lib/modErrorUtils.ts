import { createElement } from 'react';
import { modals } from '@mantine/modals';
import { isNetworkFetchError, resolveApiErrorMessage } from './networkErrors';
import type { ModInstallPlan } from '../types/modJob';

const MJ_ERROR_KEY_MAP: Record<string, string> = {
  server_running: 'server_running_mutate_blocked',
  mod_job_already_running: 'mod_job_already_running',
  mod_job_running: 'mod_job_running_block_start',
  missing_credentials: 'mod_list_portal_credentials_missing',
  no_mods_dir: 'mod_list_upload_no_mods_dir',
  helpers_unavailable: 'web_update_error_internal',
};

export function localizeModError(
  err: string,
  modHint: string | undefined,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  const k = String(err || '').trim();
  if (!k) return '';
  if (isNetworkFetchError(k)) return resolveApiErrorMessage(k, t);
  if (k === 'exists') return t('mod_list_upload_exists');
  if (k === 'invalid_name') return t('mod_list_upload_invalid_name');
  if (k === 'tmp_not_found') return t('mod_list_upload_tmp_missing');
  if (k === 'no_mods_dir') return t('mod_list_upload_no_mods_dir');
  if (k === 'invalid_mod_archive') return t('mod_list_upload_invalid_archive');
  if (k === 'invalid_mod_settings') return t('mod_list_upload_invalid_settings');
  if (k === 'missing_credentials') return t('mod_list_portal_credentials_missing');
  if (k === 'server_running') return t('server_running_mutate_blocked');
  if (k === 'builtin') return t('mod_list_cannot_remove_builtin');
  if (k === 'requires_space_age' && modHint) return t('mod_requires_space_age', modHint);
  if (k === 'requires_game_update_confirm') return t('mod_job_requires_newer_game_hint');
  return k;
}

export function mjLocalizeError(
  errorKey: string | undefined,
  errorArgs: (string | number)[] | undefined,
  fallbackText: string | undefined,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  if (errorKey) return t(errorKey, ...(errorArgs || []));
  if (fallbackText) {
    const mapped = MJ_ERROR_KEY_MAP[fallbackText];
    if (mapped) return t(mapped);
    return fallbackText;
  }
  return t('mod_job_phase_error');
}

export function modsNeedingGameLinesFromPlan(plan: ModInstallPlan | null | undefined): string[] {
  return (Array.isArray(plan?.mods_needing_game_update) ? plan!.mods_needing_game_update! : [])
    .map((x) => {
      const n = String(x?.name || '').trim();
      const r = String(x?.required_factorio || '').trim();
      if (!n) return '';
      return r ? `${n} (${r})` : n;
    })
    .filter(Boolean);
}

export function localizeModJobFailureReason(
  err: string,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  const k = String(err || '').trim();
  if (!k) return '';
  if (isNetworkFetchError(k)) return resolveApiErrorMessage(k, t);
  if (k === 'http_404' || k === 'download_http_404') return t('mod_list_dl_err_http_404');
  const httpMeta = /^http_(\d+)$/.exec(k);
  if (httpMeta) return t('mod_list_dl_err_http', httpMeta[1]);
  const httpDl = /^download_http_(\d+)$/.exec(k);
  if (httpDl) return t('mod_list_dl_err_http', httpDl[1]);
  if (k === 'no_release') return t('mod_list_portal_no_release');
  if (k === 'invalid_mod_id') return t('mod_list_dl_skip_invalid_id', '?');
  if (k === 'sha1_mismatch') return k;
  if (k === 'invalid_release') return t('mod_list_portal_no_release');
  if (k === 'missing_credentials' || k === 'mod_portal_no_credentials') {
    return t('mod_list_portal_credentials_missing');
  }
  return k;
}

export function formatModJobLogLine(
  entry: { key?: string; args?: (string | number)[]; text?: string },
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  if (entry.key === 'mod_job_log_failed' && Array.isArray(entry.args) && entry.args.length >= 2) {
    const name = String(entry.args[0] ?? '');
    const err = localizeModJobFailureReason(String(entry.args[1] ?? ''), t);
    return t('mod_job_log_failed', name, err);
  }
  if (entry.key) return t(entry.key, ...(entry.args || []));
  return entry.text || '';
}

export function modConfirm(
  message: string,
  t: (key: string, ...args: (string | number)[]) => string,
  title?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    modals.openConfirmModal({
      title: title || t('confirm_title'),
      children: createElement('p', { style: { whiteSpace: 'pre-wrap' } }, message),
      labels: { confirm: t('ok'), cancel: t('cancel') },
      confirmProps: { className: 'btn btn--primary' },
      cancelProps: { className: 'btn' },
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false),
    });
  });
}

export function normalizeFactorioDisplayVersion(raw: string): string {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (s.toLowerCase().startsWith('v')) s = s.slice(1).trim();
  const parts = s.split('.').map((p) => p.trim()).filter((p) => p !== '');
  if (!parts.length) return s;
  while (parts.length > 1 && parts[parts.length - 1] === '0') {
    parts.pop();
  }
  return parts.join('.');
}
