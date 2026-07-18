import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { modals } from '@mantine/modals';
import { api, getToken } from '../api/client';
import { feedbackMsg } from '../lib/apiFeedback';
import {
  cloneCatalog,
  findCommandLocation,
  getSelectedCommand,
  categoryOrderKeys,
  moveCategory,
  newCommandDef,
  normalizeCatalog,
  serializeCatalogForSave,
} from '../lib/commandsCatalogUtils';
import type { CommandDef, CommandsCatalogDoc } from '../types/commandsCatalog';

const EMPTY_CATALOG: CommandsCatalogDoc = { version: '2.0', categories: {} };
const PERSIST_DEBOUNCE_MS = 650;
const SAVED_NOTIFY_DEBOUNCE_MS = 400;

export function useCommandEditor(
  enabled: boolean,
  onSaved: () => void,
  t: (key: string, ...args: (string | number)[]) => string,
) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<CommandsCatalogDoc>(EMPTY_CATALOG);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState('');
  const [selectedCommandId, setSelectedCommandId] = useState('');
  const [itemsEditorOpen, setItemsEditorOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const persistTimerRef = useRef<number | null>(null);
  const savedNotifyTimerRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const title = t('commands_title');

  const categoryKeys = useMemo(() => categoryOrderKeys(catalog), [catalog]);
  const categoryKeysKey = categoryKeys.join('\0');

  const commandsInCategory = useMemo(() => {
    if (!selectedCategoryKey) return [] as CommandDef[];
    return catalog.categories[selectedCategoryKey]?.commands || [];
  }, [catalog, selectedCategoryKey]);

  const commandsInCategoryKey = useMemo(
    () => commandsInCategory.map((cmd) => cmd.id).join('\0'),
    [commandsInCategory],
  );

  const selectedCommand = useMemo(
    () => getSelectedCommand(catalog, selectedCommandId),
    [catalog, selectedCommandId],
  );

  useEffect(() => {
    if (!categoryKeys.length) {
      setSelectedCategoryKey((prev) => (prev ? '' : prev));
      return;
    }
    setSelectedCategoryKey((prev) => {
      if (prev && categoryKeys.includes(prev)) return prev;
      return categoryKeys[0];
    });
  }, [categoryKeysKey, categoryKeys]);

  useEffect(() => {
    if (!selectedCategoryKey || !commandsInCategory.length) {
      setSelectedCommandId((prev) => (prev ? '' : prev));
      return;
    }
    setSelectedCommandId((prev) => {
      if (prev && commandsInCategory.some((cmd) => cmd.id === prev)) return prev;
      return commandsInCategory[0].id;
    });
  }, [commandsInCategoryKey, selectedCategoryKey, commandsInCategory]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const notifySaved = useCallback(() => {
    if (savedNotifyTimerRef.current) window.clearTimeout(savedNotifyTimerRef.current);
    savedNotifyTimerRef.current = window.setTimeout(() => {
      savedNotifyTimerRef.current = null;
      onSavedRef.current();
    }, SAVED_NOTIFY_DEBOUNCE_MS);
  }, []);

  const cancelScheduledPersist = useCallback(() => {
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
  }, []);

  const persistNow = useCallback(
    async (doc: CommandsCatalogDoc) => {
      if (!getToken()) return;
      const payload = serializeCatalogForSave(doc);
      const r = await api<{ ok?: boolean; error?: string }>('/api/commands/catalog', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (r?.ok === false) throw new Error(String(r.error || 'save_failed'));
      dirtyRef.current = false;
      notifySaved();
    },
    [notifySaved],
  );

  const schedulePersist = useCallback(
    (doc: CommandsCatalogDoc) => {
      if (!getToken()) return;
      markDirty();
      cancelScheduledPersist();
      persistTimerRef.current = window.setTimeout(() => {
        persistTimerRef.current = null;
        persistNow(doc).catch((e) => {
          feedbackMsg(title, e instanceof Error ? e.message : String(e), true, false, t);
        });
      }, PERSIST_DEBOUNCE_MS);
    },
    [cancelScheduledPersist, markDirty, persistNow, t, title],
  );

  const loadCatalog = useCallback(async () => {
    const j = await api<{ ok?: boolean; error?: string; data?: unknown }>('/api/commands/catalog');
    if (j?.ok === false) throw new Error(String(j.error || 'load_failed'));
    return normalizeCatalog(j.data || j);
  }, []);

  const openDialog = useCallback(async () => {
    setLoading(true);
    try {
      const doc = await loadCatalog();
      dirtyRef.current = false;
      cancelScheduledPersist();
      setCatalog(doc);
      const keys = categoryOrderKeys(doc);
      setSelectedCategoryKey(keys[0] || '');
      const firstCmd = keys[0] ? doc.categories[keys[0]]?.commands[0]?.id || '' : '';
      setSelectedCommandId(firstCmd);
      setOpen(true);
    } catch (e) {
      feedbackMsg(title, e instanceof Error ? e.message : String(e), true, false, t);
    } finally {
      setLoading(false);
    }
  }, [cancelScheduledPersist, loadCatalog, t, title]);

  const closeDialog = useCallback(() => {
    setOpen(false);
    setItemsEditorOpen(false);
    if (!getToken()) return;
    cancelScheduledPersist();
    if (!dirtyRef.current) return;
    persistNow(catalogRef.current).catch(() => {});
  }, [cancelScheduledPersist, persistNow]);

  const applyCatalog = useCallback(
    (next: CommandsCatalogDoc, toastKey?: string) => {
      catalogRef.current = next;
      setCatalog(next);
      schedulePersist(next);
      if (toastKey) feedbackMsg(title, t(toastKey), false);
    },
    [schedulePersist, t, title],
  );

  const addCategory = useCallback(() => {
    const key = window.prompt(t('category_key'), '')?.trim();
    if (!key) return;
    if (catalog.categories[key]) {
      feedbackMsg(title, t('error_category_exists'), true, false, t);
      return;
    }
    const display = window.prompt(t('display_name'), key)?.trim() || key;
    const next = cloneCatalog(catalog);
    next.categories[key] = { name: display, commands: [] };
    setSelectedCategoryKey(key);
    setSelectedCommandId('');
    applyCatalog(next, 'category_added');
  }, [applyCatalog, catalog, t, title]);

  const deleteCategory = useCallback(() => {
    if (!selectedCategoryKey) return;
    const cat = catalog.categories[selectedCategoryKey];
    if (!cat) return;
    modals.openConfirmModal({
      title: t('delete_category'),
      children: t('confirm_delete_category', cat.name || selectedCategoryKey),
      labels: { confirm: t('delete_category'), cancel: t('cancel') },
      confirmProps: { className: 'btn btn--danger' },
      onConfirm: () => {
        const next = cloneCatalog(catalog);
        delete next.categories[selectedCategoryKey];
        const keys = categoryOrderKeys(next);
        setSelectedCategoryKey(keys[0] || '');
        setSelectedCommandId(keys[0] ? next.categories[keys[0]]?.commands[0]?.id || '' : '');
        applyCatalog(next, 'category_deleted');
      },
    });
  }, [applyCatalog, catalog, selectedCategoryKey, t]);

  const addCommand = useCallback(() => {
    if (!selectedCategoryKey) {
      feedbackMsg(title, t('commands_add_category_first'), true, false, t);
      return;
    }
    const cmd = newCommandDef(catalog);
    const next = cloneCatalog(catalog);
    next.categories[selectedCategoryKey].commands.push(cmd);
    setSelectedCommandId(cmd.id);
    applyCatalog(next, 'command_added');
  }, [applyCatalog, catalog, selectedCategoryKey, t, title]);

  const deleteCommand = useCallback(() => {
    if (!selectedCommandId) return;
    const cmd = selectedCommand;
    if (!cmd) return;
    modals.openConfirmModal({
      title: t('delete_command'),
      children: t('confirm_delete_command', cmd.name || cmd.id),
      labels: { confirm: t('delete_command'), cancel: t('cancel') },
      confirmProps: { className: 'btn btn--danger' },
      onConfirm: () => {
        const next = cloneCatalog(catalog);
        const loc = findCommandLocation(next, selectedCommandId);
        if (!loc) return;
        const list = next.categories[loc.categoryKey].commands;
        list.splice(loc.index, 1);
        setSelectedCommandId(list[0]?.id || '');
        applyCatalog(next, 'command_deleted');
      },
    });
  }, [applyCatalog, catalog, selectedCommand, selectedCommandId, t]);

  const setCommandField = useCallback(
    (patch: Partial<CommandDef>) => {
      if (!selectedCommandId) return;
      const next = cloneCatalog(catalog);
      const loc = findCommandLocation(next, selectedCommandId);
      if (!loc) return;
      const current = next.categories[loc.categoryKey].commands[loc.index];
      let updated: CommandDef = { ...current, ...patch };

      if (patch.has_boolean) {
        updated.has_boolean = true;
        delete updated.has_value;
      } else if (patch.has_value) {
        updated.has_value = true;
        delete updated.has_boolean;
      }

      next.categories[loc.categoryKey].commands[loc.index] = updated;
      catalogRef.current = next;
      setCatalog(next);
      schedulePersist(next);
    },
    [catalog, schedulePersist, selectedCommandId],
  );

  const moveCommandToCategory = useCallback(
    (targetCategoryKey: string) => {
      if (!selectedCommandId || !targetCategoryKey) return;
      const loc = findCommandLocation(catalog, selectedCommandId);
      if (!loc || loc.categoryKey === targetCategoryKey) return;
      if (!catalog.categories[targetCategoryKey]) return;
      const next = cloneCatalog(catalog);
      const [cmd] = next.categories[loc.categoryKey].commands.splice(loc.index, 1);
      next.categories[targetCategoryKey].commands.push(cmd);
      setSelectedCategoryKey(targetCategoryKey);
      applyCatalog(next, 'command_updated');
    },
    [applyCatalog, catalog, selectedCommandId],
  );

  const moveCommand = useCallback(
    (commandId: string, targetCategoryKey: string, targetIndex: number) => {
      let next: CommandsCatalogDoc | null = null;

      setCatalog((prev) => {
        const loc = findCommandLocation(prev, commandId);
        if (!loc || !prev.categories[targetCategoryKey]) return prev;

        const candidate = cloneCatalog(prev);
        const sourceList = candidate.categories[loc.categoryKey].commands;
        const [cmd] = sourceList.splice(loc.index, 1);
        const targetList = candidate.categories[targetCategoryKey].commands;

        let insertIndex = Math.max(0, Math.min(targetIndex, targetList.length));
        if (loc.categoryKey === targetCategoryKey) {
          if (loc.index === insertIndex || loc.index + 1 === insertIndex) return prev;
          if (loc.index < insertIndex) insertIndex -= 1;
        }

        targetList.splice(insertIndex, 0, cmd);
        next = candidate;
        return candidate;
      });

      if (!next) return;
      catalogRef.current = next;
      if (selectedCommandId === commandId) {
        setSelectedCategoryKey(targetCategoryKey);
      }
      schedulePersist(next);
    },
    [schedulePersist, selectedCommandId],
  );

  const moveCategoryOrder = useCallback(
    (categoryKey: string, targetIndex: number) => {
      let next: CommandsCatalogDoc | null = null;

      setCatalog((prev) => {
        const candidate = moveCategory(prev, categoryKey, targetIndex);
        if (candidate === prev) return prev;
        next = candidate;
        return candidate;
      });

      if (!next) return;
      catalogRef.current = next;
      schedulePersist(next);
    },
    [schedulePersist],
  );

  const setCommandItems = useCallback(
    (items: Record<string, number>) => {
      setCommandField({ items });
    },
    [setCommandField],
  );

  const toggleFlag = useCallback(
    (key: keyof CommandDef, checked: boolean) => {
      if (!selectedCommand) return;
      const patch: Partial<CommandDef> = { [key]: checked || undefined } as Partial<CommandDef>;
      if (key === 'has_boolean' && checked) {
        patch.has_value = undefined;
        if (!selectedCommand.default_value) patch.default_value = 'true';
      }
      if (key === 'has_value' && checked) {
        patch.has_boolean = undefined;
      }
      if (key === 'has_item' && checked && !selectedCommand.items) {
        patch.items = {};
      }
      setCommandField(patch);
    },
    [selectedCommand, setCommandField],
  );

  useEffect(() => {
    return () => {
      cancelScheduledPersist();
      if (savedNotifyTimerRef.current) window.clearTimeout(savedNotifyTimerRef.current);
    };
  }, [cancelScheduledPersist]);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      setItemsEditorOpen(false);
      cancelScheduledPersist();
      dirtyRef.current = false;
      setCatalog(EMPTY_CATALOG);
    }
  }, [cancelScheduledPersist, enabled]);

  return {
    open,
    loading,
    catalog,
    categoryKeys,
    selectedCategoryKey,
    setSelectedCategoryKey,
    commandsInCategory,
    selectedCommandId,
    setSelectedCommandId,
    selectedCommand,
    itemsEditorOpen,
    setItemsEditorOpen,
    openDialog,
    closeDialog,
    addCategory,
    deleteCategory,
    addCommand,
    deleteCommand,
    setCommandField,
    moveCommandToCategory,
    moveCommand,
    moveCategoryOrder,
    setCommandItems,
    toggleFlag,
  };
}

export type CommandEditorApi = ReturnType<typeof useCommandEditor>;
