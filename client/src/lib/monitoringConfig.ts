export type MonitoringMetricId =
  | 'cpu'
  | 'memory'
  | 'ups'
  | 'spm'
  | 'players'
  | 'saveSize'
  | 'evolution'
  | 'pollution';

export interface MonitoringMetricConfigItem {
  id: MonitoringMetricId;
  enabled: boolean;
}

export const GAME_METRIC_IDS: ReadonlySet<MonitoringMetricId> = new Set([
  'ups',
  'spm',
  'evolution',
  'pollution',
]);

export function isGameMetric(id: MonitoringMetricId): boolean {
  return GAME_METRIC_IDS.has(id);
}

export const DEFAULT_MONITORING_METRICS_CONFIG: MonitoringMetricConfigItem[] = [
  { id: 'cpu', enabled: true },
  { id: 'memory', enabled: true },
  { id: 'ups', enabled: true },
  { id: 'spm', enabled: true },
  { id: 'players', enabled: true },
  { id: 'saveSize', enabled: true },
  { id: 'evolution', enabled: true },
  { id: 'pollution', enabled: true },
];

const STORAGE_KEY = 'fcc_monitoring_metrics_config';

export function loadMonitoringMetricsConfig(): MonitoringMetricConfigItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MONITORING_METRICS_CONFIG;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_MONITORING_METRICS_CONFIG;

    const validIds = new Set<MonitoringMetricId>([
      'cpu',
      'memory',
      'ups',
      'spm',
      'players',
      'saveSize',
      'evolution',
      'pollution',
    ]);
    const result: MonitoringMetricConfigItem[] = [];
    const seen = new Set<MonitoringMetricId>();

    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        'id' in item &&
        typeof (item as { id: unknown }).id === 'string' &&
        validIds.has((item as { id: MonitoringMetricId }).id)
      ) {
        const id = (item as { id: MonitoringMetricId }).id;
        if (!seen.has(id)) {
          seen.add(id);
          const enabled =
            'enabled' in item
              ? Boolean((item as { enabled: unknown }).enabled)
              : true;
          result.push({ id, enabled });
        }
      }
    }

    for (const def of DEFAULT_MONITORING_METRICS_CONFIG) {
      if (!seen.has(def.id)) {
        result.push({ ...def });
      }
    }

    return result;
  } catch {
    return DEFAULT_MONITORING_METRICS_CONFIG;
  }
}

export function saveMonitoringMetricsConfig(
  config: MonitoringMetricConfigItem[],
): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}
