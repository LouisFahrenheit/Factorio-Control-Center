import { useEffect, useRef } from 'react';
import { api } from '../api/client';
import {
  localizeModError,
  modsNeedingGameLinesFromPlan,
} from '../lib/modErrorUtils';
import { openModGameVersionConfirm } from '../lib/modGameVersionConfirm';
import { modDepsConfirm } from '../lib/modDepsConfirm';
import { installConflictsFromPlan } from '../lib/modConflictUtils';
import { notifyErr } from '../lib/notify';
import { resolveStatusKind, type PanelStatus } from '../types/panel';
import type { ModInstallPlan } from '../types/modJob';
import type { ModJobApi } from './useModJob';

export function useMissingStartupDeps(
  enabled: boolean,
  status: PanelStatus | null | undefined,
  serverBusy: boolean,
  modJob: ModJobApi,
  removeOldZips: boolean,
  t: (key: string, ...args: (string | number)[]) => string,
) {
  const lastDialogKeyRef = useRef('');

  useEffect(() => {
    if (!enabled || !status) return;

    const kind = resolveStatusKind(status);
    const missDeps = Array.isArray(status.missing_startup_dependencies)
      ? status.missing_startup_dependencies
          .map(String)
          .map((d) => d.trim())
          .filter((d) => d && !d.startsWith('!'))
      : [];

    if (kind === 'error' && missDeps.length) {
      const dlgKey = `${missDeps.slice().sort().join(',')}:${String(status.last_exit_code || '')}`;
      if (dlgKey === lastDialogKeyRef.current) return;
      lastDialogKeyRef.current = dlgKey;

      void (async () => {
        let batch: ModInstallPlan | null = null;
        try {
          batch = await api<ModInstallPlan>('/api/mods/install-plan-batch', {
            method: 'POST',
            body: JSON.stringify({ mods: missDeps }),
          });
        } catch {
          batch = null;
        }

        const conflicts = installConflictsFromPlan(batch);
        const { confirmed } = await modDepsConfirm(missDeps, 'startup', t, { conflicts });
        if (!confirmed) return;
        if (serverBusy) {
          notifyErr(t('mods_btn'), t('server_running_mutate_blocked'));
          return;
        }
        try {
          let allowRg = false;
          if (batch?.requires_game_update_confirmation) {
            const flow = await openModGameVersionConfirm(t, {
              title: t('mod_install_requires_newer_game_title'),
              gameVersion: String(batch.game_version || '').trim() || '—',
              modLines: modsNeedingGameLinesFromPlan(batch),
            });
            if (!flow.ok) return;
            allowRg = flow.allow_requires_game_update;
          }
          await modJob.start('/api/mods/job/start-install-save', {
            mods: missDeps,
            remove_old_zips: removeOldZips,
            allow_requires_game_update: allowRg,
          });
        } catch (e) {
          notifyErr(t('mods_btn'), localizeModError(e instanceof Error ? e.message : String(e), undefined, t));
        }
      })();
    } else if (kind !== 'error') {
      lastDialogKeyRef.current = '';
    }
  }, [enabled, status, serverBusy, modJob, removeOldZips, t]);
}
