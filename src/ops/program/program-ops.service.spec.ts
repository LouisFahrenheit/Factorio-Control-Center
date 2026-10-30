import { Repository } from 'typeorm';
import { ProgramOpsService } from './program-ops.service';
import { PathsService } from '../../config/paths.service';
import { FccConfigService } from '../../config/fcc-config.service';
import { InstancesService } from '../../instances/instances.service';
import { LogRotationService } from '../../logging/log-rotation.service';
import { WebPanelListenerService } from '../../http/web-panel-listener.service';
import { ModPortalService } from '../mod-portal/mod-portal.service';
import { SystemPreference } from '../../config/system-preference.entity';
import * as fs from 'fs';
import * as tlsUtil from '../../http/tls-path.util';
import * as opsUtils from '../ops-utils';

jest.mock('fs', () => ({
  ...jest.requireActual<Record<string, unknown>>('fs'),
  existsSync: jest.fn(),
  statSync: jest.fn(),
  copyFileSync: jest.fn(),
  readdirSync: jest.fn(),
}));

jest.mock('../../http/tls-path.util', () => ({
  ...jest.requireActual<Record<string, unknown>>('../../http/tls-path.util'),
  tlsFilesExist: jest.fn(),
}));

jest.mock('../ops-utils', () => ({
  ...jest.requireActual<Record<string, unknown>>('../ops-utils'),
  readLogFile: jest.fn(),
}));

