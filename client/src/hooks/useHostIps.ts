import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export function useHostIps(): string[] {
  const query = useQuery({
    queryKey: ['system', 'host-ips'],
    queryFn: async () => {
      try {
        const res = await api<{ host_ips?: string[] }>('/api/host-ips');
        if (Array.isArray(res.host_ips) && res.host_ips.length > 0) {
          return res.host_ips;
        }
      } catch {
        /* try fallback */
      }
      try {
        const health = await api<{ host_ips?: string[] }>('/api/health');
        if (Array.isArray(health.host_ips) && health.host_ips.length > 0) {
          return health.host_ips;
        }
      } catch {
        /* ignore */
      }
      return [];
    },
    staleTime: 60_000,
  });
  return query.data || [];
}
