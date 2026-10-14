import { InternalServerErrorException } from '@nestjs/common';
import { ApiBridgeService } from './api-bridge.service';
import { DispatchService } from '../ops/dispatch.service';

describe('ApiBridgeService', () => {
  let service: ApiBridgeService;
  let mockDispatch: Partial<Record<keyof DispatchService, jest.Mock>>;

  beforeEach(() => {
    mockDispatch = {
      dispatch: jest.fn().mockResolvedValue({ ok: true, result: 'done' }),
      dispatchWithInstance: jest
        .fn()
        .mockResolvedValue({ ok: true, instanceResult: 'done' }),
    };

    service = new ApiBridgeService(mockDispatch as unknown as DispatchService);
  });

  describe('submit', () => {
    it('calls dispatch without instanceId when instanceId is omitted', async () => {
      const res = await service.submit('get_status', { foo: 'bar' });

      expect(mockDispatch.dispatch).toHaveBeenCalledWith('get_status', {
        foo: 'bar',
      });
      expect(mockDispatch.dispatchWithInstance).not.toHaveBeenCalled();
      expect(res).toEqual({ ok: true, result: 'done' });
    });

    it('calls dispatchWithInstance when instanceId is provided', async () => {
      const res = await service.submit(
        'server_start',
        { save: 'world.zip' },
        'inst-42',
      );

      expect(mockDispatch.dispatchWithInstance).toHaveBeenCalledWith(
        'inst-42',
        'server_start',
        { save: 'world.zip' },
      );
      expect(mockDispatch.dispatch).not.toHaveBeenCalled();
      expect(res).toEqual({ ok: true, instanceResult: 'done' });
    });

    it('returns { ok: true } fallback if dispatch returns null or undefined', async () => {
      mockDispatch.dispatch?.mockResolvedValue(null);
      const res = await service.submit('noop');
      expect(res).toEqual({ ok: true });
    });

    it('wraps dispatch errors into InternalServerErrorException', async () => {
      mockDispatch.dispatch?.mockRejectedValue(new Error('RCON timed out'));

      await expect(service.submit('failing_op')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('webActor', () => {
    it('returns trimmed username or empty string', () => {
      expect(service.webActor({ username: '  alice  ' })).toBe('alice');
      expect(service.webActor({ username: '' })).toBe('');
      expect(service.webActor(undefined)).toBe('');
    });
  });
});
