import type { FactorioPickState } from '../types/factorioUpdate';

const FU_ERROR_KEY_MAP: Record<string, string> = {
  server_running: 'about_factorio_update_stop_server',
  factorio_update_already_running: 'web_update_already_running',
  about_factorio_update_no_credentials: 'about_factorio_update_no_credentials',
  about_factorio_update_version_unknown: 'about_factorio_update_version_unknown',
  about_factorio_update_package_missing: 'about_factorio_update_package_missing',
  about_factorio_update_log_unexpected_content: 'about_factorio_update_log_unexpected_content',
  about_factorio_update_log_exit_nonzero: 'about_factorio_update_log_exit_nonzero',
  server_path_not_set: 'web_update_error_server_path',
  factorio_exe_not_found: 'web_update_error_exe_not_found',
  target_version_not_available: 'web_update_error_target_version',
  main_module_missing: 'web_update_error_internal',
  factorio_bridge_unavailable: 'web_update_error_internal',
};

export function fuLocalizeError(
  errorKey: string | undefined,
  errorArgs: (string | number)[] | undefined,
  fallbackText: string | undefined,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  if (errorKey) return t(errorKey, ...(errorArgs || []));
  if (fallbackText) {
    if (typeof fallbackText === 'string' && fallbackText.indexOf('missing_helper:') === 0) {
      return t('web_update_error_internal');
    }
    const mapped = FU_ERROR_KEY_MAP[fallbackText];
    if (mapped) return t(mapped);
    if (typeof fallbackText === 'string') {
      const m = fallbackText.match(/^\s*HTTP\s+\d+\s*:\s*(\{.*\})\s*$/i);
      const jsonText = m ? m[1] : fallbackText;
      try {
        const parsed = JSON.parse(jsonText) as { message?: string; error?: string; detail?: string };
        const msg = String(parsed?.message || parsed?.error || parsed?.detail || '').trim();
        if (msg) return msg;
      } catch {
        /* ignore */
      }
    }
    return fallbackText;
  }
  return t('web_update_phase_error');
}

export function cmpVersionsDesc(a: string, b: string): number {
  const pa = String(a || '').split('.').map((x) => parseInt(x, 10));
  const pb = String(b || '').split('.').map((x) => parseInt(x, 10));
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i += 1) {
    const va = Number.isFinite(pa[i]) ? pa[i] : 0;
    const vb = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (va !== vb) return vb - va;
  }
  return 0;
}

export function collectReleaseVersions(raw: unknown): { stable: string[]; experimental: string[] } {
  const stable: string[] = [];
  const experimental: string[] = [];
  const seenStable = new Set<string>();
  const seenExperimental = new Set<string>();
  const putStable = (v: unknown) => {
    const s = String(v || '').trim();
    if (!/^\d+(?:\.\d+){1,3}$/.test(s)) return;
    if (seenStable.has(s)) return;
    seenStable.add(s);
    stable.push(s);
  };
  const putExperimental = (v: unknown) => {
    const s = String(v || '').trim();
    if (!/^\d+(?:\.\d+){1,3}$/.test(s)) return;
    if (seenExperimental.has(s) || seenStable.has(s)) return;
    seenExperimental.add(s);
    experimental.push(s);
  };
  if (raw && typeof raw === 'object' && Array.isArray((raw as { stable?: unknown[] }).stable)) {
    const obj = raw as { stable?: unknown[]; experimental?: unknown[] };
    obj.stable?.forEach((v) => putStable(v));
    obj.experimental?.forEach((v) => putExperimental(v));
    stable.sort(cmpVersionsDesc);
    experimental.sort(cmpVersionsDesc);
    return { stable, experimental };
  }
  return { stable, experimental };
}

export function buildPickVersionList(
  state: FactorioPickState | null,
  showExperimental: boolean,
): { versions: string[]; expSet: Set<string> } {
  if (!state) return { versions: [], expSet: new Set() };
  const current = String(state.current || '').trim();
  const chainTargets = state.stableTargets;
  const expList = state.releases.experimental || [];
  const expSet = new Set(expList);
  const seen = new Set<string>();
  const versions: string[] = [];
  const add = (v: string) => {
    const s = String(v || '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    versions.push(s);
  };
  const isExperimental = (v: string) => expSet.has(String(v || '').trim());
  chainTargets.forEach((v) => {
    if (!showExperimental && isExperimental(v)) return;
    add(v);
  });
  if (showExperimental) {
    expList.forEach((v) => {
      if (current && cmpVersionsDesc(current, v) <= 0) return;
      add(v);
    });
  }
  versions.sort(cmpVersionsDesc);
  return { versions, expSet };
}
