import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import {
  ENDPOINT_TAB_MAP,
  ENDPOINT_TAB_ANY,
  ALL_TABS,
} from '../constants/fcc.constants';
import { FccConfigService } from '../config/fcc-config.service';
import { SessionService } from './session.service';
import { UsersService } from './users.service';
import { AUTH_TOKEN_KEY, extractBearerToken } from './auth.util';
import { IS_PUBLIC_KEY } from './public.decorator';

export const AUTH_USER_KEY = 'fccUser';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly config: FccConfigService,
    private readonly users: UsersService,
    @Optional() private readonly reflector?: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(
        IS_PUBLIC_KEY,
        [ctx.getHandler(), ctx.getClass()],
      );
      if (isPublic) {
        return true;
      }
    }

    const req = ctx.switchToHttp().getRequest<Request>();
    const path = req.path || '';
    if (
      path === '/api/health' ||
      path === '/api/locale-bootstrap' ||
      path.startsWith('/api/auth/login') ||
      path === '/api/auth/2fa/verify' ||
      path === '/api/auth/setup-status' ||
      path === '/api/auth/setup-admin'
    ) {
      return true;
    }
    const incoming = extractBearerToken(req.headers.authorization);
    if (!incoming) throw new UnauthorizedException('Missing bearer token');
    let user = await this.sessions.resolve(incoming);
    const expected = (this.config.webPanel.api_token || '').trim();
    if (!user && expected) {
      const a = Buffer.from(incoming);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) {
        user = {
          username: 'api-token',
          role: 'administrator',
          tabs: [...ALL_TABS],
          instance_ids: ['*'],
          enabled: true,
        };
      }
    }
    if (!user) throw new ForbiddenException('Invalid token');
    if (!user.enabled) throw new ForbiddenException('User disabled');
    const tabs = this.users.cleanTabs(user.tabs, user.role);
    const allowedTabs = this.pathAllowedTabs(path);
    if (allowedTabs?.length && !allowedTabs.some((tab) => tabs.includes(tab)))
      throw new ForbiddenException('forbidden_tab');
    if (!this.skipInstanceCheck(path)) {
      const cur = this.sessions.getSelectedInstanceId(incoming);
      if (
        cur &&
        !user.instance_ids.includes('*') &&
        !user.instance_ids.includes(cur)
      ) {
        throw new ForbiddenException('forbidden_instance');
      }

      if (!user.instance_ids.includes('*')) {
        const query = (
          req.query && typeof req.query === 'object' ? req.query : undefined
        ) as Record<string, unknown> | undefined;
        const body = (
          req.body && typeof req.body === 'object' ? req.body : undefined
        ) as Record<string, unknown> | undefined;

        const targetKeys = [
          'instance_id',
          'target_instance_id',
          'target_server_id',
        ] as const;

        for (const key of targetKeys) {
          if (query && key in query) {
            this.validateInstanceAccess(query[key], user.instance_ids);
          }
          if (body && key in body) {
            this.validateInstanceAccess(body[key], user.instance_ids);
          }
        }
      }
    }
    user.tabs = tabs;
    (
      req as Request & {
        [AUTH_TOKEN_KEY]: string;
        [AUTH_USER_KEY]: typeof user;
      }
    )[AUTH_TOKEN_KEY] = incoming;
    (req as Request & { [AUTH_USER_KEY]: typeof user })[AUTH_USER_KEY] = user;
    return true;
  }

  private pathAllowedTabs(path: string): string[] | undefined {
    for (const [pref, tabs] of Object.entries(ENDPOINT_TAB_ANY)) {
      if (path.startsWith(pref)) return tabs;
    }
    const tab = this.pathTab(path);
    return tab ? [tab] : undefined;
  }

  private pathTab(path: string): string | undefined {
    for (const [pref, tab] of Object.entries(ENDPOINT_TAB_MAP)) {
      if (path.startsWith(pref)) return tab;
    }
    return undefined;
  }

  private skipInstanceCheck(path: string): boolean {
    return (
      path.startsWith('/api/auth/') ||
      path === '/api/locale' ||
      path.startsWith('/api/instances') ||
      path === '/api/config/program' ||
      path.startsWith('/api/config/notifications') ||
      path.startsWith('/api/config/web-tls/') ||
      path.startsWith('/api/backup')
    );
  }

  private validateInstanceAccess(id: unknown, allowedIds: string[]): void {
    if (typeof id === 'string') {
      const trimmed = id.trim();
      if (
        trimmed &&
        !allowedIds.includes('*') &&
        !allowedIds.includes(trimmed)
      ) {
        throw new ForbiddenException('forbidden_instance');
      }
    } else if (Array.isArray(id)) {
      for (const item of id) {
        this.validateInstanceAccess(item, allowedIds);
      }
    }
  }
}
