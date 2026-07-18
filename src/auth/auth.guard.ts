import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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

export const AUTH_USER_KEY = 'fccUser';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly config: FccConfigService,
    private readonly users: UsersService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const path = req.path || '';
    if (
      path === '/api/health' ||
      path === '/api/locale-bootstrap' ||
      path.startsWith('/api/auth/login')
    ) {
      return true;
    }
    const incoming = extractBearerToken(req.headers.authorization);
    if (!incoming) throw new UnauthorizedException('Missing bearer token');
    let user = this.sessions.resolve(incoming);
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
      path.startsWith('/api/config/web-tls/')
    );
  }
}
