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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { ALL_TABS } from '../constants/fcc.constants';
import { SessionService } from './session.service';
import { UsersService } from './users.service';
import { InstancesService } from '../instances/instances.service';
import { WebPanelEventLogService } from '../logging/web-panel-event-log.service';
import { verifyPassword } from './password.util';
import { LoginDto, CreateUserDto, UpdateUserDto } from '../common/dto/auth.dto';

@ApiTags('Auth')
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
  @ApiOperation({
    summary: 'Login with username and password',
    description: 'Returns a session token on success.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful — returns token and user info',
  })
  @ApiResponse({
    status: 200,
    description:
      'Login failed — returns { ok: false, error: "invalid_credentials" }',
  })
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
    this.log.debug(
      `Login successful: user '${username}', role '${record.role}'. Session created.`,
    );
    this.eventLog.logAuth('login', username, record.role);
    return { ok: true, token, user: this.users.publicView(record) };
  }

  @Post('logout')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Logout and invalidate current session token' })
  @ApiResponse({ status: 200, description: 'Session invalidated successfully' })
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
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get current authenticated user info' })
  @ApiResponse({ status: 200, description: 'Returns current user object' })
  @ApiResponse({ status: 403, description: 'Invalid or missing token' })
  async me(@Headers('authorization') auth?: string) {
    const token = this.bearer(auth);
    const user = token ? await this.sessions.resolve(token) : null;
    if (!user) throw new ForbiddenException('Invalid token');
    return { ok: true, user };
  }

  @Get('users')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List all users (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of users, available tabs and instances',
  })
  @ApiResponse({ status: 403, description: 'Admin role required' })
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
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Create a new user (admin only)' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 200, description: 'User created successfully' })
  @ApiResponse({
    status: 403,
    description: 'Admin role required or validation error',
  })
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
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update an existing user (admin only)' })
  @ApiParam({ name: 'username', description: 'Username to update' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  async updateUser(
    @Headers('authorization') auth: string | undefined,
    @Param('username') username: string,
    @Body() body: Record<string, unknown>,
  ) {
    const actor = await this.requireAdmin(auth);
    const beforeList = await this.users.listPublic();
    const before = beforeList.find(
      (u) => u.username.toLowerCase() === username.toLowerCase(),
    );

    const r = await this.users.updateUser(username, body, actor);
    if (!r.ok) throw new ForbiddenException(r.error);

    const changes: string[] = [];
    if (body.password) changes.push('password changed');

    if (before) {
      if (body.role !== undefined && body.role !== before.role) {
        changes.push(`role=${body.role}`);
      }
      if (body.enabled !== undefined && body.enabled !== before.enabled) {
        changes.push(`enabled=${body.enabled}`);
      }
      if (
        body.tabs !== undefined &&
        JSON.stringify(body.tabs) !== JSON.stringify(before.tabs)
      ) {
        changes.push(`tabs=[${(body.tabs as string[]).join(', ')}]`);
      }
      if (
        body.instance_ids !== undefined &&
        JSON.stringify(body.instance_ids) !==
          JSON.stringify(before.instance_ids)
      ) {
        const ids = body.instance_ids as string[];
        if (ids.includes('*')) {
          changes.push(`servers=[All Servers]`);
        } else {
          const insts = this.instances.list().items;
          const names = ids.map((id) => {
            const i = insts.find((inst: any) => inst.id === id);
            return i ? i.name || id : id;
          });
          changes.push(`servers=[${names.join(', ')}]`);
        }
      }
    }

    const detail = `${username}${changes.length ? ` (${changes.join(', ')})` : ''}`;
    this.eventLog.logAuth('user_update', actor, detail);
    return { ok: true };
  }

  @Delete('users/:username')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Delete a user (admin only)' })
  @ApiParam({ name: 'username', description: 'Username to delete' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({
    status: 403,
    description: 'Admin role required or cannot delete self',
  })
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
