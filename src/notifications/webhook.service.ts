import { Injectable, Logger } from '@nestjs/common';
import type { WebhookTarget, NotifEvent } from './notifications-config';

export interface WebhookPayload {
  event: NotifEvent;
  instanceId: string;
  instanceName: string;
  timestamp: string;
  data: Record<string, unknown>;
}

function safeStr(val: unknown, fallback = ''): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return fallback;
}

interface ServerVersionEntry {
  id?: string;
  name?: string;
  current_version?: string;
}

@Injectable()
export class WebhookService {
  private readonly log = new Logger(WebhookService.name);

  async dispatch(
    targets: WebhookTarget[],
    event: NotifEvent,
    instanceId: string,
    instanceName: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    const payload: WebhookPayload = {
      event,
      instanceId,
      instanceName,
      timestamp: new Date().toISOString(),
      data,
    };

    const enabled = targets.filter((t) => {
      if (t.enabled === false) return false;
      if (!t.url) return false;
      if (event !== 'test' && Array.isArray(t.events) && t.events.length > 0) {
        return t.events.includes(event);
      }
      return true;
    });

    await Promise.allSettled(enabled.map((t) => this.send(t, payload)));
  }

  /** Send a test event to a single webhook target and return status. */
  async testTarget(
    target: WebhookTarget,
    instanceId: string = 'global',
    instanceName: string = 'Factorio Control Center',
  ): Promise<{ ok: boolean; status?: number; error?: string }> {
    const payload: WebhookPayload = {
      event: 'test',
      instanceId,
      instanceName,
      timestamp: new Date().toISOString(),
      data: { message: 'Test notification from Factorio Control Center' },
    };

    const body = this.isDiscordWebhook(target.url)
      ? JSON.stringify(this.formatDiscordPayload(payload))
      : JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'FactorioControlCenter/2.0',
    };
    if (target.secret) headers['Authorization'] = target.secret;

