import { AuthRateLimiterService } from './auth-rate-limiter.service';

describe('AuthRateLimiterService', () => {
  let service: AuthRateLimiterService;

  beforeEach(() => {
    service = new AuthRateLimiterService();
    service.reset();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('checkLoginAllowed & recordFailedAttempt', () => {
    it('should allow initial login attempt and report full attempts remaining', () => {
      const check = service.checkLoginAllowed('192.168.1.10', 'admin');
      expect(check.allowed).toBe(true);
      expect(check.attemptsRemaining).toBe(5);
    });

    it('should decrement remaining attempts upon failed login', () => {
      const res1 = service.recordFailedAttempt('192.168.1.10', 'admin');
      expect(res1.locked).toBe(false);
      expect(res1.attemptsRemaining).toBe(4);

      const check = service.checkLoginAllowed('192.168.1.10', 'admin');
      expect(check.allowed).toBe(true);
      expect(check.attemptsRemaining).toBe(4);
    });

    it('should lock out after 5 failed attempts from the same IP', () => {
      for (let i = 1; i <= 4; i++) {
        const res = service.recordFailedAttempt('192.168.1.50', `user${i}`);
        expect(res.locked).toBe(false);
        expect(res.attemptsRemaining).toBe(5 - i);
      }

      // 5th attempt triggers lockout
      const fifth = service.recordFailedAttempt('192.168.1.50', 'user5');
      expect(fifth.locked).toBe(true);
      expect(fifth.attemptsRemaining).toBe(0);
      expect(fifth.retryAfterMin).toBe(10);
      expect(fifth.retryAfterSec).toBeGreaterThan(0);
      expect(fifth.reason).toBe('ip_locked');

      // Subsequent check should be blocked
      const blocked = service.checkLoginAllowed('192.168.1.50', 'admin');
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toBe('ip_locked');
      expect(blocked.retryAfterMin).toBe(10);
    });

    it('should lock out username after 5 failed attempts across different IPs (distributed attack)', () => {
      for (let i = 1; i <= 4; i++) {
        const res = service.recordFailedAttempt(`10.0.0.${i}`, 'admin');
        expect(res.locked).toBe(false);
      }

      // 5th attempt for 'admin' from another IP
      const fifth = service.recordFailedAttempt('10.0.0.99', 'admin');
      expect(fifth.locked).toBe(true);
      expect(fifth.reason).toBe('username_locked');

      // 'admin' should now be locked even from a brand new IP
      const blocked = service.checkLoginAllowed('10.0.0.123', 'admin');
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toBe('username_locked');

      // But another user from that brand new IP should still be allowed
      const otherUser = service.checkLoginAllowed('10.0.0.123', 'john');
      expect(otherUser.allowed).toBe(true);
    });

    it('should reset failed attempts upon successful login', () => {
      // 3 failed attempts
      service.recordFailedAttempt('192.168.1.20', 'operator');
      service.recordFailedAttempt('192.168.1.20', 'operator');
      service.recordFailedAttempt('192.168.1.20', 'operator');

      expect(
        service.checkLoginAllowed('192.168.1.20', 'operator').attemptsRemaining,
      ).toBe(2);

      // Successful login resets counters
      service.recordSuccessfulLogin('192.168.1.20', 'operator');

      const check = service.checkLoginAllowed('192.168.1.20', 'operator');
      expect(check.allowed).toBe(true);
      expect(check.attemptsRemaining).toBe(5);
    });
  });

  describe('2FA verification rate limiting', () => {
    it('should lock out after 5 failed 2FA verification attempts', () => {
      const challengeToken = 'token_abc_123';
      for (let i = 1; i <= 4; i++) {
        const res = service.recordFailed2fa('192.168.2.1', challengeToken);
        expect(res.locked).toBe(false);
        expect(res.attemptsRemaining).toBe(5 - i);
      }

      const fifth = service.recordFailed2fa('192.168.2.1', challengeToken);
      expect(fifth.locked).toBe(true);
      expect(fifth.reason).toBe('token_locked');

      const check = service.check2faAllowed('192.168.2.1', challengeToken);
      expect(check.allowed).toBe(false);
      expect(check.reason).toBe('token_locked');
    });

    it('should reset 2FA attempts on successful verification', () => {
      const challengeToken = 'token_xyz_789';
      service.recordFailed2fa('192.168.2.5', challengeToken);
      service.recordFailed2fa('192.168.2.5', challengeToken);

      service.recordSuccessful2fa('192.168.2.5', challengeToken);

      const check = service.check2faAllowed('192.168.2.5', challengeToken);
      expect(check.allowed).toBe(true);
      expect(check.attemptsRemaining).toBe(5);
    });
  });

  describe('cleanup and reset', () => {
    it('should clear trackers on manual reset', () => {
      service.recordFailedAttempt('192.168.1.99', 'admin');
      service.reset('192.168.1.99', 'admin');

      const check = service.checkLoginAllowed('192.168.1.99', 'admin');
      expect(check.allowed).toBe(true);
      expect(check.attemptsRemaining).toBe(5);
    });
  });
});
