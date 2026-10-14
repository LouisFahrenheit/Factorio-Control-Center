import {
  unixNonRootNoPrivilegedBind,
  webPanelTlsEffective,
  resolveBindPort,
  resolveDisplayPort,
  resolveDisplayHost,
  captureRuntimeSnapshot,
  runtimeNeedsRestart,
  customBindPortRequiresElevation,
} from './web-panel-bind.util';
import type { WebPanelIni } from '../config/fcc-config.service';

describe('web-panel-bind.util', () => {
  const createMockWp = (overrides: Partial<WebPanelIni> = {}): WebPanelIni => ({
    api_token: 'token123',
    global_token: 'plain-token',
    global_username: '',
    debug_logs: false,
    listen_host: '0.0.0.0',
    listen_port: 8080,
    public_host: '',
    public_port: '0',
    tls_enabled: false,
    tls_certfile: '',
    tls_keyfile: '',
    tls_key_password: '',
    log_reformat_timestamps: true,
    mod_download_concurrency: 4,
    public_page_enabled: false,
    public_page_allow_mod_downloads: false,
    public_page_route: '/servers',
    public_page_title: '',
    public_page_subtitle: '',
    public_page_theme: '',
    public_page_hide_title: false,
    public_page_hide_subtitle: false,
    public_page_show_players: true,
    public_page_contact_link: '',
    web_disable_effects: false,
    toast_duration_sec: 5,
    sync_bans_across_instances: false,
    sync_admins_across_instances: false,
    sync_whitelist_across_instances: false,
    require_unique_instance_game_ports: false,
    server_settings_default_public_off: false,
    server_settings_apply_global_credentials: false,
    log_rotation_max_mb: 50,
    log_rotation_interval_hours: 24,
    log_rotation_backup_count: 5,
    log_write_instance: true,
    log_write_web: true,
    log_write_maintenance: true,
    log_write_audit: true,
    ...overrides,
  });

  describe('webPanelTlsEffective', () => {
    it('returns true when tls_enabled is true, false otherwise', () => {
      expect(webPanelTlsEffective(createMockWp({ tls_enabled: true }))).toBe(
        true,
      );
      expect(webPanelTlsEffective(createMockWp({ tls_enabled: false }))).toBe(
        false,
      );
    });
  });

  describe('resolveBindPort', () => {
    it('resolves valid port or falls back to 8080', () => {
      expect(resolveBindPort(createMockWp({ listen_port: 9000 }))).toBe(9000);
      expect(
        resolveBindPort(
          createMockWp({ listen_port: 'invalid' as unknown as number }),
        ),
      ).toBe(8080);
    });
  });

  describe('resolveDisplayPort', () => {
    it('uses public_port when valid, otherwise falls back to bindPort', () => {
      expect(
        resolveDisplayPort(createMockWp({ public_port: '443' }), 8080),
      ).toBe(443);
      expect(resolveDisplayPort(createMockWp({ public_port: '0' }), 8080)).toBe(
        8080,
      );
    });
  });

  describe('resolveDisplayHost', () => {
    it('prefers public_host when set', () => {
      expect(
        resolveDisplayHost(
          createMockWp({
            public_host: 'panel.example.com',
            listen_host: '0.0.0.0',
          }),
        ),
      ).toBe('panel.example.com');
    });

    it('falls back to 127.0.0.1 when listen_host is 0.0.0.0', () => {
      expect(resolveDisplayHost(createMockWp({ listen_host: '0.0.0.0' }))).toBe(
        '127.0.0.1',
      );
    });

    it('returns listen_host if not 0.0.0.0', () => {
      expect(
        resolveDisplayHost(createMockWp({ listen_host: '192.168.1.10' })),
      ).toBe('192.168.1.10');
    });
  });

  describe('captureRuntimeSnapshot and runtimeNeedsRestart', () => {
    it('detects changes requiring restart', () => {
      const initial = createMockWp({
        listen_host: '127.0.0.1',
        listen_port: 8080,
      });
      const snapshot = captureRuntimeSnapshot(initial);

      expect(runtimeNeedsRestart(snapshot, initial)).toBe(false);

      const changedHost = createMockWp({
        listen_host: '0.0.0.0',
        listen_port: 8080,
      });
      expect(runtimeNeedsRestart(snapshot, changedHost)).toBe(true);

      const changedTls = createMockWp({
        listen_host: '127.0.0.1',
        listen_port: 8080,
        tls_enabled: true,
      });
      expect(runtimeNeedsRestart(snapshot, changedTls)).toBe(true);
    });
  });

  describe('unixNonRootNoPrivilegedBind and customBindPortRequiresElevation', () => {
    it('returns false on win32', () => {
      if (process.platform === 'win32') {
        expect(unixNonRootNoPrivilegedBind()).toBe(false);
        expect(
          customBindPortRequiresElevation(
            createMockWp({ listen_port: 80 }),
            80,
          ),
        ).toBe(false);
      }
    });
  });
});
