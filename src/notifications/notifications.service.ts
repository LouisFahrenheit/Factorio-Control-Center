import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { FccConfigService } from '../config/fcc-config.service';
import { PathsService } from '../config/paths.service';
import { InstancesService } from '../instances/instances.service';
import { TelegramService } from './telegram.service';
import { WebhookService } from './webhook.service';
import type {
  InstanceNotifOverride,
  ResolvedNotifConfig,
  NotifEvent,
  WebhookTarget,
} from './notifications-config';
import {
  mergeNotifConfig,
  parseWebhookTargets,
  parseSilentEvents,
} from './notifications-config';
import { compareVersions } from '../ops/ops-utils';
import { readJsonFile, writeJsonFile } from '../common/json-store';

export interface FactorioUpdateCandidate {
  instanceId?: string;
  instanceName?: string;
  currentVersion: string;
  targetVersion: string;
}

export interface NotificationsState {
  notifiedFactorioVersions: Record<string, string>;
}

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(
    private readonly config: FccConfigService,
    @Inject(forwardRef(() => InstancesService))
    private readonly instances: InstancesService,
    private readonly telegram: TelegramService,
    private readonly webhooks: WebhookService,
    private readonly paths: PathsService,
  ) {}

  // ── Event hooks (called by RuntimeService) ──────────────────────────────────

  private lastServerStartedMap = new Map<string, number>();
  private lastServerStoppedMap = new Map<string, number>();

  async onServerStarted(instanceId: string): Promise<void> {
    const { cfg, name } = this.resolveInstance(instanceId);
    if (!cfg || !cfg.notif_server_started) return;

    const now = Date.now();
    const lastTime = this.lastServerStartedMap.get(instanceId) || 0;
    if (now - lastTime < 5000) return;
    this.lastServerStartedMap.set(instanceId, now);

    const silent = cfg.notif_silent_events.includes('server_started');
    await this.dispatch(cfg, instanceId, name, 'server_started', {
      telegram: () =>
        this.telegram.sendMessage(
          cfg.telegram_bot_token,
          cfg.telegram_chat_id,
          this.telegram.fmtServerStarted(name),
          silent,
        ),
    });
  }

  async onServerStopped(instanceId: string): Promise<void> {
    const { cfg, name } = this.resolveInstance(instanceId);
    if (!cfg || !cfg.notif_server_stopped) return;

    const now = Date.now();
    const lastTime = this.lastServerStoppedMap.get(instanceId) || 0;
    if (now - lastTime < 5000) return;
    this.lastServerStoppedMap.set(instanceId, now);

    const silent = cfg.notif_silent_events.includes('server_stopped');
    await this.dispatch(cfg, instanceId, name, 'server_stopped', {
      telegram: () =>
        this.telegram.sendMessage(
          cfg.telegram_bot_token,
          cfg.telegram_chat_id,
          this.telegram.fmtServerStopped(name),
          silent,
        ),
    });
  }

  async onServerCrash(instanceId: string, exitCode: number): Promise<void> {
    const { cfg, name } = this.resolveInstance(instanceId);
    if (!cfg || !cfg.notif_server_crash) return;
    const silent = cfg.notif_silent_events.includes('server_crash');
    await this.dispatch(cfg, instanceId, name, 'server_crash', {
      telegram: () =>
        this.telegram.sendMessage(
          cfg.telegram_bot_token,
          cfg.telegram_chat_id,
          this.telegram.fmtServerCrash(name, exitCode),
          silent,
        ),
      extra: { exit_code: exitCode },
    });
  }

  async onServerStartFailed(
    instanceId: string,
    exitCode: number,
  ): Promise<void> {
    const { cfg, name } = this.resolveInstance(instanceId);
    if (!cfg || !cfg.notif_server_start_failed) return;
    const silent = cfg.notif_silent_events.includes('server_start_failed');
    await this.dispatch(cfg, instanceId, name, 'server_start_failed', {
      telegram: () =>
        this.telegram.sendMessage(
          cfg.telegram_bot_token,
          cfg.telegram_chat_id,
          this.telegram.fmtStartFailed(name, exitCode),
          silent,
        ),
      extra: { exit_code: exitCode },
    });
  }

  async onPlayerJoin(instanceId: string, player: string): Promise<void> {
    const { cfg, name } = this.resolveInstance(instanceId);
    if (!cfg || !cfg.notif_player_join) return;
    const silent = cfg.notif_silent_events.includes('player_join');
    await this.dispatch(cfg, instanceId, name, 'player_join', {
      telegram: () =>
        this.telegram.sendMessage(
          cfg.telegram_bot_token,
          cfg.telegram_chat_id,
          this.telegram.fmtPlayerJoin(name, player),
          silent,
        ),
      extra: { player },
    });
  }

  async onPlayerLeave(instanceId: string, player: string): Promise<void> {
    const { cfg, name } = this.resolveInstance(instanceId);
    if (!cfg || !cfg.notif_player_leave) return;
    const silent = cfg.notif_silent_events.includes('player_leave');
    await this.dispatch(cfg, instanceId, name, 'player_leave', {
      telegram: () =>
        this.telegram.sendMessage(
          cfg.telegram_bot_token,
          cfg.telegram_chat_id,
          this.telegram.fmtPlayerLeave(name, player),
          silent,
        ),
      extra: { player },
    });
  }

  async onChatMessage(
    instanceId: string,
    author: string,
    message: string,
  ): Promise<void> {
    const { cfg, name } = this.resolveInstance(instanceId);
    if (!cfg || !cfg.notif_chat_relay) return;
    const silent = cfg.notif_silent_events.includes('chat_relay');
    await Promise.allSettled([
      cfg.telegram_bot_token && cfg.telegram_chat_id
        ? this.telegram.sendMessage(
            cfg.telegram_bot_token,
            cfg.telegram_chat_id,
            this.telegram.fmtChatRelay(name, author, message),
            silent,
          )
        : Promise.resolve(),
      this.webhooks.dispatch(
        cfg.webhook_targets,
        'chat_relay',
        instanceId,
        name,
        { author, message },
      ),
    ]);
  }

  async onMaintenance(instanceId: string): Promise<void> {
    const { cfg, name } = this.resolveInstance(instanceId);
    if (!cfg || !cfg.notif_maintenance) return;
    const silent = cfg.notif_silent_events.includes('maintenance');
    await this.dispatch(cfg, instanceId, name, 'maintenance', {
      telegram: () =>
        this.telegram.sendMessage(
          cfg.telegram_bot_token,
          cfg.telegram_chat_id,
          this.telegram.fmtMaintenance(name),
          silent,
        ),
    });
  }

  private loadState(): NotificationsState {
    const raw = readJsonFile<NotificationsState>(
      this.paths.notificationsStatePath,
      { notifiedFactorioVersions: {} },
    );
    if (
      !raw ||
      typeof raw !== 'object' ||
      !raw.notifiedFactorioVersions ||
      typeof raw.notifiedFactorioVersions !== 'object'
    ) {
      return { notifiedFactorioVersions: {} };
    }
    return raw;
  }

  private saveState(state: NotificationsState): void {
    const entries = Object.entries(state.notifiedFactorioVersions || {});
    if (entries.length > 200) {
      entries.sort((a, b) => b[1].localeCompare(a[1]));
      state.notifiedFactorioVersions = Object.fromEntries(
        entries.slice(0, 100),
      );
    }
    writeJsonFile(this.paths.notificationsStatePath, state);
  }

  async onFactorioUpdatesBatch(
    candidates: FactorioUpdateCandidate[],
  ): Promise<void> {
    if (!candidates || candidates.length === 0) return;

    // Filter valid update candidates
    const valid = candidates.filter(
      (c) =>
        c.targetVersion &&
        c.currentVersion &&
        compareVersions(c.targetVersion, c.currentVersion) > 0,
    );
    if (valid.length === 0) return;

    const global = this.config.notifications;

    // Group by targetVersion
    const byVersion = new Map<
      string,
      Array<{
        instanceId: string;
        name: string;
        currentVersion: string;
        cfg: ResolvedNotifConfig | null;
        silent: boolean;
      }>
    >();

    for (const c of valid) {
      if (c.instanceId) {
        const { cfg, name } = this.resolveInstance(c.instanceId);
        if (!cfg || !cfg.notif_factorio_update_available) continue;
        const silent = cfg.notif_silent_events.includes(
          'factorio_update_available',
        );
        const list = byVersion.get(c.targetVersion) || [];
        list.push({
          instanceId: c.instanceId,
          name: c.instanceName || name,
          currentVersion: c.currentVersion,
          cfg,
          silent,
        });
        byVersion.set(c.targetVersion, list);
      } else {
        if (!global.notif_factorio_update_available) continue;
        const silent = parseSilentEvents(global.notif_silent_events).includes(
          'factorio_update_available',
        );
        const list = byVersion.get(c.targetVersion) || [];
        list.push({
          instanceId: '',
          name: c.instanceName || 'Factorio Control Center',
          currentVersion: c.currentVersion,
          cfg: null,
          silent,
        });
        byVersion.set(c.targetVersion, list);
      }
    }

    if (byVersion.size === 0) return;

    const promises: Promise<void>[] = [];
    const state = this.loadState();
    let stateChanged = false;

    for (const [targetVersion, items] of byVersion.entries()) {
      // 1. Group by Telegram destination (botToken + chatId)
      const tgGroups = new Map<
        string,
        {
          botToken: string;
          chatId: string;
          silent: boolean;
          servers: Array<{ name: string; currentVersion: string }>;
        }
      >();

      for (const item of items) {
        const botToken =
          item.cfg?.telegram_bot_token ||
          (global.telegram_enabled ? global.telegram_bot_token : '');
        const chatId =
          item.cfg?.telegram_chat_id ||
          (global.telegram_enabled ? global.telegram_chat_id : '');
        const tgEnabled = item.cfg
          ? item.cfg.telegram_enabled
          : global.telegram_enabled;

        if (tgEnabled && botToken && chatId) {
          const key = `${botToken}:::${chatId}`;
          const g = tgGroups.get(key) || {
            botToken,
            chatId,
            silent: item.silent,
            servers: [],
          };
          if (!item.silent) g.silent = false;
          g.servers.push({
            name: item.name,
            currentVersion: item.currentVersion,
          });
          tgGroups.set(key, g);
        }
      }

      // Dispatch Telegram notifications
      for (const [, grp] of tgGroups.entries()) {
        const notifKey = `tg:${grp.chatId}:${targetVersion}`;
        if (state.notifiedFactorioVersions[notifKey]) {
          continue; // Already notified once for this version to this chat!
        }

        state.notifiedFactorioVersions[notifKey] = new Date().toISOString();
        stateChanged = true;

        const message = this.telegram.fmtFactorioUpdate(
          targetVersion,
          grp.servers,
        );
        promises.push(
          this.telegram.sendMessage(
            grp.botToken,
            grp.chatId,
            message,
            grp.silent,
          ),
        );
      }

      // 2. Dispatch Webhook notifications
      const webhookGroups = new Map<
        string,
        {
          target: WebhookTarget;
          servers: Array<{ id: string; name: string; currentVersion: string }>;
        }
      >();

      for (const item of items) {
        const targets = item.cfg
          ? item.cfg.webhook_targets
          : parseWebhookTargets(global.webhook_targets);

        for (const t of targets) {
          if (!t.url || t.enabled === false) continue;
          if (
            Array.isArray(t.events) &&
            t.events.length > 0 &&
            !t.events.includes('factorio_update_available')
          ) {
            continue;
          }
          const g = webhookGroups.get(t.url) || {
            target: t,
            servers: [],
          };
          g.servers.push({
            id: item.instanceId,
            name: item.name,
            currentVersion: item.currentVersion,
          });
          webhookGroups.set(t.url, g);
        }
      }

      for (const [url, grp] of webhookGroups.entries()) {
        const notifKey = `webhook:${url}:${targetVersion}`;
        if (state.notifiedFactorioVersions[notifKey]) {
          continue; // Already notified once for this version to this webhook!
        }

        state.notifiedFactorioVersions[notifKey] = new Date().toISOString();
        stateChanged = true;

        promises.push(
          this.webhooks.dispatch(
            [grp.target],
            'factorio_update_available',
            grp.servers.length === 1 ? grp.servers[0].id : '',
            grp.servers.length === 1
              ? grp.servers[0].name
              : grp.servers.map((s) => s.name).join(', '),
            {
              latest_version: targetVersion,
              current_version:
                grp.servers.length === 1
                  ? grp.servers[0].currentVersion
                  : undefined,
              servers: grp.servers.map((s) => ({
                id: s.id,
                name: s.name,
                current_version: s.currentVersion,
              })),
            },
          ),
        );
      }
    }

    if (stateChanged) {
      this.saveState(state);
    }

    await Promise.allSettled(promises);
  }

  async onFactorioUpdateAvailable(
    currentVersion: string,
    latestVersion: string,
    instanceId?: string,
    instanceName?: string,
  ): Promise<void> {
    await this.onFactorioUpdatesBatch([
      {
        instanceId,
        instanceName,
        currentVersion,
        targetVersion: latestVersion,
      },
    ]);
  }

  getResolvedInstanceConfig(instanceId: string): ResolvedNotifConfig | null {
    return this.resolveInstance(instanceId).cfg;
  }

  async onLowUps(
    instanceId: string,
    ups: number,
    durationMinutes: number,
  ): Promise<void> {
    const { cfg, name } = this.resolveInstance(instanceId);
    if (!cfg || !cfg.notif_low_ups) return;
    const silent = cfg.notif_silent_events.includes('low_ups');
    await this.dispatch(cfg, instanceId, name, 'low_ups', {
      telegram: () =>
        this.telegram.sendMessage(
          cfg.telegram_bot_token,
          cfg.telegram_chat_id,
          this.telegram.fmtLowUps(
            name,
            ups,
            durationMinutes,
            cfg.notif_low_ups_threshold,
          ),
          silent,
        ),
      extra: {
        ups,
        duration_minutes: durationMinutes,
        threshold: cfg.notif_low_ups_threshold,
      },
    });
  }

  private lastModerationMap = new Map<string, number>();

  async onModeration(
    instanceId: string,
    action: string,
    target: string,
    actor: string,
    reason?: string,
  ): Promise<void> {
    const { cfg, name } = this.resolveInstance(instanceId);
    if (!cfg || !cfg.notif_moderation) return;

    const dedupKey = `${instanceId}:${action.toLowerCase()}:${target.toLowerCase()}`;
    const now = Date.now();
    const lastTime = this.lastModerationMap.get(dedupKey) || 0;
    if (now - lastTime < 3000) return;
    this.lastModerationMap.set(dedupKey, now);

    const silent = cfg.notif_silent_events.includes('moderation');
    await this.dispatch(cfg, instanceId, name, 'moderation', {
      telegram: () =>
        this.telegram.sendMessage(
          cfg.telegram_bot_token,
          cfg.telegram_chat_id,
          this.telegram.fmtModeration(name, action, target, actor, reason),
          silent,
        ),
      extra: { action, target, actor, reason: reason || '' },
    });
  }

  /** Send a test notification to configured Telegram chat / Webhooks. */
  async sendTest(
    instanceId?: string,
  ): Promise<{ ok: boolean; sent: string[] }> {
    const global = this.config.notifications;
    const sent: string[] = [];

    const tgToken = global.telegram_bot_token;
    const tgChat = instanceId
      ? (this.resolveInstance(instanceId).cfg?.telegram_chat_id ?? '')
      : global.telegram_chat_id;
    if (global.telegram_enabled && tgToken && tgChat) {
      await this.telegram.sendMessage(tgToken, tgChat, this.telegram.fmtTest());
      sent.push('telegram');
    }

    return { ok: true, sent };
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private resolveInstance(instanceId: string): {
    cfg: ResolvedNotifConfig | null;
    name: string;
  } {
    const global = this.config.notifications;
    const item = this.instances.getById(instanceId);
    const name = item?.name ?? instanceId;
    let override: InstanceNotifOverride | null = null;
    try {
      const raw = (item as unknown as { notifOverride?: string | null })
        ?.notifOverride;
      if (raw) override = JSON.parse(raw) as InstanceNotifOverride;
    } catch {
      /* ignore malformed JSON */
    }
    const cfg = mergeNotifConfig(global, override, instanceId);
    if (!cfg.enabled) {
      return { cfg: null, name };
    }
    return { cfg, name };
  }

  private async dispatch(
    cfg: ResolvedNotifConfig,
    instanceId: string,
    instanceName: string,
    event: NotifEvent,
    actions: {
      telegram?: () => Promise<void>;
      extra?: Record<string, unknown>;
    },
  ): Promise<void> {
    const promises: Promise<void>[] = [];
    if (
      actions.telegram &&
      cfg.telegram_enabled &&
      cfg.telegram_bot_token &&
      cfg.telegram_chat_id
    ) {
      promises.push(actions.telegram());
    }
    promises.push(
      this.webhooks.dispatch(
        cfg.webhook_targets,
        event,
        instanceId,
        instanceName,
        actions.extra ?? {},
      ),
    );
    await Promise.allSettled(promises);
  }
}
