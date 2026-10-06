import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { AUTH_USER_KEY } from './auth.guard';
import { SessionUser } from '../common/types';

/** Key under which the verified admin username is stored on the request. */
export const ADMIN_ACTOR_KEY = 'fccAdminActor';

/**
 * Requires that the request has already been authenticated by AuthGuard
 * AND that the resolved user is an enabled administrator.
 *
 * Usage: @UseGuards(AuthGuard, AdminGuard)
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx
      .switchToHttp()
      .getRequest<
        Request & { [AUTH_USER_KEY]?: SessionUser; [ADMIN_ACTOR_KEY]?: string }
      >();
    const user = req[AUTH_USER_KEY];
    if (!user || user.role !== 'administrator' || user.enabled === false) {
      throw new ForbiddenException('admin_required');
    }
    req[ADMIN_ACTOR_KEY] = user.username;
    return true;
  }
}
