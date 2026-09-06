import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { FccConfigService } from '../config/fcc-config.service';
import { InstancesService } from '../instances/instances.service';
import { TelegramService } from './telegram.service';
import { WebhookService } from './webhook.service';
import type {
  InstanceNotifOverride,
  ResolvedNotifConfig,
  NotifEvent,
} from './notifications-config';
import {
  mergeNotifConfig,
  parseWebhookTargets,
  parseSilentEvents,
} from './notifications-config';
import { compareVersions } from '../ops/ops-utils';

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);
  private readonly lastNotifiedFactorioVersions = new Set<string>();

  constructor(
    private readonly config: FccConfigService,
    @Inject(forwardRef(() => InstancesService))
    private readonly instances: InstancesService,
    private readonly telegram: TelegramService,
    private readonly webhooks: WebhookService,
  ) {}

  // ── Event hooks (called by RuntimeService) ──────────────────────────────────

  async onServerStarted(instanceId: string): Promise<void> {
    const { cfg, name } = this.resolveInstance(instanceId);
    if (!cfg || !cfg.notif_server_started) return;
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

  async onFactorioUpdateAvailable(
    currentVersion: string,
    latestVersion: string,
    instanceId?: string,
    instanceName?: string,
  ): Promise<void> {
    if (
      !latestVersion ||
      !currentVersion ||
      compareVersions(latestVersion, currentVersion) <= 0
    ) {
      return;
    }
    const key = `${instanceId || 'global'}:${currentVersion}:${latestVersion}`;
    if (this.lastNotifiedFactorioVersions.has(key)) return;
    this.lastNotifiedFactorioVersions.add(key);

    if (instanceId) {
      const { cfg, name } = this.resolveInstance(instanceId);
      if (!cfg || !cfg.notif_factorio_update_available) return;
      const finalName = instanceName || name;
      const silent = cfg.notif_silent_events.includes(
        'factorio_update_available',
      );
      await this.dispatch(
        cfg,
        instanceId,
        finalName,
        'factorio_update_available',
        {
          telegram: () =>
            this.telegram.sendMessage(
              cfg.telegram_bot_token,
              cfg.telegram_chat_id,
              this.telegram.fmtFactorioUpdate(
                currentVersion,
                latestVersion,
                finalName,
              ),
              silent,
            ),
          extra: {
            current_version: currentVersion,
            latest_version: latestVersion,
          },
        },
      );
      return;
    }

    const global = this.config.notifications;
    if (!global.notif_factorio_update_available) return;

    const targets = parseWebhookTargets(global.webhook_targets);
    const silent = parseSilentEvents(global.notif_silent_events).includes(
      'factorio_update_available',
    );
    const promises: Promise<void>[] = [];
    if (
      global.telegram_enabled &&
      global.telegram_bot_token &&
      global.telegram_chat_id
    ) {
      promises.push(
        this.telegram.sendMessage(
          global.telegram_bot_token,
          global.telegram_chat_id,
          this.telegram.fmtFactorioUpdate(
            currentVersion,
            latestVersion,
            instanceName,
          ),
          silent,
        ),
      );
    }
    promises.push(
      this.webhooks.dispatch(
        targets,
        'factorio_update_available',
        '',
        instanceName || 'Factorio Control Center',
        { current_version: currentVersion, latest_version: latestVersion },
      ),
    );
    await Promise.allSettled(promises);
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
