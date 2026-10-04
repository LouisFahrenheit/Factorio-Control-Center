import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterSec?: number;
  retryAfterMin?: number;
  attemptsRemaining?: number;
  reason?:
    | 'ip_locked'
    | 'username_locked'
    | 'token_locked'
    | 'burst_limit_exceeded';
}

export interface RateLimitRecordResult {
  locked: boolean;
  retryAfterSec?: number;
  retryAfterMin?: number;
  attemptsRemaining: number;
  reason?: 'ip_locked' | 'username_locked' | 'token_locked';
}

interface AttemptTracker {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

export function normalizeClientIp(rawIp?: string | null): string {
  if (!rawIp) return '127.0.0.1';
  let ip = String(rawIp).trim();
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  } else if (ip === '::1' || ip === 'localhost') {
    ip = '127.0.0.1';
  }
  return ip || '127.0.0.1';
}

@Injectable()
export class AuthRateLimiterService implements OnModuleDestroy {
  private readonly log = new Logger(AuthRateLimiterService.name);

  readonly maxAttempts: number;
  readonly lockoutMinutes: number;
  readonly windowMinutes: number;
  readonly burstLimitPerMinute: number;

  private readonly ipAttempts = new Map<string, AttemptTracker>();
  private readonly userAttempts = new Map<string, AttemptTracker>();
  private readonly tokenAttempts = new Map<string, AttemptTracker>();
  private readonly burstTimestamps = new Map<string, number[]>();

  private readonly cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    const envMaxAttempts = parseInt(
      process.env.AUTH_MAX_FAILED_ATTEMPTS || '',
      10,
    );
    this.maxAttempts =
      Number.isFinite(envMaxAttempts) && envMaxAttempts > 0
        ? envMaxAttempts
        : 5;

    const envLockoutMinutes = parseInt(
      process.env.AUTH_LOCKOUT_MINUTES || '',
      10,
    );
    this.lockoutMinutes =
      Number.isFinite(envLockoutMinutes) && envLockoutMinutes > 0
        ? envLockoutMinutes
        : 10;

    const envWindowMinutes = parseInt(
      process.env.AUTH_ATTEMPT_WINDOW_MINUTES || '',
      10,
    );
    this.windowMinutes =
      Number.isFinite(envWindowMinutes) && envWindowMinutes > 0
        ? envWindowMinutes
        : 10;

    const envBurstLimit = parseInt(
      process.env.AUTH_BURST_LIMIT_PER_MINUTE || '',
      10,
    );
    this.burstLimitPerMinute =
      Number.isFinite(envBurstLimit) && envBurstLimit > 0 ? envBurstLimit : 30;

    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  // ── Burst rate check (rapid fire DoS prevention) ───────────────────────

  private checkBurst(ip: string): boolean {
    const now = Date.now();
    const timestamps = this.burstTimestamps.get(ip) || [];
    const oneMinAgo = now - 60 * 1000;
    const recent = timestamps.filter((t) => t > oneMinAgo);
    if (recent.length >= this.burstLimitPerMinute) {
      this.burstTimestamps.set(ip, recent);
      return false;
    }
    recent.push(now);
    this.burstTimestamps.set(ip, recent);
    return true;
  }

  // ── Generic tracker helpers ──────────────────────────────────────────

