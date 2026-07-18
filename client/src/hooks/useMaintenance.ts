import { useCallback, useEffect, useState, createElement } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { modals } from '@mantine/modals';
import { api } from '../api/client';
import { feedbackErr } from '../lib/apiFeedback';
import { isNetworkFetchError, notifyApiError, notifyNetworkFetchError } from '../lib/networkErrors';
import { notifyErr, notifyOk } from '../lib/notify';
import type { InstanceItem } from '../types/instance';
import type {
  MaintenanceReport,
  MaintenanceResponse,
  MaintenanceTask,
  MaintenanceReportsResponse,
} from '../types/maintenance';
import { reportSelectionKey } from '../lib/maintenanceUtils';

function throwIfMaintenancePutFailure(
  j: Record<string, unknown> | null | undefined,
  instances: InstanceItem[],
  t: (key: string, ...args: (string | number)[]) => string,
): void {
  if (!j || typeof j !== 'object') return;
  const er = String(j.error || '').trim();
  if (er === 'invalid_scheduler_tz') throw new Error(t('maintenance_error_invalid_scheduler_tz'));
  if (er === 'maintenance_instance_updates_forbidden') {
    const iid = String(j.instance_id || '').trim();
    const row = instances.find((x) => String(x.id || '') === iid);
    const nm = row ? String(row.name || iid).trim() : iid;
    const head = t('maintenance_instance_updates_forbidden');
    const body = t('maintenance_instance_updates_forbidden_detail', nm || iid);
    const err = new Error([head, body].filter(Boolean).join('\n'));
    (err as Error & { fccMaintenanceUpdatesForbiddenToast?: boolean }).fccMaintenanceUpdatesForbiddenToast = true;
    throw err;
  }
}

