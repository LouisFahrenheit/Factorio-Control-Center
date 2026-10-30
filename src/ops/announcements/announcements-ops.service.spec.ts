import { Test, TestingModule } from '@nestjs/testing';
import { existsSync } from 'fs';
import { join } from 'path';
import { AnnouncementsOpsService } from './announcements-ops.service';
import { InstancesService } from '../../instances/instances.service';
import { PathsService } from '../../config/paths.service';
import { readJsonFile, writeJsonFile } from '../../common/json-store';

jest.mock('fs', () => ({
  ...jest.requireActual<Record<string, unknown>>('fs'),
  existsSync: jest.fn(),
}));

jest.mock('../../common/json-store', () => ({
  readJsonFile: jest.fn(),
  writeJsonFile: jest.fn(),
}));

describe('AnnouncementsOpsService', () => {
  let service: AnnouncementsOpsService;
  let getSelectedIdMock: jest.MockedFunction<() => string | null>;
  let mockPaths: {
    announcementsPath: jest.MockedFunction<(iid: string) => string>;
    announcementsDir: string;
  };

  const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
  const mockReadJson = readJsonFile as jest.MockedFunction<typeof readJsonFile>;
  const mockWriteJson = writeJsonFile as jest.MockedFunction<
    typeof writeJsonFile
  >;

  beforeEach(async () => {
    jest.clearAllMocks();

    getSelectedIdMock = jest.fn(() => 'inst-1');
    const mockInstances = {
      getSelectedId: getSelectedIdMock,
    };
    const announcementsPath = jest.fn(
      (_iid: string) => '/path/to/inst-1/announcements.json',
    );
    mockPaths = {
      announcementsPath,
      announcementsDir: '/path/to/announcements',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementsOpsService,
        { provide: InstancesService, useValue: mockInstances },
        { provide: PathsService, useValue: mockPaths },
      ],
    }).compile();

    service = module.get<AnnouncementsOpsService>(AnnouncementsOpsService);
  });

  describe('read()', () => {
    it('returns error if no instance is selected', () => {
      getSelectedIdMock.mockReturnValue(null);
      const res = service.read();
      expect(res).toEqual({ ok: false, error: 'instance_not_found' });
    });

    it('returns empty list with missing flag if instance file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const res = service.read();
      expect(res.ok).toBe(true);
      expect(res.missing).toBe(true);
      expect(res.data).toEqual({
        version: 1,
        items: [],
      });
    });

    it('merges global announcements and local announcements with schedules', () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const pathStr = String(p);
        return (
          pathStr.includes('announcements.json') ||
          pathStr.includes('_global.json')
        );
      });

      mockReadJson.mockImplementation((p: string) => {
        if (p.includes('_global.json')) {
          return {
            items: [
              {
                id: 'global-1',
                title: 'Global Notice',
                body: 'Hello all servers',
                forAllServers: true,
              },
            ],
          };
        }
        return {
          version: 1,
          announceGlobalSchedules: {
            'global-1': {
              intervalHours: 3,
              autoRepeat: true,
            },
          },
          items: [
            {
              id: 'local-1',
              title: 'Server Notice',
              body: 'Welcome to Server 1',
              forAllServers: false,
            },
          ],
        };
      });

      const res = service.read();
      expect(res.ok).toBe(true);
      expect(res.missing).toBe(false);
      const data = res.data as { items: Array<Record<string, unknown>> };
      expect(data.items.length).toBe(2);

      const globalItem = data.items.find((x) => x.id === 'global-1');
      expect(globalItem).toMatchObject({
        id: 'global-1',
        title: 'Global Notice',
        forAllServers: true,
        intervalHours: 3,
        autoRepeat: true,
      });

      const localItem = data.items.find((x) => x.id === 'local-1');
      expect(localItem).toMatchObject({
        id: 'local-1',
        title: 'Server Notice',
        forAllServers: false,
      });
    });
  });

  describe('write()', () => {
    it('returns error if no instance is selected', () => {
      getSelectedIdMock.mockReturnValue(null);
      const res = service.write({});
      expect(res).toEqual({ ok: false, error: 'instance_not_found' });
    });

    it('splits global announcements and local announcements and writes to respective files', () => {
      const payload = {
        version: 1,
        selectedId: 'local-1',
        items: [
          {
            id: 'g-1',
            title: 'Global Alert',
            body: 'Restarting in 5m',
            forAllServers: true,
            autoRepeat: true,
            intervalHours: 12,
            lastAutoSentAt: 1234567,
          },
          {
            id: 'l-1',
            title: 'Local Alert',
            body: 'Map reset tomorrow',
            forAllServers: false,
            autoRepeat: false,
          },
          {
            id: '   ', // empty id should be skipped
            title: 'Invalid',
          },
        ],
      };

      const res = service.write(payload);
      expect(res).toEqual({ ok: true });

      expect(mockWriteJson).toHaveBeenCalledTimes(2);

      // Verify global file write
      expect(mockWriteJson).toHaveBeenCalledWith(
        join('/path/to/announcements', '_global.json'),
        {
          version: 1,
          items: [
            {
              id: 'g-1',
              title: 'Global Alert',
              body: 'Restarting in 5m',
              forAllServers: true,
            },
          ],
        },
      );

      // Verify instance file write
      expect(mockWriteJson).toHaveBeenCalledWith(
        '/path/to/inst-1/announcements.json',
        {
          version: 1,
          selectedId: 'local-1',
          announceGlobalSchedules: {
            'g-1': {
              autoRepeat: true,
              intervalHours: 12,
              lastAutoSentAt: 1234567,
              skipWhenNoPlayers: true,
            },
          },
          items: [
            {
              id: 'l-1',
              title: 'Local Alert',
              body: 'Map reset tomorrow',
              forAllServers: false,
              autoRepeat: false,
              intervalHours: 6,
              lastAutoSentAt: 0,
              skipWhenNoPlayers: true,
            },
          ],
        },
      );
    });
  });
});
