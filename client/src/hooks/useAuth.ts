import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '../api/client';
import { resetAuthUiState } from '../lib/authUi';
import { hardNavigate } from '../lib/hardNavigate';
import type { AuthUser } from '../types/instance';

interface AuthMeResponse {
  ok?: boolean;
  user?: AuthUser | null;
}

export function useAuth() {
  const qc = useQueryClient();
  const hasToken = !!getToken();

  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const j = await api<AuthMeResponse>('/api/auth/me');
      if (!j.user) throw new Error('Invalid token');
      return j.user;
    },
    enabled: hasToken,
    staleTime: 60_000,
    retry: false,
  });

  async function logout(redirectTo = '/login') {
    resetAuthUiState();
    try {
      await api('/api/auth/logout', { method: 'POST', omitBearer: true });
    } catch {
      /* ignore */
    }
    qc.removeQueries({ queryKey: ['auth'] });
    hardNavigate(redirectTo);
  }

  return {
    user: query.data ?? null,
    loading: hasToken && !query.isFetched,
    error: query.error,
    refetch: query.refetch,
    logout,
  };
}

export function userHasTab(user: AuthUser | null | undefined, tab: string): boolean {
  const tabs = user?.tabs;
  if (!Array.isArray(tabs)) return false;
  return tabs.includes(tab);
}

export function isAdmin(user: AuthUser | null | undefined): boolean {
  return String(user?.role || '') === 'administrator';
}
