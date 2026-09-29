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
import {
  LoginDto,
  CreateUserDto,
  UpdateUserDto,
  Verify2faDto,
  Enable2faDto,
  Disable2faDto,
  SetupAdminDto,
} from '../common/dto/auth.dto';
import { TwoFactorService } from './two-factor.service';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  private readonly log = new Logger(AuthController.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly instances: InstancesService,
    private readonly eventLog: WebPanelEventLogService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  @Get('setup-status')
  @ApiOperation({
    summary: 'Check if initial administrator setup is required',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns whether the initial setup wizard needs to be run.',
  })
  async setupStatus() {
    const hasUsers = await this.users.hasAnyUser();
    return { ok: true, needsSetup: !hasUsers };
  }

  @Post('setup-admin')
  @ApiOperation({
    summary: 'Create initial administrator account during setup wizard',
    description:
      'Creates the first administrator account if no users exist in the database.',
  })
  @ApiBody({ type: SetupAdminDto })
  @ApiResponse({
    status: 200,
    description: 'Initial admin created and session established.',
  })
  async setupAdmin(@Body() body: SetupAdminDto, @Ip() ip: string) {
    const username = (body.username || '').trim();
    const password = body.password || '';

    if (!username || username.length < 2) {
      return { ok: false, error: 'username_too_short' };
    }
    if (!password || password.length < 4) {
      return { ok: false, error: 'password_too_short' };
    }

    try {
      const admin = await this.users.createInitialAdmin(username, password);
      const token = await this.sessions.createSession(admin.username, ip);
      this.log.log(
        `Initial administrator '${admin.username}' created via setup wizard from IP: ${ip}.`,
      );
      this.eventLog.logAuth('login', admin.username, admin.role);
      return { ok: true, token, user: this.users.publicView(admin) };
    } catch (err: any) {
      this.log.warn(`Setup admin failed: ${err?.message || err}`);
      return { ok: false, error: err?.message || 'setup_failed' };
    }
  }

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

    if (record.twoFactorEnabled) {
      const challengeToken = this.twoFactor.createChallenge(record.username);
      this.log.debug(
        `Login requires 2FA for user '${username}'. Challenge issued.`,
      );
      return { ok: true, requires2fa: true, challengeToken };
    }

    const token = await this.sessions.createSession(record.username, ip);
    this.log.debug(
      `Login successful: user '${username}', role '${record.role}'. Session created.`,
    );
    this.eventLog.logAuth('login', username, record.role);
    return { ok: true, token, user: this.users.publicView(record) };
  }

  @Post('2fa/verify')
  @ApiOperation({ summary: 'Verify 2FA TOTP or recovery code during login' })
  @ApiBody({ type: Verify2faDto })
  async verify2fa(@Body() body: Verify2faDto, @Ip() ip: string) {
    const res = await this.twoFactor.verifyLogin(
      body.challengeToken,
      body.code,
    );
    if (!res.ok) {
      this.log.debug(`2FA verification failed: ${res.error}`);
      this.eventLog.logAuth('login_failed', res.username || 'unknown');
      return { ok: false, error: res.error };
    }

    const record = await this.users.findUser(res.username!);
    if (!record || !record.enabled) {
      return { ok: false, error: 'invalid_credentials' };
    }

    const token = await this.sessions.createSession(record.username, ip);
    this.log.debug(
      `2FA login successful: user '${record.username}'. Session created.`,
    );
    this.eventLog.logAuth('login', record.username, record.role);
    return {
      ok: true,
      token,
      user: this.users.publicView(record),
      isRecoveryCode: res.isRecoveryCode,
    };
  }

  @Post('2fa/setup')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Initiate 2FA setup for current user' })
  async setup2fa(@Headers('authorization') auth?: string) {
    const token = this.bearer(auth);
    const sessionUser = token ? await this.sessions.resolve(token) : null;
    if (!sessionUser) throw new ForbiddenException('Invalid token');

    const user = await this.users.findUser(sessionUser.username);
    if (!user) throw new ForbiddenException('User not found');
    if (user.twoFactorEnabled) {
      return { ok: false, error: 'already_enabled' };
    }

    const res = await this.twoFactor.initiateSetup(sessionUser.username);
    return { ok: true, ...res };
  }

  @Post('2fa/enable')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Confirm and enable 2FA with TOTP code' })
  @ApiBody({ type: Enable2faDto })
  async enable2fa(
    @Headers('authorization') auth: string | undefined,
    @Body() body: Enable2faDto,
  ) {
    const token = this.bearer(auth);
    const sessionUser = token ? await this.sessions.resolve(token) : null;
    if (!sessionUser) throw new ForbiddenException('Invalid token');

    const res = await this.twoFactor.confirmSetup(
      sessionUser.username,
      body.code,
    );
    if (!res.ok) return { ok: false, error: res.error };

    this.eventLog.logAuth('2fa_enable', sessionUser.username);
    return { ok: true, recoveryCodes: res.recoveryCodes };
  }

  @Post('2fa/disable')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Disable 2FA with password or TOTP confirmation' })
  @ApiBody({ type: Disable2faDto })
  async disable2fa(
    @Headers('authorization') auth: string | undefined,
    @Body() body: Disable2faDto,
  ) {
    const token = this.bearer(auth);
    const sessionUser = token ? await this.sessions.resolve(token) : null;
    if (!sessionUser) throw new ForbiddenException('Invalid token');

    const res = await this.twoFactor.disable(
      sessionUser.username,
      body.password,
      body.code,
    );
    if (!res.ok) return { ok: false, error: res.error };

    this.eventLog.logAuth('2fa_disable', sessionUser.username);
    return { ok: true };
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
        changes.push(`role=${String(body.role)}`);
      }
      if (body.enabled !== undefined && body.enabled !== before.enabled) {
        changes.push(`enabled=${String(body.enabled)}`);
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

  @Post('users/:username/reset-2fa')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Reset 2FA for a user (admin only)' })
  @ApiParam({ name: 'username', description: 'Username to reset 2FA for' })
  @ApiResponse({ status: 200, description: '2FA reset successfully' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  async reset2fa(
    @Headers('authorization') auth: string | undefined,
    @Param('username') username: string,
  ) {
    const actor = await this.requireAdmin(auth);
    const r = await this.twoFactor.resetForUser(username);
    if (!r.ok) throw new ForbiddenException(r.error);
    this.eventLog.logAuth('user_reset_2fa', actor, username);
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