export function useMaintenance(
  enabled: boolean,
  reportsEnabled: boolean,
  instances: InstanceItem[],
  t: (key: string, ...args: (string | number)[]) => string,
) {
  const qc = useQueryClient();
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [selectedReport, setSelectedReport] = useState<MaintenanceReport | null>(null);
  const maintenanceTitle = t('instances_tab_maintenance');

  const tasksQuery = useQuery({
    queryKey: ['maintenance', 'tasks'],
    queryFn: async () => {
      const j = await api<MaintenanceResponse>('/api/maintenance');
      return j;
    },
    enabled,
    refetchInterval: enabled ? 15000 : false,
  });

  const reportsQuery = useQuery({
    queryKey: ['maintenance', 'reports'],
    queryFn: () => api<MaintenanceReportsResponse>('/api/maintenance/reports'),
    enabled: enabled && reportsEnabled,
    refetchInterval: enabled && reportsEnabled ? 7000 : false,
  });

  useEffect(() => {
    if (tasksQuery.isError) {
      const e = tasksQuery.error;
      if (!notifyNetworkFetchError(maintenanceTitle, e, t)) {
        feedbackErr(maintenanceTitle, e instanceof Error ? e.message : String(e), t);
      }
      return;
    }
    if (tasksQuery.data) {
      setTasks(Array.isArray(tasksQuery.data.tasks) ? tasksQuery.data.tasks : []);
    }
  }, [tasksQuery.data, tasksQuery.isError, tasksQuery.error, maintenanceTitle, t]);

  useEffect(() => {
    if (!reportsEnabled || !reportsQuery.isError) return;
    notifyNetworkFetchError(maintenanceTitle, reportsQuery.error, t);
  }, [reportsEnabled, reportsQuery.isError, reportsQuery.error, maintenanceTitle, t]);

  const reports = reportsQuery.data?.reports || [];

  useEffect(() => {
    if (!reportsEnabled || !reports.length) {
      setSelectedReport(null);
      return;
    }
    setSelectedReport((prev) => {
      if (!prev) return reports[0];
      const key = reportSelectionKey(prev);
      const found = reports.find((r) => reportSelectionKey(r) === key);
      return found || reports[0];
    });
  }, [reports, reportsEnabled]);

  const putTasks = useCallback(
    async (nextTasks: MaintenanceTask[]) => {
      let r: MaintenanceResponse;
      try {
        r = await api<MaintenanceResponse>('/api/maintenance', {
          method: 'PUT',
          body: JSON.stringify({ tasks: nextTasks }),
        });
      } catch (e) {
        const payload = (e as Error & { fccApiJson?: Record<string, unknown> })?.fccApiJson;
        throwIfMaintenancePutFailure(payload, instances, t);
        throw e;
      }
      if (r?.ok === false) {
        throwIfMaintenancePutFailure(r as Record<string, unknown>, instances, t);
        throw new Error(String(r.error || 'save_failed'));
      }
      await qc.invalidateQueries({ queryKey: ['maintenance', 'tasks'] });
    },
    [instances, qc, t],
  );

  const handleMaintError = useCallback(
    (e: unknown, titleKey = 'instances_tab_maintenance') => {
      const err = e as Error & { fccMaintenanceUpdatesForbiddenToast?: boolean };
      const raw = err instanceof Error ? err.message : String(e);
      if (err?.fccMaintenanceUpdatesForbiddenToast) {
        notifyErr(t(titleKey), raw);
      } else if (raw === 'job_running') {
        notifyErr(t(titleKey), t('maintenance_run_now_busy'));
      } else {
        notifyApiError(t(titleKey), e, t);
      }
    },
    [t],
  );

  const toggleActive = useCallback(
    async (taskId: string, makeActive: boolean) => {
      const idx = tasks.findIndex((x) => String(x.id) === String(taskId));
      if (idx < 0) return;
      const next = tasks.slice();
      next[idx] = { ...next[idx], active: makeActive };
      try {
        await putTasks(next);
        notifyOk(t('instances_tab_maintenance'), t('maintenance_tasks_saved'));
      } catch (e) {
        handleMaintError(e);
      }
    },
    [handleMaintError, putTasks, t, tasks],
  );

  const deactivateAllTasks = useCallback(() => {
    const activeTasks = tasks.filter((task) => !!task.active);
    if (!activeTasks.length) {
      notifyErr(t('instances_tab_maintenance'), t('maintenance_deactivate_all_none'));
      return;
    }
    modals.openConfirmModal({
      title: t('maintenance_deactivate_all_confirm_title'),
      children: createElement(
        'p',
        { style: { whiteSpace: 'pre-wrap', margin: 0 } },
        t('maintenance_deactivate_all_confirm_msg', activeTasks.length),
      ),
      labels: { confirm: t('maintenance_deactivate_all_btn'), cancel: t('cancel') },
      confirmProps: { className: 'btn btn--danger' },
      onConfirm: async () => {
        const next = tasks.map((task) => ({ ...task, active: false }));
        try {
          await putTasks(next);
          notifyOk(t('instances_tab_maintenance'), t('maintenance_deactivate_all_done', activeTasks.length));
        } catch (e) {
          handleMaintError(e);
        }
      },
    });
  }, [handleMaintError, putTasks, t, tasks]);

  const deleteTask = useCallback(
    async (taskId: string) => {
      modals.openConfirmModal({
        title: t('maintenance_menu_delete'),
        children: t('maintenance_confirm_delete'),
        labels: { confirm: t('maintenance_menu_delete'), cancel: t('cancel') },
        confirmProps: { className: 'btn btn--danger' },
        onConfirm: async () => {
          const next = tasks.filter((x) => String(x.id) !== String(taskId));
          try {
            await putTasks(next);
            notifyOk(t('instances_tab_maintenance'), t('maintenance_tasks_saved'));
          } catch (e) {
            handleMaintError(e);
          }
        },
      });
    },
    [handleMaintError, putTasks, t, tasks],
  );

  const runNow = useCallback(
    async (taskId: string) => {
      try {
        const r = await api<{ ok?: boolean; error?: string }>('/api/maintenance/run', {
          method: 'POST',
          body: JSON.stringify({ task_id: taskId }),
        });
        if (r?.ok === false) throw new Error(String(r.error || 'run_failed'));
        notifyOk(t('instances_tab_maintenance'), t('maintenance_run_now_started'));
      } catch (e) {
        handleMaintError(e);
      }
    },
    [handleMaintError, t],
  );

  const upsertTask = useCallback(
    async (task: MaintenanceTask) => {
      const idx = tasks.findIndex((x) => String(x.id) === String(task.id));
      const next = tasks.slice();
      if (idx >= 0) next[idx] = task;
      else next.push(task);
      await putTasks(next);
    },
    [putTasks, tasks],
  );

  return {
    tasks,
    tasksLoading: tasksQuery.isLoading && tasks.length === 0,
    reports,
    reportsLoading: reportsQuery.isLoading,
    reportsError:
      reportsQuery.isError && !isNetworkFetchError(reportsQuery.error)
        ? reportsQuery.error instanceof Error
          ? reportsQuery.error.message
          : String(reportsQuery.error)
        : '',
    selectedReport,
    setSelectedReport,
    toggleActive,
    deactivateAllTasks,
    deleteTask,
    runNow,
    upsertTask,
    putTasks,
    handleMaintError,
    refreshTasks: () => qc.invalidateQueries({ queryKey: ['maintenance', 'tasks'] }),
    refreshReports: () => qc.invalidateQueries({ queryKey: ['maintenance', 'reports'] }),
  };
}

export type MaintenanceApi = ReturnType<typeof useMaintenance>;
