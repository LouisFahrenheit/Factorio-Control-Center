import type { Request } from 'express';
import { PlayersController } from './players.controller';
import { ApiBridgeService } from '../api-bridge.service';
import { AUTH_USER_KEY } from '../../auth/auth.guard';
import { SessionUser } from '../../common/types';

describe('PlayersController', () => {
  let controller: PlayersController;
  let mockBridge: {
    submit: jest.Mock<
      Promise<Record<string, unknown>>,
      [string, Record<string, unknown>?, string?]
    >;
    webActor: jest.Mock<string, [{ username?: string }?]>;
  };

  const createMockReq = (username = 'alice'): Request =>
    ({
      [AUTH_USER_KEY]: {
        username,
        role: 'administrator',
        tabs: ['instances'],
        instance_ids: ['*'],
        enabled: true,
      } as SessionUser,
    }) as unknown as Request;

  beforeEach(() => {
    mockBridge = {
      submit: jest
        .fn<
          Promise<Record<string, unknown>>,
          [string, Record<string, unknown>?, string?]
        >()
        .mockResolvedValue({ ok: true }),
      webActor: jest
        .fn<string, [{ username?: string }?]>()
        .mockImplementation((u?: { username?: string }) => u?.username || ''),
    };

    controller = new PlayersController(
      mockBridge as unknown as ApiBridgeService,
    );
  });

  describe('player summary and files', () => {
    it('playersSummary dispatches players_summary', async () => {
      await controller.playersSummary();
      expect(mockBridge.submit).toHaveBeenCalledWith('players_summary');
    });

    it('adminList and adminListPut dispatch admin list operations', async () => {
      await controller.adminList();
      expect(mockBridge.submit).toHaveBeenCalledWith('read_admin_list');

      await controller.adminListPut(['alice', 'bob']);
      expect(mockBridge.submit).toHaveBeenCalledWith('write_admin_list', {
        data: ['alice', 'bob'],
      });
    });

    it('banList dispatches read_ban_list', async () => {
      await controller.banList();
      expect(mockBridge.submit).toHaveBeenCalledWith('read_ban_list');
    });
  });

  describe('bans operations', () => {
    it('bansSync dispatches sync_bans', async () => {
      await controller.bansSync();
      expect(mockBridge.submit).toHaveBeenCalledWith('sync_bans');
    });

    it('ban dispatches ban_player with actor', async () => {
      const req = createMockReq('alice');
      await controller.ban({ username: 'griefer', reason: 'griefing' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('ban_player', {
        username: 'griefer',
        reason: 'griefing',
        actor: 'alice',
      });
    });

    it('unban dispatches unban_player with actor', async () => {
      const req = createMockReq('alice');
      await controller.unban({ username: 'griefer' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('unban_player', {
        username: 'griefer',
        actor: 'alice',
      });
    });
  });

  describe('moderation operations', () => {
    it('mute, unmute, kick, and purge dispatch with actor', async () => {
      const req = createMockReq('alice');

      await controller.mute({ username: 'spammer' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('mute_player', {
        username: 'spammer',
        actor: 'alice',
      });

      await controller.unmute({ username: 'spammer' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('unmute_player', {
        username: 'spammer',
        actor: 'alice',
      });

      await controller.kick({ username: 'afk_player', reason: 'afk' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('kick_player', {
        username: 'afk_player',
        reason: 'afk',
        actor: 'alice',
      });

      await controller.purge({ username: 'spammer' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('purge_player', {
        username: 'spammer',
        actor: 'alice',
      });
    });
  });

  describe('whitelist operations', () => {
    it('wlAdd, wlRemove, and wlClear dispatch with actor', async () => {
      const req = createMockReq('alice');

      await controller.wlAdd({ username: 'friend' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('whitelist_add', {
        username: 'friend',
        actor: 'alice',
      });

      await controller.wlRemove({ username: 'untrusted' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('whitelist_remove', {
        username: 'untrusted',
        actor: 'alice',
      });

      await controller.wlClear(req);
      expect(mockBridge.submit).toHaveBeenCalledWith('whitelist_clear', {
        actor: 'alice',
      });
    });
  });
});
