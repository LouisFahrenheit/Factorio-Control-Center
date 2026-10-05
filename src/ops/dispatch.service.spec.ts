import { DispatchService } from './dispatch.service';
import { InstancesService } from '../instances/instances.service';
import { InstanceSummaryService } from '../instances/instance-summary.service';
import { InstanceBootstrapService } from '../instances/instance-bootstrap.service';
import { ServerOpsService } from './server/server-ops.service';
import { SavesOpsService } from './saves/saves-ops.service';
import { FilesOpsService } from './files/files-ops.service';
import { ModSettingsSchemaService } from './files/mod-settings-schema.service';
import { PlayersOpsService } from './players/players-ops.service';
import { ModsOpsService } from './mods/mods-ops.service';
import { ModpacksOpsService } from './modpacks/modpacks-ops.service';
import { MapPresetsOpsService } from './map-presets/map-presets-ops.service';
import { FactorioUpdateService } from './factorio-update/factorio-update.service';
import { AnnouncementsOpsService } from './announcements/announcements-ops.service';
import { CommandsCatalogService } from './commands-catalog.service';
import { LocaleService } from '../locale/locale.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { AuditLogService } from '../maintenance/audit-log.service';
import { WebPanelEventLogService } from '../logging/web-panel-event-log.service';
import { InstanceHistoryService } from './instance-history.service';
import { ProgramOpsService } from './program/program-ops.service';

