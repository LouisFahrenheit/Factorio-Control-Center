import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { PanelStatus } from '../types/panel';

export function usePanelStatus(enabled: boolean, activeTab: string, selectedId: string) {
  const interval =
    activeTab === 'main' ? 800 : activeTab === 'stats' || activeTab === 'history' ? 1200 : 2000;
  const id = String(selectedId || '').trim();

  return useQuery({
    queryKey: ['panel', 'status', id],
    queryFn: () => api<PanelStatus>('/api/status'),
    enabled: enabled && !!id,
    refetchInterval: enabled && id ? interval : false,
  });
}
