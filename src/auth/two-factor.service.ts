import { Injectable, Logger } from '@nestjs/common';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import { randomBytes, createHash } from 'crypto';
import { UsersService } from './users.service';
import { verifyPassword } from './password.util';

interface ChallengeRecord {
  username: string;
  expiresAt: number;
  attempts: number;
}

interface PendingSetup {
  secret: string;
  expiresAt: number;
}

@Injectable()
export class TwoFactorService {
  private readonly log = new Logger(TwoFactorService.name);
  private readonly challenges = new Map<string, ChallengeRecord>();
  private readonly pendingSetups = new Map<string, PendingSetup>();

  constructor(private readonly users: UsersService) {
    // Periodic cleanup of stale challenges and pending setups every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000).unref();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [k, v] of this.challenges.entries()) {
      if (v.expiresAt < now) this.challenges.delete(k);
    }
    for (const [k, v] of this.pendingSetups.entries()) {
      if (v.expiresAt < now) this.pendingSetups.delete(k);
    }
  }

  createChallenge(username: string): string {
    const token = randomBytes(32).toString('hex');
    this.challenges.set(token, {
      username,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      attempts: 0,
    });
    return token;
  }

  async verifyLogin(
    challengeToken: string,
    rawCode: string,
  ): Promise<{
    ok: boolean;
    error?: string;
    username?: string;
    isRecoveryCode?: boolean;
  }> {
    const challenge = this.challenges.get(challengeToken);
    if (!challenge || challenge.expiresAt < Date.now()) {
      if (challenge) this.challenges.delete(challengeToken);
      return { ok: false, error: 'challenge_expired' };
    }

    if (challenge.attempts >= 5) {
      this.challenges.delete(challengeToken);
      return { ok: false, error: 'too_many_attempts' };
    }

    const user = await this.users.findUser(challenge.username);
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      this.challenges.delete(challengeToken);
      return { ok: false, error: '2fa_not_configured' };
    }

    const code = String(rawCode || '').trim();
    if (!code) {
      challenge.attempts++;
      return { ok: false, error: 'invalid_code' };
    }

    // 1. Try TOTP code verification
    const totp = new OTPAuth.TOTP({
      issuer: 'Factorio Control Center',
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.twoFactorSecret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta !== null) {
      this.challenges.delete(challengeToken);
      return { ok: true, username: user.username, isRecoveryCode: false };
    }

    // 2. Try recovery code verification
    const hashed = this.hashRecoveryCode(code);
    if (
      user.twoFactorRecoveryCodes &&
      user.twoFactorRecoveryCodes.includes(hashed)
    ) {
      await this.users.removeRecoveryCode(user.username, hashed);
      this.challenges.delete(challengeToken);
      this.log.log(
        `User '${user.username}' successfully authenticated using a backup recovery code.`,
      );
      return { ok: true, username: user.username, isRecoveryCode: true };
    }

    challenge.attempts++;
    return { ok: false, error: 'invalid_code' };
  }

  async initiateSetup(username: string): Promise<{
    secret: string;
    uri: string;
    qrDataUrl: string;
  }> {
    const user = await this.users.findUser(username);
    if (!user) throw new Error('User not found');

    const secretObj = new OTPAuth.Secret({ size: 20 });
    const secret = secretObj.base32;

    const totp = new OTPAuth.TOTP({
      issuer: 'Factorio Control Center',
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secretObj,
    });

    const uri = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(uri, {
      margin: 2,
      width: 256,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    this.pendingSetups.set(username.toLowerCase(), {
      secret,
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
    });

    return { secret, uri, qrDataUrl };
  }

  async confirmSetup(
    username: string,
    rawCode: string,
  ): Promise<{
    ok: boolean;
    error?: string;
    recoveryCodes?: string[];
  }> {
    const pending = this.pendingSetups.get(username.toLowerCase());
    if (!pending || pending.expiresAt < Date.now()) {
      return { ok: false, error: 'setup_expired' };
    }

    const code = String(rawCode || '').trim();
    const totp = new OTPAuth.TOTP({
      issuer: 'Factorio Control Center',
      label: username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(pending.secret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      return { ok: false, error: 'invalid_code' };
    }

    // Generate 8 recovery codes
    const recoveryCodes: string[] = [];
    const hashedCodes: string[] = [];
    for (let i = 0; i < 8; i++) {
      const raw = randomBytes(4).toString('hex').toLowerCase();
      const formatted = `${raw.slice(0, 4)}-${raw.slice(4)}`;
      recoveryCodes.push(formatted);
      hashedCodes.push(this.hashRecoveryCode(formatted));
    }

    await this.users.setTwoFactor(username, true, pending.secret, hashedCodes);
    this.pendingSetups.delete(username.toLowerCase());
    return { ok: true, recoveryCodes };
  }

  async disable(
    username: string,
    passwordConfirm?: string,
    codeConfirm?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const user = await this.users.findUser(username);
    if (!user) return { ok: false, error: 'not_found' };
    if (!user.twoFactorEnabled) return { ok: false, error: 'not_enabled' };

    let confirmed = false;

    // Check password if provided
    if (passwordConfirm) {
      confirmed = await verifyPassword(passwordConfirm, user.passwordHash);
    }

    // Check TOTP code if provided and password didn't confirm
    if (!confirmed && codeConfirm && user.twoFactorSecret) {
      const totp = new OTPAuth.TOTP({
        issuer: 'Factorio Control Center',
        label: user.username,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(user.twoFactorSecret),
      });
      confirmed =
        totp.validate({ token: codeConfirm.trim(), window: 1 }) !== null;
    }

    if (!confirmed) {
      return { ok: false, error: 'confirmation_failed' };
    }

    await this.users.setTwoFactor(username, false, null, null);
    return { ok: true };
  }

  async resetForUser(
    username: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const user = await this.users.findUser(username);
    if (!user) return { ok: false, error: 'not_found' };
    await this.users.setTwoFactor(username, false, null, null);
    return { ok: true };
  }

  hashRecoveryCode(code: string): string {
    const normalized = code.replace(/[\s-]/g, '').toLowerCase();
    return createHash('sha256').update(normalized).digest('hex');
  }
}
