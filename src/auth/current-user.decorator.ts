import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AUTH_USER_KEY } from './auth.guard';
import { SessionUser } from '../common/types';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SessionUser | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return (req as Request & { [AUTH_USER_KEY]?: SessionUser })[AUTH_USER_KEY];
  },
);
