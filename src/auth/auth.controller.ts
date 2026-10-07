import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
  Ip,
  Headers,
  Req,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
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
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import { AuthGuard } from './auth.guard';
import { AdminGuard } from './admin.guard';
import { CurrentUser } from './current-user.decorator';
import type { SessionUser } from '../common/types';
import {
  extractBearerToken,
  extractClientIp as resolveClientIp,
} from './auth.util';

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
    private readonly rateLimiter: AuthRateLimiterService,
  ) {}

  private extractClientIp(req?: Request, fallbackIp?: string): string {
    return resolveClientIp(req, fallbackIp);
  }

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
    if (!password || password.length < 8) {
      return { ok: false, error: 'invalid_password' };
    }

    try {
      const admin = await this.users.createInitialAdmin(username, password);
      const token = await this.sessions.createSession(admin.username, ip);
      this.log.log(
        `Initial administrator '${admin.username}' created via setup wizard from IP: ${ip}.`,
      );
      this.eventLog.logAuth('login', admin.username, admin.role);
      return { ok: true, token, user: this.users.publicView(admin) };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log.warn(`Setup admin failed: ${errMsg}`);
      return { ok: false, error: errMsg || 'setup_failed' };
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
  async login(
    @Body() body: LoginDto,
    @Ip() fallbackIp: string,
    @Req() req: Request,
  ) {
    const { username, password } = body;
    const ip = this.extractClientIp(req, fallbackIp);
    const u = String(username || '').trim();

    this.log.debug(`Login attempt for username: ${u} from IP: ${ip}`);

    // Check rate limiter before evaluating credentials
    const check = this.rateLimiter.checkLoginAllowed(ip, u);
    if (!check.allowed) {
      this.eventLog.logAuth(
        'login_locked',
        u || ip,
        `${check.reason}, retry in ${check.retryAfterMin}m`,
      );
      this.log.warn(
        `Login blocked by rate limiter for user '${u}' from IP '${ip}' (reason: ${check.reason}, retryAfter: ${check.retryAfterSec}s).`,
      );
      throw new HttpException(
        {
          ok: false,
          error: 'auth_rate_limit_locked',
          retryAfterSec: check.retryAfterSec,
          retryAfterMin: check.retryAfterMin,
          message: 'auth_rate_limit_locked',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const record = await this.users.findUser(u);
    if (!record || !record.enabled) {
      this.log.debug(`Login failed: user '${u}' not found or disabled.`);
      const limitResult = this.rateLimiter.recordFailedAttempt(ip, u);
      this.eventLog.logAuth('login_failed', u);
      if (limitResult.locked) {
        this.eventLog.logAuth(
          'login_locked',
          u || ip,
          `locked for ${limitResult.retryAfterMin}m`,
        );
        throw new HttpException(
          {
            ok: false,
            error: 'auth_rate_limit_locked',
            retryAfterSec: limitResult.retryAfterSec,
            retryAfterMin: limitResult.retryAfterMin,
            message: 'auth_rate_limit_locked',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return { ok: false, error: 'invalid_credentials' };
    }

    const ok = await verifyPassword(password || '', record.passwordHash);
    if (!ok) {
      this.log.debug(`Login failed: invalid password for user '${u}'.`);
      const limitResult = this.rateLimiter.recordFailedAttempt(ip, u);
      this.eventLog.logAuth('login_failed', u);
      if (limitResult.locked) {
        this.eventLog.logAuth(
          'login_locked',
          u || ip,
          `locked for ${limitResult.retryAfterMin}m`,
        );
        throw new HttpException(
          {
            ok: false,
            error: 'auth_rate_limit_locked',
            retryAfterSec: limitResult.retryAfterSec,
            retryAfterMin: limitResult.retryAfterMin,
            message: 'auth_rate_limit_locked',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return {
        ok: false,
        error: 'invalid_credentials',
        attemptsRemaining: limitResult.attemptsRemaining,
      };
    }

    this.rateLimiter.recordSuccessfulLogin(ip, u);

    if (record.twoFactorEnabled) {
      const challengeToken = this.twoFactor.createChallenge(record.username);
      this.log.debug(`Login requires 2FA for user '${u}'. Challenge issued.`);
      return { ok: true, requires2fa: true, challengeToken };
    }

    const token = await this.sessions.createSession(record.username, ip);
    this.log.debug(
      `Login successful: user '${u}', role '${record.role}'. Session created.`,
    );
    this.eventLog.logAuth('login', u, record.role);
    return { ok: true, token, user: this.users.publicView(record) };
  }

  @Post('2fa/verify')
  @ApiOperation({ summary: 'Verify 2FA TOTP or recovery code during login' })
  @ApiBody({ type: Verify2faDto })
  async verify2fa(
    @Body() body: Verify2faDto,
    @Ip() fallbackIp: string,
    @Req() req: Request,
  ) {
    const ip = this.extractClientIp(req, fallbackIp);

    const check = this.rateLimiter.check2faAllowed(ip, body.challengeToken);
    if (!check.allowed) {
      this.eventLog.logAuth(
        'login_locked',
        ip,
        `2FA limit exceeded: ${check.reason}`,
      );
      throw new HttpException(
        {
          ok: false,
          error: 'auth_rate_limit_locked',
          retryAfterSec: check.retryAfterSec,
          retryAfterMin: check.retryAfterMin,
          message: 'auth_rate_limit_locked',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const res = await this.twoFactor.verifyLogin(
      body.challengeToken,
      body.code,
    );
    if (!res.ok) {
      this.log.debug(`2FA verification failed: ${res.error}`);
      const limitResult = this.rateLimiter.recordFailed2fa(
        ip,
        body.challengeToken,
      );
      this.eventLog.logAuth('login_failed', res.username || 'unknown');
      if (limitResult.locked) {
        this.eventLog.logAuth(
          'login_locked',
          res.username || ip,
          `2FA locked for ${limitResult.retryAfterMin}m`,
        );
        throw new HttpException(
          {
            ok: false,
            error: 'auth_rate_limit_locked',
            retryAfterSec: limitResult.retryAfterSec,
            retryAfterMin: limitResult.retryAfterMin,
            message: 'auth_rate_limit_locked',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return { ok: false, error: res.error };
    }

    this.rateLimiter.recordSuccessful2fa(ip, body.challengeToken);

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
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Initiate 2FA setup for current user' })
  async setup2fa(@CurrentUser() sessionUser: SessionUser) {
    const user = await this.users.findUser(sessionUser.username);
    if (!user) throw new ForbiddenException('User not found');
    if (user.twoFactorEnabled) {
      return { ok: false, error: 'already_enabled' };
    }
    const res = await this.twoFactor.initiateSetup(sessionUser.username);
    return { ok: true, ...res };
  }

  @Post('2fa/enable')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Confirm and enable 2FA with TOTP code' })
  @ApiBody({ type: Enable2faDto })
  async enable2fa(
    @CurrentUser() sessionUser: SessionUser,
    @Body() body: Enable2faDto,
  ) {
    const res = await this.twoFactor.confirmSetup(
      sessionUser.username,
      body.code,
    );
    if (!res.ok) return { ok: false, error: res.error };
    this.eventLog.logAuth('2fa_enable', sessionUser.username);
    return { ok: true, recoveryCodes: res.recoveryCodes };
  }

  @Post('2fa/disable')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Disable 2FA with password or TOTP confirmation' })
  @ApiBody({ type: Disable2faDto })
  async disable2fa(
    @CurrentUser() sessionUser: SessionUser,
    @Body() body: Disable2faDto,
  ) {
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
    const token = extractBearerToken(auth);
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
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get current authenticated user info' })
  @ApiResponse({ status: 200, description: 'Returns current user object' })
  @ApiResponse({ status: 403, description: 'Invalid or missing token' })
  me(@CurrentUser() user: SessionUser) {
    return { ok: true, user };
  }

  @Get('users')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List all users (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of users, available tabs and instances',
  })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  async listUsers() {
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
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Create a new user (admin only)' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 200, description: 'User created successfully' })
  @ApiResponse({
    status: 403,
    description: 'Admin role required or validation error',
  })
  async createUser(
    @CurrentUser() admin: SessionUser,
    @Body() body: CreateUserDto,
  ) {
    const actor = admin.username;
    const r = await this.users.createUser(body, actor);
    if (!r.ok) throw new ForbiddenException(r.error);
    this.eventLog.logAuth('user_create', actor, String(body.username || ''));
    return { ok: true };
  }

  @Put('users/:username')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update an existing user (admin only)' })
  @ApiParam({ name: 'username', description: 'Username to update' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  async updateUser(
    @CurrentUser() admin: SessionUser,
    @Param('username') username: string,
    @Body() body: UpdateUserDto,
    @Headers('authorization') auth?: string,
  ) {
    const actor = admin.username;
    const currentToken = extractBearerToken(auth) ?? undefined;
    const beforeList = await this.users.listPublic();
    const before = beforeList.find(
      (u) => u.username.toLowerCase() === username.toLowerCase(),
    );

    const r = await this.users.updateUser(username, body, actor, currentToken);
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
        changes.push(`tabs=[${body.tabs.join(', ')}]`);
      }
      if (
        body.instance_ids !== undefined &&
        JSON.stringify(body.instance_ids) !==
          JSON.stringify(before.instance_ids)
      ) {
        const ids = body.instance_ids;
        if (ids.includes('*')) {
          changes.push(`servers=[All Servers]`);
        } else {
          const insts = this.instances.list().items;
          const names = ids.map((id) => {
            const i = insts.find((inst) => inst.id === id);
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
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Reset 2FA for a user (admin only)' })
  @ApiParam({ name: 'username', description: 'Username to reset 2FA for' })
  @ApiResponse({ status: 200, description: '2FA reset successfully' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  async reset2fa(
    @CurrentUser() admin: SessionUser,
    @Param('username') username: string,
  ) {
    const actor = admin.username;
    const r = await this.twoFactor.resetForUser(username);
    if (!r.ok) throw new ForbiddenException(r.error);
    this.sessions.revokeAllForUser(username);
    this.eventLog.logAuth('user_reset_2fa', actor, username);
    return { ok: true };
  }

  @Delete('users/:username')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Delete a user (admin only)' })
  @ApiParam({ name: 'username', description: 'Username to delete' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({
    status: 403,
    description: 'Admin role required or cannot delete self',
  })
  async deleteUser(
    @CurrentUser() admin: SessionUser,
    @Param('username') username: string,
  ) {
    const actor = admin.username;
    const r = await this.users.deleteUser(username, actor);
    if (!r.ok) throw new ForbiddenException(r.error);
    this.eventLog.logAuth('user_delete', actor, username);
    return { ok: true };
  }
}
