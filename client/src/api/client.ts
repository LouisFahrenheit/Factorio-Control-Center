const TOKEN_KEY = 'fcc_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export type ApiOptions = RequestInit & { omitBearer?: boolean };

export async function api<T = Record<string, unknown>>(
  path: string,
  init: ApiOptions = {},
): Promise<T> {
  const { omitBearer, ...fetchInit } = init;
  const headers: Record<string, string> = {
    ...(fetchInit.headers as Record<string, string>),
  };
  const token = getToken();
  if (token && !omitBearer) headers.Authorization = `Bearer ${token}`;
  const lang = localStorage.getItem('fcc_lang') || '';
  if (lang) headers['X-FCC-UI-Lang'] = lang;
  if (fetchInit.body && !(fetchInit.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(path, { ...fetchInit, headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/failed to fetch/i.test(msg)) throw new Error('web_error_failed_fetch');
    throw e;
  }

  const text = await res.text();
  let data: T & { error?: string; message?: string | string[] } = {} as T & {
    error?: string;
    message?: string | string[];
  };
  try {
    data = JSON.parse(text) as T & { error?: string; message?: string | string[] };
  } catch {
    /* non-json */
  }
  if (!res.ok) {
    if (
      token &&
      !omitBearer &&
      (res.status === 401 || (res.status === 403 && path.startsWith('/api/auth/')))
    ) {
      setToken(null);
    }
    const nestMessage = Array.isArray(data?.message)
      ? data.message[0]
      : typeof data?.message === 'string'
        ? data.message
        : undefined;
    const httpError =
      typeof data?.error === 'string' ? data.error.trim() : '';
    const err =
      nestMessage ||
      (httpError && !/^(Forbidden|Unauthorized)$/i.test(httpError) ? httpError : undefined) ||
      (res.status === 403 ? 'invalid_credentials' : undefined) ||
      httpError ||
      text ||
      res.statusText;
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
  return data;
}

const LOGIN_DENIED_KEYS: Record<string, string> = {
  Forbidden: 'web_login_access_denied',
  forbidden: 'web_login_access_denied',
  invalid_credentials: 'web_login_access_denied',
  auth_failed: 'web_login_access_denied',
};

export function isLoginDeniedError(err: string): boolean {
  return String(err || '').trim() in LOGIN_DENIED_KEYS;
}

export function localizeAuthError(err: string, t: (key: string) => string): string {
  const k = String(err || '').trim();
  const localeKey = LOGIN_DENIED_KEYS[k] || k;
  const mapped = t(localeKey);
  return mapped !== localeKey ? mapped : k;
}