describe('ProgramOpsService', () => {
  let service: ProgramOpsService;
  let mockPaths: jest.Mocked<PathsService>;
  let mockConfig: {
    section: jest.Mock;
    webPanel: Record<string, unknown>;
    updatePreferences: jest.Mock;
  };
  let mockInstances: {
    getSelected: jest.Mock;
    getSelectedId: jest.Mock;
    load: jest.Mock;
    update: jest.Mock;
  };
  let mockLogRotation: {
    syncFromConfig: jest.Mock;
    logWriteWebEnabled: jest.Mock;
    logWriteMaintenanceEnabled: jest.Mock;
    logWriteAuditEnabled: jest.Mock;
  };
  let mockListener: {
    captureSnapshot: jest.Mock;
    restartIfNeeded: jest.Mock;
    restart: jest.Mock;
  };
  let mockPortal: {
    verifyCredentials: jest.Mock;
    clearVerifyCache: jest.Mock;
  };
  let mockSysPrefsRepo: jest.Mocked<Repository<SystemPreference>>;

  const mockFs = jest.mocked(fs);
  const mockTlsUtil = jest.mocked(tlsUtil);
  const mockOpsUtils = jest.mocked(opsUtils);

  beforeEach(() => {
    jest.clearAllMocks();

    mockPaths = {
      rootDir: '/test/root',
      localeDir: '/test/root/locale',
      tlsDir: '/test/root/tls',
      webPanelLogPath: jest.fn().mockReturnValue('/test/root/logs/web.log'),
      maintenanceSchedulerLogPath: jest
        .fn()
        .mockReturnValue('/test/root/logs/maint.log'),
      auditLogPath: jest.fn().mockReturnValue('/test/root/logs/audit.log'),
    } as unknown as jest.Mocked<PathsService>;

    mockConfig = {
      section: jest.fn((name: string) => {
        if (name === 'shared') {
          return {
            theme: 'dark_space',
            translate_mod_names: 'true',
            modpack_activate_use_symlinks: 'true',
          };
        }
        if (name === 'language') {
          return { code: 'ru' };
        }
        return {};
      }),
      webPanel: {
        web_disable_effects: false,
        sync_bans_across_instances: true,
        sync_admins_across_instances: false,
        sync_whitelist_across_instances: false,
        require_unique_instance_game_ports: true,
        server_settings_default_public_off: false,
        server_settings_apply_global_credentials: true,
        toast_duration_sec: 5,
        log_rotation_max_mb: 50,
        log_rotation_interval_hours: 24,
        log_rotation_backup_count: 3,
        log_write_instance: true,
        log_write_web: true,
        log_write_maintenance: true,
        log_write_audit: true,
        log_reformat_timestamps: false,
        public_page_enabled: true,
        public_page_allow_mod_downloads: false,
        public_page_route: '/status',
        public_page_title: 'My Server',
        public_page_subtitle: 'Factorio Status',
        public_page_theme: 'dark_space',
        public_page_hide_title: false,
        public_page_hide_subtitle: false,
        public_page_show_players: true,
        public_page_contact_link: 'https://discord.gg/test',
        global_username: 'factorio_user',
        global_token: 'factorio_token_123',
        tls_enabled: false,
        tls_certfile: 'tls/cert.pem',
        tls_keyfile: 'tls/key.pem',
        tls_key_password: '',
        public_host: '127.0.0.1',
        public_port: 8080,
        listen_host: '0.0.0.0',
        listen_port: 8080,
      },
      updatePreferences: jest.fn().mockResolvedValue(undefined),
    };

    mockInstances = {
      getSelected: jest.fn(),
      getSelectedId: jest.fn(),
      load: jest.fn().mockReturnValue({ items: [] }),
      update: jest.fn().mockResolvedValue({ ok: true }),
    };

    mockLogRotation = {
      syncFromConfig: jest.fn(),
      logWriteWebEnabled: jest.fn().mockReturnValue(true),
      logWriteMaintenanceEnabled: jest.fn().mockReturnValue(true),
      logWriteAuditEnabled: jest.fn().mockReturnValue(true),
    };

    mockListener = {
      captureSnapshot: jest.fn().mockReturnValue({ port: 8080 }),
      restartIfNeeded: jest.fn().mockResolvedValue({ ok: true }),
      restart: jest.fn().mockResolvedValue({ ok: true }),
    };

    mockPortal = {
      verifyCredentials: jest
        .fn()
        .mockResolvedValue({ ok: true, username: 'portal_user' }),
      clearVerifyCache: jest.fn(),
    };

    mockSysPrefsRepo = {} as unknown as jest.Mocked<
      Repository<SystemPreference>
    >;

    mockFs.existsSync.mockReturnValue(false);
    (mockFs.readdirSync as unknown as jest.Mock).mockReturnValue([
      'server_lang_en.json',
      'server_lang_ru.json',
      'server_lang_zh-cn.json',
      'other.txt',
    ]);

    service = new ProgramOpsService(
      mockPaths,
      mockConfig as unknown as FccConfigService,
      mockInstances as unknown as InstancesService,
      mockLogRotation as unknown as LogRotationService,
      mockListener as unknown as WebPanelListenerService,
      mockPortal as unknown as ModPortalService,
      mockSysPrefsRepo,
    );
  });

  describe('get()', () => {
    it('returns full program configuration with normalized theme and language', () => {
      const res = service.get();
      expect(res.ok).toBe(true);
      expect(res['theme']).toBe('dark_space');
      expect(res['language']).toBe('ru');
      expect(res['translate_mod_names']).toBe(true);
      expect(res['factorio_global_credentials_present']).toBe(true);
      expect(res['available_languages']).toEqual(['en', 'ru', 'zh-cn']);
      expect(res['available_themes']).toContain('dark_space');
    });

    it('falls back to default theme and en language if unknown or missing', () => {
      mockConfig.section.mockImplementation((name: string) => {
        if (name === 'shared') return { theme: 'non_existent_theme' };
        if (name === 'language') return { code: 'unknown_lang' };
        return {};
      });

      const res = service.get();
      expect(res.ok).toBe(true);
      expect(res['theme']).toBe('fcc_classic');
      expect(res['language']).toBe('en');
    });

    it('handles empty language directory error gracefully and defaults to en', () => {
      (mockFs.readdirSync as unknown as jest.Mock).mockImplementation(() => {
        throw new Error('Directory not found');
      });

      const res = service.get();
      expect(res['available_languages']).toEqual(['en']);
      expect(res['language']).toBe('en');
    });
  });

  describe('verifyGlobalFactorioCredentials()', () => {
    it('returns unverified if username or token are empty', async () => {
      mockConfig.webPanel.global_username = '';
      mockConfig.webPanel.global_token = '';

      const res = await service.verifyGlobalFactorioCredentials();
      expect(res).toEqual({ ok: true, verified: false, portal_username: '' });
      expect(mockPortal.verifyCredentials).not.toHaveBeenCalled();
    });

    it('returns verified: true with portal username when portal confirms credentials', async () => {
      mockPortal.verifyCredentials.mockResolvedValueOnce({
        ok: true,
        username: 'factorio_pro',
      });

      const res = await service.verifyGlobalFactorioCredentials();
      expect(res).toEqual({
        ok: true,
        verified: true,
        portal_username: 'factorio_pro',
      });
      expect(mockPortal.verifyCredentials).toHaveBeenCalledWith(
        'factorio_user',
        'factorio_token_123',
      );
    });

    it('returns verified: false when portal rejects credentials', async () => {
      mockPortal.verifyCredentials.mockResolvedValueOnce({ ok: false });

      const res = await service.verifyGlobalFactorioCredentials();
      expect(res).toEqual({ ok: true, verified: false, portal_username: '' });
    });
  });

  describe('set()', () => {
    it('validates factorio credentials when provided and fails if incomplete', async () => {
      const res = await service.set({
        global_username: 'user_only',
        global_token: '',
      });
      expect(res).toEqual({
        ok: false,
        error: 'factorio_credentials_incomplete',
      });
    });

    it('fails when factorio credentials verification is rejected by portal', async () => {
      mockPortal.verifyCredentials.mockResolvedValueOnce({ ok: false });
      const res = await service.set({
        global_username: 'bad_user',
        global_token: 'bad_token',
      });
      expect(res).toEqual({
        ok: false,
        error: 'factorio_credentials_invalid',
      });
    });

    it('clears verify cache and updates preferences when credentials are valid', async () => {
      mockPortal.verifyCredentials.mockResolvedValueOnce({
        ok: true,
        username: 'good_user',
      });
      const res = await service.set({
        global_username: 'good_user',
        global_token: 'good_token',
      });
      expect(res.ok).toBe(true);
      expect(mockPortal.clearVerifyCache).toHaveBeenCalled();
      expect(mockConfig.updatePreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          'web_panel.global_username': 'good_user',
          'web_panel.global_token': 'good_token',
        }),
      );
    });

    it('updates shared settings and records modpack_activate_use_symlinks changes', async () => {
      const res = await service.set({
        translate_mod_names: false,
        modpack_activate_use_symlinks: false,
        theme: 'vulcanus',
        language: 'ru',
      });

      expect(res.ok).toBe(true);
      expect(res['settings_changes']).toEqual([
        {
          key: 'modpack_activate_use_symlinks',
          from: 'true',
          to: 'false',
        },
      ]);
      expect(mockConfig.updatePreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          'shared.translate_mod_names': 'false',
          'shared.modpack_activate_use_symlinks': 'false',
          'shared.theme': 'vulcanus',
          'language.code': 'ru',
        }),
      );
    });

    it('clamps numeric web panel options to valid ranges', async () => {
      await service.set({
        toast_duration_sec: 999, // clamp to 20
        log_rotation_max_mb: 5000, // clamp to 2048
        log_rotation_interval_hours: 99999, // clamp to 8760
        log_rotation_backup_count: -5, // clamp to 1
        listen_port: 70000, // clamp to 65535
      });

      expect(mockConfig.updatePreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          'web_panel.toast_duration_sec': '20',
          'web_panel.log_rotation_max_mb': '2048',
          'web_panel.log_rotation_interval_hours': '8760',
          'web_panel.log_rotation_backup_count': '1',
          'web_panel.listen_port': '65535',
        }),
      );
    });

    it('auto-shifts default HTTP/HTTPS ports when TLS is toggled ON/OFF', async () => {
      // Toggle TLS ON from 80 -> 443
      mockConfig.webPanel.tls_enabled = false;
      mockConfig.webPanel.listen_port = 80;
      mockTlsUtil.tlsFilesExist.mockReturnValue(true);

      await service.set({
        tls_enabled: true,
      });

      expect(mockConfig.updatePreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          'web_panel.tls_enabled': 'true',
          'web_panel.listen_port': '443',
        }),
      );

      // Toggle TLS ON from 8080 -> 8443
      mockConfig.webPanel.tls_enabled = false;
      mockConfig.webPanel.listen_port = 8080;
      await service.set({
        tls_enabled: true,
      });
      expect(mockConfig.updatePreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          'web_panel.tls_enabled': 'true',
          'web_panel.listen_port': '8443',
        }),
      );

      // Toggle TLS OFF from 443 -> 80
      mockConfig.webPanel.tls_enabled = true;
      mockConfig.webPanel.listen_port = 443;
      await service.set({
        tls_enabled: false,
      });
      expect(mockConfig.updatePreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          'web_panel.tls_enabled': 'false',
          'web_panel.listen_port': '80',
        }),
      );

      // Toggle TLS OFF from 8443 -> 8080
      mockConfig.webPanel.tls_enabled = true;
      mockConfig.webPanel.listen_port = 8443;
      await service.set({
        tls_enabled: false,
      });
      expect(mockConfig.updatePreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          'web_panel.tls_enabled': 'false',
          'web_panel.listen_port': '8080',
        }),
      );
    });

    it('fails when TLS is enabled but cert or key files are missing', async () => {
      mockTlsUtil.tlsFilesExist.mockReturnValue(false);

      const res = await service.set({
        tls_enabled: true,
        tls_certfile: 'missing/cert.pem',
        tls_keyfile: 'missing/key.pem',
      });

      expect(res).toEqual({
        ok: false,
        error: 'tls_cert_or_key_missing',
      });
    });

    it('restarts web panel listener if runtime keys were changed and reports errors', async () => {
      mockListener.restartIfNeeded.mockResolvedValueOnce({
        ok: false,
        error: 'port_already_in_use',
      });

      const res = await service.set({
        listen_port: 9000,
      });

      expect(mockListener.restartIfNeeded).toHaveBeenCalled();
      expect(res).toEqual({
        ok: false,
        error: 'port_already_in_use',
      });
    });

    it('restarts web panel listener successfully if runtime keys were changed', async () => {
      mockListener.restartIfNeeded.mockResolvedValueOnce({ ok: true });

      const res = await service.set({
        listen_port: 9000,
      });

      expect(mockListener.restartIfNeeded).toHaveBeenCalled();
      expect(res.ok).toBe(true);
    });
  });

  describe('restartWebPanel()', () => {
    it('calls listener restart and returns ok: true on success', async () => {
      const res = await service.restartWebPanel();
      expect(res).toEqual({ ok: true });
      expect(mockListener.restart).toHaveBeenCalled();
    });

    it('returns error if restart fails', async () => {
      mockListener.restart.mockResolvedValueOnce({
        ok: false,
        error: 'cannot_bind_socket',
      });
      const res = await service.restartWebPanel();
      expect(res).toEqual({
        ok: false,
        error: 'cannot_bind_socket',
      });
    });
  });

  describe('programLogHistory()', () => {
    it('returns error for invalid log kind', () => {
      const res = service.programLogHistory('invalid_kind');
      expect(res).toEqual({ ok: false, error: 'invalid_log_kind' });
    });

    it('returns empty list and disabled flag if log writing is disabled for kind', () => {
      mockLogRotation.logWriteWebEnabled.mockReturnValue(false);
      const res = service.programLogHistory('web');
      expect(res).toEqual({
        ok: true,
        lines: [],
        path: '/test/root/logs/web.log',
        truncated: false,
        line_capped: false,
        full_loaded: false,
        file_missing: true,
        file_bytes: 0,
        program_log_disabled: true,
      });
    });

    it('returns error if log file is too large', () => {
      mockOpsUtils.readLogFile.mockReturnValueOnce({
        lines: [],
        truncated: false,
        lineCapped: false,
        fileMissing: false,
        fileBytes: 50000000,
        tooLarge: true,
      });

      const res = service.programLogHistory('maintenance');
      expect(res).toEqual({
        ok: false,
        error: 'log_file_too_large',
        path: '/test/root/logs/maint.log',
        file_bytes: 50000000,
      });
    });

    it('returns log lines on successful read for audit log', () => {
      mockOpsUtils.readLogFile.mockReturnValueOnce({
        lines: ['line 1', 'line 2'],
        truncated: false,
        lineCapped: false,
        fileMissing: false,
        fileBytes: 120,
      });

      const res = service.programLogHistory('audit', 100, true);
      expect(res).toEqual({
        ok: true,
        lines: ['line 1', 'line 2'],
        path: '/test/root/logs/audit.log',
        truncated: false,
        line_capped: false,
        full_loaded: true,
        file_missing: false,
        file_bytes: 120,
      });
    });
  });

  describe('getServerIni()', () => {
    it('returns instance_not_found if no instance is selected', () => {
      mockInstances.getSelected.mockReturnValue(null);
      const res = service.getServerIni();
      expect(res).toEqual({ ok: false, error: 'instance_not_found' });
    });

    it('returns ip, port, save and host_ips for selected instance', () => {
      mockInstances.getSelected.mockReturnValue({
        id: 'inst-1',
        name: 'Instance 1',
        ip: '127.0.0.1',
        port: 34197,
        launchSave: 'my_world',
      });

      const res = service.getServerIni();
      expect(res.ok).toBe(true);
      expect(res['ip']).toBe('127.0.0.1');
      expect(res['port']).toBe('34197');
      expect(res['save']).toBe('my_world');
      expect(Array.isArray(res['host_ips'])).toBe(true);
    });
  });

  describe('uploadWebTlsFile()', () => {
    it('returns error for invalid kind', () => {
      const res = service.uploadWebTlsFile('/tmp/file', 'invalid');
      expect(res).toEqual({ ok: false, error: 'tls_upload_invalid_kind' });
    });

    it('returns error if tmp file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      const res = service.uploadWebTlsFile('/tmp/cert.pem', 'cert');
      expect(res).toEqual({ ok: false, error: 'tls_upload_missing_tmp' });
    });

    it('returns error if statSync fails', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.statSync as unknown as jest.Mock).mockImplementation(() => {
        throw new Error('EACCES');
      });
      const res = service.uploadWebTlsFile('/tmp/cert.pem', 'cert');
      expect(res).toEqual({ ok: false, error: 'tls_upload_missing_tmp' });
    });

    it('returns error if file is empty or exceeds max bytes (2MB)', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.statSync as unknown as jest.Mock).mockReturnValue({ size: 0 });
      expect(service.uploadWebTlsFile('/tmp/cert.pem', 'cert')).toEqual({
        ok: false,
        error: 'tls_upload_too_large',
      });

      (mockFs.statSync as unknown as jest.Mock).mockReturnValue({
        size: 3 * 1024 * 1024,
      });
      expect(service.uploadWebTlsFile('/tmp/cert.pem', 'cert')).toEqual({
        ok: false,
        error: 'tls_upload_too_large',
      });
    });

    it('copies file to tls directory and returns relative path', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.statSync as unknown as jest.Mock).mockReturnValue({ size: 1024 });

      const res = service.uploadWebTlsFile('/tmp/mykey.pem', 'key');
      expect(mockFs.copyFileSync).toHaveBeenCalled();
      expect(res.ok).toBe(true);
      expect(res['kind']).toBe('key');
    });

    it('handles copyFileSync error gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.statSync as unknown as jest.Mock).mockReturnValue({ size: 1024 });
      (mockFs.copyFileSync as unknown as jest.Mock).mockImplementation(() => {
        throw new Error('Disk full');
      });

      const res = service.uploadWebTlsFile('/tmp/mycert.pem', 'cert');
      expect(res).toEqual({ ok: false, error: 'Disk full' });
    });
  });

  describe('modpackActivateUseSymlinks()', () => {
    it('returns configured boolean flag', () => {
      expect(service.modpackActivateUseSymlinks()).toBe(true);
    });
  });

  describe('setServerIni()', () => {
    it('returns instance_not_found if no instance selected', async () => {
      mockInstances.getSelectedId.mockReturnValue(null);
      const res = await service.setServerIni({ port: '34198' });
      expect(res).toEqual({ ok: false, error: 'instance_not_found' });
    });

    it('validates game IP address and rejects invalid IP', async () => {
      mockInstances.getSelectedId.mockReturnValue('inst-1');
      mockInstances.getSelected.mockReturnValue({
        id: 'inst-1',
        ip: '0.0.0.0',
        port: 34197,
      });

      const res = await service.setServerIni({ ip: 'invalid_ip_string' });
      expect(res).toEqual({ ok: false, error: 'invalid_ip' });
    });

    it('validates game port and rejects invalid port', async () => {
      mockInstances.getSelectedId.mockReturnValue('inst-1');
      mockInstances.getSelected.mockReturnValue({
        id: 'inst-1',
        ip: '0.0.0.0',
        port: 34197,
      });

      const res = await service.setServerIni({ port: '999999' });
      expect(res).toEqual({ ok: false, error: 'invalid_port' });
    });

    it('checks for port conflict across instances if required by config', async () => {
      mockInstances.getSelectedId.mockReturnValue('inst-1');
      mockInstances.getSelected.mockReturnValue({
        id: 'inst-1',
        ip: '0.0.0.0',
        port: 34197,
      });
      mockInstances.load.mockReturnValue({
        items: [{ id: 'inst-2', port: '34198' }],
      });

      const res = await service.setServerIni({ port: '34198' });
      expect(res).toEqual({ ok: false, error: 'port_in_use' });
    });

    it('updates instance settings and tracks changes', async () => {
      mockInstances.getSelectedId.mockReturnValue('inst-1');
      mockInstances.getSelected.mockReturnValue({
        id: 'inst-1',
        ip: '0.0.0.0',
        port: 34197,
        launchSave: 'old_world',
      });
      mockInstances.load.mockReturnValue({
        items: [],
      });

      const res = await service.setServerIni({
        ip: '127.0.0.1',
        port: '34198',
        save: 'new_world',
      });

      expect(res.ok).toBe(true);
      expect(mockInstances.update).toHaveBeenCalledWith('inst-1', {
        ip: '127.0.0.1',
        port: '34198',
        launchSave: 'new_world',
      });
      expect(res['settings_changes']).toEqual([
        { key: 'ip', from: '0.0.0.0', to: '127.0.0.1' },
        { key: 'port', from: '34197', to: '34198' },
        { key: 'save', from: 'old_world', to: 'new_world' },
      ]);
    });

    it('returns empty settings_changes when no arguments provided', async () => {
      mockInstances.getSelectedId.mockReturnValue('inst-1');
      mockInstances.getSelected.mockReturnValue({
        id: 'inst-1',
      });

      const res = await service.setServerIni({});
      expect(res).toEqual({ ok: true, settings_changes: [] });
      expect(mockInstances.update).not.toHaveBeenCalled();
    });
  });
});
