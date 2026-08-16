import { Injectable } from '@nestjs/common';
import { FccConfigService } from '../../config/fcc-config.service';
import { LocaleService } from '../../locale/locale.service';
import { WebPanelLogService } from '../../logging/web-panel-log.service';
import {
  platformFirewallAddUdpAllow,
  platformFirewallIsElevated,
  platformFirewallSupported,
} from './platform-firewall.util';

import { existsSync } from 'fs';

@Injectable()
export class FirewallService {
  constructor(
    private readonly config: FccConfigService,
    private readonly locale: LocaleService,
    private readonly webLog: WebPanelLogService,
  ) {}

  logStartupNotice(): void {
    if (existsSync('/.dockerenv')) return;
    if (!platformFirewallSupported()) return;
    const key = platformFirewallIsElevated()
      ? 'firewall_web_startup_elevated'
      : 'firewall_web_startup_not_elevated';
    this.logHeadless(key);
  }

  async tryApplyOnGameStart(factorioExe: string, port: number): Promise<void> {
    if (!platformFirewallSupported()) return;
    if (!platformFirewallIsElevated()) return;
    if (port < 1 || port > 65535) return;

    const { ok, detail, created } = await platformFirewallAddUdpAllow(factorioExe, port);
    if (ok) {
      // Only log if the rule was actually newly created
      if (created) {
        this.logHeadless('firewall_rule_ok_log', port, factorioExe);
      }
    } else {
      this.logHeadless('firewall_rule_failed_log', detail || 'unknown');
    }
  }

  private logHeadless(key: string, ...args: (string | number)[]): void {
    const text = this.formatLocale(key, ...args);
    const line = text;
    console.log(line);
    this.webLog.appendFile(line);
  }

  private formatLocale(key: string, ...args: (string | number)[]): string {
    const strings =
      this.locale.readLang(this.config.langCode) ||
      this.locale.readLang('en') ||
      {};
    let text = strings[key] || key;
    for (const arg of args) {
      text = text.replace('{}', String(arg));
    }
    return text;
  }
}
