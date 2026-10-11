import { FirewallService } from './firewall.service';
import { FccConfigService } from '../../config/fcc-config.service';
import { LocaleService } from '../../locale/locale.service';
import { WebPanelLogService } from '../../logging/web-panel-log.service';
import * as platformUtil from './platform-firewall.util';

jest.mock('./platform-firewall.util', () => ({
  platformFirewallAddUdpAllow: jest.fn(),
  platformFirewallIsElevated: jest.fn(),
  platformFirewallSupported: jest.fn(),
}));

describe('FirewallService', () => {
  let service: FirewallService;
  let mockConfig: Partial<FccConfigService>;
  let mockLocale: Partial<LocaleService>;
  let mockWebLog: Partial<WebPanelLogService>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});

    mockConfig = {
      langCode: 'en',
    };

    mockLocale = {
      readLang: jest.fn().mockReturnValue({
        firewall_web_startup_elevated: 'Firewall: running elevated',
        firewall_web_startup_not_elevated: 'Firewall: running non-elevated',
        firewall_rule_ok_log: 'Firewall rule added: port {} for {}',
        firewall_rule_failed_log: 'Firewall rule failed: {}',
      }),
    };

    mockWebLog = {
      appendFile: jest.fn(),
    };

    service = new FirewallService(
      mockConfig as FccConfigService,
      mockLocale as LocaleService,
      mockWebLog as WebPanelLogService,
    );
  });

  describe('logStartupNotice', () => {
    it('does nothing if platform firewall is not supported', () => {
      (platformUtil.platformFirewallSupported as jest.Mock).mockReturnValue(
        false,
      );

      service.logStartupNotice();
      expect(mockWebLog.appendFile).not.toHaveBeenCalled();
    });

    it('logs elevated notice when elevated', () => {
      (platformUtil.platformFirewallSupported as jest.Mock).mockReturnValue(
        true,
      );
      (platformUtil.platformFirewallIsElevated as jest.Mock).mockReturnValue(
        true,
      );

      service.logStartupNotice();
      expect(mockWebLog.appendFile).toHaveBeenCalledWith(
        'Firewall: running elevated',
      );
    });

    it('logs non-elevated notice when not elevated', () => {
      (platformUtil.platformFirewallSupported as jest.Mock).mockReturnValue(
        true,
      );
      (platformUtil.platformFirewallIsElevated as jest.Mock).mockReturnValue(
        false,
      );

      service.logStartupNotice();
      expect(mockWebLog.appendFile).toHaveBeenCalledWith(
        'Firewall: running non-elevated',
      );
    });
  });

  describe('tryApplyOnGameStart', () => {
    it('skips if firewall not supported or not elevated or port is invalid', async () => {
      (platformUtil.platformFirewallSupported as jest.Mock).mockReturnValue(
        false,
      );
      await service.tryApplyOnGameStart('factorio.exe', 34197);
      expect(platformUtil.platformFirewallAddUdpAllow).not.toHaveBeenCalled();

      (platformUtil.platformFirewallSupported as jest.Mock).mockReturnValue(
        true,
      );
      (platformUtil.platformFirewallIsElevated as jest.Mock).mockReturnValue(
        false,
      );
      await service.tryApplyOnGameStart('factorio.exe', 34197);
      expect(platformUtil.platformFirewallAddUdpAllow).not.toHaveBeenCalled();

      (platformUtil.platformFirewallIsElevated as jest.Mock).mockReturnValue(
        true,
      );
      await service.tryApplyOnGameStart('factorio.exe', 0); // invalid port
      expect(platformUtil.platformFirewallAddUdpAllow).not.toHaveBeenCalled();
    });

    it('logs success when rule is newly created', async () => {
      (platformUtil.platformFirewallSupported as jest.Mock).mockReturnValue(
        true,
      );
      (platformUtil.platformFirewallIsElevated as jest.Mock).mockReturnValue(
        true,
      );
      (platformUtil.platformFirewallAddUdpAllow as jest.Mock).mockResolvedValue(
        {
          ok: true,
          created: true,
        },
      );

      await service.tryApplyOnGameStart('/bin/factorio', 34197);
      expect(mockWebLog.appendFile).toHaveBeenCalledWith(
        'Firewall rule added: port 34197 for /bin/factorio',
      );
    });

    it('does not log if rule already existed and was not newly created', async () => {
      (platformUtil.platformFirewallSupported as jest.Mock).mockReturnValue(
        true,
      );
      (platformUtil.platformFirewallIsElevated as jest.Mock).mockReturnValue(
        true,
      );
      (platformUtil.platformFirewallAddUdpAllow as jest.Mock).mockResolvedValue(
        {
          ok: true,
          created: false,
        },
      );

      await service.tryApplyOnGameStart('/bin/factorio', 34197);
      expect(mockWebLog.appendFile).not.toHaveBeenCalled();
    });

    it('logs failure if firewall rule addition failed', async () => {
      (platformUtil.platformFirewallSupported as jest.Mock).mockReturnValue(
        true,
      );
      (platformUtil.platformFirewallIsElevated as jest.Mock).mockReturnValue(
        true,
      );
      (platformUtil.platformFirewallAddUdpAllow as jest.Mock).mockResolvedValue(
        {
          ok: false,
          detail: 'permission denied',
        },
      );

      await service.tryApplyOnGameStart('/bin/factorio', 34197);
      expect(mockWebLog.appendFile).toHaveBeenCalledWith(
        'Firewall rule failed: permission denied',
      );
    });
  });
});
