import { SavesController } from './saves.controller';
import { ApiBridgeService } from '../api-bridge.service';
import { AUTH_USER_KEY } from '../../auth/auth.guard';
import { SessionUser } from '../../common/types';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('SavesController', () => {
  let controller: SavesController;
  let bridge: {
    submit: jest.Mock;
    webActor: jest.Mock;
  };
  let tempDir: string;

  const dummyUser: SessionUser = {
    username: 'admin',
    role: 'administrator',
    tabs: ['instances'],
    instance_ids: ['*'],
    enabled: true,
  };

  const mockRequest = (
    user: SessionUser = dummyUser,
    headers: Record<string, string> = {},
  ): Request =>
    ({
      [AUTH_USER_KEY]: user,
      headers,
    }) as unknown as Request;

  const mockResponse = () => {
    const status = jest.fn();
    const json = jest.fn();
    const download = jest.fn();
    const res = {
      status,
      json,
      download,
    };
    status.mockReturnValue(res);
    json.mockReturnValue(res);
    download.mockReturnValue(res);
    return { res: res as unknown as Response, status, json, download };
  };

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-saves-ctrl-test-'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  beforeEach(() => {
    bridge = {
      submit: jest.fn().mockResolvedValue({ ok: true }),
      webActor: jest.fn().mockReturnValue('web:admin'),
    };

    controller = new SavesController(bridge as unknown as ApiBridgeService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('saves', () => {
    it('dispatches list_saves with instance_id', async () => {
      const res = await controller.saves('inst-1');
      expect(bridge.submit).toHaveBeenCalledWith('list_saves', {}, 'inst-1');
      expect(res).toEqual({ ok: true });
    });
  });

  describe('saveSetLaunch', () => {
    it('dispatches set_launch_save with name and actor', async () => {
      const res = await controller.saveSetLaunch(
        { name: 'current.zip' },
        mockRequest(),
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'set_launch_save',
        {
          name: 'current.zip',
          actor: 'web:admin',
        },
        'inst-1',
      );
      expect(res).toEqual({ ok: true });
    });
  });

  describe('saveUpload', () => {
    it('throws BadRequestException if file buffer is missing', async () => {
      await expect(
        controller.saveUpload(
          null as unknown as Express.Multer.File,
          mockRequest(),
        ),
      ).rejects.toThrow();
    });

    it('uploads file and cleans up temp file', async () => {
      const fakeFile = {
        buffer: Buffer.from('PK-TEST-CONTENT'),
        originalname: 'my-save.zip',
      } as Express.Multer.File;

      const res = await controller.saveUpload(
        fakeFile,
        mockRequest(),
        'custom-name.zip',
        'inst-1',
      );

      expect(bridge.submit).toHaveBeenCalledTimes(1);
      const call = bridge.submit.mock.calls[0] as unknown as [
        string,
        { name: string; actor: string; tmp_path: string },
        string,
      ];
      expect(call[0]).toBe('upload_save_archive');
      expect(call[1].name).toBe('custom-name.zip');
      expect(call[1].actor).toBe('web:admin');
      expect(call[1].tmp_path.includes('fcc-save')).toBe(true);
      expect(call[2]).toBe('inst-1');
      expect(res).toEqual({ ok: true });
    });
  });

  describe('saveDownload', () => {
    it('returns 404 when file does not exist', async () => {
      bridge.submit.mockResolvedValue({
        ok: true,
        path: '/non/existent/file.zip',
        name: 'file.zip',
      });
      const { res, status, json } = mockResponse();
      await controller.saveDownload('file', res);
      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ ok: false, error: 'not_found' });
    });

    it('downloads file when path exists', async () => {
      const testFile = path.join(tempDir, 'save1.zip');
      fs.writeFileSync(testFile, 'dummy content');
      bridge.submit.mockResolvedValue({
        ok: true,
        path: testFile,
        name: 'save1.zip',
      });
      const { res, download } = mockResponse();
      await controller.saveDownload('save1', res);
      expect(download).toHaveBeenCalledWith(testFile, 'save1.zip');
    });
  });

  describe('saveInspect', () => {
    it('inspects save with name and ui_lang', async () => {
      const res = await controller.saveInspect(
        'save1',
        mockRequest(dummyUser, { 'x-fcc-ui-lang': 'ru' }),
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'inspect_save',
        { name: 'save1', ui_lang: 'ru' },
        'inst-1',
      );
      expect(res).toEqual({ ok: true });
    });
  });

  describe('saveRename', () => {
    it('renames save', async () => {
      const res = await controller.saveRename(
        'old.zip',
        { new_name: 'new.zip' },
        mockRequest(),
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'rename_save',
        {
          name: 'old.zip',
          new_name: 'new.zip',
          actor: 'web:admin',
        },
        'inst-1',
      );
      expect(res).toEqual({ ok: true });
    });
  });

  describe('saveDuplicate', () => {
    it('duplicates save', async () => {
      const res = await controller.saveDuplicate(
        'save1',
        mockRequest(),
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'duplicate_save',
        {
          name: 'save1',
          actor: 'web:admin',
        },
        'inst-1',
      );
      expect(res).toEqual({ ok: true });
    });
  });

  describe('saveTransfer', () => {
    it('transfers save to another instance', async () => {
      const res = await controller.saveTransfer(
        'save1',
        { target_instance_id: 'inst-2', mode: 'copy', overwrite: true },
        mockRequest(),
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'transfer_save',
        {
          name: 'save1',
          target_instance_id: 'inst-2',
          mode: 'copy',
          target_name: '',
          overwrite: true,
          actor: 'web:admin',
        },
        'inst-1',
      );
      expect(res).toEqual({ ok: true });
    });
  });

  describe('saveDelete', () => {
    it('deletes save', async () => {
      const res = await controller.saveDelete('save1', mockRequest(), 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'delete_save',
        {
          name: 'save1',
          actor: 'web:admin',
        },
        'inst-1',
      );
      expect(res).toEqual({ ok: true });
    });
  });
});