describe('DispatchService', () => {
  let service: DispatchService;
  let mockInstances: Partial<InstancesService>;
  let mockInstanceSummary: Partial<InstanceSummaryService>;
  let mockInstanceBootstrap: Partial<InstanceBootstrapService>;
  let mockServer: Partial<ServerOpsService>;
  let mockSaves: Partial<SavesOpsService>;
  let mockFiles: Partial<FilesOpsService>;
  let mockModSettingsSchema: Partial<ModSettingsSchemaService>;
  let mockPlayers: Partial<PlayersOpsService>;
  let mockMods: Partial<ModsOpsService>;
  let mockModpacks: Partial<ModpacksOpsService>;
  let mockMapPresets: Partial<MapPresetsOpsService>;
  let mockFactorioUpdate: Partial<FactorioUpdateService>;
  let mockAnnouncements: Partial<AnnouncementsOpsService>;
  let mockProgram: Partial<ProgramOpsService>;
  let mockCommands: Partial<CommandsCatalogService>;
  let mockLocale: Partial<LocaleService>;
  let mockMaintenance: Partial<MaintenanceService>;
  let mockAuditLog: Partial<AuditLogService>;
  let mockWebEventLog: Partial<WebPanelEventLogService>;
  let mockInstanceHistory: Partial<InstanceHistoryService>;

  beforeEach(() => {
    mockInstances = {
      getSelected: jest
        .fn()
        .mockReturnValue({ id: 'inst-1', name: 'Server 1' }),
      getSelectedId: jest.fn().mockReturnValue('inst-1'),
      add: jest.fn().mockResolvedValue({ ok: true, id: 'inst-2' }),
      update: jest.fn().mockResolvedValue({ ok: true }),
      clone: jest.fn().mockResolvedValue({ ok: true, id: 'inst-clone' }),
      remove: jest.fn().mockResolvedValue({ ok: true }),
      select: jest.fn().mockResolvedValue({ ok: true }),
    };

    mockInstanceSummary = {
      list: jest
        .fn()
        .mockReturnValue({ instances: [{ id: 'inst-1', name: 'Server 1' }] }),
    };

    mockInstanceBootstrap = {
      start: jest.fn().mockResolvedValue({ ok: true }),
      status: jest.fn().mockReturnValue({ status: 'idle' }),
    };

    mockServer = {
      start: jest.fn().mockResolvedValue({ ok: true }),
      stop: jest.fn().mockResolvedValue({ ok: true }),
      kill: jest.fn().mockReturnValue({ ok: true }),
      restart: jest.fn().mockResolvedValue({ ok: true }),
    };

    mockSaves = {
      list: jest.fn().mockResolvedValue({ saves: [] }),
      delete: jest.fn().mockResolvedValue({ ok: true }),
      rename: jest.fn().mockResolvedValue({ ok: true }),
    };

    mockFiles = {};
    mockModSettingsSchema = {
      invalidateInstance: jest.fn(),
    };

    mockPlayers = {
      ban: jest.fn().mockResolvedValue({ ok: true }),
      unban: jest.fn().mockResolvedValue({ ok: true }),
      kick: jest.fn().mockResolvedValue({ ok: true }),
      whitelistAdd: jest.fn().mockResolvedValue({ ok: true }),
      whitelistRemove: jest.fn().mockResolvedValue({ ok: true }),
    };

    mockMods = {
      list: jest.fn().mockResolvedValue({ mods: [] }),
      setEnabled: jest.fn().mockResolvedValue({ ok: true }),
    };

    mockModpacks = {
      list: jest.fn().mockReturnValue({ modpacks: [] }),
    };

    mockMapPresets = {
      list: jest.fn().mockReturnValue({ presets: [] }),
    };

    mockFactorioUpdate = {};
    mockAnnouncements = {
      read: jest.fn().mockReturnValue({ announcements: [] }),
      write: jest.fn().mockReturnValue({ ok: true }),
    };

    mockProgram = {
      get: jest.fn().mockReturnValue({ version: '1.1.3' }),
      set: jest.fn().mockReturnValue({ ok: true }),
    };

    mockCommands = {
      read: jest.fn().mockReturnValue({ ok: true, data: [] }),
    };

    mockLocale = {};
    mockMaintenance = {
      hasPendingManual: jest.fn().mockReturnValue(false),
      resumeManualWhenRunning: jest.fn(),
    };

    mockAuditLog = {
      record: jest.fn(),
    };

    mockWebEventLog = {
      logDispatchOp: jest.fn(),
    };

    mockInstanceHistory = {
      recordFromDispatch: jest.fn(),
    };

    service = new DispatchService(
      mockInstances as InstancesService,
      mockInstanceSummary as InstanceSummaryService,
      mockInstanceBootstrap as InstanceBootstrapService,
      mockServer as ServerOpsService,
      mockSaves as SavesOpsService,
      mockFiles as FilesOpsService,
      mockModSettingsSchema as ModSettingsSchemaService,
      mockPlayers as PlayersOpsService,
      mockMods as ModsOpsService,
      mockModpacks as ModpacksOpsService,
      mockMapPresets as MapPresetsOpsService,
      mockFactorioUpdate as FactorioUpdateService,
      mockAnnouncements as AnnouncementsOpsService,
      mockProgram as ProgramOpsService,
      mockCommands as CommandsCatalogService,
      mockLocale as LocaleService,
      mockMaintenance as MaintenanceService,
      mockAuditLog as AuditLogService,
      mockWebEventLog as WebPanelEventLogService,
      mockInstanceHistory as InstanceHistoryService,
    );
  });

  describe('routing operations', () => {
    it('should route instances_list to instanceSummary.list', async () => {
      const res = await service.dispatch('instances_list');
      expect(mockInstanceSummary.list).toHaveBeenCalled();
      expect(res.instances).toBeDefined();
    });

    it('should route start_server to server.start and record history/logs', async () => {
      const res = await service.dispatch('start_server', { actor: 'Admin' });
      expect(mockServer.start).toHaveBeenCalled();
      expect(res.ok).toBe(true);
      expect(mockWebEventLog.logDispatchOp).toHaveBeenCalledWith(
        'start_server',
        { actor: 'Admin' },
        { ok: true },
      );
      expect(mockInstanceHistory.recordFromDispatch).toHaveBeenCalled();
    });

    it('should route stop_server to server.stop', async () => {
      const res = await service.dispatch('stop_server', { actor: 'Admin' });
      expect(mockServer.stop).toHaveBeenCalled();
      expect(res.ok).toBe(true);
    });

    it('should route list_saves to saves.list', async () => {
      const res = await service.dispatch('list_saves');
      expect(mockSaves.list).toHaveBeenCalled();
      expect(res.saves).toBeDefined();
    });

    it('should route ban_player to players.ban', async () => {
      await service.dispatch('ban_player', {
        player: 'BadActor',
        reason: 'Cheating',
        actor: 'Admin',
      });
      expect(mockPlayers.ban).toHaveBeenCalledWith(
        'BadActor',
        'Cheating',
        'Admin',
      );
    });

    it('should route unban_player to players.unban', async () => {
      await service.dispatch('unban_player', {
        player: 'GoodActor',
        actor: 'Admin',
      });
      expect(mockPlayers.unban).toHaveBeenCalledWith('GoodActor', 'Admin');
    });

    it('should return error for unknown operation', async () => {
      const res = await service.dispatch('non_existent_op');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('unknown web op: non_existent_op');
    });
  });

  describe('maintenance internal flag', () => {
    it('should skip audit and web event logging if _maintenance_internal is true', async () => {
      await service.dispatch('start_server', {
        save: 'world.zip',
        _maintenance_internal: true,
      });

      expect(mockServer.start).toHaveBeenCalled();
      expect(mockAuditLog.record).not.toHaveBeenCalled();
      expect(mockWebEventLog.logDispatchOp).not.toHaveBeenCalled();
      expect(mockInstanceHistory.recordFromDispatch).not.toHaveBeenCalled();
    });
  });

  describe('instances_remove cache invalidation', () => {
    it('should invalidate modSettingsSchema when removing instance', async () => {
      await service.dispatch('instances_remove', {
        id: 'inst-1',
        deleteFromDisk: false,
      });
      expect(mockInstances.remove).toHaveBeenCalledWith('inst-1', {
        deleteFromDisk: false,
        deleteData: false,
      });
      expect(mockModSettingsSchema.invalidateInstance).toHaveBeenCalledWith(
        'inst-1',
      );
    });
  });
});
