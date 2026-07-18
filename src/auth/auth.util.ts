import type { Request } from 'express';

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
