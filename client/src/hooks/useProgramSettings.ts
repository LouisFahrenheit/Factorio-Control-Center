import { useCallback, useEffect, useMemo, useState } from 'react';
import { modals } from '@mantine/modals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { feedbackErr } from '../lib/apiFeedback';
import { notifyApiError } from '../lib/networkErrors';
import { notifyOk } from '../lib/notify';
import type { ProgramSettings } from '../types/programSettings';
import { applyEffectiveTheme, getLocalThemeOverride, setProgramDefaultTheme } from '../theme/themes';

function localizeTlsError(err: string, t: (key: string) => string): string {
  const k = String(err || '').trim();
  const map: Record<string, string> = {
    tls_cert_or_key_missing: 'web_panel_tls_files_not_found_msg',
    tls_upload_invalid_kind: 'web_panel_tls_upload_err_kind',
    tls_upload_missing_tmp: 'web_panel_tls_upload_err_tmp',
    tls_upload_too_large: 'web_panel_tls_upload_err_large',
    tls_upload_bad_extension: 'web_panel_tls_upload_err_ext',
    web_panel_restart_failed: 'web_panel_restart_failed_msg',
    web_panel_failed_to_start: 'web_panel_restart_failed_msg',
    web_panel_port_in_use: 'web_panel_restart_failed_msg',
  };
  const key = map[k];
  if (key) {
    const line = t(key);
    if (line !== key) return line;
  }
  return k;
}

