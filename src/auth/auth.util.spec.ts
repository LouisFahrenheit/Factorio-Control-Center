import type { Request } from 'express';
import {
  extractBearerToken,
  requestBearerToken,
  isPrivateOrLoopbackIp,
  extractClientIp,
  AUTH_TOKEN_KEY,
} from './auth.util';

describe('auth.util', () => {
  describe('extractBearerToken', () => {
    it('extracts token from valid Bearer header', () => {
      expect(extractBearerToken('Bearer abc123xyz')).toBe('abc123xyz');
      expect(extractBearerToken('bearer   token-with-spaces  ')).toBe(
        'token-with-spaces',
      );
    });

    it('returns null for missing, empty or malformed authorization headers', () => {
      expect(extractBearerToken(undefined)).toBeNull();
      expect(extractBearerToken('')).toBeNull();
      expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
      expect(extractBearerToken('Bearer ')).toBeNull();
    });
  });

  describe('requestBearerToken', () => {
    it('returns token from request property if present', () => {
      const req = {
        [AUTH_TOKEN_KEY]: 'token-from-req-prop',
        headers: { authorization: 'Bearer other-token' },
      } as unknown as Request;

      expect(requestBearerToken(req)).toBe('token-from-req-prop');
    });

    it('falls back to authorization header if request property not present', () => {
      const req = {
        headers: { authorization: 'Bearer header-token' },
      } as unknown as Request;

      expect(requestBearerToken(req)).toBe('header-token');
    });
  });

  describe('isPrivateOrLoopbackIp', () => {
    it('identifies loopback addresses', () => {
      expect(isPrivateOrLoopbackIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('127.0.1.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('::1')).toBe(true);
      expect(isPrivateOrLoopbackIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('localhost')).toBe(true);
    });

    it('identifies RFC1918 and link-local private network addresses', () => {
      // 10.0.0.0/8
      expect(isPrivateOrLoopbackIp('10.0.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('10.254.0.1')).toBe(true);

      // 172.16.0.0/12 (172.16 - 172.31)
      expect(isPrivateOrLoopbackIp('172.16.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('172.24.5.10')).toBe(true);
      expect(isPrivateOrLoopbackIp('172.31.255.254')).toBe(true);

      // 192.168.0.0/16
      expect(isPrivateOrLoopbackIp('192.168.1.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('192.168.100.50')).toBe(true);

      // 169.254.0.0/16 (link-local)
      expect(isPrivateOrLoopbackIp('169.254.1.1')).toBe(true);

      // IPv6 unique-local (fc00::/7) or link-local (fe80::/10)
      expect(isPrivateOrLoopbackIp('fd12:3456:789a::1')).toBe(true);
      expect(isPrivateOrLoopbackIp('fe80::1')).toBe(true);
    });

    it('returns false for public internet IP addresses', () => {
      expect(isPrivateOrLoopbackIp('8.8.8.8')).toBe(false);
      expect(isPrivateOrLoopbackIp('1.1.1.1')).toBe(false);
      expect(isPrivateOrLoopbackIp('203.0.113.195')).toBe(false);
      expect(isPrivateOrLoopbackIp('172.15.0.1')).toBe(false);
      expect(isPrivateOrLoopbackIp('172.32.0.1')).toBe(false);
      expect(isPrivateOrLoopbackIp('11.0.0.1')).toBe(false);
    });
  });

  describe('extractClientIp', () => {
    it('ignores spoofed X-Forwarded-For when direct connection is from a public IP', () => {
      const req = {
        ip: '203.0.113.50',
        headers: {
          'x-forwarded-for': '1.2.3.4',
        },
      } as unknown as Request;

      // By default (no TRUST_PROXY set), direct connection from public IP does not trust proxy header
      const ip = extractClientIp(req);
      expect(ip).toBe('203.0.113.50');
    });

    it('trusts X-Forwarded-For when direct connection is from loopback (e.g. local Nginx)', () => {
      const req = {
        ip: '127.0.0.1',
        headers: {
          'x-forwarded-for': '198.51.100.22',
        },
      } as unknown as Request;

      const ip = extractClientIp(req);
      expect(ip).toBe('198.51.100.22');
    });

    it('trusts X-Forwarded-For when direct connection is from Docker internal network', () => {
      const req = {
        socket: { remoteAddress: '172.18.0.3' },
        headers: {
          'x-forwarded-for': '198.51.100.44',
        },
      } as unknown as Request;

      const ip = extractClientIp(req);
      expect(ip).toBe('198.51.100.44');
    });

    it('parses the first IP from a comma-separated X-Forwarded-For list', () => {
      const req = {
        ip: '127.0.0.1',
        headers: {
          'x-forwarded-for': '203.0.113.10, 10.0.0.1, 127.0.0.1',
        },
      } as unknown as Request;

      const ip = extractClientIp(req);
      expect(ip).toBe('203.0.113.10');
    });

    it('reads X-Real-IP when X-Forwarded-For is absent and proxy is trusted', () => {
      const req = {
        ip: '127.0.0.1',
        headers: {
          'x-real-ip': '198.51.100.77',
        },
      } as unknown as Request;

      const ip = extractClientIp(req);
      expect(ip).toBe('198.51.100.77');
    });

    it('forces trust when TRUST_PROXY=true even if direct IP is public', () => {
      const req = {
        ip: '203.0.113.50',
        headers: {
          'x-forwarded-for': '1.2.3.4',
        },
      } as unknown as Request;

      const ip = extractClientIp(req, undefined, 'true');
      expect(ip).toBe('1.2.3.4');
    });

    it('disables trust when TRUST_PROXY=false even if direct IP is loopback', () => {
      const req = {
        ip: '127.0.0.1',
        headers: {
          'x-forwarded-for': '1.2.3.4',
        },
      } as unknown as Request;

      const ip = extractClientIp(req, undefined, 'false');
      expect(ip).toBe('127.0.0.1');
    });

    it('falls back to fallbackIp if req has no ip or socket', () => {
      const req = { headers: {} } as unknown as Request;
      expect(extractClientIp(req, '192.168.1.99')).toBe('192.168.1.99');
      expect(extractClientIp(undefined, '10.0.0.5')).toBe('10.0.0.5');
    });
  });
});
