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
} from '@nestjs/common';
import { ALL_TABS } from '../constants/fcc.constants';
import { SessionService } from './session.service';
import { UsersService } from './users.service';
import { InstancesService } from '../instances/instances.service';
import { WebPanelEventLogService } from '../logging/web-panel-event-log.service';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly instances: InstancesService,
    private readonly eventLog: WebPanelEventLogService,
  ) {}

  @Post('login')
  login(@Body() body: { username?: string; password?: string }) {
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!username || !password)
      throw new UnauthorizedException('username and password are required');
    const user = this.sessions.login(username, password, this.users);
    if (!user) {
      this.eventLog.logAuth('login_failed', username);
      throw new ForbiddenException('invalid_credentials');
    }
    const token = this.sessions.createToken(user);
    const record = this.users.findUser(username)!;
    this.eventLog.logAuth('login', username, user.role);
    return { ok: true, token, user: this.users.publicView(record) };
  }

  @Post('logout')
  logout(@Headers('authorization') auth?: string) {
    const token = this.bearer(auth);
    if (token) {
      const sessionUser = this.sessions.resolve(token);
      if (sessionUser) this.eventLog.logAuth('logout', sessionUser.username);
      this.sessions.logout(token);
    }
    return { ok: true };
  }

  @Get('me')
  me(@Headers('authorization') auth?: string) {
    const token = this.bearer(auth);
    const user = token ? this.sessions.resolve(token) : null;
    if (!user) throw new ForbiddenException('Invalid token');
    return { ok: true, user };
  }

  @Get('users')
  listUsers(@Headers('authorization') auth?: string) {
    this.requireAdmin(auth);
    return {
      ok: true,
      users: this.users.listPublic(),
      tabs: ALL_TABS,
      instances: this.instances.list().items.map((i) => ({
        id: i.id,
        name: i.name,
      })),
    };
  }

  @Post('users')
  createUser(
    @Headers('authorization') auth: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const actor = this.requireAdmin(auth);
    const r = this.users.createUser(body as never, actor);
    if (!r.ok) throw new ForbiddenException(r.error);
    this.eventLog.logAuth('user_create', actor, String(body.username || ''));
    return { ok: true };
  }

  @Put('users/:username')
  updateUser(
    @Headers('authorization') auth: string | undefined,
    @Param('username') username: string,
    @Body() body: Record<string, unknown>,
  ) {
    const actor = this.requireAdmin(auth);
    const r = this.users.updateUser(username, body, actor);
    if (!r.ok) throw new ForbiddenException(r.error);
    this.eventLog.logAuth('user_update', actor, username);
    return { ok: true };
  }

  @Delete('users/:username')
  deleteUser(
    @Headers('authorization') auth: string | undefined,
    @Param('username') username: string,
  ) {
    const actor = this.requireAdmin(auth);
    const r = this.users.deleteUser(username, actor);
    if (!r.ok) throw new ForbiddenException(r.error);
    this.eventLog.logAuth('user_delete', actor, username);
    return { ok: true };
  }

  private bearer(auth?: string): string | null {
    const m = /^Bearer\s+(.+)$/i.exec(auth || '');
    return m ? m[1].trim() : null;
  }

  private requireAdmin(auth?: string): string {
    const token = this.bearer(auth);
    const sessionUser = token ? this.sessions.resolve(token) : null;
    if (!sessionUser) throw new ForbiddenException('admin_required');
    const record = this.users.findUser(sessionUser.username);
    if (!record || record.role !== 'administrator' || record.enabled === false)
      throw new ForbiddenException('admin_required');
    return sessionUser.username;
  }
}