  private isTrackerLocked(
    tracker: AttemptTracker | undefined,
    now: number,
  ): { locked: boolean; retryAfterSec: number; retryAfterMin: number } {
    if (!tracker || !tracker.lockedUntil) {
      return { locked: false, retryAfterSec: 0, retryAfterMin: 0 };
    }
    if (tracker.lockedUntil > now) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((tracker.lockedUntil - now) / 1000),
      );
      const retryAfterMin = Math.max(1, Math.ceil(retryAfterSec / 60));
      return { locked: true, retryAfterSec, retryAfterMin };
    }
    return { locked: false, retryAfterSec: 0, retryAfterMin: 0 };
  }

  private getActiveAttempts(
    tracker: AttemptTracker | undefined,
    now: number,
  ): number {
    if (!tracker) return 0;
    if (tracker.lockedUntil && tracker.lockedUntil > now) {
      return tracker.count;
    }
    const windowMs = this.windowMinutes * 60 * 1000;
    if (now - tracker.firstAttemptAt > windowMs) {
      return 0;
    }
    return tracker.count;
  }

  private recordFailureOnMap(
    map: Map<string, AttemptTracker>,
    key: string,
    now: number,
  ): { count: number; locked: boolean; lockedUntil?: number } {
    const windowMs = this.windowMinutes * 60 * 1000;
    let tracker = map.get(key);

    if (!tracker || now - tracker.firstAttemptAt > windowMs) {
      tracker = { count: 1, firstAttemptAt: now };
    } else {
      tracker.count += 1;
    }

    let locked = false;
    let lockedUntil: number | undefined;

    if (tracker.count >= this.maxAttempts) {
      locked = true;
      lockedUntil = now + this.lockoutMinutes * 60 * 1000;
      tracker.lockedUntil = lockedUntil;
    }

    map.set(key, tracker);
    return { count: tracker.count, locked, lockedUntil };
  }

  // ── Public Login Methods ─────────────────────────────────────────────

  checkLoginAllowed(
    rawIp?: string | null,
    username?: string,
  ): RateLimitCheckResult {
    const ip = normalizeClientIp(rawIp);
    const now = Date.now();

    if (!this.checkBurst(ip)) {
      return {
        allowed: false,
        retryAfterSec: 60,
        retryAfterMin: 1,
        reason: 'burst_limit_exceeded',
      };
    }

    // Check Username lockout first if provided
    const u = String(username || '')
      .trim()
      .toLowerCase();
    if (u) {
      const userLock = this.isTrackerLocked(this.userAttempts.get(u), now);
      if (userLock.locked) {
        return {
          allowed: false,
          retryAfterSec: userLock.retryAfterSec,
          retryAfterMin: userLock.retryAfterMin,
          reason: 'username_locked',
        };
      }
    }

    // Check IP lockout
    const ipLock = this.isTrackerLocked(this.ipAttempts.get(ip), now);
    if (ipLock.locked) {
      return {
        allowed: false,
        retryAfterSec: ipLock.retryAfterSec,
        retryAfterMin: ipLock.retryAfterMin,
        reason: 'ip_locked',
      };
    }

    const ipActive = this.getActiveAttempts(this.ipAttempts.get(ip), now);
    const userActive = u
      ? this.getActiveAttempts(this.userAttempts.get(u), now)
      : 0;
    const currentMax = Math.max(ipActive, userActive);

    return {
      allowed: true,
      attemptsRemaining: Math.max(0, this.maxAttempts - currentMax),
    };
  }

  recordFailedAttempt(
    rawIp?: string | null,
    username?: string,
  ): RateLimitRecordResult {
    const ip = normalizeClientIp(rawIp);
    const now = Date.now();
    const u = String(username || '')
      .trim()
      .toLowerCase();

    const ipRes = this.recordFailureOnMap(this.ipAttempts, ip, now);
    let userRes: { count: number; locked: boolean; lockedUntil?: number } = {
      count: 0,
      locked: false,
    };

    if (u) {
      userRes = this.recordFailureOnMap(this.userAttempts, u, now);
    }

    const isLocked = ipRes.locked || userRes.locked;
    const lockedUntil = Math.max(
      ipRes.lockedUntil || 0,
      userRes.lockedUntil || 0,
    );

    if (isLocked) {
      const retryAfterSec = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
      const retryAfterMin = Math.max(1, Math.ceil(retryAfterSec / 60));
      const reason: 'ip_locked' | 'username_locked' = userRes.locked
        ? 'username_locked'
        : 'ip_locked';

      this.log.warn(
        `Auth rate limiter: ${reason === 'username_locked' ? `User '${u}'` : `IP '${ip}'`} locked out for ${retryAfterMin} min after ${this.maxAttempts} failed login attempts.`,
      );

      return {
        locked: true,
        retryAfterSec,
        retryAfterMin,
        attemptsRemaining: 0,
        reason,
      };
    }

    const maxCount = Math.max(ipRes.count, userRes.count);
    return {
      locked: false,
      attemptsRemaining: Math.max(0, this.maxAttempts - maxCount),
    };
  }

  recordSuccessfulLogin(rawIp?: string | null, username?: string): void {
    const ip = normalizeClientIp(rawIp);
    const u = String(username || '')
      .trim()
      .toLowerCase();

    this.ipAttempts.delete(ip);
    if (u) {
      this.userAttempts.delete(u);
    }
  }

  // ── Public 2FA Verification Methods ──────────────────────────────────

  check2faAllowed(
    rawIp?: string | null,
    challengeToken?: string,
  ): RateLimitCheckResult {
    const ip = normalizeClientIp(rawIp);
    const token = String(challengeToken || '').trim();
    const now = Date.now();

    if (token) {
      const tokenLock = this.isTrackerLocked(
        this.tokenAttempts.get(token),
        now,
      );
      if (tokenLock.locked) {
        return {
          allowed: false,
          retryAfterSec: tokenLock.retryAfterSec,
          retryAfterMin: tokenLock.retryAfterMin,
          reason: 'token_locked',
        };
      }
    }

    const ipLock = this.isTrackerLocked(this.ipAttempts.get(ip), now);
    if (ipLock.locked) {
      return {
        allowed: false,
        retryAfterSec: ipLock.retryAfterSec,
        retryAfterMin: ipLock.retryAfterMin,
        reason: 'ip_locked',
      };
    }

    const ipActive = this.getActiveAttempts(this.ipAttempts.get(ip), now);
    const tokenActive = token
      ? this.getActiveAttempts(this.tokenAttempts.get(token), now)
      : 0;
    const currentMax = Math.max(ipActive, tokenActive);

    return {
      allowed: true,
      attemptsRemaining: Math.max(0, this.maxAttempts - currentMax),
    };
  }

  recordFailed2fa(
    rawIp?: string | null,
    challengeToken?: string,
  ): RateLimitRecordResult {
    const ip = normalizeClientIp(rawIp);
    const token = String(challengeToken || '').trim();
    const now = Date.now();

    const ipRes = this.recordFailureOnMap(this.ipAttempts, ip, now);
    let tokenRes: { count: number; locked: boolean; lockedUntil?: number } = {
      count: 0,
      locked: false,
    };

    if (token) {
      tokenRes = this.recordFailureOnMap(this.tokenAttempts, token, now);
    }

    const isLocked = ipRes.locked || tokenRes.locked;
    const lockedUntil = Math.max(
      ipRes.lockedUntil || 0,
      tokenRes.lockedUntil || 0,
    );

    if (isLocked) {
      const retryAfterSec = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
      const retryAfterMin = Math.max(1, Math.ceil(retryAfterSec / 60));
      const reason: 'ip_locked' | 'token_locked' = tokenRes.locked
        ? 'token_locked'
        : 'ip_locked';

      this.log.warn(
        `2FA rate limiter: ${reason === 'token_locked' ? `Challenge token` : `IP '${ip}'`} locked out for ${retryAfterMin} min after ${this.maxAttempts} failed 2FA verification attempts.`,
      );

      return {
        locked: true,
        retryAfterSec,
        retryAfterMin,
        attemptsRemaining: 0,
        reason,
      };
    }

    const maxCount = Math.max(ipRes.count, tokenRes.count);
    return {
      locked: false,
      attemptsRemaining: Math.max(0, this.maxAttempts - maxCount),
    };
  }

  recordSuccessful2fa(rawIp?: string | null, challengeToken?: string): void {
    const ip = normalizeClientIp(rawIp);
    const token = String(challengeToken || '').trim();

    this.ipAttempts.delete(ip);
    if (token) {
      this.tokenAttempts.delete(token);
    }
  }

  // ── Maintenance & Reset ──────────────────────────────────────────────

  reset(ip?: string, username?: string): void {
    if (ip) {
      const normIp = normalizeClientIp(ip);
      this.ipAttempts.delete(normIp);
      this.burstTimestamps.delete(normIp);
    }
    if (username) {
      this.userAttempts.delete(username.trim().toLowerCase());
    }
    if (!ip && !username) {
      this.ipAttempts.clear();
      this.userAttempts.clear();
      this.tokenAttempts.clear();
      this.burstTimestamps.clear();
    }
  }

  cleanup(): void {
    const now = Date.now();
    const windowMs = this.windowMinutes * 60 * 1000;

    const prune = (map: Map<string, AttemptTracker>) => {
      for (const [key, tracker] of map.entries()) {
        const isLockExpired =
          !tracker.lockedUntil || tracker.lockedUntil <= now;
        const isWindowExpired = now - tracker.firstAttemptAt > windowMs;
        if (isLockExpired && isWindowExpired) {
          map.delete(key);
        }
      }
    };

    prune(this.ipAttempts);
    prune(this.userAttempts);
    prune(this.tokenAttempts);

    const oneMinAgo = now - 60 * 1000;
    for (const [ip, list] of this.burstTimestamps.entries()) {
      const valid = list.filter((t) => t > oneMinAgo);
      if (valid.length === 0) {
        this.burstTimestamps.delete(ip);
      } else {
        this.burstTimestamps.set(ip, valid);
      }
    }
  }
}
