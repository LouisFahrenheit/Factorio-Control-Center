import { Injectable } from '@nestjs/common';
import { PathsService } from '../config/paths.service';
import { LogRotationService } from './log-rotation.service';

@Injectable()
export class WebPanelLogService {
  constructor(
    private readonly paths: PathsService,
    private readonly rotation: LogRotationService,
  ) {}

  appendDebug(message: string): void {
    this.logEvent('web_ops', String(message ?? '').replace(/\r?\n$/, ''));
  }

  logEvent(category: string, message: string): void {
    if (!this.rotation.logWriteWebEnabled()) return;
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const cat = String(category || 'event').trim() || 'event';
    const text = String(message ?? '')
      .replace(/\r?\n/g, ' ')
      .trim();
    const line = `[${ts}] [${cat}] ${text}`;
    this.rotation.appendLine(this.paths.webPanelLogPath(), line);
  }

  appendFile(message: string): void {
    if (!this.rotation.logWriteWebEnabled()) return;
    this.rotation.appendLine(
      this.paths.webPanelLogPath(),
      String(message ?? '').replace(/\r?\n$/, ''),
    );
  }

  appendFileBlock(text: string): void {
    if (!this.rotation.logWriteWebEnabled()) return;
    for (const line of String(text || '').split(/\r?\n/)) {
      this.rotation.appendLine(this.paths.webPanelLogPath(), line);
    }
  }
}
