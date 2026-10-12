import { Injectable, Logger } from '@nestjs/common';
import type { WebhookTarget, NotifEvent } from './notifications-config';

export interface WebhookPayload {
  event: NotifEvent;
  instanceId: string;
  instanceName: string;
  timestamp: string;
  data: Record<string, unknown>;
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

  private isDiscordWebhook(url: string): boolean {
    return (
      url.includes('discord.com/api/webhooks') ||
      url.includes('discordapp.com/api/webhooks')
    );
  }

  private formatDiscordPayload(
    payload: WebhookPayload,
  ): Record<string, unknown> {
    const isTest = payload.event === 'test';
    const title = isTest
      ? '🔔 Test Notification'
      : `Factorio Event: ${payload.event}`;
    const description = isTest
      ? `Test notification from **${payload.instanceName || 'Factorio Control Center'}**.`
      : `Server: **${payload.instanceName || 'Factorio Server'}**\nEvent: **${payload.event}**`;

    const fields = Object.entries(payload.data).map(([key, val]) => ({
      name: key,
      value:
        typeof val === 'object' && val !== null
          ? JSON.stringify(val)
          : String(val),
      inline: true,
    }));

    return {
      username: 'Factorio Control Center',
      embeds: [
        {
          title,
          description,
          color: isTest ? 0x3498db : 0xe67e22,
          timestamp: payload.timestamp,
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
