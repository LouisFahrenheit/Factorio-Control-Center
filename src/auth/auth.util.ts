import type { Request } from 'express';
import { normalizeClientIp } from './auth-rate-limiter.service';

export const AUTH_TOKEN_KEY = 'fccToken';

export function extractBearerToken(auth?: string): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(auth || '');
  return m ? m[1].trim() : null;
}

export function requestBearerToken(req: Request): string | null {
  const stored = (req as Request & { [AUTH_TOKEN_KEY]?: string })[
    AUTH_TOKEN_KEY
  ];
  if (stored) return stored;
  return extractBearerToken(req.headers.authorization);
}

/**
 * Checks whether an IP address belongs to loopback, private RFC1918, or link-local address spaces.
 */
export function isPrivateOrLoopbackIp(rawIp: string): boolean {
  const ip = normalizeClientIp(rawIp);
  if (!ip) return false;

  // Loopback (127.0.0.0/8 or ::1)
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.')) {
    return true;
  }

  // Private IPv4 ranges:
  // 10.0.0.0 - 10.255.255.255 (10.0.0.0/8)
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    return true;
  }

  // 172.16.0.0 - 172.31.255.255 (172.16.0.0/12)
  const m172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(ip);
  if (m172) {
    const second = parseInt(m172[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  // 192.168.0.0 - 192.168.255.255 (192.168.0.0/16)
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    return true;
  }

  // Link-local (169.254.0.0/16)
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    return true;
  }

  // IPv6 unique local (fc00::/7) or link-local (fe80::/10)
  const lower = ip.toLowerCase();
  if (
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80:')
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts and normalizes the client IP from an incoming request.
 * Protects against IP spoofing by only honoring X-Forwarded-For / X-Real-IP
 * if the direct connection originates from a trusted reverse proxy (loopback/private IP by default,
 * or explicitly enabled via TRUST_PROXY=true).
 */
export function extractClientIp(
  req?: Request,
  fallbackIp?: string,
  trustProxyEnv = process.env.TRUST_PROXY,
): string {
  const directIp = normalizeClientIp(
    fallbackIp || req?.socket?.remoteAddress || req?.ip,
  );

  const trustSetting = trustProxyEnv?.trim().toLowerCase();
  let shouldTrustProxy = false;

  if (trustSetting === 'true' || trustSetting === '1') {
    shouldTrustProxy = true;
  } else if (trustSetting === 'false' || trustSetting === '0') {
    shouldTrustProxy = false;
  } else {
    // Auto-detection: trust proxy headers only if direct connection comes from loopback or internal proxy
    shouldTrustProxy = isPrivateOrLoopbackIp(directIp);
  }

  if (shouldTrustProxy) {
    const forwarded = req?.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      const first = forwarded.split(',')[0].trim();
      if (first) return normalizeClientIp(first);
    }
    const realIp = req?.headers?.['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) {
      return normalizeClientIp(realIp.trim());
    }
  }

  return directIp;
}
