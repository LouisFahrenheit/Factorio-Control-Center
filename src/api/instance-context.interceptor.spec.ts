import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import type { Request } from 'express';
import { InstanceContextInterceptor } from './instance-context.interceptor';
import { SessionService } from '../auth/session.service';
import { InstancesService } from '../instances/instances.service';

describe('InstanceContextInterceptor', () => {
  let interceptor: InstanceContextInterceptor;
  let mockSessions: Partial<Record<keyof SessionService, jest.Mock>>;
  let mockInstances: Partial<Record<keyof InstancesService, jest.Mock>>;
  let mockCallHandler: CallHandler;

  const createMockContext = (
    path: string,
    authHeader?: string,
  ): ExecutionContext => {
    const req = {
      path,
      headers: authHeader ? { authorization: authHeader } : {},
    } as unknown as Request;

    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    mockSessions = {
      getSelectedInstanceId: jest.fn().mockReturnValue('inst-1'),
    };

    mockInstances = {
      getById: jest.fn().mockReturnValue({ id: 'inst-1' }),
      withInstance: jest
        .fn()
        .mockImplementation((_id: string, fn: () => unknown) => fn()),
    };

    mockCallHandler = {
      handle: jest.fn().mockReturnValue(of({ data: 'result' })),
    };

    interceptor = new InstanceContextInterceptor(
      mockSessions as unknown as SessionService,
      mockInstances as unknown as InstancesService,
    );
  });

  it('skips interceptor logic for paths in SKIP_PREFIXES', async () => {
    const ctx = createMockContext('/api/health');
    const obs = interceptor.intercept(ctx, mockCallHandler);
    const res: unknown = await lastValueFrom(obs);

    expect(res).toEqual({ data: 'result' });
    expect(mockSessions.getSelectedInstanceId).not.toHaveBeenCalled();
    expect(mockInstances.withInstance).not.toHaveBeenCalled();
  });

  it('calls next.handle() directly if request has no bearer token', async () => {
    const ctx = createMockContext('/api/server/start');
    const obs = interceptor.intercept(ctx, mockCallHandler);
    const res: unknown = await lastValueFrom(obs);

    expect(res).toEqual({ data: 'result' });
    expect(mockSessions.getSelectedInstanceId).not.toHaveBeenCalled();
    expect(mockInstances.withInstance).not.toHaveBeenCalled();
  });

  it('calls next.handle() directly if session has no selected instance', async () => {
    mockSessions.getSelectedInstanceId?.mockReturnValue(null);
    const ctx = createMockContext('/api/server/start', 'Bearer token123');
    const obs = interceptor.intercept(ctx, mockCallHandler);
    const res: unknown = await lastValueFrom(obs);

    expect(res).toEqual({ data: 'result' });
    expect(mockInstances.withInstance).not.toHaveBeenCalled();
  });

  it('executes handler within withInstance when valid instance is selected', async () => {
    const ctx = createMockContext('/api/server/start', 'Bearer token123');
    const obs = interceptor.intercept(ctx, mockCallHandler);
    const res: unknown = await lastValueFrom(obs);

    expect(res).toEqual({ data: 'result' });
    expect(mockInstances.withInstance).toHaveBeenCalledWith(
      'inst-1',
      expect.any(Function),
    );
  });
});
