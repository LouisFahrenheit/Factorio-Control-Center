import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { modals } from '@mantine/modals';
import { api } from '../api/client';
import { useLocale } from '../i18n/LocaleProvider';
import { isNetworkFetchError, notifyNetworkFetchError, resolveApiErrorMessage } from '../lib/networkErrors';
import { notifyErr, notifyOk } from '../lib/notify';
import {
  resolveUserTabs,
  normalizeUserTabs,
  tabsDisabledForRole,
  localizeWebUserError,
  isLastEnabledAdmin,
  isAllUserInstances,
} from '../lib/webUserUtils';
import type { WebAccessInstance, WebUser, WebUsersResponse } from '../types/webUser';

export type WebUserEditorMode = '' | 'create' | 'edit';

export interface WebUserEditorState {
  username: string;
  password: string;
  role: string;
  enabled: boolean;
  tabs: string[];
  instanceIds: string[];
  allInstances: boolean;
}

function emptyEditor(): WebUserEditorState {
  return {
    username: '',
    password: '',
    role: 'moderator',
    enabled: true,
    tabs: resolveUserTabs('moderator'),
    instanceIds: [],
    allInstances: false,
  };
}

function editorFromUser(user: WebUser, accessInstances: WebAccessInstance[]): WebUserEditorState {
  const role = user.role || 'moderator';
  const instanceIds = Array.isArray(user.instance_ids) ? user.instance_ids.slice() : [];
  const allInstances = isAllUserInstances(instanceIds, accessInstances);
  return {
    username: user.username || '',
    password: '',
    role,
    enabled: user.enabled !== false,
    tabs: resolveUserTabs(role, user.tabs),
    instanceIds: allInstances ? accessInstances.map((it) => String(it.id || '').trim()).filter(Boolean) : instanceIds,
    allInstances,
  };
}