export function useProgramSettings(
  enabled: boolean,
  t: (key: string, ...args: (string | number)[]) => string,
  onLanguageSaved?: () => void,
) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<ProgramSettings>({});

  const query = useQuery({
    queryKey: ['program', 'settings'],
    queryFn: () => api<ProgramSettings>('/api/config/program'),
    enabled,
  });

  const savedUsername = String(query.data?.global_username || '').trim();
  const savedToken = String(query.data?.global_token || '').trim();
  const factorioCredentialsDirty = useMemo(() => {
    const draftUser = String(draft.global_username || '').trim();
    const draftToken = String(draft.global_token || '').trim();
    return draftUser !== savedUsername || draftToken !== savedToken;
  }, [draft.global_token, draft.global_username, savedToken, savedUsername]);

  const verifyQuery = useQuery({
    queryKey: ['program', 'global-factorio-credentials-verify', savedUsername, savedToken],
    queryFn: () =>
      api<{ ok?: boolean; verified?: boolean; portal_username?: string }>(
        '/api/config/program/factorio-credentials-verify',
      ),
    enabled: enabled && !!savedUsername && !!savedToken,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  /** Verified global panel credentials only (not server-settings.json). */
  const verifiedGlobalPortalUsername =
    !!savedUsername &&
    !!savedToken &&
    !factorioCredentialsDirty &&
    verifyQuery.data?.verified
      ? String(verifyQuery.data.portal_username || savedUsername).trim()
      : '';

  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const saveField = useCallback(
    async (patch: Partial<ProgramSettings>, revert?: () => void) => {
      try {
        await api('/api/config/program', {
          method: 'PUT',
          body: JSON.stringify(patch),
        });
        await qc.invalidateQueries({ queryKey: ['program', 'settings'] });
      } catch (e) {
        revert?.();
        notifyApiError(t('instances_tab_settings'), e, t);
        throw e;
      }
    },
    [qc, t],
  );

  const patchDraft = useCallback((patch: Partial<ProgramSettings>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const setTlsEnabled = useCallback((enabled: boolean) => {
    setDraft((d) => {
      const currentPort = Math.max(1, Math.min(65535, parseInt(String(d.listen_port ?? 8080), 10) || 8080));
      let nextPort = currentPort;
      if (enabled) {
        if (currentPort === 80) nextPort = 443;
        else if (currentPort === 8080) nextPort = 8443;
      } else {
        if (currentPort === 443) nextPort = 80;
        else if (currentPort === 8443) nextPort = 8080;
      }
      return { ...d, tls_enabled: enabled, listen_port: nextPort };
    });
  }, []);

  const setModpackUseSymlinks = useCallback(
    async (checked: boolean) => {
      setDraft((d) => ({ ...d, modpack_activate_use_symlinks: checked }));
      try {
        await saveField({ modpack_activate_use_symlinks: checked });
        await qc.invalidateQueries({ queryKey: ['modpacks', 'list'] });
      } catch {
        setDraft((d) => ({ ...d, modpack_activate_use_symlinks: !checked }));
      }
    },
    [saveField],
  );

  const setSyncBans = useCallback(
    async (checked: boolean) => {
      setDraft((d) => ({ ...d, sync_bans_across_instances: checked }));
      try {
        await saveField({ sync_bans_across_instances: checked });
      } catch {
        setDraft((d) => ({ ...d, sync_bans_across_instances: !checked }));
      }
    },
    [saveField],
  );

  const setSyncAdmins = useCallback(
    async (checked: boolean) => {
      setDraft((d) => ({ ...d, sync_admins_across_instances: checked }));
      try {
        await saveField({ sync_admins_across_instances: checked });
      } catch {
        setDraft((d) => ({ ...d, sync_admins_across_instances: !checked }));
      }
    },
    [saveField],
  );

  const setSyncWhitelist = useCallback(
    async (checked: boolean) => {
      setDraft((d) => ({ ...d, sync_whitelist_across_instances: checked }));
      try {
        await saveField({ sync_whitelist_across_instances: checked });
      } catch {
        setDraft((d) => ({ ...d, sync_whitelist_across_instances: !checked }));
      }
    },
    [saveField],
  );

  const setRequireUniquePorts = useCallback(
    async (checked: boolean) => {
      setDraft((d) => ({ ...d, require_unique_instance_game_ports: checked }));
      try {
        await saveField({ require_unique_instance_game_ports: checked });
      } catch {
        setDraft((d) => ({ ...d, require_unique_instance_game_ports: !checked }));
      }
    },
    [saveField],
  );

  const setServerSettingsDefaultPublicOff = useCallback(
    async (checked: boolean) => {
      setDraft((d) => ({ ...d, server_settings_default_public_off: checked }));
      try {
        await saveField({ server_settings_default_public_off: checked });
      } catch {
        setDraft((d) => ({ ...d, server_settings_default_public_off: !checked }));
      }
    },
    [saveField],
  );

  const setServerSettingsApplyGlobalCredentials = useCallback(
    async (checked: boolean) => {
      setDraft((d) => ({ ...d, server_settings_apply_global_credentials: checked }));
      try {
        await saveField({ server_settings_apply_global_credentials: checked });
      } catch {
        setDraft((d) => ({ ...d, server_settings_apply_global_credentials: !checked }));
      }
    },
    [saveField],
  );

  const setLogWriteInstance = useCallback(
    async (checked: boolean) => {
      setDraft((d) => ({ ...d, log_write_instance: checked }));
      try {
        await saveField({ log_write_instance: checked });
      } catch {
        setDraft((d) => ({ ...d, log_write_instance: !checked }));
      }
    },
    [saveField],
  );

  const setLogReformatTimestamps = useCallback(
    async (checked: boolean) => {
      setDraft((d) => ({ ...d, log_reformat_timestamps: checked }));
      try {
        await saveField({ log_reformat_timestamps: checked });
      } catch {
        setDraft((d) => ({ ...d, log_reformat_timestamps: !checked }));
      }
    },
    [saveField],
  );

  const setLogWriteWeb = useCallback(
    async (checked: boolean) => {
      setDraft((d) => ({ ...d, log_write_web: checked }));
      try {
        await saveField({ log_write_web: checked });
      } catch {
        setDraft((d) => ({ ...d, log_write_web: !checked }));
      }
    },
    [saveField],
  );

  const setLogWriteMaintenance = useCallback(
    async (checked: boolean) => {
      setDraft((d) => ({ ...d, log_write_maintenance: checked }));
      try {
        await saveField({ log_write_maintenance: checked });
      } catch {
        setDraft((d) => ({ ...d, log_write_maintenance: !checked }));
      }
    },
    [saveField],
  );

  const setLogWriteAudit = useCallback(
    async (checked: boolean) => {
      setDraft((d) => ({ ...d, log_write_audit: checked }));
      try {
        await saveField({ log_write_audit: checked });
      } catch {
        setDraft((d) => ({ ...d, log_write_audit: !checked }));
      }
    },
    [saveField],
  );

  const setLanguage = useCallback(
    async (language: string) => {
      const prev = draft.language;
      setDraft((d) => ({ ...d, language }));
      try {
        await saveField({ language });
        onLanguageSaved?.();
      } catch {
        setDraft((d) => ({ ...d, language: prev }));
      }
    },
    [draft.language, onLanguageSaved, saveField],
  );

  const setTheme = useCallback(
    async (theme: string) => {
      const prev = draft.theme;
      setDraft((d) => ({ ...d, theme }));
      try {
        await saveField({ theme });
        setProgramDefaultTheme(theme);
        if (!getLocalThemeOverride()) {
          applyEffectiveTheme(theme);
        }
      } catch {
        setDraft((d) => ({ ...d, theme: prev }));
      }
    },
    [draft.theme, saveField],
  );

  const saveFactorioCredentials = useCallback(async () => {
    const username = String(draft.global_username || '').trim();
    const token = String(draft.global_token || '').trim();
    if (!username || !token) {
      feedbackErr(t('instances_tab_settings'), t('program_factorio_credentials_incomplete'), t);
      return;
    }
    try {
      await saveField({ global_username: username, global_token: token });
      await qc.invalidateQueries({ queryKey: ['program', 'global-factorio-credentials-verify'] });
      await qc.invalidateQueries({ queryKey: ['mods', 'list'] });
      notifyOk(
        t('instances_tab_settings'),
        t('program_factorio_credentials_saved'),
      );
    } catch {
      /* saveField already notified */
    }
  }, [draft.global_token, draft.global_username, qc, saveField, t]);

  const saveTlsSettings = useCallback(async () => {
    const settingsTitle = t('instances_tab_settings');
    const publicPortRaw = String(draft.public_port ?? '').trim();
    let public_port = '';
    if (publicPortRaw) {
      const n = parseInt(publicPortRaw, 10);
      if (Number.isFinite(n)) public_port = String(Math.max(1, Math.min(65535, n)));
    }
    const patch = {
      tls_enabled: !!draft.tls_enabled,
      tls_certfile: String(draft.tls_certfile || '').trim(),
      tls_keyfile: String(draft.tls_keyfile || '').trim(),
      tls_key_password: String(draft.tls_key_password || ''),
      listen_host: String(draft.listen_host || '0.0.0.0').trim() || '0.0.0.0',
      listen_port: Math.max(1, Math.min(65535, parseInt(String(draft.listen_port ?? 8080), 10) || 8080)),
      public_host: String(draft.public_host || '').trim(),
      public_port,
    };
    try {
      await saveField(patch);
      const line = t('web_panel_tls_web_saved_msg');
      notifyOk(settingsTitle, line !== 'web_panel_tls_web_saved_msg' ? line : undefined);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      feedbackErr(settingsTitle, localizeTlsError(raw, t));
    }
  }, [draft, saveField, t]);

  const doRestartWebPanel = useCallback(async () => {
    const settingsTitle = t('instances_tab_settings');
    try {
      await api('/api/config/web/restart', { method: 'POST' });
      notifyOk(settingsTitle, t('web_panel_restart_ok_msg'));
      await qc.invalidateQueries({ queryKey: ['program', 'settings'] });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      feedbackErr(settingsTitle, localizeTlsError(raw, t));
    }
  }, [qc, t]);

  const restartWebPanel = useCallback(() => {
    modals.openConfirmModal({
      title: t('web_panel_restart_confirm_title'),
      children: t('web_panel_restart_confirm_msg'),
      labels: { confirm: t('web_panel_restart_btn'), cancel: t('cancel') },
      onConfirm: () => {
        void doRestartWebPanel();
      },
    });
  }, [doRestartWebPanel, t]);

  const uploadTlsFile = useCallback(
    async (kind: 'cert' | 'key', file: File) => {
      const settingsTitle = t('instances_tab_settings');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      try {
        const r = await api<{ ok?: boolean; path?: string; error?: string }>(
          '/api/config/web-tls/upload',
          { method: 'POST', body: fd },
        );
        if (r.path) {
          if (kind === 'cert') patchDraft({ tls_certfile: r.path });
          else patchDraft({ tls_keyfile: r.path });
          const p = r.path;
          const line = t('web_panel_tls_upload_done_msg', p);
          notifyOk(settingsTitle, line !== 'web_panel_tls_upload_done_msg' ? line : p);
        }
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        feedbackErr(settingsTitle, localizeTlsError(raw, t));
      }
    },
    [patchDraft, t],
  );

  const saveLogRotationSettings = useCallback(async () => {
    let mb = parseInt(String(draft.log_rotation_max_mb ?? 50), 10);
    let h = parseInt(String(draft.log_rotation_interval_hours ?? 24), 10);
    let b = parseInt(String(draft.log_rotation_backup_count ?? 3), 10);
    if (!Number.isFinite(mb)) mb = 50;
    if (!Number.isFinite(h)) h = 24;
    if (!Number.isFinite(b)) b = 3;
    mb = Math.max(1, Math.min(2048, mb));
    h = Math.max(1, Math.min(8760, h));
    b = Math.max(1, Math.min(20, b));
    const patch = {
      log_rotation_max_mb: mb,
      log_rotation_interval_hours: h,
      log_rotation_backup_count: b,
      log_write_instance: !!draft.log_write_instance,
      log_write_web: !!draft.log_write_web,
      log_write_maintenance: !!draft.log_write_maintenance,
      log_write_audit: !!draft.log_write_audit,
    };
    patchDraft(patch);
    try {
      await saveField(patch);
      const line = t('program_log_rotation_saved_msg');
      notifyOk(
        t('instances_tab_settings'),
        line !== 'program_log_rotation_saved_msg' ? line : 'Saved.',
      );
    } catch {
      /* saveField already notified */
    }
  }, [draft, patchDraft, saveField, t]);

  const languages = (() => {
    const langs = Array.isArray(draft.available_languages)
      ? draft.available_languages.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];
    return langs;
  })();

  return {
    settings: draft,
    loading: query.isLoading,
    verifyingFactorioCredentials: verifyQuery.isLoading || verifyQuery.isFetching,
    verifiedGlobalPortalUsername,
    factorioCredentialsDirty,
    languages,
    patchDraft,
    setTlsEnabled,
    setModpackUseSymlinks,
    setSyncBans,
    setSyncAdmins,
    setSyncWhitelist,
    setRequireUniquePorts,
    setServerSettingsDefaultPublicOff,
    setServerSettingsApplyGlobalCredentials,
    setLogWriteInstance,
    setLogReformatTimestamps,
    setLogWriteWeb,
    setLogWriteMaintenance,
    setLogWriteAudit,
    setLanguage,
    setTheme,
    saveFactorioCredentials,
    saveTlsSettings,
    restartWebPanel,
    uploadTlsFile,
    saveLogRotationSettings,
  };
}

export type ProgramSettingsApi = ReturnType<typeof useProgramSettings>;
