import { useState, useEffect, useMemo, type ReactNode, type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { AppIcon } from '../AppIcon';
import { FccSwitch } from '../FccSwitch';
import { TabLoadingPlaceholder } from '../TabLoadingPlaceholder';
import type { InstanceItem } from '../../types/instance';

const canWebkitDisc =
  typeof CSS !== 'undefined' && CSS.supports && CSS.supports('-webkit-text-security', 'disc');

interface WebhookTarget {
  url: string;
  secret?: string;
  enabled?: boolean;
}

interface GlobalNotifConfig {
  telegram_enabled: boolean;
  telegram_bot_token: string;
  telegram_chat_id: string;
  webhook_targets: string;
  notif_instances_mode: 'all' | 'selected';
  notif_selected_instance_ids: string;
  notif_server_started: boolean;
  notif_server_stopped: boolean;
  notif_server_crash: boolean;
  notif_server_start_failed: boolean;
  notif_player_join: boolean;
  notif_player_leave: boolean;
  notif_chat_relay: boolean;
  notif_maintenance: boolean;
  notif_factorio_update_available: boolean;
  notif_low_ups: boolean;
  notif_low_ups_threshold: number;
  notif_moderation: boolean;
  notif_silent_events: string;
}

interface InstanceNotifOverride {
  enabled?: boolean | null;
  telegram_chat_id?: string | null;
  webhook_targets?: string | null;
  notif_silent_events?: string | null;
  notif_server_started?: boolean | null;
  notif_server_stopped?: boolean | null;
  notif_server_crash?: boolean | null;
  notif_server_start_failed?: boolean | null;
  notif_player_join?: boolean | null;
  notif_player_leave?: boolean | null;
  notif_chat_relay?: boolean | null;
  notif_maintenance?: boolean | null;
  notif_factorio_update_available?: boolean | null;
  notif_low_ups?: boolean | null;
  notif_low_ups_threshold?: number | null;
  notif_moderation?: boolean | null;
}

interface IntegrationsTabProps {
  instances: InstanceItem[];
  t: (key: string, ...args: (string | number)[]) => string;
}

interface SettingsTableProps {
  title: string;
  titleId: string;
  titleMeta?: ReactNode;
  sectionId?: string;
  className?: string;
  children: ReactNode;
}

function SettingsTable({
  title,
  titleId,
  titleMeta,
  sectionId,
  className,
  children,
}: SettingsTableProps) {
  const sectionClass =
    'settings-table-section' + (className ? ' ' + className : '');
  return (
    <section className={sectionClass} id={sectionId} aria-labelledby={titleId}>
      <h3 id={titleId} className="settings-table-section__title">
        <span className="settings-table-section__title-text">{title}</span>
        {titleMeta ? (
          <span className="settings-table-section__title-meta">{titleMeta}</span>
        ) : null}
      </h3>
      <table className="settings-table">
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}

interface SettingsCheckRowProps {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  silent?: boolean;
  onSilentChange?: () => void;
  silentTitle?: string;
}

function SettingsCheckRow({
  label,
  hint,
  htmlFor,
  checked,
  onChange,
  silent,
  onSilentChange,
  silentTitle,
}: SettingsCheckRowProps) {
  return (
    <tr className="settings-table__row settings-table__row--inline-check">
      <td colSpan={2} className="settings-table__inline-cell">
        <div className="integrations-event-row-content">
          <FccSwitch
            id={htmlFor}
            className="settings-table__inline-check"
            labelClassName="settings-table__inline-check-label"
            checked={checked}
            onChange={onChange}
            label={label}
          />
          {onSilentChange && checked && (
            <button
              type="button"
              className={`btn btn--compact integrations-silent-btn ${
                silent ? 'integrations-silent-btn--active' : ''
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onSilentChange();
              }}
              title={silentTitle}
              aria-label={silentTitle}
            >
              <AppIcon name={silent ? 'notifications_off' : 'notifications'} size={14} />
            </button>
          )}
        </div>
        {hint ? <span className="settings-table__hint">{hint}</span> : null}
      </td>
    </tr>
  );
}

export function IntegrationsTab({ instances, t }: IntegrationsTabProps) {
  const qc = useQueryClient();

  // ── Global Config Query & State ──
  const { data: globalData, isLoading } = useQuery<{ ok: boolean } & GlobalNotifConfig>({
    queryKey: ['config', 'notifications'],
    queryFn: () => api('/api/config/notifications'),
  });

  // Local state for global form
  const [form, setForm] = useState<GlobalNotifConfig>({
    telegram_enabled: false,
    telegram_bot_token: '',
    telegram_chat_id: '',
    webhook_targets: '[]',
    notif_instances_mode: 'all',
    notif_selected_instance_ids: '[]',
    notif_server_started: true,
    notif_server_stopped: true,
    notif_server_crash: true,
    notif_server_start_failed: true,
    notif_player_join: true,
    notif_player_leave: true,
    notif_chat_relay: false,
    notif_maintenance: true,
    notif_factorio_update_available: true,
    notif_low_ups: true,
    notif_low_ups_threshold: 55,
    notif_moderation: true,
    notif_silent_events: '["player_join","player_leave"]',
  });

  const [targets, setTargets] = useState<WebhookTarget[]>([]);
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [showBotToken, setShowBotToken] = useState(false);

  // ── Per-Server Override State ──
  const [overrideServerId, setOverrideServerId] = useState<string>('');
  const [hasOverride, setHasOverride] = useState<boolean>(false);
  const [overrideForm, setOverrideForm] = useState<InstanceNotifOverride>({});
  const [overrideSaveStatus, setOverrideSaveStatus] = useState<string | null>(null);

  // Sync global form when query data arrives
  useEffect(() => {
    if (globalData) {
      setForm({
        telegram_enabled: Boolean(globalData.telegram_enabled),
        telegram_bot_token: globalData.telegram_bot_token ?? '',
        telegram_chat_id: globalData.telegram_chat_id ?? '',
        webhook_targets: globalData.webhook_targets ?? '[]',
        notif_instances_mode: globalData.notif_instances_mode ?? 'all',
        notif_selected_instance_ids: globalData.notif_selected_instance_ids ?? '[]',
        notif_server_started: Boolean(globalData.notif_server_started),
        notif_server_stopped: Boolean(globalData.notif_server_stopped),
        notif_server_crash: Boolean(globalData.notif_server_crash),
        notif_server_start_failed: Boolean(globalData.notif_server_start_failed),
        notif_player_join: Boolean(globalData.notif_player_join),
        notif_player_leave: Boolean(globalData.notif_player_leave),
        notif_chat_relay: Boolean(globalData.notif_chat_relay),
        notif_maintenance: Boolean(globalData.notif_maintenance),
        notif_factorio_update_available: Boolean(globalData.notif_factorio_update_available),
        notif_low_ups: Boolean(globalData.notif_low_ups),
        notif_low_ups_threshold:
          globalData.notif_low_ups_threshold !== undefined &&
          !isNaN(Number(globalData.notif_low_ups_threshold))
            ? Number(globalData.notif_low_ups_threshold)
            : 55,
        notif_moderation: Boolean(globalData.notif_moderation),
        notif_silent_events:
          globalData.notif_silent_events ?? '["player_join","player_leave"]',
      });

      try {
        const parsedTargets = JSON.parse(globalData.webhook_targets || '[]');
        if (Array.isArray(parsedTargets)) setTargets(parsedTargets);
      } catch {
        setTargets([]);
      }

      try {
        const parsedSelected = JSON.parse(globalData.notif_selected_instance_ids || '[]');
        if (Array.isArray(parsedSelected)) setSelectedInstanceIds(parsedSelected);
      } catch {
        setSelectedInstanceIds([]);
      }
    }
  }, [globalData]);

  const globalSilentEvents: string[] = useMemo(() => {
    try {
      const parsed = JSON.parse(form.notif_silent_events || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [form.notif_silent_events]);

  const handleToggleGlobalSilent = (event: string) => {
    const next = globalSilentEvents.includes(event)
      ? globalSilentEvents.filter((e) => e !== event)
      : [...globalSilentEvents, event];
    setForm((p) => ({ ...p, notif_silent_events: JSON.stringify(next) }));
  };

  const overrideSilentEvents: string[] = useMemo(() => {
    const raw =
      overrideForm.notif_silent_events !== null &&
      overrideForm.notif_silent_events !== undefined
        ? overrideForm.notif_silent_events
        : form.notif_silent_events;
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [overrideForm.notif_silent_events, form.notif_silent_events]);

  const handleToggleOverrideSilent = (event: string) => {
    const next = overrideSilentEvents.includes(event)
      ? overrideSilentEvents.filter((e) => e !== event)
      : [...overrideSilentEvents, event];
    setOverrideForm((p) => ({
      ...p,
      notif_silent_events: JSON.stringify(next),
    }));
  };

  // Query per-server override when overrideServerId changes
  const { data: overrideData, isFetching: overrideFetching } = useQuery<{
    ok: boolean;
    override: InstanceNotifOverride | null;
  }>({
    queryKey: ['instance', overrideServerId, 'notifications'],
    queryFn: () => api(`/api/config/notifications/instance/${overrideServerId}`),
    enabled: Boolean(overrideServerId),
  });

  useEffect(() => {
    if (overrideData) {
      if (overrideData.override) {
        setHasOverride(true);
        setOverrideForm(overrideData.override);
      } else {
        setHasOverride(false);
        setOverrideForm({});
      }
      setOverrideSaveStatus(null);
    }
  }, [overrideData]);

  // Mutations
  const saveGlobalMutation = useMutation({
    mutationFn: (cfg: GlobalNotifConfig) =>
      api('/api/config/notifications', {
        method: 'PUT',
        body: JSON.stringify(cfg),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config', 'notifications'] });
      setSaveStatus(t('notif_saved_success') || 'Settings saved successfully.');
      setTimeout(() => setSaveStatus(null), 3500);
    },
    onError: () => {
      setSaveStatus(t('notif_save_err') || 'Failed to save settings.');
      setTimeout(() => setSaveStatus(null), 4000);
    },
  });

  const saveOverrideMutation = useMutation({
    mutationFn: ({
      instanceId,
      override,
    }: {
      instanceId: string;
      override: InstanceNotifOverride | null;
    }) =>
      api(`/api/config/notifications/instance/${instanceId}`, {
        method: 'PUT',
        body: JSON.stringify({ override }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instance', overrideServerId, 'notifications'] });
      setOverrideSaveStatus(t('notif_saved_success') || 'Settings saved successfully.');
      setTimeout(() => setOverrideSaveStatus(null), 3500);
    },
    onError: () => {
      setOverrideSaveStatus(t('notif_save_err') || 'Failed to save settings.');
      setTimeout(() => setOverrideSaveStatus(null), 4000);
    },
  });

  const testMutation = useMutation({
    mutationFn: (targetInstId?: string) =>
      api('/api/config/notifications/test', {
        method: 'POST',
        body: JSON.stringify(targetInstId ? { instanceId: targetInstId } : {}),
      }) as Promise<{ ok: boolean; sent: string[] }>,
    onSuccess: (res: { ok: boolean; sent: string[] }) => {
      if (res.sent?.length) {
        setTestStatus(`${t('notif_test_sent') || 'Test sent to'}: ${res.sent.join(', ')}`);
      } else {
        setTestStatus(t('notif_test_none') || 'No channels configured.');
      }
      setTimeout(() => setTestStatus(null), 4000);
    },
    onError: () => {
      setTestStatus(t('notif_test_err') || 'Failed to send test notification.');
      setTimeout(() => setTestStatus(null), 4000);
    },
  });

  const handleSaveGlobal = () => {
    const payload: GlobalNotifConfig = {
      ...form,
      webhook_targets: JSON.stringify(targets),
      notif_selected_instance_ids: JSON.stringify(selectedInstanceIds),
    };
    saveGlobalMutation.mutate(payload);
  };

  const handleToggleTelegramEnabled = () => {
    const nextVal = !form.telegram_enabled;
    setForm((p) => ({ ...p, telegram_enabled: nextVal }));
    const payload: GlobalNotifConfig = {
      ...form,
      telegram_enabled: nextVal,
      webhook_targets: JSON.stringify(targets),
      notif_selected_instance_ids: JSON.stringify(selectedInstanceIds),
    };
    saveGlobalMutation.mutate(payload);
  };

  const handleToggleSelectedServer = (id: string) => {
    setSelectedInstanceIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleSelectAllServers = () => {
    setSelectedInstanceIds(instances.map((i) => String(i.id)));
  };

  const handleDeselectAllServers = () => {
    setSelectedInstanceIds([]);
  };

  const handleSaveOverride = () => {
    if (!overrideServerId) return;
    saveOverrideMutation.mutate({
      instanceId: overrideServerId,
      override: hasOverride ? overrideForm : null,
    });
  };

  const handleResetOverride = () => {
    if (!overrideServerId) return;
    setHasOverride(false);
    setOverrideForm({});
    saveOverrideMutation.mutate({
      instanceId: overrideServerId,
      override: null,
    });
  };

  const handleAddTarget = () => {
    setTargets((prev) => [...prev, { url: '', secret: '', enabled: true }]);
  };

  const handleRemoveTarget = (idx: number) => {
    setTargets((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateTarget = (idx: number, field: keyof WebhookTarget, val: unknown) => {
    setTargets((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, [field]: val } : t)),
    );
  };

  const selectedServerItem = useMemo(
    () => instances.find((i) => String(i.id) === overrideServerId),
    [instances, overrideServerId],
  );

  const activeEventsCount = useMemo(() => {
    let count = 0;
    if (form.notif_server_started) count++;
    if (form.notif_server_stopped) count++;
    if (form.notif_server_crash) count++;
    if (form.notif_server_start_failed) count++;
    if (form.notif_player_join) count++;
    if (form.notif_player_leave) count++;
    if (form.notif_chat_relay) count++;
    if (form.notif_maintenance) count++;
    if (form.notif_factorio_update_available) count++;
    if (form.notif_low_ups) count++;
    if (form.notif_moderation) count++;
    return count;
  }, [form]);

  const isTelegramConfigured = Boolean(form.telegram_bot_token && form.telegram_chat_id);

  if (isLoading) {
    return <TabLoadingPlaceholder variant="table" label={t('tab_data_loading') || 'Loading...'} />;
  }

  return (
    <div
      id="instanceTabIntegrations"
      className="settings-sub-panel"
      role="tabpanel"
      aria-labelledby="settingsSubTabIntegrationsBtn"
    >
      <div className="instance-settings-tables__layout">
        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* LEFT / MINOR COLUMN: Telegram Bot, Event Toggles & Main Controls  */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="instance-settings-tables__minor">
          {/* SECTION 1: Telegram Connection */}
          <SettingsTable
            title={t('notif_telegram_title') || 'Telegram Integration'}
            titleId="notifTelegramTitle"
            sectionId="notifTelegramSection"
            className="settings-table-section--compact"
            titleMeta={
              <span
                className={`integrations-conn-badge ${
                  !form.telegram_enabled
                    ? 'integrations-conn-badge--disabled'
                    : isTelegramConfigured
                      ? 'integrations-conn-badge--connected'
                      : ''
                }`}
              >
                <span className="integrations-conn-badge__dot" />
                {!form.telegram_enabled
                  ? t('notif_disabled') || 'Disabled'
                  : isTelegramConfigured
                    ? t('notif_active') || 'Active'
                    : t('notif_not_configured') || 'Not configured'}
              </span>
            }
          >
            <tr className="settings-table__row">
              <td className="settings-table__label">
                <label htmlFor="telegramBotToken" className="settings-table__label-text">
                  {t('notif_telegram_bot_token') || 'Bot Token'}
                </label>
                <span className="settings-table__hint">
                  {t('notif_telegram_bot_token_hint') || 'From @BotFather'}
                </span>
              </td>
              <td className="settings-table__control">
                <div className="settings-table__control-stack">
                  <button
                    type="button"
                    className="btn btn--compact"
                    onClick={() => setShowBotToken((v) => !v)}
                    title={showBotToken ? t('hide') || 'Hide' : t('show') || 'Show'}
                  >
                    <AppIcon name="asterisk" size={15} />
                  </button>
                  <input
                    id="telegramBotToken"
                    name="fcc_telegram_bot_token"
                    type={canWebkitDisc ? 'text' : showBotToken ? 'text' : 'password'}
                    style={
                      canWebkitDisc && !showBotToken
                        ? ({ WebkitTextSecurity: 'disc' } as CSSProperties)
                        : undefined
                    }
                    className="input settings-table__input"
                    placeholder="123456789:ABCdef..."
                    autoComplete="one-time-code"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-fcc-non-credential="1"
                    data-form-type="other"
                    value={form.telegram_bot_token}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, telegram_bot_token: e.target.value }))
                    }
                  />
                </div>
              </td>
            </tr>

            <tr className="settings-table__row">
              <td className="settings-table__label">
                <label htmlFor="telegramChatId" className="settings-table__label-text">
                  {t('notif_telegram_chat_id') || 'Chat ID'}
                </label>
                <span className="settings-table__hint">
                  {t('notif_telegram_chat_id_hint') || 'Numeric user or channel ID'}
                </span>
              </td>
              <td className="settings-table__control">
                <div className="settings-table__control-stack">
                  <span className="settings-table__control-spacer" aria-hidden="true" />
                  <input
                    id="telegramChatId"
                    type="text"
                    className="input settings-table__input"
                    placeholder="-100123456789"
                    value={form.telegram_chat_id}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, telegram_chat_id: e.target.value }))
                    }
                  />
                </div>
              </td>
            </tr>
            <tr className="settings-table__row">
              <td colSpan={2} className="settings-table__inline-cell integrations-actions-cell">
                <div className="integrations-action-group">
                  <button
                    type="button"
                    className="btn btn--compact btn--with-icon integrations-save-btn"
                    onClick={handleSaveGlobal}
                    disabled={saveGlobalMutation.isPending}
                  >
                    <AppIcon name="save" size={16} />
                    {saveGlobalMutation.isPending
                      ? t('notif_saving') || 'Saving...'
                      : t('notif_save_btn') || 'Save'}
                  </button>

                  <button
                    type="button"
                    className="btn btn--compact btn--with-icon"
                    onClick={handleToggleTelegramEnabled}
                    disabled={saveGlobalMutation.isPending}
                  >
                    <AppIcon name="mode_off_on" size={15} />
                    {form.telegram_enabled
                      ? t('notif_telegram_disable_btn') || 'Disable'
                      : t('notif_telegram_enable_btn') || 'Enable'}
                  </button>

                  <button
                    type="button"
                    className="btn btn--compact btn--with-icon"
                    onClick={() => testMutation.mutate(undefined)}
                    disabled={testMutation.isPending}
                  >
                    <AppIcon name="terminal" size={16} />
                    {testMutation.isPending
                      ? t('notif_testing') || 'Sending...'
                      : t('notif_test_btn') || 'Test'}
                  </button>

                  {saveStatus && (
                    <span
                      className={`integrations-tab__status-msg ${
                        saveStatus.includes('error') || saveStatus.includes('Не удалось')
                          ? 'integrations-tab__status-msg--err'
                          : ''
                      }`}
                    >
                      {saveStatus}
                    </span>
                  )}
                  {testStatus && (
                    <span
                      className={`integrations-tab__status-msg ${
                        testStatus.includes('failed') || testStatus.includes('Не удалось')
                          ? 'integrations-tab__status-msg--err'
                          : ''
                      }`}
                    >
                      {testStatus}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          </SettingsTable>

          {/* SECTION 2: Global Notification Triggers */}
          <SettingsTable
            title={t('notif_events_title') || 'Events'}
            titleId="notifEventsTitle"
            sectionId="notifEventsSection"
            className="settings-table-section--compact"
            titleMeta={
              <span className="integrations-counter-badge">{activeEventsCount}/11</span>
            }
          >
            <SettingsCheckRow
              label={t('notif_ev_server_started') || 'Server started successfully'}
              htmlFor="ev_server_started"
              checked={form.notif_server_started}
              onChange={(val) => setForm((p) => ({ ...p, notif_server_started: val }))}
              silent={globalSilentEvents.includes('server_started')}
              onSilentChange={() => handleToggleGlobalSilent('server_started')}
              silentTitle={
                globalSilentEvents.includes('server_started')
                  ? t('notif_silent_toggle_off') || 'Send with sound'
                  : t('notif_silent_toggle_on') || 'Send silently'
              }
            />
            <SettingsCheckRow
              label={t('notif_ev_server_stopped') || 'Server stopped'}
              htmlFor="ev_server_stopped"
              checked={form.notif_server_stopped}
              onChange={(val) => setForm((p) => ({ ...p, notif_server_stopped: val }))}
              silent={globalSilentEvents.includes('server_stopped')}
              onSilentChange={() => handleToggleGlobalSilent('server_stopped')}
              silentTitle={
                globalSilentEvents.includes('server_stopped')
                  ? t('notif_silent_toggle_off') || 'Send with sound'
                  : t('notif_silent_toggle_on') || 'Send silently'
              }
            />
            <SettingsCheckRow
              label={t('notif_ev_server_crash') || 'Server crashed unexpectedly'}
              htmlFor="ev_server_crash"
              checked={form.notif_server_crash}
              onChange={(val) => setForm((p) => ({ ...p, notif_server_crash: val }))}
              silent={globalSilentEvents.includes('server_crash')}
              onSilentChange={() => handleToggleGlobalSilent('server_crash')}
              silentTitle={
                globalSilentEvents.includes('server_crash')
                  ? t('notif_silent_toggle_off') || 'Send with sound'
                  : t('notif_silent_toggle_on') || 'Send silently'
              }
            />
            <SettingsCheckRow
              label={t('notif_ev_start_failed') || 'Server failed to start'}
              htmlFor="ev_server_start_failed"
              checked={form.notif_server_start_failed}
              onChange={(val) => setForm((p) => ({ ...p, notif_server_start_failed: val }))}
              silent={globalSilentEvents.includes('server_start_failed')}
              onSilentChange={() => handleToggleGlobalSilent('server_start_failed')}
              silentTitle={
                globalSilentEvents.includes('server_start_failed')
                  ? t('notif_silent_toggle_off') || 'Send with sound'
                  : t('notif_silent_toggle_on') || 'Send silently'
              }
            />
            <SettingsCheckRow
              label={t('notif_ev_player_join') || 'Player joined the server'}
              htmlFor="ev_player_join"
              checked={form.notif_player_join}
              onChange={(val) => setForm((p) => ({ ...p, notif_player_join: val }))}
              silent={globalSilentEvents.includes('player_join')}
              onSilentChange={() => handleToggleGlobalSilent('player_join')}
              silentTitle={
                globalSilentEvents.includes('player_join')
                  ? t('notif_silent_toggle_off') || 'Send with sound'
                  : t('notif_silent_toggle_on') || 'Send silently'
              }
            />
            <SettingsCheckRow
              label={t('notif_ev_player_leave') || 'Player left the server'}
              htmlFor="ev_player_leave"
              checked={form.notif_player_leave}
              onChange={(val) => setForm((p) => ({ ...p, notif_player_leave: val }))}
              silent={globalSilentEvents.includes('player_leave')}
              onSilentChange={() => handleToggleGlobalSilent('player_leave')}
              silentTitle={
                globalSilentEvents.includes('player_leave')
                  ? t('notif_silent_toggle_off') || 'Send with sound'
                  : t('notif_silent_toggle_on') || 'Send silently'
              }
            />
            <SettingsCheckRow
              label={t('notif_ev_chat_relay') || 'Relay in-game chat to Telegram'}
              htmlFor="ev_chat_relay"
              checked={form.notif_chat_relay}
              onChange={(val) => setForm((p) => ({ ...p, notif_chat_relay: val }))}
              silent={globalSilentEvents.includes('chat_relay')}
              onSilentChange={() => handleToggleGlobalSilent('chat_relay')}
              silentTitle={
                globalSilentEvents.includes('chat_relay')
                  ? t('notif_silent_toggle_off') || 'Send with sound'
                  : t('notif_silent_toggle_on') || 'Send silently'
              }
            />
            <SettingsCheckRow
              label={t('notif_ev_maintenance') || 'Maintenance window started / finished'}
              htmlFor="ev_maintenance"
              checked={form.notif_maintenance}
              onChange={(val) => setForm((p) => ({ ...p, notif_maintenance: val }))}
              silent={globalSilentEvents.includes('maintenance')}
              onSilentChange={() => handleToggleGlobalSilent('maintenance')}
              silentTitle={
                globalSilentEvents.includes('maintenance')
                  ? t('notif_silent_toggle_off') || 'Send with sound'
                  : t('notif_silent_toggle_on') || 'Send silently'
              }
            />
            <SettingsCheckRow
              label={t('notif_ev_factorio_update_available') || 'Factorio update available'}
              htmlFor="ev_factorio_update_available"
              checked={form.notif_factorio_update_available}
              onChange={(val) => setForm((p) => ({ ...p, notif_factorio_update_available: val }))}
              silent={globalSilentEvents.includes('factorio_update_available')}
              onSilentChange={() => handleToggleGlobalSilent('factorio_update_available')}
              silentTitle={
                globalSilentEvents.includes('factorio_update_available')
                  ? t('notif_silent_toggle_off') || 'Send with sound'
                  : t('notif_silent_toggle_on') || 'Send silently'
              }
            />
            <SettingsCheckRow
              label={
                <span className="integrations-ups-label-wrap">
                  <span>{t('notif_ev_low_ups') || 'Low UPS below'}</span>
                  <input
                    type="number"
                    min={10}
                    max={60}
                    step={1}
                    className="input integrations-ups-threshold-input"
                    value={form.notif_low_ups_threshold ?? 55}
                    disabled={!form.notif_low_ups}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const num = Number(e.target.value);
                      setForm((p) => ({
                        ...p,
                        notif_low_ups_threshold: isNaN(num) ? 55 : num,
                      }));
                    }}
                  />
                  <span className="integrations-ups-threshold-unit">UPS</span>
                </span>
              }
              htmlFor="ev_low_ups"
              checked={form.notif_low_ups}
              onChange={(val) => setForm((p) => ({ ...p, notif_low_ups: val }))}
              silent={globalSilentEvents.includes('low_ups')}
              onSilentChange={() => handleToggleGlobalSilent('low_ups')}
              silentTitle={
                globalSilentEvents.includes('low_ups')
                  ? t('notif_silent_toggle_off') || 'Send with sound'
                  : t('notif_silent_toggle_on') || 'Send silently'
              }
            />
            <SettingsCheckRow
              label={t('notif_ev_moderation') || 'Moderation actions (kick, ban, promote, purge)'}
              htmlFor="ev_moderation"
              checked={form.notif_moderation}
              onChange={(val) => setForm((p) => ({ ...p, notif_moderation: val }))}
              silent={globalSilentEvents.includes('moderation')}
              onSilentChange={() => handleToggleGlobalSilent('moderation')}
              silentTitle={
                globalSilentEvents.includes('moderation')
                  ? t('notif_silent_toggle_off') || 'Send with sound'
                  : t('notif_silent_toggle_on') || 'Send silently'
              }
            />
          </SettingsTable>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* RIGHT / MAJOR COLUMN: Server Scope, Overrides & Custom Webhooks    */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="instance-settings-tables__major">
          {/* SECTION 1: Server Scope & Instance Selection */}
          <SettingsTable
            title={t('notif_servers_scope_title') || 'Server Scope & Selection'}
            titleId="notifServersScopeTitle"
            sectionId="notifServersScopeSection"
            titleMeta={
              <span className="integrations-counter-badge">
                {instances.length} {t('instances_count_label') || 'servers'}
              </span>
            }
          >
            <tr className="settings-table__row settings-table__row--scope-header">
              <td colSpan={2} className="integrations-scope-cell">
                <div className="integrations-scope-bar">
                  <div className="integrations-scope-info">
                    <span className="integrations-scope-hint">
                      {t('notif_instances_mode_hint') ||
                        'Choose whether notifications should trigger for all game servers or only specifically selected servers.'}
                    </span>
                  </div>
                  <div className="integrations-scope-segmented">
                    <button
                      type="button"
                      className={`integrations-scope-btn ${
                        form.notif_instances_mode === 'all'
                          ? 'integrations-scope-btn--active'
                          : ''
                      }`}
                      onClick={() =>
                        setForm((p) => ({ ...p, notif_instances_mode: 'all' }))
                      }
                    >
                      <AppIcon name="list" size={15} />
                      {t('notif_instances_mode_all') || 'All servers'}
                    </button>
                    <button
                      type="button"
                      className={`integrations-scope-btn ${
                        form.notif_instances_mode === 'selected'
                          ? 'integrations-scope-btn--active'
                          : ''
                      }`}
                      onClick={() =>
                        setForm((p) => ({ ...p, notif_instances_mode: 'selected' }))
                      }
                    >
                      <AppIcon name="settings" size={15} />
                      {t('notif_instances_mode_selected') || 'Only selected servers'}
                    </button>
                  </div>
                </div>
              </td>
            </tr>

            {form.notif_instances_mode === 'selected' && (
              <tr className="settings-table__row">
                <td colSpan={2} style={{ padding: 0 }}>
                  <div className="integrations-server-selection-bar">
                    <span className="integrations-server-selection-title">
                      {t('notif_select_servers_prompt') || 'Active servers for notifications:'}
                    </span>
                    <div className="integrations-server-selection-actions">
                      <button
                        type="button"
                        className="btn btn--small btn--compact btn--secondary btn--with-icon"
                        onClick={handleSelectAllServers}
                      >
                        <AppIcon name="select_check_box" size={14} />
                        {t('notif_select_all') || 'Select All'}
                      </button>
                      <button
                        type="button"
                        className="btn btn--small btn--compact btn--secondary btn--with-icon"
                        onClick={handleDeselectAllServers}
                      >
                        <AppIcon name="close" size={14} />
                        {t('notif_deselect_all') || 'Deselect All'}
                      </button>
                    </div>
                  </div>

                  {!instances.length ? (
                    <div className="settings-table__footnote" style={{ padding: '16px', textAlign: 'center' }}>
                      {t('instances_empty_title') || 'No servers found.'}
                    </div>
                  ) : (
                    <div className="integrations-server-grid">
                      {instances.map((srv) => {
                        const idStr = String(srv.id);
                        const isChecked = selectedInstanceIds.includes(idStr);
                        const isRunning = srv.status === 'running';
                        return (
                          <div
                            key={idStr}
                            className={`integrations-server-card ${
                              isChecked ? 'integrations-server-card--active' : ''
                            }`}
                            onClick={() => handleToggleSelectedServer(idStr)}
                          >
                            <div
                              className="integrations-server-card__switch"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <FccSwitch
                                id={`srv_chk_${idStr}`}
                                checked={isChecked}
                                onChange={() => handleToggleSelectedServer(idStr)}
                                label=""
                              />
                            </div>
                            <span
                              className="integrations-server-card__name"
                              title={srv.name || idStr}
                            >
                              {srv.name || idStr}
                            </span>
                            <span
                              className={`integrations-srv-status-chip ${
                                isRunning
                                  ? 'integrations-srv-status-chip--running'
                                  : 'integrations-srv-status-chip--stopped'
                              }`}
                            >
                              {isRunning
                                ? t('notif_server_running') || 'Running'
                                : t('notif_server_stopped') || 'Stopped'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </td>
              </tr>
            )}
          </SettingsTable>

          {/* SECTION 2: Per-Server Custom Overrides */}
          <SettingsTable
            title={t('notif_server_override_title') || 'Per-Server Custom Overrides'}
            titleId="notifServerOverrideTitle"
            sectionId="notifServerOverrideSection"
          >
            <tr className="settings-table__row settings-table__row--override-header">
              <td colSpan={2} className="integrations-override-selector-cell">
                <div className="integrations-override-selector-bar">
                  <div className="integrations-override-selector-info">
                    <span className="integrations-override-selector-title">
                      {t('notif_choose_server_override') || 'Configure individual server:'}
                    </span>
                    <span className="integrations-override-selector-hint">
                      {t('notif_choose_server_override_hint') ||
                        'Set a separate Telegram chat or custom events for a specific server.'}
                    </span>
                  </div>
                  <div className="integrations-override-select-wrap">
                    <select
                      id="overrideServerSelect"
                      className="input integrations-override-select"
                      value={overrideServerId}
                      onChange={(e) => setOverrideServerId(e.target.value)}
                    >
                      <option value="">
                        {t('notif_select_server_placeholder') || '-- Select server to configure --'}
                      </option>
                      {instances.map((i) => (
                        <option key={i.id} value={String(i.id)}>
                          {i.name || i.id}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </td>
            </tr>

            {overrideServerId && (
              <tr className="settings-table__row">
                <td colSpan={2} style={{ padding: 0 }}>
                  <div className="integrations-override-panel">
                    <div className="integrations-override-header">
                      <div className="integrations-override-server-identity">
                        <span className="integrations-override-server-title">
                          {selectedServerItem?.name || overrideServerId}
                        </span>
                        <span
                          className={`integrations-override-badge ${
                            hasOverride ? 'integrations-override-badge--custom' : ''
                          }`}
                        >
                          {hasOverride
                            ? t('notif_override_custom_badge') || 'Custom Config'
                            : t('notif_override_global_badge') || 'Using Global'}
                        </span>
                      </div>
                      <FccSwitch
                        id="toggleHasOverride"
                        checked={hasOverride}
                        onChange={(val) => {
                          setHasOverride(val);
                          if (val && !overrideForm.enabled) {
                            setOverrideForm((p) => ({ ...p, enabled: true }));
                          }
                        }}
                        label={
                          t('notif_enable_server_override') ||
                          'Enable custom settings for this server'
                        }
                      />
                    </div>

                    {overrideFetching ? (
                      <div className="settings-table__footnote" style={{ padding: '16px', textAlign: 'center' }}>
                        {t('tab_data_loading') || 'Loading...'}
                      </div>
                    ) : hasOverride ? (
                      <div className="integrations-override-body">
                        <div className="integrations-override-top-bar">
                          <FccSwitch
                            id="serverNotifEnabled"
                            checked={overrideForm.enabled !== false}
                            onChange={(val) =>
                              setOverrideForm((p) => ({ ...p, enabled: val }))
                            }
                            label={
                              t('notif_server_active_label') ||
                              'Allow notifications for this server'
                            }
                          />
                          <div className="integrations-override-chat-wrap">
                            <label htmlFor="serverTelegramChatId" className="integrations-override-chat-label">
                              {t('notif_telegram_chat_override') || 'Telegram Chat ID (Override):'}
                            </label>
                            <input
                              id="serverTelegramChatId"
                              type="text"
                              className="input integrations-override-chat-input"
                              placeholder={form.telegram_chat_id || '-100123456789'}
                              value={overrideForm.telegram_chat_id ?? ''}
                              onChange={(e) =>
                                setOverrideForm((p) => ({
                                  ...p,
                                  telegram_chat_id: e.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>

                        <div className="integrations-override-events-section">
                          <div className="integrations-override-events-header">
                            <span className="integrations-override-events-title">
                              {t('notif_server_events_title') || 'Event Overrides:'}
                            </span>
                          </div>
                          <div className="integrations-override-events-grid">
                            {(() => {
                              const isStarted =
                                overrideForm.notif_server_started !== null &&
                                overrideForm.notif_server_started !== undefined
                                  ? Boolean(overrideForm.notif_server_started)
                                  : form.notif_server_started;
                              const isSilent = overrideSilentEvents.includes('server_started');
                              return (
                                <div className="integrations-event-card integrations-event-card--with-silent">
                                  <FccSwitch
                                    id="ov_started"
                                    checked={isStarted}
                                    onChange={(val) =>
                                      setOverrideForm((p) => ({ ...p, notif_server_started: val }))
                                    }
                                    label={t('notif_ev_server_started') || 'Server started'}
                                  />
                                  {isStarted && (
                                    <button
                                      type="button"
                                      className={`btn btn--compact integrations-silent-btn ${
                                        isSilent ? 'integrations-silent-btn--active' : ''
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleOverrideSilent('server_started');
                                      }}
                                      title={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                      aria-label={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                    >
                                      <AppIcon
                                        name={isSilent ? 'notifications_off' : 'notifications'}
                                        size={14}
                                      />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {(() => {
                              const isStopped =
                                overrideForm.notif_server_stopped !== null &&
                                overrideForm.notif_server_stopped !== undefined
                                  ? Boolean(overrideForm.notif_server_stopped)
                                  : form.notif_server_stopped;
                              const isSilent = overrideSilentEvents.includes('server_stopped');
                              return (
                                <div className="integrations-event-card integrations-event-card--with-silent">
                                  <FccSwitch
                                    id="ov_stopped"
                                    checked={isStopped}
                                    onChange={(val) =>
                                      setOverrideForm((p) => ({ ...p, notif_server_stopped: val }))
                                    }
                                    label={t('notif_ev_server_stopped') || 'Server stopped'}
                                  />
                                  {isStopped && (
                                    <button
                                      type="button"
                                      className={`btn btn--compact integrations-silent-btn ${
                                        isSilent ? 'integrations-silent-btn--active' : ''
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleOverrideSilent('server_stopped');
                                      }}
                                      title={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                      aria-label={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                    >
                                      <AppIcon
                                        name={isSilent ? 'notifications_off' : 'notifications'}
                                        size={14}
                                      />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {(() => {
                              const isCrash =
                                overrideForm.notif_server_crash !== null &&
                                overrideForm.notif_server_crash !== undefined
                                  ? Boolean(overrideForm.notif_server_crash)
                                  : form.notif_server_crash;
                              const isSilent = overrideSilentEvents.includes('server_crash');
                              return (
                                <div className="integrations-event-card integrations-event-card--with-silent">
                                  <FccSwitch
                                    id="ov_crash"
                                    checked={isCrash}
                                    onChange={(val) =>
                                      setOverrideForm((p) => ({ ...p, notif_server_crash: val }))
                                    }
                                    label={t('notif_ev_server_crash') || 'Server crash'}
                                  />
                                  {isCrash && (
                                    <button
                                      type="button"
                                      className={`btn btn--compact integrations-silent-btn ${
                                        isSilent ? 'integrations-silent-btn--active' : ''
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleOverrideSilent('server_crash');
                                      }}
                                      title={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                      aria-label={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                    >
                                      <AppIcon
                                        name={isSilent ? 'notifications_off' : 'notifications'}
                                        size={14}
                                      />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {(() => {
                              const isStartFailed =
                                overrideForm.notif_server_start_failed !== null &&
                                overrideForm.notif_server_start_failed !== undefined
                                  ? Boolean(overrideForm.notif_server_start_failed)
                                  : form.notif_server_start_failed;
                              const isSilent = overrideSilentEvents.includes('server_start_failed');
                              return (
                                <div className="integrations-event-card integrations-event-card--with-silent">
                                  <FccSwitch
                                    id="ov_start_failed"
                                    checked={isStartFailed}
                                    onChange={(val) =>
                                      setOverrideForm((p) => ({
                                        ...p,
                                        notif_server_start_failed: val,
                                      }))
                                    }
                                    label={t('notif_ev_start_failed') || 'Start failed'}
                                  />
                                  {isStartFailed && (
                                    <button
                                      type="button"
                                      className={`btn btn--compact integrations-silent-btn ${
                                        isSilent ? 'integrations-silent-btn--active' : ''
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleOverrideSilent('server_start_failed');
                                      }}
                                      title={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                      aria-label={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                    >
                                      <AppIcon
                                        name={isSilent ? 'notifications_off' : 'notifications'}
                                        size={14}
                                      />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {(() => {
                              const isPlayerJoin =
                                overrideForm.notif_player_join !== null &&
                                overrideForm.notif_player_join !== undefined
                                  ? Boolean(overrideForm.notif_player_join)
                                  : form.notif_player_join;
                              const isSilent = overrideSilentEvents.includes('player_join');
                              return (
                                <div className="integrations-event-card integrations-event-card--with-silent">
                                  <FccSwitch
                                    id="ov_player_join"
                                    checked={isPlayerJoin}
                                    onChange={(val) =>
                                      setOverrideForm((p) => ({ ...p, notif_player_join: val }))
                                    }
                                    label={t('notif_ev_player_join') || 'Player joined'}
                                  />
                                  {isPlayerJoin && (
                                    <button
                                      type="button"
                                      className={`btn btn--compact integrations-silent-btn ${
                                        isSilent ? 'integrations-silent-btn--active' : ''
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleOverrideSilent('player_join');
                                      }}
                                      title={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                      aria-label={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                    >
                                      <AppIcon
                                        name={isSilent ? 'notifications_off' : 'notifications'}
                                        size={14}
                                      />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {(() => {
                              const isPlayerLeave =
                                overrideForm.notif_player_leave !== null &&
                                overrideForm.notif_player_leave !== undefined
                                  ? Boolean(overrideForm.notif_player_leave)
                                  : form.notif_player_leave;
                              const isSilent = overrideSilentEvents.includes('player_leave');
                              return (
                                <div className="integrations-event-card integrations-event-card--with-silent">
                                  <FccSwitch
                                    id="ov_player_leave"
                                    checked={isPlayerLeave}
                                    onChange={(val) =>
                                      setOverrideForm((p) => ({ ...p, notif_player_leave: val }))
                                    }
                                    label={t('notif_ev_player_leave') || 'Player left'}
                                  />
                                  {isPlayerLeave && (
                                    <button
                                      type="button"
                                      className={`btn btn--compact integrations-silent-btn ${
                                        isSilent ? 'integrations-silent-btn--active' : ''
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleOverrideSilent('player_leave');
                                      }}
                                      title={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                      aria-label={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                    >
                                      <AppIcon
                                        name={isSilent ? 'notifications_off' : 'notifications'}
                                        size={14}
                                      />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {(() => {
                              const isChat =
                                overrideForm.notif_chat_relay !== null &&
                                overrideForm.notif_chat_relay !== undefined
                                  ? Boolean(overrideForm.notif_chat_relay)
                                  : form.notif_chat_relay;
                              const isSilent = overrideSilentEvents.includes('chat_relay');
                              return (
                                <div className="integrations-event-card integrations-event-card--with-silent">
                                  <FccSwitch
                                    id="ov_chat"
                                    checked={isChat}
                                    onChange={(val) =>
                                      setOverrideForm((p) => ({ ...p, notif_chat_relay: val }))
                                    }
                                    label={t('notif_ev_chat_relay') || 'Chat relay'}
                                  />
                                  {isChat && (
                                    <button
                                      type="button"
                                      className={`btn btn--compact integrations-silent-btn ${
                                        isSilent ? 'integrations-silent-btn--active' : ''
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleOverrideSilent('chat_relay');
                                      }}
                                      title={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                      aria-label={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                    >
                                      <AppIcon
                                        name={isSilent ? 'notifications_off' : 'notifications'}
                                        size={14}
                                      />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {(() => {
                              const isMaint =
                                overrideForm.notif_maintenance !== null &&
                                overrideForm.notif_maintenance !== undefined
                                  ? Boolean(overrideForm.notif_maintenance)
                                  : form.notif_maintenance;
                              const isSilent = overrideSilentEvents.includes('maintenance');
                              return (
                                <div className="integrations-event-card integrations-event-card--with-silent">
                                  <FccSwitch
                                    id="ov_maint"
                                    checked={isMaint}
                                    onChange={(val) =>
                                      setOverrideForm((p) => ({ ...p, notif_maintenance: val }))
                                    }
                                    label={t('notif_ev_maintenance') || 'Maintenance'}
                                  />
                                  {isMaint && (
                                    <button
                                      type="button"
                                      className={`btn btn--compact integrations-silent-btn ${
                                        isSilent ? 'integrations-silent-btn--active' : ''
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleOverrideSilent('maintenance');
                                      }}
                                      title={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                      aria-label={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                    >
                                      <AppIcon
                                        name={isSilent ? 'notifications_off' : 'notifications'}
                                        size={14}
                                      />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {(() => {
                              const isUpdate =
                                overrideForm.notif_factorio_update_available !== null &&
                                overrideForm.notif_factorio_update_available !== undefined
                                  ? Boolean(overrideForm.notif_factorio_update_available)
                                  : form.notif_factorio_update_available;
                              const isSilent = overrideSilentEvents.includes('factorio_update_available');
                              return (
                                <div className="integrations-event-card integrations-event-card--with-silent">
                                  <FccSwitch
                                    id="ov_factorio_update"
                                    checked={isUpdate}
                                    onChange={(val) =>
                                      setOverrideForm((p) => ({
                                        ...p,
                                        notif_factorio_update_available: val,
                                      }))
                                    }
                                    label={
                                      t('notif_ev_factorio_update_available') ||
                                      'Factorio update available'
                                    }
                                  />
                                  {isUpdate && (
                                    <button
                                      type="button"
                                      className={`btn btn--compact integrations-silent-btn ${
                                        isSilent ? 'integrations-silent-btn--active' : ''
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleOverrideSilent('factorio_update_available');
                                      }}
                                      title={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                      aria-label={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                    >
                                      <AppIcon
                                        name={isSilent ? 'notifications_off' : 'notifications'}
                                        size={14}
                                      />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {(() => {
                              const isLowUps =
                                overrideForm.notif_low_ups !== null &&
                                overrideForm.notif_low_ups !== undefined
                                  ? Boolean(overrideForm.notif_low_ups)
                                  : form.notif_low_ups;
                              const isSilent = overrideSilentEvents.includes('low_ups');
                              return (
                                <div className="integrations-event-card integrations-event-card--with-silent">
                                  <FccSwitch
                                    id="ov_low_ups"
                                    checked={isLowUps}
                                    onChange={(val) =>
                                      setOverrideForm((p) => ({ ...p, notif_low_ups: val }))
                                    }
                                    label={
                                      <span className="integrations-ups-label-wrap">
                                        <span>{t('notif_ev_low_ups') || 'Low UPS below'}</span>
                                        <input
                                          type="number"
                                          min={10}
                                          max={60}
                                          step={1}
                                          className="input integrations-ups-threshold-input"
                                          value={
                                            overrideForm.notif_low_ups_threshold ??
                                            form.notif_low_ups_threshold ??
                                            55
                                          }
                                          disabled={!isLowUps}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={(e) => {
                                            const num = Number(e.target.value);
                                            setOverrideForm((p) => ({
                                              ...p,
                                              notif_low_ups_threshold: isNaN(num) ? 55 : num,
                                            }));
                                          }}
                                        />
                                        <span className="integrations-ups-threshold-unit">UPS</span>
                                      </span>
                                    }
                                  />
                                  {isLowUps && (
                                    <button
                                      type="button"
                                      className={`btn btn--compact integrations-silent-btn ${
                                        isSilent ? 'integrations-silent-btn--active' : ''
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleOverrideSilent('low_ups');
                                      }}
                                      title={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                      aria-label={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                    >
                                      <AppIcon
                                        name={isSilent ? 'notifications_off' : 'notifications'}
                                        size={14}
                                      />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {(() => {
                              const isMod =
                                overrideForm.notif_moderation !== null &&
                                overrideForm.notif_moderation !== undefined
                                  ? Boolean(overrideForm.notif_moderation)
                                  : form.notif_moderation;
                              const isSilent = overrideSilentEvents.includes('moderation');
                              return (
                                <div className="integrations-event-card integrations-event-card--with-silent">
                                  <FccSwitch
                                    id="ov_moderation"
                                    checked={isMod}
                                    onChange={(val) =>
                                      setOverrideForm((p) => ({ ...p, notif_moderation: val }))
                                    }
                                    label={
                                      t('notif_ev_moderation') ||
                                      'Moderation actions'
                                    }
                                  />
                                  {isMod && (
                                    <button
                                      type="button"
                                      className={`btn btn--compact integrations-silent-btn ${
                                        isSilent ? 'integrations-silent-btn--active' : ''
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleOverrideSilent('moderation');
                                      }}
                                      title={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                      aria-label={
                                        isSilent
                                          ? t('notif_silent_toggle_off') || 'Send with sound'
                                          : t('notif_silent_toggle_on') || 'Send silently'
                                      }
                                    >
                                      <AppIcon
                                        name={isSilent ? 'notifications_off' : 'notifications'}
                                        size={14}
                                      />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        <div className="integrations-override-actions">
                          <button
                            type="button"
                            className="btn btn--compact btn--with-icon"
                            onClick={handleSaveOverride}
                            disabled={saveOverrideMutation.isPending}
                          >
                            <AppIcon name="save" size={16} />
                            {saveOverrideMutation.isPending
                              ? t('saving') || 'Saving...'
                              : t('notif_save_server_btn') || 'Save Server Override'}
                          </button>
                          <button
                            type="button"
                            className="btn btn--danger btn--compact btn--with-icon"
                            onClick={handleResetOverride}
                            disabled={saveOverrideMutation.isPending}
                          >
                            <AppIcon name="reset" size={16} />
                            {t('notif_reset_server_btn') || 'Reset to Global'}
                          </button>
                          {overrideSaveStatus && (
                            <span className="integrations-tab__status-msg">
                              {overrideSaveStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="settings-table__footnote" style={{ padding: '16px' }}>
                        {t('notif_server_using_global_note') ||
                          'This server currently inherits all global notification settings and webhooks.'}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </SettingsTable>

          {/* SECTION 3: Custom Webhooks (Monitoring) */}
          <SettingsTable
            title={t('notif_custom_webhooks_title') || 'Custom Webhooks (Monitoring)'}
            titleId="notifCustomWebhooksTitle"
            sectionId="notifCustomWebhooksSection"
            titleMeta={
              <button
                type="button"
                className="btn btn--compact btn--with-icon"
                onClick={handleAddTarget}
              >
                <AppIcon name="add" size={14} />
                {t('notif_webhook_add_btn') || 'Add Webhook'}
              </button>
            }
          >
            <tr className="settings-table__row">
              <td colSpan={2} style={{ padding: 0 }}>
                <div className="integrations-webhooks-container">
                  <div className="integrations-webhooks-hint-bar">
                    <AppIcon name="info" size={15} className="integrations-webhooks-hint-icon" />
                    <span className="integrations-webhooks-hint-text">
                      <code>HTTP POST</code> {t('integrations_webhook_payload_hint') || 'JSON payload: { event, instanceId, instanceName, timestamp, data }'}
                    </span>
                  </div>

                  {!targets.length ? (
                    <div className="integrations-webhooks-empty">
                      <div className="integrations-webhooks-empty__icon">
                        <AppIcon name="monitoring" size={24} />
                      </div>
                      <span className="integrations-webhooks-empty__text">
                        {t('notif_no_webhooks') || 'No custom webhooks configured.'}
                      </span>
                    </div>
                  ) : (
                    <div className="integrations-webhooks-list">
                      {targets.map((tgt, idx) => (
                        <div key={idx} className="integrations-webhook-card">
                          <div className="integrations-webhook-card__endpoint">
                            <div className="input-with-icon integrations-webhook-input-wrap">
                              <AppIcon name="add_link" size={15} className="input-with-icon__icon" />
                              <input
                                type="url"
                                className="input integrations-webhook-input"
                                placeholder="https://monitoring.example.com/api/webhook"
                                value={tgt.url}
                                onChange={(e) =>
                                  handleUpdateTarget(idx, 'url', e.target.value)
                                }
                              />
                            </div>
                          </div>
                          <div className="integrations-webhook-card__secret">
                            <input
                              type="text"
                              className="input integrations-webhook-input integrations-webhook-input--secret"
                              placeholder={
                                t('notif_webhook_secret_placeholder') ||
                                'Bearer token / secret (optional)'
                              }
                              autoComplete="off"
                              spellCheck={false}
                              data-lpignore="true"
                              data-1p-ignore="true"
                              data-bwignore="true"
                              data-fcc-non-credential="1"
                              data-form-type="other"
                              value={tgt.secret || ''}
                              onChange={(e) =>
                                handleUpdateTarget(idx, 'secret', e.target.value)
                              }
                            />
                          </div>
                          <button
                            type="button"
                            className="btn btn--danger btn--compact integrations-webhook-delete-btn"
                            onClick={() => handleRemoveTarget(idx)}
                            title={t('delete') || 'Remove'}
                          >
                            <AppIcon name="delete" size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </td>
            </tr>
          </SettingsTable>
        </div>
      </div>
    </div>
  );
}
