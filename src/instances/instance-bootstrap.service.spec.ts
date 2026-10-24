import { Test, TestingModule } from '@nestjs/testing';
import { FccConfigService } from '../config/fcc-config.service';
import { FactorioUpdateService } from '../ops/factorio-update/factorio-update.service';
import { InstancesService } from './instances.service';
import { InstanceBootstrapService } from './instance-bootstrap.service';
import { GameInstance } from './game-instance.entity';

describe('InstanceBootstrapService', () => {
  let service: InstanceBootstrapService;
  let mockConfig: { webPanel: Record<string, unknown> };
  let mockFactorioUpdate: { releases: jest.Mock };
  let mockInstances: {
    findExistingByServerPath: jest.Mock;
    add: jest.Mock;
  };

  beforeEach(async () => {
    mockConfig = {
      webPanel: {
        global_username: 'factorio_user',
        global_token: 'factorio_token',
      },
    };

    mockFactorioUpdate = {
      releases: jest.fn().mockResolvedValue({
        ok: true,
        releases: {
          stable: ['2.0.10', '2.0.9'],
          experimental: ['2.0.12', '2.0.11'],
        },
      }),
    };

    mockInstances = {
      findExistingByServerPath: jest.fn().mockReturnValue(null),
      add: jest.fn().mockResolvedValue({
        ok: true,
        item: { id: 'inst-bootstrapped-1' } as GameInstance,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstanceBootstrapService,
        { provide: FccConfigService, useValue: mockConfig },
        { provide: FactorioUpdateService, useValue: mockFactorioUpdate },
        { provide: InstancesService, useValue: mockInstances },
      ],
    }).compile();

    service = module.get<InstanceBootstrapService>(InstanceBootstrapService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('start validation', () => {
    it('should reject start if serverPath is missing or blank', () => {
      const res = service.start({ serverPath: '   ' });
      expect(res).toEqual({ ok: false, error: 'instance_path_required' });
    });

    it('should reject start if bootstrap is already running', () => {
      // Stub downloadAndExtract to stay pending
      jest
        .spyOn(
          service as unknown as { downloadAndExtract: () => Promise<void> },
          'downloadAndExtract',
        )
        .mockImplementation(() => new Promise(() => {}));

      const res1 = service.start({ serverPath: '/servers/srv1' });
      expect(res1).toEqual({ ok: true, started: true });

      const res2 = service.start({ serverPath: '/servers/srv2' });
      expect(res2).toEqual({ ok: false, error: 'instance_bootstrap_busy' });
    });

    it('should reject start if path already belongs to an existing instance', () => {
      mockInstances.findExistingByServerPath.mockReturnValue({
        id: 'existing-1',
        name: 'Existing Server',
        serverPath: '/servers/srv1',
      });

      const res = service.start({ serverPath: '/servers/srv1' });
      expect(res).toEqual({
        ok: false,
        error: 'instance_path_exists',
        errorArgs: ['Existing Server'],
      });
      expect(mockInstances.findExistingByServerPath).toHaveBeenCalledWith(
        '/servers/srv1',
      );
    });
  });

  describe('stop and status', () => {
    it('should return error if trying to stop when not running', () => {
      const res = service.stop();
      expect(res).toEqual({
        ok: false,
        error: 'instance_bootstrap_not_running',
      });
    });

    it('should mark stop_requested when stopping a running bootstrap', () => {
      jest
        .spyOn(
          service as unknown as { downloadAndExtract: () => Promise<void> },
          'downloadAndExtract',
        )
        .mockImplementation(() => new Promise(() => {}));

      service.start({ serverPath: '/servers/srv1' });
      const res = service.stop();
      expect(res).toEqual({ ok: true });

      const status = service.status();
      expect(status.ok).toBe(true);
      expect(status.stop_requested).toBe(true);
      expect(status.running).toBe(true);
    });

    it('should report idle status initially', () => {
      const st = service.status();
      expect(st).toEqual({
        ok: true,
        running: false,
        phase: 'idle',
        download_cur: 0,
        download_tot: 0,
        target_path: '',
        error: '',
        error_args: [],
        server_path: '',
        added_id: '',
        finished_at: 0,
        stop_requested: false,
      });
    });
  });

  describe('worker validations & options', () => {
    it('should fail worker if factorio credentials are missing', async () => {
      mockConfig.webPanel = { global_username: '', global_token: '' };

      service.start({ serverPath: '/servers/srv1' });
      // Wait for background worker promise
      await new Promise((r) => setTimeout(r, 20));

      const status = service.status();
      expect(status.running).toBe(false);
      expect(status.phase).toBe('error');
      expect(status.error).toBe('about_factorio_update_no_credentials');
    });

    it('should fail worker on Windows if build is headless', async () => {
      if (process.platform === 'win32') {
        service.start({
          serverPath: '/servers/srv1',
          packageBuild: 'headless',
        });
        await new Promise((r) => setTimeout(r, 20));

        const status = service.status();
        expect(status.phase).toBe('error');
        expect(status.error).toBe('instance_template_headless_windows');
      }
    });

    it('should fail worker if packageBuild is invalid', async () => {
      if (process.platform !== 'linux') {
        service.start({
          serverPath: '/servers/srv1',
          packageBuild: 'invalid_flavor',
        });
        await new Promise((r) => setTimeout(r, 20));

        const status = service.status();
        expect(status.phase).toBe('error');
        expect(status.error).toBe('instance_template_invalid_build');
      }
    });

    it('should fail worker if packageVersion format is invalid', async () => {
      service.start({
        serverPath: '/servers/srv1',
        packageBuild: process.platform === 'linux' ? 'headless' : 'alpha',
        packageVersion: '2.0-beta-invalid',
      });
      await new Promise((r) => setTimeout(r, 20));

      const status = service.status();
      expect(status.phase).toBe('error');
      expect(status.error).toBe('instance_template_invalid_version');
    });

    it('should resolve first stable version if packageVersion is latest and showExperimental is false', async () => {
      const version = await (
        service as unknown as {
          resolveDownloadVersion: (v: unknown, exp: boolean) => Promise<string>;
        }
      ).resolveDownloadVersion('latest', false);

      expect(mockFactorioUpdate.releases).toHaveBeenCalled();
      expect(version).toBe('2.0.10');
    });

    it('should return latest if showExperimental is true', async () => {
      const version = await (
        service as unknown as {
          resolveDownloadVersion: (v: unknown, exp: boolean) => Promise<string>;
        }
      ).resolveDownloadVersion('latest', true);

      expect(version).toBe('latest');
    });
  });

  describe('successful worker execution and registration', () => {
    it('should download, extract, initialize and auto-register instance successfully', async () => {
      jest
        .spyOn(
          service as unknown as { downloadAndExtract: () => Promise<void> },
          'downloadAndExtract',
        )
        .mockImplementation(() => {
          (
            service as unknown as { set: (s: Record<string, unknown>) => void }
          ).set({
            server_path: '/servers/srv1',
          });
          return Promise.resolve();
        });

      const initSpy = jest
        .spyOn(
          service as unknown as { initializeDownloadedServer: () => void },
          'initializeDownloadedServer',
        )
        .mockReturnValue();

      service.start({
        name: 'My New Server',
        serverPath: '/servers/srv1',
        ip: '0.0.0.0',
        port: '34197',
        rconPort: 27015,
        rconPassword: 'rcon_secret_password',
        autostartServer: true,
        autoEnterPanel: true,
        blockUpdates: false,
        experimentalUpdates: false,
      });

      await new Promise((r) => setTimeout(r, 20));

      expect(initSpy).toHaveBeenCalledWith('/servers/srv1');
      expect(mockInstances.add).toHaveBeenCalledWith({
        name: 'My New Server',
        serverPath: '/servers/srv1',
        ip: '0.0.0.0',
        port: '34197',
        rconPort: 27015,
        rconPassword: 'rcon_secret_password',
        autostartServer: true,
        autoEnterPanel: true,
        blockUpdates: false,
        experimentalUpdates: false,
        autoFixPortsOnConflict: true,
      });

      const st = service.status();
      expect(st.running).toBe(false);
      expect(st.phase).toBe('done');
      expect(st.added_id).toBe('inst-bootstrapped-1');
      expect(st.error).toBe('');
    });

    it('should handle cancellation cleanly and set phase to cancelled', async () => {
      jest
        .spyOn(
          service as unknown as { downloadAndExtract: () => Promise<void> },
          'downloadAndExtract',
        )
        .mockImplementation(() => {
          return Promise.reject(new Error('cancelled'));
        });

      service.start({ serverPath: '/servers/srv1' });
      await new Promise((r) => setTimeout(r, 20));

      const st = service.status();
      expect(st.running).toBe(false);
      expect(st.phase).toBe('cancelled');
      expect(st.error).toBe('');
    });

    it('should handle instance_path_exists thrown from auto-register', async () => {
      jest
        .spyOn(
          service as unknown as { downloadAndExtract: () => Promise<void> },
          'downloadAndExtract',
        )
        .mockImplementation(() => {
          (
            service as unknown as { set: (s: Record<string, unknown>) => void }
          ).set({
            server_path: '/servers/srv1',
          });
          return Promise.resolve();
        });
      jest
        .spyOn(
          service as unknown as { initializeDownloadedServer: () => void },
          'initializeDownloadedServer',
        )
        .mockReturnValue();

      mockInstances.add.mockResolvedValue({
        ok: false,
        error: 'instance_path_exists',
        errorArgs: ['Duplicate Name'],
      });

      service.start({ serverPath: '/servers/srv1' });
      await new Promise((r) => setTimeout(r, 20));

      const st = service.status();
      expect(st.running).toBe(false);
      expect(st.phase).toBe('error');
      expect(st.error).toBe('instance_path_exists');
      expect(st.error_args).toEqual(['Duplicate Name']);
    });
  });
});
