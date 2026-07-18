import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DispatchService } from '../ops/dispatch.service';

@Injectable()
export class ApiBridgeService {
  constructor(private readonly dispatch: DispatchService) {}

  async submit(
    op: string,
    kwargs: Record<string, unknown> = {},
    instanceId?: string,
  ): Promise<Record<string, unknown>> {
    try {
      const data = instanceId
        ? await this.dispatch.dispatchWithInstance(instanceId, op, kwargs)
        : await this.dispatch.dispatch(op, kwargs);
      return data ?? { ok: true };
    } catch (e) {
      throw new InternalServerErrorException(
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  webActor(user?: { username?: string }): string {
    const name = String(user?.username || '').trim();
    return name ? `User: ${name}` : 'System: Panel';
  }
}
