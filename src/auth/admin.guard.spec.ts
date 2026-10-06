import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard, ADMIN_ACTOR_KEY } from './admin.guard';
import { AUTH_USER_KEY } from './auth.guard';
import { SessionUser } from '../common/types';

function createMockContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  let guard: AdminGuard;

  beforeEach(() => {
    guard = new AdminGuard();
  });

  it('allows access for an enabled administrator and sets ADMIN_ACTOR_KEY', () => {
    const adminUser: SessionUser = {
      username: 'masteradmin',
      role: 'administrator',
      tabs: ['control'],
      instance_ids: ['*'],
      enabled: true,
    };

    const req: Record<string, unknown> = {
      [AUTH_USER_KEY]: adminUser,
    };
    const ctx = createMockContext(req);

    const allowed = guard.canActivate(ctx);
    expect(allowed).toBe(true);
    expect(req[ADMIN_ACTOR_KEY]).toBe('masteradmin');
  });

  it('throws ForbiddenException when no user is attached to request', () => {
    const req: Record<string, unknown> = {};
    const ctx = createMockContext(req);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('admin_required');
    expect(req[ADMIN_ACTOR_KEY]).toBeUndefined();
  });

  it('throws ForbiddenException for moderator role', () => {
    const modUser: SessionUser = {
      username: 'moderator1',
      role: 'moderator',
      tabs: ['players'],
      instance_ids: [],
      enabled: true,
    };

    const req: Record<string, unknown> = {
      [AUTH_USER_KEY]: modUser,
    };
    const ctx = createMockContext(req);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('admin_required');
    expect(req[ADMIN_ACTOR_KEY]).toBeUndefined();
  });

  it('throws ForbiddenException for server_engineer role', () => {
    const engineerUser: SessionUser = {
      username: 'engineer1',
      role: 'server_engineer',
      tabs: ['control', 'mods'],
      instance_ids: [],
      enabled: true,
    };

    const req: Record<string, unknown> = {
      [AUTH_USER_KEY]: engineerUser,
    };
    const ctx = createMockContext(req);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('admin_required');
    expect(req[ADMIN_ACTOR_KEY]).toBeUndefined();
  });

  it('throws ForbiddenException for disabled administrator', () => {
    const disabledAdmin: SessionUser = {
      username: 'oldadmin',
      role: 'administrator',
      tabs: ['control'],
      instance_ids: ['*'],
      enabled: false,
    };

    const req: Record<string, unknown> = {
      [AUTH_USER_KEY]: disabledAdmin,
    };
    const ctx = createMockContext(req);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('admin_required');
    expect(req[ADMIN_ACTOR_KEY]).toBeUndefined();
  });
});
