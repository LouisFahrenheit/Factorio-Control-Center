import { WebPanelEventLogService } from './web-panel-event-log.service';
import { AuditLogService } from '../maintenance/audit-log.service';
import { InstancesService } from '../instances/instances.service';
import { LogRotationService } from './log-rotation.service';
import { PathsService } from '../config/paths.service';
import { InstanceItem } from '../common/types';

describe('WebPanelEventLogService', () => {
  let service: WebPanelEventLogService;
  let mockAudit: {
    record: jest.Mock;
  };
  let mockInstances: {
    getSelected: jest.Mock;
    getById: jest.Mock;
  };
  let mockLogRotation: {
    logWriteMaintenanceEnabled: jest.Mock;
    appendLine: jest.Mock;
  };
  let mockPaths: {
    maintenanceSchedulerLogPath: jest.Mock;
  };

  const fakeInstance = {
    id: 'inst-1',
    name: 'Main Server',
  } as unknown as InstanceItem;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAudit = {
      record: jest.fn(),
    };

    mockInstances = {
      getSelected: jest.fn().mockReturnValue(fakeInstance),
      getById: jest.fn((id: string) => {
        if (id === 'inst-1') return fakeInstance;
        return null;
      }),
    };

    mockLogRotation = {
      logWriteMaintenanceEnabled: jest.fn().mockReturnValue(true),
      appendLine: jest.fn(),
    };

    mockPaths = {
      maintenanceSchedulerLogPath: jest
        .fn()
        .mockReturnValue('/logs/maintenance.log'),
    };

    service = new WebPanelEventLogService(
      mockAudit as unknown as AuditLogService,
      mockInstances as unknown as InstancesService,
      mockLogRotation as unknown as LogRotationService,
      mockPaths as unknown as PathsService,
    );
  });

  describe('logAuth()', () => {
    it('records login events with correct actor and success flag', () => {
      service.logAuth('login', 'admin');
      expect(mockAudit.record).toHaveBeenCalledWith({
        event_kind: 'auth',
        actor: 'admin',
        trigger: 'manual',
        success: true,
        detail: { message: 'Logged in' },
      });
    });

    it('records login_failed with success: false', () => {
      service.logAuth('login_failed', 'hacker');
      expect(mockAudit.record).toHaveBeenCalledWith({
        event_kind: 'auth',
        actor: 'hacker',
        trigger: 'manual',
        success: false,
        detail: { message: 'Login failed' },
      });
    });

    it('records login_locked, logout, and 2fa events', () => {
      service.logAuth('login_locked', 'user1', 'IP 127.0.0.1');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            message:
              'Temporarily locked out due to excessive failed attempts (IP 127.0.0.1)',
          },
        }),
      );

      service.logAuth('logout', 'user1');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { message: 'Logged out' },
        }),
      );

      service.logAuth('2fa_enable', 'user1');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { message: 'Enabled two-factor authentication (2FA)' },
        }),
      );

      service.logAuth('2fa_disable', 'user1');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { message: 'Disabled two-factor authentication (2FA)' },
        }),
      );

      service.logAuth('user_reset_2fa', 'admin', 'targetUser');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            message: 'Reset two-factor authentication (2FA) for targetUser',
          },
        }),
      );
    });

    it('records user management events (create, update, delete)', () => {
      service.logAuth('user_create', 'admin', 'newUser');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { message: 'Created user account for newUser' },
        }),
      );

      service.logAuth('user_update', 'admin', 'userA');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { message: 'Updated user account userA' },
        }),
      );

      service.logAuth('user_delete', 'admin', 'userB');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { message: 'Deleted user account userB' },
        }),
      );
    });

    it('defaults username to ? when empty', () => {
      service.logAuth('login', '');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: '?',
        }),
      );
    });
  });

  describe('logDispatchOp()', () => {
    it('ignores ops not present in LOGGED_OPS', () => {
      service.logDispatchOp('unknown_op', {}, { ok: true });
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('logs instance lifecycle ops (add, remove, update, clone, bootstrap)', () => {
      // instances_add
      service.logDispatchOp('instances_add', { actor: 'admin' }, { ok: true });
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { message: 'Added new server' },
        }),
      );

      // instances_remove with files kept vs deleted
      service.logDispatchOp(
        'instances_remove',
        { actor: 'admin', deleteFromDisk: false },
        { ok: true },
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { message: 'Deleted server (files kept)' },
        }),
      );

      service.logDispatchOp(
        'instances_remove',
        { actor: 'admin', deleteFromDisk: true },
        { ok: true },
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { message: 'Deleted server (files deleted)' },
        }),
      );

      // instances_update with changes list
      service.logDispatchOp(
        'instances_update',
        { actor: 'admin' },
        { ok: true, changes: ['port', 'save'] },
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { message: 'Updated server configuration (port, save)' },
        }),
      );

      // instances_clone
      service.logDispatchOp(
        'instances_clone',
        { actor: 'admin', name: 'Cloned Server' },
        { ok: true, id: 'inst-clone' },
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { message: 'Cloned server to inst-clone' },
        }),
      );

      // instance_bootstrap_start
      service.logDispatchOp(
        'instance_bootstrap_start',
        { actor: 'admin' },
        { ok: true },
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { message: 'Started automatic server setup' },
        }),
      );
    });

    it('logs server controls (start, stop, restart, kill, save, backup, rcon, restart_web_panel, tls)', () => {
      const simpleOps = [
        ['start_server', 'Started server'],
        ['stop_server', 'Stopped server'],
        ['restart_server', 'Restarted server'],
        ['kill_server', 'Force killed server'],
        ['save_game', 'Saved game'],
        ['backup', 'Created backup'],
        ['rcon_exec', 'Executed RCON command'],
        ['restart_web_panel', 'Restarted web panel'],
      ];

      for (const [op, msg] of simpleOps) {
        service.logDispatchOp(op, { actor: 'operator' }, { ok: true });
        expect(mockAudit.record).toHaveBeenCalledWith(
          expect.objectContaining({
            detail: { message: msg },
          }),
        );
      }

      // upload_web_tls_file
      service.logDispatchOp(
        'upload_web_tls_file',
        { actor: 'admin', kind: 'cert' },
        { ok: true },
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { message: 'Uploaded new TLS cert' },
        }),
      );
    });

    it('logs set_program_settings with redacting of sensitive secrets', () => {
      service.logDispatchOp(
        'set_program_settings',
        {
          actor: 'admin',
          listen_port: 8080,
          global_token: 'secret_token_123',
          tls_key_password: 'super_password',
          api_token: 'secret_api_token',
          _internal: 'hidden',
        },
        { ok: true },
      );

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            message: 'Changed global panel settings (listen_port=8080)',
          },
        }),
      );
    });

    it('writes to maintenance log for maintenance operations', () => {
      service.logDispatchOp(
        'maintenance_run_now',
        { actor: 'cron' },
        { ok: true },
      );
      expect(mockLogRotation.appendLine).toHaveBeenCalledWith(
        '/logs/maintenance.log',
        expect.stringContaining('manually triggered maintenance run'),
      );

      service.logDispatchOp(
        'maintenance_set',
        { actor: 'admin' },
        { ok: true },
      );
      expect(mockLogRotation.appendLine).toHaveBeenCalledWith(
        '/logs/maintenance.log',
        expect.stringContaining('updated maintenance tasks'),
      );

      service.logDispatchOp(
        'maintenance_clear_manual',
        { actor: 'admin' },
        { ok: true },
      );
      expect(mockLogRotation.appendLine).toHaveBeenCalledWith(
        '/logs/maintenance.log',
        expect.stringContaining('cleared manual maintenance session'),
      );

      // When logWriteMaintenanceEnabled is false, skips appendLine
      mockLogRotation.appendLine.mockClear();
      mockLogRotation.logWriteMaintenanceEnabled.mockReturnValue(false);
      service.logDispatchOp(
        'maintenance_run_now',
        { actor: 'cron' },
        { ok: true },
      );
      expect(mockLogRotation.appendLine).not.toHaveBeenCalled();
    });

    it('logs player moderation operations', () => {
      const playerOps = [
        ['ban_player', 'Banned player Player1'],
        ['unban_player', 'Unbanned player Player1'],
        ['kick_player', 'Kicked player Player1'],
        ['mute_player', 'Muted player Player1'],
        ['unmute_player', 'Unmuted player Player1'],
        ['purge_player', 'Purged player Player1'],
        ['whitelist_add', 'Added Player1 to whitelist'],
        ['whitelist_remove', 'Removed Player1 from whitelist'],
        ['whitelist_clear', 'Cleared whitelist'],
        ['sync_bans', 'Synchronized bans across servers'],
      ];

      for (const [op, msg] of playerOps) {
        service.logDispatchOp(
          op,
          { actor: 'moderator', player: 'Player1' },
          { ok: true },
        );
        expect(mockAudit.record).toHaveBeenCalledWith(
          expect.objectContaining({
            detail: { message: msg },
          }),
        );
      }
    });

    it('logs saves and mod management operations', () => {
      const ops = [
        ['factorio_update', 'Updated Factorio server version'],
        ['announcements_write', 'Updated server announcements'],
        ['write_commands_catalog', 'Updated RCON commands catalog'],
        ['mods_job_start', 'Started background mods job'],
        ['write_admin_list', 'Updated admin list'],
      ];

      for (const [op, msg] of ops) {
        service.logDispatchOp(op, { actor: 'admin' }, { ok: true });
        expect(mockAudit.record).toHaveBeenCalledWith(
          expect.objectContaining({
            detail: { message: msg },
          }),
        );
      }
    });

    it('records failed operations with error detail and success: false', () => {
      service.logDispatchOp(
        'start_server',
        { actor: 'admin' },
        { ok: false, error: 'Port in use' },
      );

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Port in use',
        }),
      );
    });

    it('uses result.name as instance name when provided', () => {
      service.logDispatchOp(
        'start_server',
        { actor: 'admin', id: 'inst-1' },
        { ok: true, name: 'Custom Name' },
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          instance_id: 'inst-1',
          instance_name: 'Custom Name',
        }),
      );
    });
  });
});
