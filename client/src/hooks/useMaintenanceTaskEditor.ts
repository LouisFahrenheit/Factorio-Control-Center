import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collectTaskFromForm,
  editorFormFromTask,
  emptyEditorForm,
  filterPickerIdsForUpdates,
  instancePickSummary,
  nextFirePreviewLabel,
  syncScheduleDerived,
  type InstancePickState,
  type MaintenanceEditorForm,
} from '../lib/maintenanceEditorUtils';
import { feedbackErr } from '../lib/apiFeedback';
import { notifyOk, notifyWarn } from '../lib/notify';
import type { MaintenanceApi } from './useMaintenance';
import type { InstanceItem } from '../types/instance';
import type { MaintenanceTask } from '../types/maintenance';

export type MaintenanceEditorMode = 'add' | 'edit';

export function useMaintenanceTaskEditor(
  maintenance: MaintenanceApi,
  instances: InstanceItem[],
  defaultInstanceId: string,
  t: (key: string, ...args: (string | number)[]) => string,
) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<MaintenanceEditorMode>('add');
  const [form, setFormState] = useState<MaintenanceEditorForm>(() => emptyEditorForm(defaultInstanceId));
  const [saving, setSaving] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTemp, setPickerTemp] = useState<InstancePickState>({ all: false, ids: [] });
  const [nextPreviewTick, setNextPreviewTick] = useState(0);

  useEffect(() => {
    if (!open || form.manualOnly) return;
    const id = window.setInterval(() => setNextPreviewTick((n) => n + 1), 30000);
    return () => window.clearInterval(id);
  }, [open, form.manualOnly]);

  const updateForm = useCallback(
    (patch: Partial<MaintenanceEditorForm>) => {
      setFormState((prev) => {
        let next = syncScheduleDerived(prev, patch);
        const wantUpd = !next.optMaintenance && (next.optMods || next.optFactorio);
        if (wantUpd && next.instancePick.ids.length) {
          next = {
            ...next,
            instancePick: {
              ...next.instancePick,
              ids: filterPickerIdsForUpdates(next.instancePick.ids, instances, true),
            },
          };
        }
        return next;
      });
    },
    [instances],
  );

  const instanceSummary = useMemo(
    () => instancePickSummary(form.instancePick, instances, t),
    [form.instancePick, instances, t],
  );

  const nextPreview = useMemo(() => nextFirePreviewLabel(form, t), [form, t, nextPreviewTick]);

  const scheduleDisabled = form.manualOnly;
  const repeatDisabled = form.manualOnly || form.weekdays.length === 0;
  const optsDisabled = form.optMaintenance;
  const wantUpdates = !form.optMaintenance && (form.optMods || form.optFactorio);

  const openAdd = useCallback(() => {
    setMode('add');
    setFormState(emptyEditorForm(defaultInstanceId));
    setOpen(true);
  }, [defaultInstanceId]);

  const openEdit = useCallback((task: MaintenanceTask) => {
    setMode('edit');
    setFormState(editorFormFromTask(task));
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const openPicker = useCallback(() => {
    setPickerTemp({
      all: !!form.instancePick.all,
      ids: Array.isArray(form.instancePick.ids) ? form.instancePick.ids.slice() : [],
    });
    setPickerOpen(true);
  }, [form.instancePick]);

  const closePicker = useCallback(() => setPickerOpen(false), []);

  const confirmPicker = useCallback(() => {
    let ids = pickerTemp.ids.slice();
    if (wantUpdates) ids = filterPickerIdsForUpdates(ids, instances, true);
    updateForm({
      instancePick: {
        all: !!pickerTemp.all,
        ids: pickerTemp.all ? [] : ids,
      },
    });
    setPickerOpen(false);
  }, [instances, pickerTemp, updateForm, wantUpdates]);

  const togglePickerInstance = useCallback(
    (id: string, checked: boolean) => {
      setPickerTemp((prev) => {
        if (checked) {
          const ids = prev.all ? [id] : prev.ids.includes(id) ? prev.ids : [...prev.ids, id];
          return { all: false, ids };
        }
        return { all: false, ids: prev.ids.filter((x) => x !== id) };
      });
    },
    [],
  );

  const setPickerAll = useCallback((all: boolean) => {
    setPickerTemp({ all, ids: [] });
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const task = collectTaskFromForm(form, maintenance.tasks);
      await maintenance.upsertTask(task);
      notifyOk(t('instances_tab_maintenance'), t('maintenance_tasks_saved'));
      setOpen(false);
    } catch (e) {
      const err = e as Error & { fccMaintenanceInstanceToast?: boolean; fccMaintenanceUpdatesForbiddenToast?: boolean };
      const raw = err instanceof Error ? err.message : String(e);
      if (err.fccMaintenanceInstanceToast) {
        notifyWarn(t('instances_tab_maintenance'), t(raw));
      } else if (err.fccMaintenanceUpdatesForbiddenToast) {
        maintenance.handleMaintError(e);
      } else {
        feedbackErr(t('instances_tab_maintenance'), t(raw) !== raw ? t(raw) : raw);
      }
    } finally {
      setSaving(false);
    }
  }, [form, maintenance, t]);

  const toggleWeekday = useCallback((wd: number, checked: boolean) => {
    setFormState((prev) => {
      const set = new Set(prev.weekdays);
      if (checked) set.add(wd);
      else set.delete(wd);
      return syncScheduleDerived(prev, { weekdays: Array.from(set).sort((a, b) => a - b) });
    });
  }, []);

  return {
    open,
    mode,
    form,
    saving,
    instanceSummary,
    nextPreview,
    scheduleDisabled,
    repeatDisabled,
    optsDisabled,
    wantUpdates,
    pickerOpen,
    pickerTemp,
    openAdd,
    openEdit,
    close,
    save,
    updateForm,
    toggleWeekday,
    openPicker,
    closePicker,
    confirmPicker,
    togglePickerInstance,
    setPickerAll,
  };
}

export type MaintenanceTaskEditorApi = ReturnType<typeof useMaintenanceTaskEditor>;
