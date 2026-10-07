import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard, AUTH_USER_KEY } from './auth.guard';
import { SessionService } from './session.service';
import { UsersService } from './users.service';
import { FccConfigService } from '../config/fcc-config.service';
import { AUTH_TOKEN_KEY } from './auth.util';

describe('AuthGuard', () => {
  interface MockRequest {
    path?: string;
    headers?: Record<string, string>;
    [AUTH_TOKEN_KEY]?: string;
    [AUTH_USER_KEY]?: {
      username: string;
      role: string;
      tabs?: string[];
      instance_ids?: string[];
      enabled?: boolean;
    };
  }

  let guard: AuthGuard;
  let mockSessions: Partial<SessionService>;
  let mockConfig: {
    webPanel: {
      api_token: string;
    };
  };
  let mockUsers: Partial<UsersService>;
  let mockReflector: Partial<Reflector>;

  const createMockContext = (
    req: MockRequest,
    handler = () => {},
    controllerClass = class {},
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
      getHandler: () => handler,
      getClass: () => controllerClass,
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    mockSessions = {
      resolve: jest.fn(),
      getSelectedInstanceId: jest.fn().mockReturnValue(''),
    };

    mockConfig = {
      webPanel: {
        api_token: 'secret-api-token-12345',
      },
    };

    mockUsers = {
      cleanTabs: jest.fn().mockImplementation((tabs: string[]) => tabs || []),
    };

    mockReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };

    guard = new AuthGuard(
      mockSessions as SessionService,
      mockConfig as unknown as FccConfigService,
      mockUsers as UsersService,
      mockReflector as Reflector,
    );
  });

  describe('public routes', () => {
    it('allows access without credentials when @Public() metadata is present', async () => {
      mockReflector.getAllAndOverride = jest.fn().mockReturnValue(true);

      const ctx = createMockContext({ path: '/api/some-custom-public-route' });
      const allowed = await guard.canActivate(ctx);

      expect(allowed).toBe(true);
      expect(mockSessions.resolve).not.toHaveBeenCalled();
    });

    it('allows access to hardcoded fallback public endpoints without token', async () => {
      const publicPaths = [
        '/api/health',
        '/api/locale-bootstrap',
        '/api/auth/login',
        '/api/auth/2fa/verify',
        '/api/auth/setup-status',
        '/api/auth/setup-admin',
      ];

      for (const path of publicPaths) {
        const ctx = createMockContext({ path });
        const allowed = await guard.canActivate(ctx);
        expect(allowed).toBe(true);
      }
      expect(mockSessions.resolve).not.toHaveBeenCalled();
    });
  });

  describe('missing token', () => {
    it('throws UnauthorizedException when authorization header is missing', async () => {
      const ctx = createMockContext({ path: '/api/servers', headers: {} });

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Missing bearer token',
      );
    });

    it('throws UnauthorizedException when authorization header does not start with Bearer', async () => {
      const ctx = createMockContext({
        path: '/api/servers',
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('session token authentication', () => {
    it('authenticates user with valid session token and attaches user to request', async () => {
      const sessionUser = {
        username: 'alice',
        role: 'administrator',
        tabs: ['control', 'servers'],
        instance_ids: ['*'],
        enabled: true,
      };
      (mockSessions.resolve as jest.Mock).mockResolvedValue(sessionUser);

      const req: MockRequest = {
        path: '/api/servers',
        headers: { authorization: 'Bearer valid-token-123' },
      };
      const ctx = createMockContext(req);

      const allowed = await guard.canActivate(ctx);

      expect(allowed).toBe(true);
      expect(req[AUTH_TOKEN_KEY]).toBe('valid-token-123');
      expect(req[AUTH_USER_KEY]).toEqual(sessionUser);
    });

    it('throws ForbiddenException when session token cannot be resolved and no matching api_token', async () => {
      (mockSessions.resolve as jest.Mock).mockResolvedValue(null);

      const req = {
        path: '/api/servers',
        headers: { authorization: 'Bearer invalid-token' },
      };
      const ctx = createMockContext(req);

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid token');
    });

    it('throws ForbiddenException when user account is disabled', async () => {
      (mockSessions.resolve as jest.Mock).mockResolvedValue({
        username: 'banned_user',
        role: 'moderator',
        tabs: ['control'],
        instance_ids: ['*'],
        enabled: false,
      });

      const req = {
        path: '/api/servers',
        headers: { authorization: 'Bearer disabled-user-token' },
      };
      const ctx = createMockContext(req);

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(ctx)).rejects.toThrow('User disabled');
    });
  });

  describe('API_TOKEN authentication', () => {
    it('authenticates with global API_TOKEN and creates synthetic administrator', async () => {
      (mockSessions.resolve as jest.Mock).mockResolvedValue(null);

      const req: MockRequest = {
        path: '/api/servers',
        headers: { authorization: 'Bearer secret-api-token-12345' },
      };
      const ctx = createMockContext(req);

      const allowed = await guard.canActivate(ctx);

      expect(allowed).toBe(true);
      expect(req[AUTH_USER_KEY]).toBeDefined();
      expect(req[AUTH_USER_KEY]?.username).toBe('api-token');
      expect(req[AUTH_USER_KEY]?.role).toBe('administrator');
      expect(req[AUTH_USER_KEY]?.instance_ids).toEqual(['*']);
    });

    it('rejects incorrect API_TOKEN with ForbiddenException', async () => {
      (mockSessions.resolve as jest.Mock).mockResolvedValue(null);

      const req = {
        path: '/api/servers',
        headers: { authorization: 'Bearer wrong-api-token-value' },
      };
      const ctx = createMockContext(req);

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid token');
    });
  });

  describe('tab and instance permissions', () => {
    it('throws ForbiddenException when user does not have permission for the endpoint tab', async () => {
      // User only has 'players' tab
      (mockSessions.resolve as jest.Mock).mockResolvedValue({
        username: 'bob',
        role: 'moderator',
        tabs: ['players'],
        instance_ids: ['*'],
        enabled: true,
      });
      (mockUsers.cleanTabs as jest.Mock).mockReturnValue(['players']);

      // /api/mods requires 'mods' tab
      const req = {
        path: '/api/mods/install',
        headers: { authorization: 'Bearer bob-token' },
      };
      const ctx = createMockContext(req);

      await expect(guard.canActivate(ctx)).rejects.toThrow('forbidden_tab');
    });

    it('throws ForbiddenException when user has restricted instance access and target instance is not allowed', async () => {
      (mockSessions.resolve as jest.Mock).mockResolvedValue({
        username: 'engineer',
        role: 'server_engineer',
        tabs: ['control'],
        instance_ids: ['instance-alpha'],
        enabled: true,
      });
      (mockUsers.cleanTabs as jest.Mock).mockReturnValue(['control']);
      (mockSessions.getSelectedInstanceId as jest.Mock).mockReturnValue(
        'instance-beta',
      );

      const req = {
        path: '/api/server/start',
        headers: { authorization: 'Bearer engineer-token' },
      };
      const ctx = createMockContext(req);

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'forbidden_instance',
      );
    });

    it('allows access when user has specific instance in instance_ids', async () => {
      (mockSessions.resolve as jest.Mock).mockResolvedValue({
        username: 'engineer',
        role: 'server_engineer',
        tabs: ['control'],
        instance_ids: ['instance-alpha'],
        enabled: true,
      });
      (mockUsers.cleanTabs as jest.Mock).mockReturnValue(['control']);
      (mockSessions.getSelectedInstanceId as jest.Mock).mockReturnValue(
        'instance-alpha',
      );

      const req = {
        path: '/api/server/start',
        headers: { authorization: 'Bearer engineer-token' },
      };
      const ctx = createMockContext(req);

      const allowed = await guard.canActivate(ctx);
      expect(allowed).toBe(true);
    });
  });
});
