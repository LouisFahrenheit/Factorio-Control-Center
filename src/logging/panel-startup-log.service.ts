import { Injectable } from '@nestjs/common';
import { UsersService } from '../auth/users.service';
import { FccConfigService } from '../config/fcc-config.service';
import { PathsService } from '../config/paths.service';
import { resolveAppBuild } from '../common/app-build.util';
import { APP_VERSION } from '../constants/fcc.constants';
import { InstancesService } from '../instances/instances.service';
import { LocaleService } from '../locale/locale.service';
import {
  resolveBindPort,
  resolveDisplayHost,
  resolveDisplayPort,
} from '../http/web-panel-bind.util';
import { listLanIPv4, listPublicIPv4 } from '../http/lan-address.util';
import { trimHost } from '../common/trim.util';
import { readJsonFile } from '../common/json-store';
import { FCC_ASCII_LOGO } from './fcc-ascii-logo';
import { centerBlock } from './console-center.util';
import { WebPanelLogService } from './web-panel-log.service';
import { FirewallService } from '../ops/firewall/firewall.service';

const SUMMARY_WIDTH = 49;
const AUTOSTART_DELAY_SEC = 2;

@Injectable()
export class PanelStartupLogService {
  constructor(
    private readonly instances: InstancesService,
    private readonly users: UsersService,
    private readonly locale: LocaleService,
    private readonly config: FccConfigService,
    private readonly paths: PathsService,
    private readonly webLog: WebPanelLogService,
    private readonly firewall: FirewallService,
  ) {}

  logReady(): void {
    const build = resolveAppBuild();
    const versionLine = `v${APP_VERSION}  build ${build}`;
    const banner = `${FCC_ASCII_LOGO}\n${versionLine}`;
    const centeredBanner = centerBlock(banner);

    console.log('');
    console.log(centeredBanner);
    console.log('');

    this.webLog.appendFileBlock(centeredBanner);
    this.blankFile();

    this.logSummary();

    console.log('');
    this.blankFile();

    const wp = this.config.webPanel;
    const bindHost = trimHost(wp.listen_host);
    const bindPort = resolveBindPort(wp);
    const scheme = wp.tls_enabled ? 'https' : 'http';
    const urlHost = resolveDisplayHost(wp);
    const urlPort = resolveDisplayPort(wp, bindPort);
    const portSuffix =
      (urlPort === 80 && scheme === 'http') ||
      (urlPort === 443 && scheme === 'https')
        ? ''
        : `:${urlPort}`;
    const panelUrl = `${scheme}://${urlHost}${portSuffix}/`;

    this.line('panel_startup_url', panelUrl);
    this.line('panel_startup_url_local', scheme, urlPort);

    if (bindHost === '127.0.0.1' || bindHost === '::1') {
      this.line('panel_startup_lan_blocked');
    } else if (bindHost === '0.0.0.0' || bindHost === '::') {
      for (const ip of listLanIPv4()) {
        this.line('panel_startup_lan_url', `${scheme}://${ip}${portSuffix}/`);
      }
      for (const ip of listPublicIPv4()) {
        this.line(
          'panel_startup_public_url',
          `${scheme}://${ip}${portSuffix}/`,
        );
      }
    }
    this.line('panel_startup_config', this.paths.settingsPath);

    if (this.users.defaultAdminPasswordActive()) {
      console.log('');
      this.blankFile();
      this.line('panel_startup_default_password_warning');
    }

    console.log('');
    this.blankFile();
    this.firewall.logStartupNotice();
    this.line('panel_startup_press_ctrl_c');
    console.log('');
  }

  private logSummary(): void {
    const serverCount = this.instances.load().items.length;
    const userCount = this.users.load().users.length;
    const lang = this.config.langCode || 'en';
    const nodeVersion = process.version;
    const selected = this.instances.getSelected();
    const autostartQueued = !!selected?.autostartServer;
    const { total: maintTotal, active: maintActive } =
      this.countMaintenanceTasks();

    const lines = [
      this.summaryHeader(),
      this.formatLocale('panel_startup_summary_line1', serverCount, userCount),
      this.formatLocale('panel_startup_summary_line2', lang, nodeVersion),
    ];
    if (autostartQueued) {
      lines.push(
        this.formatLocale(
          'panel_startup_summary_autostart',
          AUTOSTART_DELAY_SEC,
        ),
      );
    }
    if (maintTotal > 0) {
      lines.push(
        this.formatLocale(
          'panel_startup_summary_maintenance',
          maintTotal,
          maintActive,
        ),
      );
    } else {
      lines.push(this.formatLocale('panel_startup_summary_maintenance_none'));
    }

    const centered = centerBlock(lines.join('\n'));
    console.log(centered);
    this.webLog.appendFileBlock(centered);
  }

  private summaryHeader(width = SUMMARY_WIDTH): string {
    const title = this.formatLocale('panel_startup_summary_title');
    const label = `── ${title} ──`;
    if (label.length >= width) return label;
    const pad = width - label.length;
    const left = Math.floor(pad / 2);
    return '─'.repeat(left) + label + '─'.repeat(pad - left);
  }

  private countMaintenanceTasks(): { total: number; active: number } {
    const doc = readJsonFile<{
      tasks?: { active?: boolean; manual_only?: boolean }[];
    }>(this.paths.maintenancePath, { tasks: [] });
    const tasks = Array.isArray(doc.tasks) ? doc.tasks : [];
    const active = tasks.filter((t) => t.active && !t.manual_only).length;
    return { total: tasks.length, active };
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

  private line(key: string, ...args: (string | number)[]): void {
    const text = this.formatLocale(key, ...args);
    console.log(text);
    this.webLog.appendFile(text);
  }

  private blankFile(): void {
    this.webLog.appendFile('');
  }
}
