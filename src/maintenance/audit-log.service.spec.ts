import { AuditLogService } from './audit-log.service';
import { PathsService } from '../config/paths.service';
import { LogRotationService } from '../logging/log-rotation.service';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let tempDir: string;
  let openSessionsPath: string;
  let reportsPath: string;
  let auditLogFile: string;

  let mockPaths: Partial<PathsService>;
  let mockLogRotation: Partial<LogRotationService>;
  let appendedLines: string[] = [];

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-audit-test-'));
    openSessionsPath = path.join(tempDir, 'open-sessions.json');
    reportsPath = path.join(tempDir, 'maintenance-reports.json');
    auditLogFile = path.join(tempDir, 'audit.log');
    appendedLines = [];

    mockPaths = {
      auditOpenSessionsPath: openSessionsPath,
      maintenanceReportsPath: reportsPath,
      auditLogPath: jest.fn().mockReturnValue(auditLogFile),
    };

    mockLogRotation = {
      logWriteAuditEnabled: jest.fn().mockReturnValue(true),
      appendLine: jest
        .fn()
        .mockImplementation((_filePath: string, line: string) => {
          appendedLines.push(line);
        }),
    };

    service = new AuditLogService(
      mockPaths as PathsService,
      mockLogRotation as LogRotationService,
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe('record', () => {
    it('appends an audit log line when audit logging is enabled', () => {
      service.record({
        event_kind: 'web_panel',
        instance_id: 'inst-1',
        instance_name: 'Factorio EU',
        actor: 'Admin',
        success: true,
        detail: { message: 'Updated server settings' },
      });

      expect(appendedLines.length).toBe(1);
      const line = appendedLines[0];
      expect(line).toContain(
        '[Action] Admin on Factorio EU: Updated server settings',
      );
      expect(line).not.toContain('[FAILED]');
    });

    it('formats failed audit log line with error message', () => {
      service.record({
        event_kind: 'auth',
        actor: 'guest',
        success: false,
        error: 'Invalid password',
      });

      expect(appendedLines.length).toBe(1);
      const line = appendedLines[0];
      expect(line).toContain('[Auth] guest [FAILED] — Error: Invalid password');
    });

    it('does not append audit log line when audit logging is disabled', () => {
      (mockLogRotation.logWriteAuditEnabled as jest.Mock).mockReturnValue(
        false,
      );

      service.record({
        event_kind: 'save_download',
        actor: 'user',
        success: true,
      });

      expect(appendedLines.length).toBe(0);
    });

    it('formats mod and rename changes in detail', () => {
      service.record({
        event_kind: 'mod_toggle',
        instance_name: 'Factorio Server',
        actor: 'Alice',
        detail: { name: 'space-exploration', changes: ['disabled'] },
      });

      expect(appendedLines.length).toBe(1);
      expect(appendedLines[0]).toContain('space-exploration, 1 change(s)');

      service.record({
        event_kind: 'save_rename',
        instance_name: 'Factorio Server',
        actor: 'Alice',
        detail: { name: 'old_save', new_name: 'new_save' },
      });

      expect(appendedLines.length).toBe(2);
      expect(appendedLines[1]).toContain('old_save → new_save');
    });
  });

  describe('manual session lifecycle', () => {
    it('manages begin, resume, record, and end of manual sessions', () => {
      expect(service.hasOpenManualSession('inst-1')).toBe(false);

      // Begin session
      service.beginManualSession('inst-1', 'Test Server');
      expect(service.hasOpenManualSession('inst-1')).toBe(true);

      // Starting same session again does not duplicate
      service.beginManualSession('inst-1', 'Test Server');

      // Append resume step
      service.appendManualResumeStep('inst-1', 'Operator');

      // Record an action during the manual session
      service.record({
        event_kind: 'mod_install',
        instance_id: 'inst-1',
        instance_name: 'Test Server',
        actor: 'Operator',
        success: true,
      });

      // End session
      service.endManualSession('inst-1', 'Operator');
      expect(service.hasOpenManualSession('inst-1')).toBe(false);

      const reports = service.listReports();
      expect(reports.length).toBe(1);
      const report = reports[0];
      expect(report.instance_id).toBe('inst-1');
      expect(report.report_kind).toBe('manual_session');
      expect(report.open).toBe(false);

      const steps = report.steps as Array<{ kind: string }>;
      expect(steps.some((s) => s.kind === 'session_start')).toBe(true);
      expect(steps.some((s) => s.kind === 'maintenance_manual_resume')).toBe(
        true,
      );
      expect(steps.some((s) => s.kind === 'audit_event')).toBe(true);
      expect(steps.some((s) => s.kind === 'session_end')).toBe(true);
    });

    it('ignores session calls when instanceId is empty', () => {
      service.beginManualSession('', '');
      service.appendManualResumeStep('');
      service.endManualSession('');
      expect(service.listReports()).toEqual([]);
    });
  });

  describe('appendMaintenanceRun and listReports', () => {
    it('appends and updates scheduled maintenance run reports', () => {
      service.appendMaintenanceRun({
        run_id: 'run-101',
        instance_id: 'inst-1',
        instance_name: 'Factorio Server',
        run_trigger: 'scheduled',
        success: true,
        steps: [{ kind: 'backup', ok: true }],
      });

      let reports = service.listReports();
      expect(reports.length).toBe(1);
      expect(reports[0].run_id).toBe('run-101');
      expect(reports[0].run_trigger).toBe('scheduled');

      // Update existing run
      service.appendMaintenanceRun({
        run_id: 'run-101',
        instance_id: 'inst-1',
        instance_name: 'Factorio Server',
        success: true,
        steps: [
          { kind: 'backup', ok: true },
          { kind: 'restart', ok: true },
        ],
      });

      reports = service.listReports();
      expect(reports.length).toBe(1);
      const steps = reports[0].steps as unknown[];
      expect(steps.length).toBe(2);
    });

    it('prepends report when instance_id is missing', () => {
      service.appendMaintenanceRun({
        run_id: 'global-run',
        report_kind: 'maintenance_run',
      });

      const reports = service.listReports();
      expect(reports.length).toBe(1);
      expect(reports[0].run_id).toBe('global-run');
    });
  });

  describe('purgeInstance', () => {
    it('removes active session and stored reports for purged instance', () => {
      service.beginManualSession('inst-to-purge', 'Purge Server');
      service.appendMaintenanceRun({
        run_id: 'run-other',
        instance_id: 'inst-keep',
        report_kind: 'maintenance_run',
      });

      expect(service.hasOpenManualSession('inst-to-purge')).toBe(true);
      expect(service.listReports().length).toBe(2);

      service.purgeInstance('inst-to-purge');

      expect(service.hasOpenManualSession('inst-to-purge')).toBe(false);
      const remaining = service.listReports();
      expect(remaining.length).toBe(1);
      expect(remaining[0].instance_id).toBe('inst-keep');
    });

    it('ignores purge for empty instance id', () => {
      expect(() => service.purgeInstance('')).not.toThrow();
    });
  });
});