    try {
      const res = await fetch(target.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok || (res.status >= 200 && res.status < 300)) {
        return { ok: true, status: res.status };
      }
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  private isDiscordWebhook(url: string): boolean {
    return (
      url.includes('discord.com/api/webhooks') ||
      url.includes('discordapp.com/api/webhooks')
    );
  }

  private formatDiscordPayload(
    payload: WebhookPayload,
  ): Record<string, unknown> {
    const { event, instanceName, data, timestamp } = payload;
    const sName = instanceName || 'Factorio Server';

    let title = `Factorio Event: ${event}`;
    let description = `Server: **${sName}**`;
    let color = 0xe67e22;
    const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

    switch (event) {
      case 'test': {
        title = '🔔 Test Notification';
        description = `Test notification from **${instanceName || 'Factorio Control Center'}**.\nWebhook integration is working properly!`;
        color = 0x3498db;
        for (const [key, val] of Object.entries(data)) {
          if (key === 'message') continue;
          if (typeof val === 'object' && val !== null) continue;
          const s = safeStr(val);
          if (s) fields.push({ name: key, value: s, inline: true });
        }
        break;
      }

      case 'server_started':
        title = '🟢 Server Online';
        description = `**${sName}** is now running and accepting connections.`;
        color = 0x2ecc71;
        break;

      case 'server_stopped':
        title = '🔴 Server Offline';
        description = `**${sName}** has stopped.`;
        color = 0x7f8c8d;
        break;

      case 'server_crash': {
        title = '💥 Server Crashed';
        description = `**${sName}** crashed unexpectedly.`;
        color = 0xe74c3c;
        const code = safeStr(data.exitCode);
        if (code) {
          fields.push({
            name: 'Exit Code',
            value: `\`${code}\``,
            inline: true,
          });
        }
        break;
      }

      case 'server_start_failed': {
        title = '⚠️ Server Failed to Start';
        description = `**${sName}** failed to start.`;
        color = 0xe67e22;
        const code = safeStr(data.exitCode);
        if (code) {
          fields.push({
            name: 'Exit Code',
            value: `\`${code}\``,
            inline: true,
          });
        }
        break;
      }

      case 'player_join': {
        const player = safeStr(data.player, 'Player');
        title = '👤 Player Joined';
        description = `**${player}** joined server **${sName}**.`;
        color = 0x3498db;
        break;
      }

      case 'player_leave': {
        const player = safeStr(data.player, 'Player');
        title = '👤 Player Left';
        description = `**${player}** left server **${sName}**.`;
        color = 0x7f8c8d;
        break;
      }

      case 'chat_relay': {
        const author = safeStr(data.author, 'Player');
        const message = safeStr(data.message);
        title = '💬 In-Game Chat';
        description = `**${author}**: ${message}`;
        color = 0x5865f2;
        fields.push({ name: 'Server', value: sName, inline: true });
        break;
      }

      case 'maintenance':
        title = '🔧 Maintenance Mode';
        description = `**${sName}** entered maintenance mode.`;
        color = 0xf1c40f;
        break;

      case 'factorio_update_available': {
        title = '🚀 Factorio Update Available';
        const latest = safeStr(data.latest_version);
        const current = safeStr(data.current_version);
        const rawServers = Array.isArray(data.servers)
          ? (data.servers as ServerVersionEntry[])
          : [];

        if (rawServers.length > 1) {
          description =
            `A new version of Factorio is available: **${latest}**\n\n**Affected Servers:**\n` +
            rawServers
              .map(
                (item) =>
                  `• **${item.name || 'Server'}** (installed: \`${item.current_version || '?'}\`)`,
              )
              .join('\n');
          color = 0xe67e22;
        } else {
          description = `A new version of Factorio is available for **${sName}**.`;
          color = 0xe67e22;
          fields.push({ name: 'Server', value: sName, inline: true });
          if (current) {
            fields.push({
              name: 'Installed',
              value: `\`${current}\``,
              inline: true,
            });
          }
          fields.push({
            name: 'Available',
            value: `\`${latest}\``,
            inline: true,
          });
        }
        break;
      }

      case 'low_ups': {
        const ups = safeStr(data.ups, '?');
        const threshold = safeStr(data.threshold, '55');
        title = '⚠️ Low Server Performance';
        description = `**${sName}** performance dropped below acceptable rate.`;
        color = 0xe67e22;
        fields.push(
          { name: 'Current UPS', value: `${ups} / 60`, inline: true },
          { name: 'Threshold', value: `${threshold} UPS`, inline: true },
        );
        break;
      }

      case 'moderation': {
        const action = safeStr(data.action, 'moderation');
        const target = safeStr(data.target, 'Player');
        title = '🛡️ Moderation Action';
        description = `Player **${target}** was **${action}ed**.`;
        color = 0xe74c3c;
        fields.push({ name: 'Server', value: sName, inline: true });
        const actor = safeStr(data.actor);
        if (actor) {
          fields.push({ name: 'By', value: actor, inline: true });
        }
        const reason = safeStr(data.reason);
        if (reason) {
          fields.push({ name: 'Reason', value: reason, inline: true });
        }
        break;
      }

      default: {
        for (const [key, val] of Object.entries(data)) {
          if (typeof val === 'object' && val !== null) continue;
          const s = safeStr(val);
          if (s) {
            fields.push({
              name: key,
              value: s,
              inline: true,
            });
          }
        }
        break;
      }
    }

    return {
      username: 'Factorio Control Center',
      embeds: [
        {
          title,
          description,
          color,
          timestamp,
          footer: { text: 'Factorio Control Center' },
          ...(fields.length > 0 ? { fields } : {}),
        },
      ],
    };
  }

  private async send(
    target: WebhookTarget,
    payload: WebhookPayload,
  ): Promise<void> {
    const body = this.isDiscordWebhook(target.url)
      ? JSON.stringify(this.formatDiscordPayload(payload))
      : JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'FactorioControlCenter/2.0',
    };
    if (target.secret) headers['Authorization'] = target.secret;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(target.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok || res.status < 500) return; // 4xx = our fault, don't retry
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (err: unknown) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 2000));
        } else {
          const message = err instanceof Error ? err.message : String(err);
          this.log.warn(
            `Webhook delivery failed for ${target.url}: ${message}`,
          );
        }
      }
    }
  }
}
