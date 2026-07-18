import { Injectable, Logger } from '@nestjs/common';
import { InstancesService } from './instances.service';
import { RuntimeService } from '../ops/runtime.service';
import { ModsJobService } from '../ops/mods/mods-job.service';
import { LocaleService } from '../locale/locale.service';
import { FccConfigService } from '../config/fcc-config.service';
import { WebPanelLogService } from '../logging/web-panel-log.service';

const AUTOSTART_DELAY_MS = 1500;
const MAX_ATTEMPTS = 20;
const RETRY_MS = 2000;

@Injectable()
export class InstanceAutostartService {
  private readonly log = new Logger(InstanceAutostartService.name);

  constructor(
    private readonly instances: InstancesService,
    private readonly runtime: RuntimeService,
    private readonly modJobs: ModsJobService,
    private readonly locale: LocaleService,
    private readonly config: FccConfigService,
    private readonly webLog: WebPanelLogService,
  ) {}

  /** Run after the web panel HTTP listener is up (legacy headless parity). */
  scheduleAfterPanelStart(): void {
    setTimeout(() => void this.maybeAutostart(0), AUTOSTART_DELAY_MS);
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

  private logLine(key: string, ...args: (string | number)[]): void {
    const line = this.formatLocale(key, ...args);
    this.log.log(line);
    this.webLog.appendDebug(line);
  }

  private serverLabel(
    item: { name?: string; id?: string } | undefined,
  ): string {
    return String(item?.name || item?.id || '?').trim() || '?';
  }

  async maybeAutostart(attempt: number): Promise<void> {
    let item = this.instances.getSelected();
    try {
      if (!item?.autostartServer) return;
    } catch (e) {
      this.logLine(
        'headless_autostart_check_failed',
        this.serverLabel(item),
        e instanceof Error ? e.message : String(e),
      );
      return;
    }

    const label = this.serverLabel(item);

    try {
      if (item.maintenanceLock) {
        this.instances.update(item.id, { ...item, maintenanceLock: false });
        item = { ...item, maintenanceLock: false };
      }

      if (this.modJobs.isRunningForInstance(item.id)) {
        this.logLine(
          'headless_autostart_not_started',
          label,
          'mod_job_running',
        );
        return;
      }

      const result = await this.runtime.start(item);

      if (!result.ok) {
        if (
          result.error === 'missing_server_settings' &&
          attempt + 1 < MAX_ATTEMPTS
        ) {
          setTimeout(() => void this.maybeAutostart(attempt + 1), RETRY_MS);
          return;
        }
        this.logLine(
          'headless_autostart_not_started',
          label,
          result.error || 'unknown',
        );
        return;
      }

      this.logLine('headless_autostart_issued', label);
    } catch (e) {
      this.logLine(
        'headless_autostart_start_failed',
        label,
        e instanceof Error ? e.message : String(e),
      );
    }
  }
}
