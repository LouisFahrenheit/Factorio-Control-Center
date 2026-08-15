import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Put,
  UnauthorizedException,
  Ip,
  Logger,
} from '@nestjs/common';
import { ALL_TABS } from '../constants/fcc.constants';
import { SessionService } from './session.service';
import { UsersService } from './users.service';
import { InstancesService } from '../instances/instances.service';
import { WebPanelEventLogService } from '../logging/web-panel-event-log.service';
import { verifyPassword } from './password.util';

@Controller('api/auth')
export class AuthController {
  private readonly log = new Logger(AuthController.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly instances: InstancesService,
    private readonly eventLog: WebPanelEventLogService,
  ) {}

  @Post('login')
  async login(@Body() body: unknown, @Ip() ip: string) {
    const { username, password } = body as Record<string, string>;
    this.log.debug(`Login attempt for username: ${username} from IP: ${ip}`);
    
    const record = await this.users.findUser(username);
    if (!record || !record.enabled) {
      this.log.debug(`Login failed: user '${username}' not found or disabled.`);
      return { ok: false, error: 'invalid_credentials' };
    }
    const ok = await verifyPassword(password || '', record.passwordHash);
    if (!ok) {
      this.log.debug(`Login failed: invalid password for user '${username}'.`);
      this.eventLog.logAuth('login_failed', username);
      return { ok: false, error: 'invalid_credentials' };
    }

    const token = await this.sessions.createSession(record.username, ip);
    this.log.debug(`Login successful: user '${username}', role '${record.role}'. Session created.`);
    this.eventLog.logAuth('login', username, record.role);
    return { ok: true, token, user: this.users.publicView(record) };
  }

  @Post('logout')
  async logout(@Headers('authorization') auth?: string) {
    const token = this.bearer(auth);
    if (!token) return { ok: true };
    const sessionUser = await this.sessions.resolve(token);
    if (sessionUser) {
      this.log.debug(`Logout for user '${sessionUser.username}'.`);
      this.eventLog.logAuth('logout', sessionUser.username);
    }
    this.sessions.logout(token);
    return { ok: true };
  }

  @Get('me')
  async me(@Headers('authorization') auth?: string) {
    const token = this.bearer(auth);
    const user = token ? await this.sessions.resolve(token) : null;
    if (!user) throw new ForbiddenException('Invalid token');
    return { ok: true, user };
  }

  @Get('users')
  async listUsers(@Headers('authorization') auth?: string) {
    await this.requireAdmin(auth);
    return {
      ok: true,
      users: await this.users.listPublic(),
      tabs: ALL_TABS,
      instances: this.instances.list().items.map((i) => ({
        id: i.id,
        name: i.name,
      })),
    };
  }

  @Post('users')
  async createUser(
    @Headers('authorization') auth: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const actor = await this.requireAdmin(auth);
    const r = await this.users.createUser(body as never, actor);
    if (!r.ok) throw new ForbiddenException(r.error);
    this.eventLog.logAuth('user_create', actor, String(body.username || ''));
    return { ok: true };
  }

  @Put('users/:username')
  async updateUser(
    @Headers('authorization') auth: string | undefined,
    @Param('username') username: string,
    @Body() body: Record<string, unknown>,
  ) {
    const actor = await this.requireAdmin(auth);
    const r = await this.users.updateUser(username, body, actor);
    if (!r.ok) throw new ForbiddenException(r.error);
    this.eventLog.logAuth('user_update', actor, username);
    return { ok: true };
  }

  @Delete('users/:username')
  async deleteUser(
    @Headers('authorization') auth: string | undefined,
    @Param('username') username: string,
  ) {
    const actor = await this.requireAdmin(auth);
    const r = await this.users.deleteUser(username, actor);
    if (!r.ok) throw new ForbiddenException(r.error);
    this.eventLog.logAuth('user_delete', actor, username);
    return { ok: true };
  }

  private bearer(auth?: string): string | null {
    const m = /^Bearer\s+(.+)$/i.exec(auth || '');
    return m ? m[1].trim() : null;
  }

  private async requireAdmin(auth?: string): Promise<string> {
    const token = this.bearer(auth);
    const sessionUser = token ? await this.sessions.resolve(token) : null;
    if (!sessionUser) throw new ForbiddenException('admin_required');
    const record = await this.users.findUser(sessionUser.username);
    if (!record || record.role !== 'administrator' || record.enabled === false)
      throw new ForbiddenException('admin_required');
    return sessionUser.username;
  }
}
