import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class TelegramService implements OnModuleDestroy {
  private readonly log = new Logger(TelegramService.name);
  private offset = 0;
  private pollTimer: NodeJS.Timeout | null = null;
  private currentToken = '';
  private currentChatId = '';
  private onMessageCb: ((text: string) => void) | null = null;

  onModuleDestroy() {
    this.stopPolling();
  }

  // ── Send ────────────────────────────────────────────────────────────────────

  /** Send a plain text message to a Telegram chat. */
  async sendMessage(
    botToken: string,
    chatId: string,
    text: string,
    silent = false,
  ): Promise<void> {
    if (!botToken || !chatId || !text) return;
    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const payload: Record<string, unknown> = {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };
      if (silent) {
        payload.disable_notification = true;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.log.warn(
          `Telegram sendMessage ${res.status}: ${body.slice(0, 200)}`,
        );
      }
    } catch (e) {
      const cause = (e as { cause?: Error | string })?.cause;
      const causeMsg =
        cause instanceof Error ? cause.message : cause ? String(cause) : '';
      this.log.warn(
        `Telegram sendMessage failed: ${e}${causeMsg ? ` (cause: ${causeMsg})` : ''}`,
      );
    }
  }

  // ── Polling (for incoming messages — not used for RCON commands per spec) ──

  /**
   * Start long-polling getUpdates.
   * onMessage is called for each text message that arrives.
   */
  startPolling(
    botToken: string,
    chatId: string,
    onMessage: (text: string) => void,
    intervalMs = 4000,
  ): void {
    if (!botToken) return;
    if (
      this.pollTimer &&
      this.currentToken === botToken &&
      this.currentChatId === chatId
    )
      return;
    this.stopPolling();

    this.currentToken = botToken;
    this.currentChatId = chatId;
    this.onMessageCb = onMessage;
    this.offset = 0;

    this.log.log('Starting Telegram bot polling');

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.log.log('Stopped Telegram bot polling');
    }
    this.currentToken = '';
    this.currentChatId = '';
    this.onMessageCb = null;
    this.offset = 0;
  }

  private async poll(): Promise<void> {
    if (!this.currentToken) return;
    try {
      const url =
        `https://api.telegram.org/bot${this.currentToken}/getUpdates` +
        `?offset=${this.offset}&timeout=0&limit=20&allowed_updates=["message"]`;
      const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) {
        this.log.warn(`Telegram poll ${res.status}`);
        return;
      }

      const data = (await res.json()) as {
        ok: boolean;
        result: {
          update_id: number;
          message?: {
            chat: { id: number };
            from?: { username?: string; first_name?: string; is_bot?: boolean };
            text?: string;
          };
        }[];
      };

      if (!data.ok || !Array.isArray(data.result)) return;

      for (const update of data.result) {
        this.offset = update.update_id + 1;
        const msg = update.message;
        if (!msg?.text) continue;
        if (msg.from?.is_bot) continue;
        // Only relay from the configured chat
        if (
          this.currentChatId &&
          String(msg.chat.id) !== String(this.currentChatId)
        )
          continue;
        this.onMessageCb?.(msg.text);
      }
    } catch {
      // transient
    }
  }

  // ── Message formatters ──────────────────────────────────────────────────────

  fmtServerStarted(instanceName: string): string {
    return `🟢 <b>Server Online</b>\n<b>${this.esc(instanceName)}</b> is now running.`;
  }

  fmtServerStopped(instanceName: string): string {
    return `🔴 <b>Server Offline</b>\n<b>${this.esc(instanceName)}</b> has stopped.`;
  }

  fmtServerCrash(instanceName: string, exitCode: number): string {
    return `💥 <b>Server Crashed</b>\n<b>${this.esc(instanceName)}</b> crashed (exit code: <code>${exitCode}</code>).`;
  }

  fmtStartFailed(instanceName: string, exitCode: number): string {
    return `⚠️ <b>Server Failed to Start</b>\n<b>${this.esc(instanceName)}</b> (exit code: <code>${exitCode}</code>).`;
  }

  fmtPlayerJoin(instanceName: string, player: string): string {
    return `👤 <b>${this.esc(player)}</b> joined <b>${this.esc(instanceName)}</b>.`;
  }

  fmtPlayerLeave(instanceName: string, player: string): string {
    return `👤 <b>${this.esc(player)}</b> left <b>${this.esc(instanceName)}</b>.`;
  }

  fmtChatRelay(instanceName: string, author: string, message: string): string {
    return `💬 [<b>${this.esc(instanceName)}</b>] <b>${this.esc(author)}:</b> ${this.esc(message)}`;
  }

  fmtMaintenance(instanceName: string): string {
    return `🔧 <b>Maintenance</b>\n<b>${this.esc(instanceName)}</b> entered maintenance mode.`;
  }

  fmtFactorioUpdate(
    currentVersion: string,
    latestVersion: string,
    instanceName?: string,
  ): string {
    let text = `🚀 <b>Factorio Update Available</b>\n`;
    if (instanceName) {
      text += `Server: <b>${this.esc(instanceName)}</b>\n`;
    }
    text +=
      `A new version of Factorio is available: <code>${this.esc(latestVersion)}</code> ` +
      `(installed: <code>${this.esc(currentVersion)}</code>).`;
    return text;
  }

  fmtLowUps(
    instanceName: string,
    ups: number,
    minutes: number,
    threshold?: number,
  ): string {
    const durationText =
      minutes > 1 ? ` for ${minutes} consecutive minutes.` : '.';
    const thresholdText = threshold ? ` (threshold: ${threshold})` : '';
    return (
      `📉 <b>Low UPS Warning</b>\n` +
      `<b>${this.esc(instanceName)}</b> UPS dropped to <b>${ups.toFixed(1)}</b>${thresholdText}${durationText}`
    );
  }

  fmtModeration(
    instanceName: string,
    action: string,
    target: string,
    actor: string,
    reason?: string,
  ): string {
    const act = action.toUpperCase();
    let emoji = '🛡️';
    let actionLabel = act;

    if (act === 'BAN') emoji = '🔨';
    else if (act === 'KICK') emoji = '👢';
    else if (act === 'UNBAN') emoji = '🤝';
    else if (act === 'MUTE') emoji = '🔇';
    else if (act === 'UNMUTE') emoji = '🔊';
    else if (act === 'PROMOTE') emoji = '⭐';
    else if (act === 'DEMOTE') emoji = '🔻';
    else if (act === 'PURGE') emoji = '🧹';
    else if (act === 'WHITELIST_ADD' || act === 'WHITELIST ADD') {
      emoji = '📋➕';
      actionLabel = 'WHITELIST ADD';
    } else if (act === 'WHITELIST_REMOVE' || act === 'WHITELIST REMOVE') {
      emoji = '📋➖';
      actionLabel = 'WHITELIST REMOVE';
    } else if (act === 'WHITELIST_CLEAR' || act === 'WHITELIST CLEAR') {
      emoji = '📋🗑️';
      actionLabel = 'WHITELIST CLEAR';
    }

    let text = `${emoji} <b>Moderation: ${this.esc(actionLabel)}</b>\n`;
    text += `Server: <b>${this.esc(instanceName)}</b>\n`;
    if (target && target !== '*') {
      text += `Player: <b>${this.esc(target)}</b>\n`;
    }
    text += `By: <b>${this.esc(actor || 'System')}</b>`;
    if (reason && reason.trim()) {
      text += `\nReason: <i>${this.esc(reason.trim())}</i>`;
    }
    return text;
  }

  fmtTest(): string {
    return '✅ <b>Test Notification</b>\nTelegram integration is working correctly.';
  }

  private esc(str: string): string {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
