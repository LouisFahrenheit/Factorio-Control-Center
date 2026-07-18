import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { from, lastValueFrom } from 'rxjs';
import { requestBearerToken } from '../auth/auth.util';
import { SessionService } from '../auth/session.service';
import { InstancesService } from '../instances/instances.service';

const SKIP_PREFIXES = [
  '/api/health',
  '/api/locale-bootstrap',
  '/api/auth/',
  '/api/instances',
  '/api/config/program',
  '/api/config/web-tls/',
];

@Injectable()
export class InstanceContextInterceptor implements NestInterceptor {
  constructor(
    private readonly sessions: SessionService,
    private readonly instances: InstancesService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<Request>();
    const path = req.path || '';
    if (SKIP_PREFIXES.some((p) => path === p || path.startsWith(p))) {
      return next.handle();
    }
    const token = requestBearerToken(req);
    if (!token) return next.handle();
    const instanceId = this.sessions.getSelectedInstanceId(token);
    if (!instanceId) return next.handle();
    return from(
      this.instances.withInstance(instanceId, () =>
        lastValueFrom(next.handle()),
      ),
    );
  }
}