export function useWebUsers(enabled: boolean, t: (key: string, ...args: (string | number)[]) => string) {
  const qc = useQueryClient();
  const { reload: reloadLocale } = useLocale();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<WebUserEditorMode>('');
  const [editor, setEditor] = useState<WebUserEditorState>(emptyEditor);
  const [selectedUser, setSelectedUser] = useState('');

  const accessTitle = t('instances_tab_access');

  const query = useQuery({
    queryKey: ['web', 'users'],
    queryFn: () => api<WebUsersResponse>('/api/auth/users'),
    enabled,
  });

  const users = query.data?.users || [];
  const accessInstances: WebAccessInstance[] = query.data?.instances || [];

  useEffect(() => {
    if (!enabled || !query.isError) return;
    notifyNetworkFetchError(accessTitle, query.error, t);
  }, [enabled, query.isError, query.error, accessTitle, t]);

  const loadError =
    query.isLoading || !enabled
      ? ''
      : query.isError
        ? isNetworkFetchError(query.error)
          ? ''
          : resolveApiErrorMessage(query.error, t)
        : query.isFetched && !users.length
          ? t('web_error_load_failed')
          : '';

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['web', 'users'] }), [qc]);

  const toast = useCallback(
    (msg: string, isErr = false) => {
      if (isErr) notifyErr(t('instances_tab_access'), msg);
      else notifyOk(t('instances_tab_access'), msg);
    },
    [t],
  );

  const openCreate = useCallback(() => {
    setEditorMode('create');
    setSelectedUser('');
    setEditor(emptyEditor());
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback(
    (user: WebUser) => {
      setEditorMode('edit');
      setSelectedUser(String(user.username || ''));
      setEditor(editorFromUser(user, accessInstances));
      setEditorOpen(true);
    },
    [accessInstances],
  );

  const closeEditor = useCallback(() => {
    setEditorMode('');
    setEditorOpen(false);
    setEditor((e) => ({ ...e, password: '' }));
  }, []);

  const setRole = useCallback((role: string) => {
    setEditor((e) => ({ ...e, role, tabs: resolveUserTabs(role) }));
  }, []);

  const toggleTab = useCallback((tab: string, checked: boolean) => {
    setEditor((e) => {
      if (tabsDisabledForRole(e.role)) return e;
      const set = new Set(e.tabs);
      if (checked) set.add(tab);
      else set.delete(tab);
      return { ...e, tabs: normalizeUserTabs(Array.from(set)) };
    });
  }, []);

  const resolvedInstanceIds = useCallback((state: WebUserEditorState): string[] => {
    if (state.allInstances) return ['*'];
    return state.instanceIds.filter(Boolean);
  }, []);

  const saveEditor = useCallback(async () => {
    const username = editor.username.trim();
    if (!username) return;
    const instance_ids = resolvedInstanceIds(editor);
    const tabs = normalizeUserTabs(editor.tabs);
    try {
      if (editorMode === 'create') {
        await api('/api/auth/users', {
          method: 'POST',
          body: JSON.stringify({
            username,
            password: editor.password,
            role: editor.role,
            tabs,
            instance_ids,
          }),
        });
      } else if (editorMode === 'edit') {
        const payload: Record<string, unknown> = {
          role: editor.role,
          tabs,
          instance_ids,
          enabled: editor.enabled,
        };
        if (editor.password.trim()) payload.password = editor.password.trim();
        await api('/api/auth/users/' + encodeURIComponent(username), {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }
      setSelectedUser(username);
      await refresh();
      await reloadLocale();
      toast(t('web_users_saved'));
      closeEditor();
    } catch (e) {
      toast(localizeWebUserError(e instanceof Error ? e.message : String(e), t), true);
    }
  }, [closeEditor, editor, editorMode, refresh, reloadLocale, resolvedInstanceIds, t, toast]);

  const setEnabled = useCallback(
    async (username: string, enabled: boolean) => {
      try {
        await api('/api/auth/users/' + encodeURIComponent(username), {
          method: 'PUT',
          body: JSON.stringify({ enabled }),
        });
        if (selectedUser === username && editorOpen) {
          setEditor((e) => ({ ...e, enabled }));
        }
        await refresh();
        toast(t('web_users_saved'));
      } catch (e) {
        toast(localizeWebUserError(e instanceof Error ? e.message : String(e), t), true);
      }
    },
    [editorOpen, refresh, selectedUser, t, toast],
  );

  const deleteUser = useCallback(
    async (username: string) => {
      const uname = String(username || '').trim();
      if (!uname) return;
      modals.openConfirmModal({
        title: t('maintenance_menu_delete'),
        children: t('web_user_delete_confirm', uname),
        labels: { confirm: t('maintenance_menu_delete'), cancel: t('cancel') },
        confirmProps: { className: 'btn btn--danger' },
        onConfirm: async () => {
          try {
            await api('/api/auth/users/' + encodeURIComponent(uname), { method: 'DELETE' });
            if (selectedUser === uname) closeEditor();
            await refresh();
          } catch (e) {
            toast(localizeWebUserError(e instanceof Error ? e.message : String(e), t), true);
          }
        },
      });
    },
    [closeEditor, refresh, selectedUser, t, toast],
  );

  useEffect(() => {
    if (!editorOpen || editorMode !== 'edit') return;
    const u = users.find((x) => String(x.username) === selectedUser);
    if (u) setEditor(editorFromUser(u, accessInstances));
  }, [users, accessInstances, editorOpen, editorMode, selectedUser]);

  return {
    users,
    accessInstances,
    loading: query.isLoading,
    loadError,
    editorOpen,
    editorMode,
    editor,
    selectedUser,
    isLastEnabledAdmin: (username: string) => isLastEnabledAdmin(users, username),
    setEditor,
    setRole,
    toggleTab,
    openCreate,
    openEdit,
    closeEditor,
    saveEditor,
    setEnabled,
    deleteUser,
  };
}

export type WebUsersApi = ReturnType<typeof useWebUsers>;
