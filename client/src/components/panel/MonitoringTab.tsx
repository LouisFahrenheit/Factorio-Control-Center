import { useState, useRef, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  IconGauge,
  IconPlayerPause,
  IconPower,
  IconActivity,
  IconBug,
  IconCloudFog,
  IconExternalLink,
  IconAdjustmentsHorizontal,
} from '@tabler/icons-react';
import { api } from '../../api/client';
import { AppIcon } from '../AppIcon';
import { goToInstanceSettings } from '../../lib/goToServers';
import {
  TabLoadingPlaceholder,
  tabInitialLoad,
} from '../TabLoadingPlaceholder';
import { MonitoringSettingsModal } from './MonitoringSettingsModal';
import {
  loadMonitoringMetricsConfig,
  saveMonitoringMetricsConfig,
  isGameMetric,
  type MonitoringMetricConfigItem,
  type MonitoringMetricId,
} from '../../lib/monitoringConfig';

interface MetricPoint {
  [key: string]: string | number | undefined;
  timestamp: string;
  cpu: number;
  cpuMax?: number;
  memory: number;
  memoryMax?: number;
  players: number;
  ups: number;
  upsMin?: number;
  saveSize: number;
  saveSizeMax?: number;
  spm: number;
  spmMax?: number;
  espm?: number;
  espmMax?: number;
  evolution?: number;
  evolutionMax?: number;
  evolutionGleba?: number;
  evolutionGlebaMax?: number;
  pollution?: number;
  pollutionMax?: number;
  pollutionAbsorbed?: number;
  pollutionAbsorbedMax?: number;
  pollutionGleba?: number;
  pollutionGlebaMax?: number;
  pollutionGlebaAbsorbed?: number;
  pollutionGlebaAbsorbedMax?: number;
  pollutionTotal?: number;
  pollutionTotalMax?: number;
  pollutionGlebaTotal?: number;
  pollutionGlebaTotalMax?: number;
}

interface CompanionLiveStatus {
  active: boolean;
  disabled?: boolean;
  game_speed?: number;
  paused?: boolean;
  research?: {
    name?: string;
    localised_name?: string;
    level?: number;
    progress_percent?: number;
    units_done?: number;
    units_total?: number;
    eta_seconds?: number | null;
  } | null;
  evolution?: {
    factor?: number;
    percent?: number;
    nauvis_percent?: number;
    gleba_percent?: number;
  };
  pollution?: {
    nauvis?: number;
    nauvis_absorbed?: number;
    nauvis_total?: number;
    gleba?: number;
    gleba_absorbed?: number;
    gleba_total?: number;
  };
  updatedAt?: number;
}

function formatEta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) return '';
  if (seconds < 60) return `${Math.round(seconds)}с`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s > 0 ? `${m}м ${s}с` : `${m}м`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}ч ${remM}м` : `${h}ч`;
}

function formatTechName(
  name: string | undefined,
  level?: number,
  localisedName?: string,
): string {
  if (localisedName && localisedName.trim()) {
    const trimmed = localisedName.trim();
    if (typeof level === 'number' && level > 1) {
      return `${trimmed} ${level}`;
    }
    return trimmed;
  }
  if (!name) return '';
  let clean = name;
  if (typeof level === 'number') {
    if (/-\d+$/.test(clean)) {
      clean = clean.replace(/-\d+$/, `-${level}`);
    } else {
      clean = `${clean}-${level}`;
    }
  }
  return clean
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function isMetricsModName(name?: string): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return (
    n === 'fcc-metrics' ||
    n === 'factorio-control-center-metrics' ||
    n === 'fcc_metrics' ||
    n.startsWith('fcc-metrics') ||
    n.startsWith('factorio-control-center-metrics') ||
    n.startsWith('fcc_metrics')
  );
}

interface MonitoringTabProps {
  instanceId: string;
  serverRunning: boolean;
  collectGameMetrics?: boolean;
  t: (key: string, ...args: (string | number)[]) => string;
}

type RangeOption = '1h' | '6h' | '24h' | '7d' | '30d' | '90d' | '180d' | '365d';

export function MonitoringTab({
  instanceId,
  serverRunning,
  collectGameMetrics,
  t,
}: MonitoringTabProps) {
  const [range, setRange] = useState<RangeOption>('24h');
  const [spmMode, setSpmMode] = useState<'spm' | 'espm'>(() => {
    try {
      const saved = localStorage.getItem('fcc_monitoring_spm_mode');
      return saved === 'espm' ? 'espm' : 'spm';
    } catch {
      return 'spm';
    }
  });

  const handleSpmModeChange = (mode: 'spm' | 'espm') => {
    setSpmMode(mode);
    try {
      localStorage.setItem('fcc_monitoring_spm_mode', mode);
    } catch {
      /* ignore */
    }
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [metricsConfig, setMetricsConfig] = useState<
    MonitoringMetricConfigItem[]
  >(() => loadMonitoringMetricsConfig());

  const handleMetricsConfigChange = (
    newConfig: MonitoringMetricConfigItem[],
  ) => {
    setMetricsConfig(newConfig);
    saveMonitoringMetricsConfig(newConfig);
  };

  // Query to fetch metrics
  const {
    data: metrics = [],
    isLoading,
    isPlaceholderData,
  } = useQuery<MetricPoint[]>({
    queryKey: ['metrics', instanceId, range],
    queryFn: () =>
      api<MetricPoint[]>(`/api/metrics/${instanceId}?range=${range}`),
    refetchInterval:
      range === '1h' || range === '6h' || range === '24h' ? 30000 : false, // Poll active ranges every 30s
    enabled: !!instanceId,
    placeholderData: keepPreviousData,
  });

  // Query to fetch live companion mod status (current research, progress, speed, paused)
  const { data: liveData } = useQuery<CompanionLiveStatus | null>({
    queryKey: ['metrics-live', instanceId],
    queryFn: () =>
      api<CompanionLiveStatus | null>(`/api/metrics/${instanceId}/live`),
    refetchInterval: serverRunning ? 5000 : false,
    enabled: !!instanceId && serverRunning,
  });

  // Query to check installed mods on the instance (works both when server is running and stopped)
  const { data: modListResponse } = useQuery<{
    data?: { mods?: Array<{ name?: string; enabled?: boolean }> };
  }>({
    queryKey: ['files', 'mod-list', instanceId],
    queryFn: () =>
      api<{ data?: { mods?: Array<{ name?: string; enabled?: boolean }> } }>(
        `/api/files/mod-list?instance_id=${instanceId}`,
      ),
    enabled: !!instanceId,
  });

  const { data: instancesData } = useQuery<{
    items?: Array<{ id: string; collectGameMetrics?: boolean }>;
  }>({
    queryKey: ['instances'],
    queryFn: () =>
      api<{ items?: Array<{ id: string; collectGameMetrics?: boolean }> }>(
        '/api/instances',
      ),
    enabled: typeof collectGameMetrics !== 'boolean' && !!instanceId,
  });

  const isMetricsDisabledInSettings = useMemo(() => {
    if (typeof collectGameMetrics === 'boolean') {
      return !collectGameMetrics;
    }
    const list = instancesData?.items;
    if (Array.isArray(list)) {
      const found = list.find((x) => String(x.id) === instanceId);
      if (found && typeof found.collectGameMetrics === 'boolean') {
        return !found.collectGameMetrics;
      }
    }
    return false;
  }, [collectGameMetrics, instancesData, instanceId]);

  const metricsModEntry = useMemo(() => {
    const list = modListResponse?.data?.mods;
    if (!Array.isArray(list)) return undefined;
    return list.find((m) => m && isMetricsModName(m.name));
  }, [modListResponse]);

  const isModInstalled = Boolean(metricsModEntry);
  const isModDisabled = Boolean(
    metricsModEntry ? metricsModEntry.enabled === false : liveData?.disabled,
  );

  const showLiveWidget = Boolean(
    serverRunning && liveData?.active && !isModDisabled,
  );
  const showPromoBanner = Boolean(
    !showLiveWidget &&
      (!isModInstalled || isModDisabled) &&
      (!serverRunning || (liveData !== undefined && !liveData?.active)),
  );

  const hasGameMetrics = useMemo(() => {
    if (liveData?.active && !isModDisabled) return true;
    return metrics.some(
      (m) =>
        (m.spm ?? 0) > 0 ||
        (m.espm ?? 0) > 0 ||
        (m.evolution ?? 0) > 0 ||
        (m.evolutionGleba ?? 0) > 0 ||
        (m.pollution ?? 0) > 0 ||
        (m.pollutionGleba ?? 0) > 0 ||
        (m.pollutionTotal ?? 0) > 0,
    );
  }, [liveData?.active, isModDisabled, metrics]);

  const visibleMetrics = useMemo(() => {
    return metricsConfig.filter(
      (item) => item.enabled && (!isGameMetric(item.id) || hasGameMetrics),
    );
  }, [metricsConfig, hasGameMetrics]);

  const initialLoading = tabInitialLoad(isLoading, metrics.length > 0);

  const rangeButtons: { key: RangeOption; label: string }[] = [
    { key: '1h', label: t('range_1h') || '1 ч' },
    { key: '6h', label: t('range_6h') || '6 ч' },
    { key: '24h', label: t('range_24h') || '24 ч' },
    { key: '7d', label: t('range_7d') || '7 дн' },
    { key: '30d', label: t('range_30d') || '30 дн' },
    { key: '90d', label: t('range_90d') || '90 дн' },
    { key: '180d', label: t('range_180d') || '180 дн' },
    { key: '365d', label: t('range_365d') || '1 год' },
  ];

  const renderChart = (id: MonitoringMetricId) => {
    switch (id) {
      case 'cpu':
        return (
          <ChartCard
            key="cpu"
            title={t('metric_cpu_usage') || 'Использование CPU (%)'}
            icon={
              <AppIcon
                name="cpu"
                size={18}
                style={{ color: 'var(--mantine-color-blue-filled)' }}
              />
            }
            metrics={metrics}
            metricKey="cpu"
            yMaxDefault={100}
            color="var(--mantine-color-blue-filled)"
            gradientId="gradCpu"
            valueFormatter={(v) => `${v.toFixed(1)}%`}
            showMax={range !== '1h' && range !== '6h' && range !== '24h'}
            t={t}
            range={range}
            isUpdating={isPlaceholderData}
          />
        );

      case 'memory':
        return (
          <ChartCard
            key="memory"
            title={
              t('metric_memory_usage') || 'Использование оперативной памяти'
            }
            icon={
              <AppIcon
                name="memory"
                size={18}
                style={{ color: 'var(--mantine-color-orange-filled)' }}
              />
            }
            metrics={metrics}
            metricKey="memory"
            yMaxDefault={1024 * 1024 * 1024} // 1 GB in bytes
            color="var(--mantine-color-orange-filled)"
            gradientId="gradMemory"
            valueFormatter={(v) => formatBytes(v)}
            showMax={range !== '1h' && range !== '6h' && range !== '24h'}
            t={t}
            range={range}
            isUpdating={isPlaceholderData}
          />
        );

      case 'ups':
        return (
          <ChartCard
            key="ups"
            title={t('metric_ups') || 'UPS (Тактов в секунду)'}
            icon={
              <IconActivity
                size={18}
                color="var(--mantine-color-yellow-filled)"
              />
            }
            metrics={metrics}
            metricKey="ups"
            yMaxDefault={60}
            color="var(--mantine-color-yellow-filled)"
            gradientId="gradUps"
            valueFormatter={(v) => `${v.toFixed(1)}`}
            showMin={range !== '1h' && range !== '6h' && range !== '24h'}
            t={t}
            range={range}
            isUpdating={isPlaceholderData}
          />
        );

      case 'spm':
        return (
          <ChartCard
            key="spm"
            title={
              spmMode === 'espm'
                ? t('metric_espm') || 'ESPM'
                : t('metric_spm') || 'SPM'
            }
            icon={
              <AppIcon
                name="science"
                size={18}
                style={{
                  color:
                    spmMode === 'espm'
                      ? 'var(--mantine-color-grape-filled, #cc5de8)'
                      : 'var(--mantine-color-cyan-filled)',
                }}
              />
            }
            headerRight={
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background:
                    'var(--mantine-color-dark-8, rgba(0, 0, 0, 0.35))',
                  border:
                    '1px solid var(--mantine-color-dark-4, rgba(255, 255, 255, 0.1))',
                  borderRadius: '6px',
                  padding: '2px',
                  gap: '2px',
                }}
              >
                <button
                  type="button"
                  className={`btn btn--compact ${spmMode === 'spm' ? 'btn--active' : ''}`}
                  style={{
                    border: 'none',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: spmMode === 'spm' ? 700 : 500,
                    background:
                      spmMode === 'spm'
                        ? 'var(--mantine-color-cyan-filled, #15aabf)'
                        : 'transparent',
                    color:
                      spmMode === 'spm' ? '#fff' : 'var(--mantine-color-dimmed)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => handleSpmModeChange('spm')}
                >
                  {t('metric_spm') || 'SPM'}
                </button>
                <button
                  type="button"
                  className={`btn btn--compact ${spmMode === 'espm' ? 'btn--active' : ''}`}
                  style={{
                    border: 'none',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: spmMode === 'espm' ? 700 : 500,
                    background:
                      spmMode === 'espm'
                        ? 'var(--mantine-color-grape-filled, #cc5de8)'
                        : 'transparent',
                    color:
                      spmMode === 'espm'
                        ? '#fff'
                        : 'var(--mantine-color-dimmed)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => handleSpmModeChange('espm')}
                >
                  {t('metric_espm') || 'ESPM'}
                </button>
              </div>
            }
            metrics={metrics}
            metricKey={spmMode}
            yMaxDefault={100}
            color={
              spmMode === 'espm'
                ? 'var(--mantine-color-grape-filled, #cc5de8)'
                : 'var(--mantine-color-cyan-filled)'
            }
            gradientId={spmMode === 'espm' ? 'gradEspm' : 'gradSpm'}
            valueFormatter={(v) => `${Math.round(v)}`}
            showMax={range !== '1h' && range !== '6h' && range !== '24h'}
            t={t}
            range={range}
            isUpdating={isPlaceholderData}
          />
        );

      case 'players':
        return (
          <ChartCard
            key="players"
            title={t('metric_players_online') || 'Онлайн игроков'}
            icon={
              <AppIcon
                name="users"
                size={18}
                style={{ color: 'var(--mantine-color-green-filled)' }}
              />
            }
            metrics={metrics}
            metricKey="players"
            yMaxDefault={5}
            color="var(--mantine-color-green-filled)"
            gradientId="gradPlayers"
            valueFormatter={(v) => `${Math.round(v)}`}
            t={t}
            range={range}
            isUpdating={isPlaceholderData}
          />
        );

      case 'saveSize':
        return (
          <ChartCard
            key="saveSize"
            title={t('metric_save_size') || 'Размер файла сохранения'}
            icon={
              <AppIcon
                name="save"
                size={18}
                style={{ color: 'var(--mantine-color-pink-filled)' }}
              />
            }
            metrics={metrics}
            metricKey="saveSize"
            yMaxDefault={1024 * 1024} // 1 MB in bytes
            color="var(--mantine-color-pink-filled)"
            gradientId="gradSaveSize"
            valueFormatter={(v) => formatBytes(v)}
            showMax={range !== '1h' && range !== '6h' && range !== '24h'}
            t={t}
            range={range}
            isUpdating={isPlaceholderData}
          />
        );

      case 'evolution':
        return (
          <EvolutionChartCard
            key="evolution"
            metrics={metrics}
            range={range}
            isUpdating={isPlaceholderData}
            t={t}
          />
        );

      case 'pollution':
        return (
          <PollutionChartCard
            key="pollution"
            metrics={metrics}
            range={range}
            isUpdating={isPlaceholderData}
            t={t}
            livePollution={liveData?.pollution}
          />
        );
    }
  };

  return (
    <div
      id="tabPanelMonitoring"
      className="tab-panel tab-panel--active monitoring-tab"
      role="tabpanel"
      aria-labelledby="tabBtnMonitoring"
    >
      <div
        className="monitoring-tab__header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            flexWrap: 'wrap',
          }}
        >
          {showLiveWidget && liveData ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '12px',
                padding: '6px 14px',
                background:
                  'linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.015) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.09)',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                minWidth: '380px',
                width: '460px',
                maxWidth: '100%',
                minHeight: '56px',
                boxSizing: 'border-box',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  minWidth: 0,
                  justifyContent: 'center',
                  gap: '5px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    minWidth: 0,
                  }}
                >
                  <AppIcon
                    name={liveData.research ? 'science' : 'science_off'}
                    size={18}
                    title={t('metric_live_research') || 'Текущее исследование'}
                    style={{
                      color: liveData.research
                        ? 'var(--accent)'
                        : 'var(--mantine-color-dimmed)',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: liveData.research
                        ? 'var(--mantine-color-text)'
                        : 'var(--mantine-color-dimmed)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={
                      liveData.research?.name
                        ? formatTechName(
                            liveData.research.name,
                            liveData.research.level,
                            liveData.research.localised_name,
                          )
                        : t('metric_live_no_research') ||
                          'Нет активных исследований'
                    }
                  >
                    {liveData.research?.name
                      ? formatTechName(
                          liveData.research.name,
                          liveData.research.level,
                          liveData.research.localised_name,
                        )
                      : t('metric_live_no_research') ||
                        'Нет активных исследований'}
                  </span>
                </div>

                {liveData.research &&
                  typeof liveData.research.progress_percent === 'number' && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                      }}
                    >
                      <div
                        style={{
                          position: 'relative',
                          width: '100%',
                          height: '5px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          borderRadius: '9999px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, Math.max(0, liveData.research.progress_percent))}%`,
                            background:
                              'linear-gradient(90deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 75%, white 25%) 100%)',
                            borderRadius: '9999px',
                            transition: 'width 0.4s ease',
                            boxShadow:
                              '0 0 6px color-mix(in srgb, var(--accent) 40%, transparent)',
                          }}
                        />
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.72rem',
                          color: 'var(--mantine-color-dimmed)',
                          lineHeight: 1,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 700,
                              color: 'var(--accent)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {liveData.research.progress_percent.toFixed(1)}%
                          </span>
                          {typeof liveData.research.units_done === 'number' &&
                            typeof liveData.research.units_total ===
                              'number' && (
                              <>
                                <span style={{ opacity: 0.4 }}>•</span>
                                <span
                                  style={{ fontVariantNumeric: 'tabular-nums' }}
                                >
                                  {liveData.research.units_done.toLocaleString()}{' '}
                                  /{' '}
                                  {liveData.research.units_total.toLocaleString()}
                                </span>
                              </>
                            )}
                        </div>
                        {liveData.research.eta_seconds && (
                          <span
                            style={{
                              marginLeft: 'auto',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            ~{formatEta(liveData.research.eta_seconds)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
              </div>

              {/* Status Badge: Replaced with Paused / Disabled when applicable */}
              {(liveData.disabled ||
                isModDisabled ||
                liveData.paused ||
                typeof liveData.game_speed === 'number') && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
                    paddingLeft: '10px',
                    flexShrink: 0,
                  }}
                >
                  {liveData.disabled || isModDisabled ? (
                    <div
                      title={t('metric_live_disabled') || 'Отключен'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        minWidth: '68px',
                        borderRadius: '12px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: 'var(--mantine-color-dimmed)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        boxSizing: 'border-box',
                      }}
                    >
                      <IconPower size={12} />
                      <span>{t('metric_live_disabled') || 'Отключен'}</span>
                    </div>
                  ) : liveData.paused ? (
                    <div
                      title={t('metric_live_paused') || 'Пауза'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        minWidth: '68px',
                        borderRadius: '12px',
                        background:
                          'color-mix(in srgb, var(--accent) 15%, transparent)',
                        border:
                          '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
                        color: 'var(--accent)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        boxSizing: 'border-box',
                      }}
                    >
                      <IconPlayerPause size={12} />
                      <span>{t('metric_live_paused') || 'Пауза'}</span>
                    </div>
                  ) : typeof liveData.game_speed === 'number' ? (
                    <div
                      title={`${t('metric_live_speed') || 'Скорость'}: ${liveData.game_speed}x`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        minWidth: '68px',
                        borderRadius: '12px',
                        background:
                          liveData.game_speed !== 1
                            ? 'rgba(245, 159, 0, 0.15)'
                            : 'rgba(255, 255, 255, 0.06)',
                        border: `1px solid ${
                          liveData.game_speed !== 1
                            ? 'rgba(245, 159, 0, 0.35)'
                            : 'rgba(255, 255, 255, 0.1)'
                        }`,
                        color:
                          liveData.game_speed !== 1
                            ? '#fab005'
                            : 'var(--mantine-color-dimmed)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        boxSizing: 'border-box',
                      }}
                    >
                      <IconGauge size={13} />
                      <span>{liveData.game_speed}x</span>
                    </div>
                  ) : null}
                </div>
              )}
              </motion.div>
            ) : showPromoBanner ? (
              <motion.div
                onClick={() => {
                  if (isModDisabled) {
                    document.getElementById('tabBtnMods')?.click();
                  } else {
                    window.open(
                      'https://mods.factorio.com/mod/factorio-control-center-metrics',
                      '_blank',
                      'noopener,noreferrer',
                    );
                  }
                }}
                title={
                  isModDisabled
                    ? t('metrics_mod_disabled_desc') ||
                      'Мод выключен в списке модов сервера'
                    : t('metrics_mod_promo_tip') ||
                      'Страница мода на портале Factorio'
                }
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                whileHover={{ y: -1 }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '6px 14px',
                  background:
                    'linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%)',
                  border: isModDisabled
                    ? '1px solid rgba(245, 159, 0, 0.25)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  minWidth: '380px',
                  width: '460px',
                  maxWidth: '100%',
                  minHeight: '56px',
                  boxSizing: 'border-box',
                  flexShrink: 0,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                className="monitoring-promo-banner"
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '6px',
                      background: isModDisabled
                        ? 'rgba(245, 159, 0, 0.08)'
                        : 'rgba(255, 255, 255, 0.04)',
                      border: isModDisabled
                        ? '1px solid rgba(245, 159, 0, 0.2)'
                        : '1px solid rgba(255, 255, 255, 0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <AppIcon
                      name={isModDisabled ? 'science_off' : 'science'}
                      size={18}
                      style={{
                        color: isModDisabled
                          ? 'var(--mantine-color-yellow-filled)'
                          : 'var(--mantine-color-cyan-filled)',
                        opacity: isModDisabled ? 0.9 : 0.8,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: 'var(--mantine-color-text)',
                        }}
                      >
                        {t('metrics_mod_promo_title') || 'FCC: Metrics'}
                      </span>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: isModDisabled
                            ? 'rgba(245, 159, 0, 0.15)'
                            : 'rgba(255, 255, 255, 0.08)',
                          border: isModDisabled
                            ? '1px solid rgba(245, 159, 0, 0.3)'
                            : undefined,
                          color: isModDisabled
                            ? '#fab005'
                            : 'var(--mantine-color-dimmed)',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {isModDisabled
                          ? t('metrics_mod_disabled_badge') || 'Отключен'
                          : t('metrics_mod_promo_badge') || 'Мод'}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.73rem',
                        color: 'var(--mantine-color-dimmed)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {isModDisabled
                        ? t('metrics_mod_disabled_desc') ||
                          'Мод выключен в списке модов сервера'
                        : t('metrics_mod_promo_desc') ||
                          'Живые исследования, точный UPS, ESPM и загрязнение'}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: isModDisabled
                      ? 'rgba(245, 159, 0, 0.12)'
                      : 'rgba(255, 255, 255, 0.04)',
                    border: isModDisabled
                      ? '1px solid rgba(245, 159, 0, 0.28)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    color: isModDisabled
                      ? '#fab005'
                      : 'var(--mantine-color-text)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {isModDisabled ? (
                    <>
                      <IconPower size={13} />
                      <span>{t('metrics_mod_enable_btn') || 'Включить'}</span>
                    </>
                  ) : (
                    <>
                      <span>{t('metrics_mod_promo_btn') || 'Установить'}</span>
                      <IconExternalLink size={12} style={{ opacity: 0.6 }} />
                    </>
                  )}
                </div>
              </motion.div>
            ) : null}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <div
            className="btn-group"
            style={{
              display: 'flex',
              background: 'var(--mantine-color-dark-6)',
              borderRadius: '6px',
              padding: '4px',
            }}
          >
            {rangeButtons.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className="btn btn--compact"
                style={{
                  position: 'relative',
                  background: 'transparent',
                  color:
                    range === opt.key
                      ? 'var(--accent-selected, #f1be64)'
                      : 'var(--mantine-color-text)',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: range === opt.key ? 600 : 500,
                  transition: 'color 0.2s',
                }}
                onClick={() => setRange(opt.key)}
              >
                {range === opt.key && (
                  <motion.div
                    layoutId="activeRangeHighlight"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background:
                        'color-mix(in srgb, var(--accent) 20%, var(--mantine-color-dark-5))',
                      border:
                        '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                      borderRadius: '4px',
                      zIndex: 1,
                    }}
                    transition={{
                      type: 'spring',
                      stiffness: 380,
                      damping: 30,
                    }}
                  />
                )}
                <span style={{ position: 'relative', zIndex: 2 }}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setSettingsOpen(true)}
            title={t('monitoring_settings_btn') || 'Настроить графики'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              height: '36px',
              background: 'var(--mantine-color-dark-6)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'var(--mantine-color-text)',
              transition: 'background 0.2s, border-color 0.2s',
            }}
          >
            <IconAdjustmentsHorizontal size={16} />
            <span>{t('monitoring_settings_btn') || 'Настроить графики'}</span>
          </button>
        </div>
      </div>

      {initialLoading ? (
        <TabLoadingPlaceholder
          variant="dashboard"
          label={t('tab_data_loading') || 'Загрузка данных...'}
        />
      ) : metrics.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '300px',
            background: 'var(--mantine-color-dark-7)',
            borderRadius: '8px',
            border: '1px dashed var(--mantine-color-dark-4)',
            padding: '28px 24px',
            color: 'var(--mantine-color-dimmed)',
          }}
        >
          <span style={{ fontSize: '1.1rem', marginBottom: '8px' }}>
            {t('no_metrics_title') || 'Нет данных'}
          </span>
          <span
            style={{
              fontSize: '0.85rem',
              textAlign: 'center',
              maxWidth: '420px',
            }}
          >
            {t('no_metrics_desc') ||
              'Метрики появятся после запуска сервера и сбора первого отсчета.'}
          </span>
          {isMetricsDisabledInSettings && (
            <div
              style={{
                marginTop: '16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--mantine-color-dimmed)',
                  textAlign: 'center',
                  maxWidth: '420px',
                }}
              >
                {t('no_metrics_disabled_in_settings') ||
                  'Сбор метрик выключен в настройках сервера.'}
              </span>
              <button
                type="button"
                className="btn btn--secondary btn--compact"
                onClick={() => goToInstanceSettings(instanceId)}
                title={t('no_metrics_open_settings_btn') || 'Настройки сервера'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: 'var(--mantine-color-text)',
                  cursor: 'pointer',
                  transition: 'background 0.2s, border-color 0.2s',
                }}
              >
                <AppIcon name="edit" size={15} />
                <span>
                  {t('no_metrics_open_settings_btn') || 'Настройки сервера'}
                </span>
              </button>
            </div>
          )}
        </div>
      ) : visibleMetrics.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '280px',
            background: 'var(--mantine-color-dark-7)',
            borderRadius: '8px',
            border: '1px dashed var(--mantine-color-dark-4)',
            padding: '32px 24px',
            color: 'var(--mantine-color-dimmed)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '14px',
            }}
          >
            <IconAdjustmentsHorizontal
              size={24}
              style={{
                opacity: 0.6,
                color: 'var(--mantine-color-blue-filled)',
              }}
            />
          </div>
          <span
            style={{
              fontSize: '1.05rem',
              fontWeight: 600,
              marginBottom: '6px',
              color: 'var(--mantine-color-text)',
            }}
          >
            {t('monitoring_settings_all_hidden') ||
              'Все графики скрыты в настройках'}
          </span>
          <span
            style={{
              fontSize: '0.85rem',
              textAlign: 'center',
              maxWidth: '420px',
              marginBottom: '16px',
            }}
          >
            {t('monitoring_settings_all_hidden_desc') ||
              'Включите необходимые графики в настройках отображения.'}
          </span>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setSettingsOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <IconAdjustmentsHorizontal size={16} />
            <span>{t('monitoring_settings_btn') || 'Настроить графики'}</span>
          </button>
        </div>
      ) : (
        <div className="monitoring-grid">
          {visibleMetrics.map((item) => renderChart(item.id))}
        </div>
      )}

      <MonitoringSettingsModal
        open={settingsOpen}
        config={metricsConfig}
        onChange={handleMetricsConfigChange}
        onClose={() => setSettingsOpen(false)}
        hasGameMetrics={hasGameMetrics}
        isModDisabled={isModDisabled}
        t={t}
      />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

interface ChartCardProps {
  title: string;
  icon?: React.ReactNode;
  headerRight?: React.ReactNode;
  metrics: MetricPoint[];
  metricKey:
    | 'cpu'
    | 'memory'
    | 'players'
    | 'ups'
    | 'saveSize'
    | 'spm'
    | 'espm'
    | 'evolution'
    | 'pollution';
  secondarySeriesKey?: 'evolutionGleba' | 'pollutionGleba';
  secondarySeriesLabel?: string;
  secondarySeriesColor?: string;
  primarySeriesLabel?: string;
  yMaxDefault: number;
  color: string;
  gradientId: string;
  valueFormatter: (val: number) => string;
  showMax?: boolean;
  showMin?: boolean;
  t: (key: string, ...args: (string | number)[]) => string;
  range: RangeOption;
  isUpdating?: boolean;
}

function ChartCard({
  title,
  icon,
  headerRight,
  metrics,
  metricKey,
  secondarySeriesKey,
  secondarySeriesLabel,
  secondarySeriesColor,
  primarySeriesLabel,
  yMaxDefault,
  color,
  gradientId,
  valueFormatter,
  showMax = false,
  showMin = false,
  t,
  range,
  isUpdating = false,
}: ChartCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const hasSecondary = showMax || showMin;
  const secondaryKey = useMemo(() => {
    if (showMax) {
      if (metricKey === 'cpu') return 'cpuMax';
      if (metricKey === 'memory') return 'memoryMax';
      if (metricKey === 'saveSize') return 'saveSizeMax';
      if (metricKey === 'spm') return 'spmMax';
      if (metricKey === 'espm') return 'espmMax';
      if (metricKey === 'evolution') return 'evolutionMax';
      if (metricKey === 'pollution') return 'pollutionMax';
    }
    if (showMin) {
      if (metricKey === 'ups') return 'upsMin';
    }
    return null;
  }, [showMax, showMin, metricKey]);

  // Get max values for Y scaling
  const maxAvgValue = useMemo(() => {
    return Math.max(...metrics.map((m) => Number(m[metricKey] ?? 0)), 0.1);
  }, [metrics, metricKey]);

  const maxSecondaryValue = useMemo(() => {
    if (!hasSecondary || !secondaryKey) return 0;
    return Math.max(
      ...metrics.map((m) =>
        m[secondaryKey] !== undefined ? Number(m[secondaryKey]) : 0,
      ),
      0.1,
    );
  }, [metrics, secondaryKey, hasSecondary]);

  const yMax = useMemo(() => {
    if (metricKey === 'evolution') {
      return 100;
    }
    if (metricKey === 'ups') {
      const maxUps = Math.max(maxAvgValue, maxSecondaryValue);
      if (maxUps <= 61) return 60;
      return Math.ceil(maxUps / 60) * 60;
    }
    return Math.max(yMaxDefault, maxAvgValue, maxSecondaryValue) * 1.15;
  }, [metricKey, yMaxDefault, maxAvgValue, maxSecondaryValue]);

  // Chart coordinates calculations
  const width = 1000;
  const height = 180;
  const paddingLeft = 110;
  const paddingRight = 45;
  const paddingTop = 15;
  const paddingBottom = 35;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Target points count for uniform path structure to enable smooth Framer Motion transitions
  const targetPointsCount = 120;

  const resampledMetrics = useMemo(() => {
    if (metrics.length === 0) return [];
    if (metrics.length === 1) {
      return Array.from({ length: targetPointsCount }, () => ({
        ...metrics[0],
      }));
    }

    const result: MetricPoint[] = [];
    for (let i = 0; i < targetPointsCount; i++) {
      const progress = i / (targetPointsCount - 1);
      const rawIndex = progress * (metrics.length - 1);
      const indexLow = Math.floor(rawIndex);
      const indexHigh = Math.ceil(rawIndex);
      const weight = rawIndex - indexLow;

      const pLow = metrics[indexLow];
      const pHigh = metrics[indexHigh];

      // Interpolate numeric values
      const cpu = pLow.cpu + (pHigh.cpu - pLow.cpu) * weight;
      const memory = pLow.memory + (pHigh.memory - pLow.memory) * weight;
      const players = pLow.players + (pHigh.players - pLow.players) * weight;
      const ups = pLow.ups + (pHigh.ups - pLow.ups) * weight;
      const saveSize =
        pLow.saveSize + (pHigh.saveSize - pLow.saveSize) * weight;
      const spm = pLow.spm + (pHigh.spm - pLow.spm) * weight;
      const espm =
        (pLow.espm ?? 0) + ((pHigh.espm ?? 0) - (pLow.espm ?? 0)) * weight;

      // Handle optional properties
      const cpuMax =
        pLow.cpuMax !== undefined && pHigh.cpuMax !== undefined
          ? pLow.cpuMax + (pHigh.cpuMax - pLow.cpuMax) * weight
          : pLow.cpuMax !== undefined
            ? pLow.cpuMax
            : pLow.cpu;

      const memoryMax =
        pLow.memoryMax !== undefined && pHigh.memoryMax !== undefined
          ? pLow.memoryMax + (pHigh.memoryMax - pLow.memoryMax) * weight
          : pLow.memoryMax !== undefined
            ? pLow.memoryMax
            : pLow.memory;

      const upsMin =
        pLow.upsMin !== undefined && pHigh.upsMin !== undefined
          ? pLow.upsMin + (pHigh.upsMin - pLow.upsMin) * weight
          : pLow.upsMin !== undefined
            ? pLow.upsMin
            : pLow.ups;

      const saveSizeMax =
        pLow.saveSizeMax !== undefined && pHigh.saveSizeMax !== undefined
          ? pLow.saveSizeMax + (pHigh.saveSizeMax - pLow.saveSizeMax) * weight
          : pLow.saveSizeMax !== undefined
            ? pLow.saveSizeMax
            : pLow.saveSize;

      const spmMax =
        pLow.spmMax !== undefined && pHigh.spmMax !== undefined
          ? pLow.spmMax + (pHigh.spmMax - pLow.spmMax) * weight
          : pLow.spmMax !== undefined
            ? pLow.spmMax
            : pLow.spm;

      const espmMax =
        pLow.espmMax !== undefined && pHigh.espmMax !== undefined
          ? pLow.espmMax + (pHigh.espmMax - pLow.espmMax) * weight
          : pLow.espmMax !== undefined
            ? pLow.espmMax
            : (pLow.espm ?? espm);

      const evolution =
        pLow.evolution !== undefined && pHigh.evolution !== undefined
          ? pLow.evolution + (pHigh.evolution - pLow.evolution) * weight
          : (pLow.evolution ?? 0);
      const evolutionMax =
        pLow.evolutionMax !== undefined && pHigh.evolutionMax !== undefined
          ? pLow.evolutionMax +
            (pHigh.evolutionMax - pLow.evolutionMax) * weight
          : (pLow.evolutionMax ?? evolution);

      const evolutionGleba =
        pLow.evolutionGleba !== undefined && pHigh.evolutionGleba !== undefined
          ? pLow.evolutionGleba +
            (pHigh.evolutionGleba - pLow.evolutionGleba) * weight
          : (pLow.evolutionGleba ?? 0);
      const evolutionGlebaMax =
        pLow.evolutionGlebaMax !== undefined &&
        pHigh.evolutionGlebaMax !== undefined
          ? pLow.evolutionGlebaMax +
            (pHigh.evolutionGlebaMax - pLow.evolutionGlebaMax) * weight
          : (pLow.evolutionGlebaMax ?? evolutionGleba);

      const pollution =
        pLow.pollution !== undefined && pHigh.pollution !== undefined
          ? pLow.pollution + (pHigh.pollution - pLow.pollution) * weight
          : (pLow.pollution ?? 0);
      const pollutionMax =
        pLow.pollutionMax !== undefined && pHigh.pollutionMax !== undefined
          ? pLow.pollutionMax +
            (pHigh.pollutionMax - pLow.pollutionMax) * weight
          : (pLow.pollutionMax ?? pollution);

      const pollutionAbsorbed =
        pLow.pollutionAbsorbed !== undefined &&
        pHigh.pollutionAbsorbed !== undefined
          ? pLow.pollutionAbsorbed +
            (pHigh.pollutionAbsorbed - pLow.pollutionAbsorbed) * weight
          : (pLow.pollutionAbsorbed ?? 0);
      const pollutionAbsorbedMax =
        pLow.pollutionAbsorbedMax !== undefined &&
        pHigh.pollutionAbsorbedMax !== undefined
          ? pLow.pollutionAbsorbedMax +
            (pHigh.pollutionAbsorbedMax - pLow.pollutionAbsorbedMax) * weight
          : (pLow.pollutionAbsorbedMax ?? pollutionAbsorbed);

      const pollutionGleba =
        pLow.pollutionGleba !== undefined && pHigh.pollutionGleba !== undefined
          ? pLow.pollutionGleba +
            (pHigh.pollutionGleba - pLow.pollutionGleba) * weight
          : (pLow.pollutionGleba ?? 0);
      const pollutionGlebaMax =
        pLow.pollutionGlebaMax !== undefined &&
        pHigh.pollutionGlebaMax !== undefined
          ? pLow.pollutionGlebaMax +
            (pHigh.pollutionGlebaMax - pLow.pollutionGlebaMax) * weight
          : (pLow.pollutionGlebaMax ?? pollutionGleba);

      const pollutionGlebaAbsorbed =
        pLow.pollutionGlebaAbsorbed !== undefined &&
        pHigh.pollutionGlebaAbsorbed !== undefined
          ? pLow.pollutionGlebaAbsorbed +
            (pHigh.pollutionGlebaAbsorbed - pLow.pollutionGlebaAbsorbed) *
              weight
          : (pLow.pollutionGlebaAbsorbed ?? 0);
      const pollutionGlebaAbsorbedMax =
        pLow.pollutionGlebaAbsorbedMax !== undefined &&
        pHigh.pollutionGlebaAbsorbedMax !== undefined
          ? pLow.pollutionGlebaAbsorbedMax +
            (pHigh.pollutionGlebaAbsorbedMax - pLow.pollutionGlebaAbsorbedMax) *
              weight
          : (pLow.pollutionGlebaAbsorbedMax ?? pollutionGlebaAbsorbed);

      // Choose timestamp: use the closer one to keep date displays accurate
      const timestamp = weight < 0.5 ? pLow.timestamp : pHigh.timestamp;

      result.push({
        timestamp,
        cpu,
        cpuMax,
        memory,
        memoryMax,
        players,
        ups,
        upsMin,
        saveSize,
        saveSizeMax,
        spm,
        spmMax,
        espm,
        espmMax,
        evolution,
        evolutionMax,
        evolutionGleba,
        evolutionGlebaMax,
        pollution,
        pollutionMax,
        pollutionAbsorbed,
        pollutionAbsorbedMax,
        pollutionGleba,
        pollutionGlebaMax,
        pollutionGlebaAbsorbed,
        pollutionGlebaAbsorbedMax,
      });
    }
    return result;
  }, [metrics, targetPointsCount]);

  const timeWindow = useMemo(() => {
    const right =
      metrics.length > 0
        ? new Date(metrics[metrics.length - 1].timestamp)
        : new Date();
    let leftMs = 24 * 60 * 60 * 1000;
    switch (range) {
      case '1h':
        leftMs = 1 * 60 * 60 * 1000;
        break;
      case '6h':
        leftMs = 6 * 60 * 60 * 1000;
        break;
      case '24h':
        leftMs = 24 * 60 * 60 * 1000;
        break;
      case '7d':
        leftMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case '30d':
        leftMs = 30 * 24 * 60 * 60 * 1000;
        break;
      case '90d':
        leftMs = 90 * 24 * 60 * 60 * 1000;
        break;
      case '180d':
        leftMs = 180 * 24 * 60 * 60 * 1000;
        break;
      case '365d':
        leftMs = 365 * 24 * 60 * 60 * 1000;
        break;
    }
    const left = new Date(right.getTime() - leftMs);
    return { left, right, duration: leftMs };
  }, [range, metrics]);

  const points = useMemo(() => {
    const { left, duration } = timeWindow;
    return resampledMetrics.map((m) => {
      const itemTime = new Date(m.timestamp).getTime();
      const relativeTime = itemTime - left.getTime();
      const ratio =
        duration > 0 ? Math.max(0, Math.min(1, relativeTime / duration)) : 0;

      const x = paddingLeft + ratio * chartWidth;
      const val = Number(m[metricKey] ?? 0);
      const y = height - paddingBottom - (val / yMax) * chartHeight;

      let ySecVal = y;
      if (hasSecondary && secondaryKey) {
        const mSec =
          m[secondaryKey] !== undefined ? Number(m[secondaryKey]) : val;
        ySecVal = height - paddingBottom - (mSec / yMax) * chartHeight;
      }

      let yExtra = y;
      if (secondarySeriesKey) {
        const mExtra =
          m[secondarySeriesKey] !== undefined
            ? Number(m[secondarySeriesKey])
            : 0;
        yExtra = height - paddingBottom - (mExtra / yMax) * chartHeight;
      }

      return { x, y, ySecondary: ySecVal, yExtraSeries: yExtra, raw: m };
    });
  }, [
    resampledMetrics,
    metricKey,
    yMax,
    chartWidth,
    chartHeight,
    hasSecondary,
    secondaryKey,
    secondarySeriesKey,
    timeWindow,
  ]);

  // Path string for the line
  const linePath = useMemo(() => {
    if (points.length === 0) return '';
    return points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');
  }, [points]);

  // Path string for the secondary line (peaks / drops)
  const secondaryLinePath = useMemo(() => {
    if (!hasSecondary || points.length === 0) return '';
    return points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.ySecondary}`)
      .join(' ');
  }, [points, hasSecondary]);

  // Path string for extra series curve (e.g. Gleba evolution)
  const extraSeriesLinePath = useMemo(() => {
    if (!secondarySeriesKey || points.length === 0) return '';
    return points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.yExtraSeries}`)
      .join(' ');
  }, [points, secondarySeriesKey]);

  // Path string for the filled area underneath the line
  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const first = points[0];
    const last = points[points.length - 1];
    return `${linePath} L ${last.x} ${height - paddingBottom} L ${first.x} ${height - paddingBottom} Z`;
  }, [points, linePath]);

  // Interactive mouse tracking
  function handleMouseMove(ev: React.MouseEvent<SVGSVGElement, MouseEvent>) {
    if (!containerRef.current || points.length === 0) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const mouseX = ((ev.clientX - rect.left) / rect.width) * width;

    // Find nearest point
    let nearestIdx = 0;
    let minDiff = Infinity;

    points.forEach((p, idx) => {
      const diff = Math.abs(p.x - mouseX);
      if (diff < minDiff) {
        minDiff = diff;
        nearestIdx = idx;
      }
    });

    setHoverIndex(nearestIdx);

    // Calculate tooltip coordinates inside client viewport
    const containerRect = containerRef.current.getBoundingClientRect();
    const isRightHalf =
      ev.clientX - containerRect.left > containerRect.width / 2;
    const tooltipX = isRightHalf
      ? ev.clientX - containerRect.left - 175
      : ev.clientX - containerRect.left + 15;
    const tooltipY = ev.clientY - containerRect.top - 70;
    setTooltipPos({ x: tooltipX, y: tooltipY });
  }

  // Format horizontal time axes
  const gridTicks = 5;
  const timeLabels = useMemo(() => {
    const { left, duration } = timeWindow;
    const labels = [];
    for (let i = 0; i < gridTicks; i++) {
      const ratio = i / (gridTicks - 1);
      const tickTime = new Date(left.getTime() + ratio * duration);

      let text = '';
      if (range === '1h' || range === '6h' || range === '24h') {
        text = tickTime.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
      } else if (
        range === '7d' ||
        range === '30d' ||
        range === '90d' ||
        range === '180d'
      ) {
        text = tickTime.toLocaleDateString([], {
          day: '2-digit',
          month: '2-digit',
        });
      } else {
        text = tickTime.toLocaleDateString([], {
          month: 'short',
          year: '2-digit',
        });
      }

      const x = paddingLeft + ratio * chartWidth;
      labels.push({ x, text });
    }
    return labels;
  }, [timeWindow, range, chartWidth]);

  const activePoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <section
      className="players-tab__card"
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-4)',
        borderRadius: '8px',
        padding: '16px',
        opacity: isUpdating ? 0.6 : 1,
        transition: 'opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <header
        className="players-tab__card-header"
        style={{
          marginBottom: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {icon && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                color,
                flexShrink: 0,
              }}
            >
              {icon}
            </span>
          )}
          <h3
            className="players-tab__card-title"
            style={{
              margin: 0,
              fontSize: '1rem',
              fontWeight: 600,
              color: 'var(--mantine-color-text)',
            }}
          >
            {title}
          </h3>
        </div>
        {headerRight}
        {secondarySeriesKey && (
          <div
            style={{
              display: 'flex',
              gap: '14px',
              alignItems: 'center',
              fontSize: '0.8rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: color,
                }}
              />
              <span
                style={{ color: 'var(--mantine-color-text)', fontWeight: 500 }}
              >
                {primarySeriesLabel || 'Наувис'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor:
                    secondarySeriesColor || 'var(--mantine-color-teal-filled)',
                }}
              />
              <span
                style={{ color: 'var(--mantine-color-text)', fontWeight: 500 }}
              >
                {secondarySeriesLabel || 'Глеба'}
              </span>
            </div>
          </div>
        )}
      </header>
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{
            width: '100%',
            height: 'auto',
            minWidth: '600px',
            display: 'block',
            overflow: 'visible',
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            {/* Area gradient */}
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines (horizontal) */}
          {[0, 0.25, 0.5, 0.75, 1].map((val, idx) => {
            const y = paddingTop + val * chartHeight;
            const gridVal = yMax * (1 - val);
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="var(--mantine-color-dark-4)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  fill="var(--mantine-color-dimmed)"
                  fontSize="11"
                  textAnchor="end"
                >
                  {valueFormatter(gridVal)}
                </text>
              </g>
            );
          })}

          {/* X axis line */}
          <line
            x1={paddingLeft}
            y1={height - paddingBottom}
            x2={width - paddingRight}
            y2={height - paddingBottom}
            stroke="var(--mantine-color-dark-4)"
            strokeWidth="1.5"
          />

          {/* X axis labels */}
          {timeLabels.map((lbl, idx) => (
            <text
              key={idx}
              x={lbl.x}
              y={height - 15}
              fill="var(--mantine-color-dimmed)"
              fontSize="12"
              textAnchor="middle"
            >
              {lbl.text}
            </text>
          ))}

          {/* Area under curve */}
          <motion.path
            d={areaPath}
            fill={`url(#${gradientId})`}
            animate={{ d: areaPath }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />

          {/* Secondary value curve (peaks or drops) */}
          {hasSecondary && (
            <motion.path
              d={secondaryLinePath}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity="0.5"
              animate={{ d: secondaryLinePath }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          )}

          {/* Main Average / Raw curve */}
          <motion.path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            animate={{ d: linePath }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />

          {/* Secondary Series curve (e.g. Gleba) */}
          {secondarySeriesKey && (
            <motion.path
              d={extraSeriesLinePath}
              fill="none"
              stroke={
                secondarySeriesColor || 'var(--mantine-color-teal-filled)'
              }
              strokeWidth="2.5"
              animate={{ d: extraSeriesLinePath }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          )}

          {/* Hover helper elements */}
          {activePoint && (
            <g>
              {/* Vertical timeline line */}
              <line
                x1={activePoint.x}
                y1={paddingTop}
                x2={activePoint.x}
                y2={height - paddingBottom}
                stroke="var(--mantine-color-dark-3)"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />

              {/* Secondary indicator dot */}
              {hasSecondary && (
                <circle
                  cx={activePoint.x}
                  cy={activePoint.ySecondary}
                  r="4"
                  fill="var(--mantine-color-dark-1)"
                  stroke={color}
                  strokeWidth="1.5"
                />
              )}

              {/* Secondary series dot */}
              {secondarySeriesKey && (
                <circle
                  cx={activePoint.x}
                  cy={activePoint.yExtraSeries}
                  r="5"
                  fill="var(--mantine-color-dark-9)"
                  stroke={
                    secondarySeriesColor || 'var(--mantine-color-teal-filled)'
                  }
                  strokeWidth="2"
                />
              )}

              {/* Main value indicator dot */}
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="6"
                fill="var(--mantine-color-dark-9)"
                stroke={color}
                strokeWidth="2.5"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Pop-up Interactive HTML Tooltip */}
      {activePoint && (
        <div
          style={{
            position: 'absolute',
            left: tooltipPos.x,
            top: tooltipPos.y,
            backgroundColor: 'var(--mantine-color-dark-6)',
            border: '1px solid var(--mantine-color-dark-4)',
            borderRadius: '6px',
            padding: '8px 12px',
            boxShadow: 'var(--mantine-shadow-md)',
            pointerEvents: 'none',
            zIndex: 100,
            minWidth: '150px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            fontSize: '0.82rem',
          }}
        >
          <div
            style={{
              fontWeight: 600,
              color: 'var(--mantine-color-white)',
              borderBottom: '1px solid var(--mantine-color-dark-4)',
              paddingBottom: '4px',
              marginBottom: '4px',
            }}
          >
            {new Date(activePoint.raw.timestamp).toLocaleString([], {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
          {secondarySeriesKey ? (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '16px',
                }}
              >
                <span style={{ color: 'var(--mantine-color-dimmed)' }}>
                  {primarySeriesLabel || 'Наувис'}:
                </span>
                <span style={{ fontWeight: 600, color }}>
                  {valueFormatter(Number(activePoint.raw[metricKey] ?? 0))}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '16px',
                }}
              >
                <span style={{ color: 'var(--mantine-color-dimmed)' }}>
                  {secondarySeriesLabel || 'Глеба'}:
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color:
                      secondarySeriesColor ||
                      'var(--mantine-color-teal-filled)',
                  }}
                >
                  {valueFormatter(
                    Number(activePoint.raw[secondarySeriesKey] ?? 0),
                  )}
                </span>
              </div>
            </>
          ) : (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '16px',
              }}
            >
              <span style={{ color: 'var(--mantine-color-dimmed)' }}>
                {hasSecondary
                  ? t('stats_avg') || 'Среднее'
                  : t('stats_value') || 'Значение'}
                :
              </span>
              <span style={{ fontWeight: 600, color }}>
                {valueFormatter(Number(activePoint.raw[metricKey] ?? 0))}
              </span>
            </div>
          )}
          {hasSecondary && secondaryKey && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '16px',
              }}
            >
              <span style={{ color: 'var(--mantine-color-dimmed)' }}>
                {showMax
                  ? t('stats_max') || 'Пиковое'
                  : t('stats_min') || 'Минимальное'}
                :
              </span>
              <span style={{ fontWeight: 600, color }}>
                {valueFormatter(Number(activePoint.raw[secondaryKey] || 0))}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

interface PollutionChartCardProps {
  metrics: MetricPoint[];
  range: RangeOption;
  isUpdating?: boolean;
  t: (key: string, ...args: (string | number)[]) => string;
  livePollution?: CompanionLiveStatus['pollution'];
}

function PollutionChartCard({
  metrics,
  range,
  isUpdating = false,
  t,
  livePollution,
}: PollutionChartCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [surfaceFilter, setSurfaceFilter] = useState<
    'all' | 'nauvis' | 'gleba'
  >('all');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const showMax = range !== '1h' && range !== '6h' && range !== '24h';

  // Latest metrics for header badge highlight
  const latestMetric = useMemo(() => {
    if (metrics.length === 0) return null;
    return metrics[metrics.length - 1];
  }, [metrics]);

  const latestStats = useMemo(() => {
    if (!latestMetric && !livePollution) return null;
    const nProd = Number(livePollution?.nauvis ?? latestMetric?.pollution ?? 0);
    const nAbs = Number(
      livePollution?.nauvis_absorbed ?? latestMetric?.pollutionAbsorbed ?? 0,
    );
    const gProd = Number(
      livePollution?.gleba ?? latestMetric?.pollutionGleba ?? 0,
    );
    const gAbs = Number(
      livePollution?.gleba_absorbed ??
        latestMetric?.pollutionGlebaAbsorbed ??
        0,
    );

    const nauvisTotal =
      typeof livePollution?.nauvis_total === 'number'
        ? livePollution.nauvis_total
        : Number(latestMetric?.pollutionTotal ?? 0);
    const glebaTotal =
      typeof livePollution?.gleba_total === 'number'
        ? livePollution.gleba_total
        : Number(latestMetric?.pollutionGlebaTotal ?? 0);

    let activeProd = 0;
    let activeAbs = 0;
    let activeTotal = 0;
    if (surfaceFilter === 'nauvis') {
      activeProd = nProd;
      activeAbs = nAbs;
      activeTotal = nauvisTotal;
    } else if (surfaceFilter === 'gleba') {
      activeProd = gProd;
      activeAbs = gAbs;
      activeTotal = glebaTotal;
    } else {
      activeProd = nProd + gProd;
      activeAbs = nAbs + gAbs;
      activeTotal = nauvisTotal + glebaTotal;
    }

    const diff = activeProd - activeAbs;
    return {
      nauvisTotal,
      glebaTotal,
      activeTotal,
      diff,
      isAccumulating: diff > 0,
      isCleaning: diff < 0,
    };
  }, [latestMetric, livePollution, surfaceFilter]);

  // Compute Y-scale maximum across visible surfaces
  const yMax = useMemo(() => {
    let max = 0.1;
    metrics.forEach((m) => {
      if (surfaceFilter === 'all' || surfaceFilter === 'nauvis') {
        const np = Number(m.pollution ?? 0);
        const na = Number(m.pollutionAbsorbed ?? 0);
        const npm =
          showMax && m.pollutionMax !== undefined ? Number(m.pollutionMax) : np;
        const nam =
          showMax && m.pollutionAbsorbedMax !== undefined
            ? Number(m.pollutionAbsorbedMax)
            : na;
        max = Math.max(max, np, na, npm, nam);
      }
      if (surfaceFilter === 'all' || surfaceFilter === 'gleba') {
        const gp = Number(m.pollutionGleba ?? 0);
        const ga = Number(m.pollutionGlebaAbsorbed ?? 0);
        const gpm =
          showMax && m.pollutionGlebaMax !== undefined
            ? Number(m.pollutionGlebaMax)
            : gp;
        const gam =
          showMax && m.pollutionGlebaAbsorbedMax !== undefined
            ? Number(m.pollutionGlebaAbsorbedMax)
            : ga;
        max = Math.max(max, gp, ga, gpm, gam);
      }
    });
    return Math.max(100, max) * 1.15;
  }, [metrics, surfaceFilter, showMax]);

  // Chart coordinates calculations
  const width = 1000;
  const height = 180;
  const paddingLeft = 110;
  const paddingRight = 45;
  const paddingTop = 15;
  const paddingBottom = 35;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const targetPointsCount = 120;

  const resampledMetrics = useMemo(() => {
    if (metrics.length === 0) return [];
    if (metrics.length === 1) {
      return Array.from({ length: targetPointsCount }, () => ({
        ...metrics[0],
      }));
    }

    const result: MetricPoint[] = [];
    for (let i = 0; i < targetPointsCount; i++) {
      const progress = i / (targetPointsCount - 1);
      const rawIndex = progress * (metrics.length - 1);
      const indexLow = Math.floor(rawIndex);
      const indexHigh = Math.ceil(rawIndex);
      const weight = rawIndex - indexLow;

      const pLow = metrics[indexLow];
      const pHigh = metrics[indexHigh];

      const pollution =
        (pLow.pollution ?? 0) +
        ((pHigh.pollution ?? 0) - (pLow.pollution ?? 0)) * weight;
      const pollutionAbsorbed =
        (pLow.pollutionAbsorbed ?? 0) +
        ((pHigh.pollutionAbsorbed ?? 0) - (pLow.pollutionAbsorbed ?? 0)) *
          weight;
      const pollutionGleba =
        (pLow.pollutionGleba ?? 0) +
        ((pHigh.pollutionGleba ?? 0) - (pLow.pollutionGleba ?? 0)) * weight;
      const pollutionGlebaAbsorbed =
        (pLow.pollutionGlebaAbsorbed ?? 0) +
        ((pHigh.pollutionGlebaAbsorbed ?? 0) -
          (pLow.pollutionGlebaAbsorbed ?? 0)) *
          weight;

      const timestamp = weight < 0.5 ? pLow.timestamp : pHigh.timestamp;

      result.push({
        timestamp,
        cpu: 0,
        memory: 0,
        players: 0,
        ups: 0,
        saveSize: 0,
        spm: 0,
        pollution,
        pollutionAbsorbed,
        pollutionGleba,
        pollutionGlebaAbsorbed,
      });
    }
    return result;
  }, [metrics, targetPointsCount]);

  const timeWindow = useMemo(() => {
    const right =
      metrics.length > 0
        ? new Date(metrics[metrics.length - 1].timestamp)
        : new Date();
    let leftMs = 24 * 60 * 60 * 1000;
    switch (range) {
      case '1h':
        leftMs = 1 * 60 * 60 * 1000;
        break;
      case '6h':
        leftMs = 6 * 60 * 60 * 1000;
        break;
      case '24h':
        leftMs = 24 * 60 * 60 * 1000;
        break;
      case '7d':
        leftMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case '30d':
        leftMs = 30 * 24 * 60 * 60 * 1000;
        break;
      case '90d':
        leftMs = 90 * 24 * 60 * 60 * 1000;
        break;
      case '180d':
        leftMs = 180 * 24 * 60 * 60 * 1000;
        break;
      case '365d':
        leftMs = 365 * 24 * 60 * 60 * 1000;
        break;
    }
    const left = new Date(right.getTime() - leftMs);
    return { left, right, duration: leftMs };
  }, [range, metrics]);

  const points = useMemo(() => {
    const { left, duration } = timeWindow;
    return resampledMetrics.map((m) => {
      const itemTime = new Date(m.timestamp).getTime();
      const relativeTime = itemTime - left.getTime();
      const ratio =
        duration > 0 ? Math.max(0, Math.min(1, relativeTime / duration)) : 0;
      const x = paddingLeft + ratio * chartWidth;

      const np = Number(m.pollution ?? 0);
      const na = Number(m.pollutionAbsorbed ?? 0);
      const gp = Number(m.pollutionGleba ?? 0);
      const ga = Number(m.pollutionGlebaAbsorbed ?? 0);

      const yNauvisProd = height - paddingBottom - (np / yMax) * chartHeight;
      const yNauvisAbs = height - paddingBottom - (na / yMax) * chartHeight;
      const yGlebaProd = height - paddingBottom - (gp / yMax) * chartHeight;
      const yGlebaAbs = height - paddingBottom - (ga / yMax) * chartHeight;

      return {
        x,
        yNauvisProd,
        yNauvisAbs,
        yGlebaProd,
        yGlebaAbs,
        raw: m,
      };
    });
  }, [resampledMetrics, yMax, chartWidth, chartHeight, timeWindow]);

  const nauvisProdPath = useMemo(
    () =>
      points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yNauvisProd}`)
        .join(' '),
    [points],
  );
  const nauvisAbsPath = useMemo(
    () =>
      points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yNauvisAbs}`)
        .join(' '),
    [points],
  );
  const glebaProdPath = useMemo(
    () =>
      points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yGlebaProd}`)
        .join(' '),
    [points],
  );
  const glebaAbsPath = useMemo(
    () =>
      points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yGlebaAbs}`)
        .join(' '),
    [points],
  );

  const nauvisAreaPath = useMemo(() => {
    if (points.length === 0) return '';
    const first = points[0];
    const last = points[points.length - 1];
    return `${nauvisProdPath} L ${last.x} ${height - paddingBottom} L ${first.x} ${height - paddingBottom} Z`;
  }, [points, nauvisProdPath]);

  const glebaAreaPath = useMemo(() => {
    if (points.length === 0) return '';
    const first = points[0];
    const last = points[points.length - 1];
    return `${glebaProdPath} L ${last.x} ${height - paddingBottom} L ${first.x} ${height - paddingBottom} Z`;
  }, [points, glebaProdPath]);

  function handleMouseMove(ev: React.MouseEvent<SVGSVGElement, MouseEvent>) {
    if (!containerRef.current || points.length === 0) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const mouseX = ((ev.clientX - rect.left) / rect.width) * width;

    let nearestIdx = 0;
    let minDiff = Infinity;
    points.forEach((p, idx) => {
      const diff = Math.abs(p.x - mouseX);
      if (diff < minDiff) {
        minDiff = diff;
        nearestIdx = idx;
      }
    });

    setHoverIndex(nearestIdx);

    const containerRect = containerRef.current.getBoundingClientRect();
    const isRightHalf =
      ev.clientX - containerRect.left > containerRect.width / 2;
    const tooltipX = isRightHalf
      ? ev.clientX - containerRect.left - 230
      : ev.clientX - containerRect.left + 15;
    const tooltipY = ev.clientY - containerRect.top - 70;
    setTooltipPos({ x: tooltipX, y: tooltipY });
  }

  // Time labels for X axis
  const gridTicks = 5;
  const timeLabels = useMemo(() => {
    const { left, duration } = timeWindow;
    const labels = [];
    for (let i = 0; i < gridTicks; i++) {
      const ratio = i / (gridTicks - 1);
      const tickTime = new Date(left.getTime() + ratio * duration);

      let text = '';
      if (range === '1h' || range === '6h' || range === '24h') {
        text = tickTime.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
      } else if (
        range === '7d' ||
        range === '30d' ||
        range === '90d' ||
        range === '180d'
      ) {
        text = tickTime.toLocaleDateString([], {
          day: '2-digit',
          month: '2-digit',
        });
      } else {
        text = tickTime.toLocaleDateString([], {
          month: 'short',
          year: '2-digit',
        });
      }

      const x = paddingLeft + ratio * chartWidth;
      labels.push({ x, text });
    }
    return labels;
  }, [timeWindow, range, chartWidth]);

  const activePoint = hoverIndex !== null ? points[hoverIndex] : null;

  const showNauvis = surfaceFilter === 'all' || surfaceFilter === 'nauvis';
  const showGleba = surfaceFilter === 'all' || surfaceFilter === 'gleba';

  return (
    <section
      className="players-tab__card"
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-4)',
        borderRadius: '8px',
        padding: '16px',
        opacity: isUpdating ? 0.6 : 1,
        transition: 'opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <header
        className="players-tab__card-header"
        style={{
          marginBottom: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                color: 'var(--mantine-color-grape-filled)',
                flexShrink: 0,
              }}
            >
              <IconCloudFog size={18} />
            </span>
            <h3
              className="players-tab__card-title"
              style={{
                margin: 0,
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--mantine-color-text)',
              }}
            >
              {t('metric_pollution') || 'Загрязнение (/мин)'}
            </h3>
          </div>

          {/* Current total surface pollution */}
          {latestStats && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '3px 10px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  color:
                    surfaceFilter === 'gleba'
                      ? 'var(--mantine-color-teal-light-color, #63e6be)'
                      : 'var(--mantine-color-grape-light-color, #e599f7)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor:
                      surfaceFilter === 'gleba'
                        ? 'var(--mantine-color-teal-filled)'
                        : 'var(--mantine-color-grape-filled)',
                  }}
                />
                {surfaceFilter === 'all'
                  ? `${t('metric_pollution_total') || 'Общее'}: ${Math.round(latestStats.activeTotal).toLocaleString()}`
                  : surfaceFilter === 'nauvis'
                    ? `${t('metric_pollution_nauvis') || 'Наувис'}: ${Math.round(latestStats.nauvisTotal).toLocaleString()}`
                    : `${t('metric_pollution_gleba') || 'Глеба'}: ${Math.round(latestStats.glebaTotal).toLocaleString()}`}
              </span>
            </div>
          )}

          {/* Highlight: Which is greater (Production vs Absorption) */}
          {latestStats && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: '12px',
                background: latestStats.isAccumulating
                  ? 'rgba(204, 93, 232, 0.15)'
                  : latestStats.isCleaning
                    ? 'rgba(32, 201, 151, 0.15)'
                    : 'rgba(255, 255, 255, 0.06)',
                border: `1px solid ${
                  latestStats.isAccumulating
                    ? 'rgba(204, 93, 232, 0.35)'
                    : latestStats.isCleaning
                      ? 'rgba(32, 201, 151, 0.35)'
                      : 'rgba(255, 255, 255, 0.1)'
                }`,
                color: latestStats.isAccumulating
                  ? 'var(--mantine-color-grape-light-color, #e599f7)'
                  : latestStats.isCleaning
                    ? 'var(--mantine-color-teal-light-color, #63e6be)'
                    : 'var(--mantine-color-dimmed)',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              <span>
                {latestStats.isAccumulating
                  ? '▲'
                  : latestStats.isCleaning
                    ? '▼'
                    : '•'}
              </span>
              <span>
                {latestStats.isAccumulating
                  ? `${t('metric_pollution_accumulating') || 'Накопление'}: +${Math.round(latestStats.diff).toLocaleString()} /мин`
                  : latestStats.isCleaning
                    ? `${t('metric_pollution_cleaning') || 'Очищение'}: -${Math.round(Math.abs(latestStats.diff)).toLocaleString()} /мин`
                    : `${t('metric_pollution_net') || 'Баланс'}: 0 /мин`}
              </span>
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          {/* Surface Filter Controls: Click Nauvis or Gleba to show only them */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              background: 'var(--mantine-color-dark-8)',
              padding: '3px',
              borderRadius: '6px',
              border: '1px solid var(--mantine-color-dark-5)',
            }}
          >
            <button
              type="button"
              onClick={() => setSurfaceFilter('all')}
              style={{
                background:
                  surfaceFilter === 'all'
                    ? 'var(--mantine-color-dark-5)'
                    : 'transparent',
                color:
                  surfaceFilter === 'all'
                    ? '#fff'
                    : 'var(--mantine-color-dimmed)',
                border: 'none',
                borderRadius: '4px',
                padding: '3px 10px',
                fontSize: '0.78rem',
                fontWeight: surfaceFilter === 'all' ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {t('metric_pollution_all') || 'Все'}
            </button>
            <button
              type="button"
              onClick={() =>
                setSurfaceFilter((prev) =>
                  prev === 'nauvis' ? 'all' : 'nauvis',
                )
              }
              style={{
                background:
                  surfaceFilter === 'nauvis'
                    ? 'rgba(204, 93, 232, 0.2)'
                    : 'transparent',
                color:
                  surfaceFilter === 'nauvis'
                    ? '#e599f7'
                    : 'var(--mantine-color-dimmed)',
                border:
                  surfaceFilter === 'nauvis'
                    ? '1px solid rgba(204, 93, 232, 0.45)'
                    : '1px solid transparent',
                borderRadius: '4px',
                padding: '3px 10px',
                fontSize: '0.78rem',
                fontWeight: surfaceFilter === 'nauvis' ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {t('metric_evolution_nauvis') || 'Наувис'}
            </button>
            <button
              type="button"
              onClick={() =>
                setSurfaceFilter((prev) => (prev === 'gleba' ? 'all' : 'gleba'))
              }
              style={{
                background:
                  surfaceFilter === 'gleba'
                    ? 'rgba(255, 146, 43, 0.2)'
                    : 'transparent',
                color:
                  surfaceFilter === 'gleba'
                    ? '#ffc078'
                    : 'var(--mantine-color-dimmed)',
                border:
                  surfaceFilter === 'gleba'
                    ? '1px solid rgba(255, 146, 43, 0.45)'
                    : '1px solid transparent',
                borderRadius: '4px',
                padding: '3px 10px',
                fontSize: '0.78rem',
                fontWeight: surfaceFilter === 'gleba' ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {t('metric_evolution_gleba') || 'Глеба'}
            </button>
          </div>
        </div>
      </header>

      {/* Interactive Legend with click actions to filter */}
      <div
        style={{
          display: 'flex',
          gap: '14px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '8px',
          fontSize: '0.78rem',
        }}
      >
        {showNauvis && (
          <>
            <button
              type="button"
              onClick={() =>
                setSurfaceFilter((prev) =>
                  prev === 'nauvis' ? 'all' : 'nauvis',
                )
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: 'var(--mantine-color-text)',
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: 'var(--mantine-color-grape-filled)',
                  display: 'inline-block',
                }}
              />
              <span>
                {t('metric_evolution_nauvis') || 'Наувис'} (
                {t('metric_pollution_production') || 'Производство'})
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                setSurfaceFilter((prev) =>
                  prev === 'nauvis' ? 'all' : 'nauvis',
                )
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: 'var(--mantine-color-text)',
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 3,
                  borderRadius: 2,
                  borderBottom: '2px dashed var(--mantine-color-teal-filled)',
                  display: 'inline-block',
                }}
              />
              <span>
                {t('metric_evolution_nauvis') || 'Наувис'} (
                {t('metric_pollution_absorption') || 'Поглощение'})
              </span>
            </button>
          </>
        )}

        {showGleba && (
          <>
            <button
              type="button"
              onClick={() =>
                setSurfaceFilter((prev) => (prev === 'gleba' ? 'all' : 'gleba'))
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: 'var(--mantine-color-text)',
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: 'var(--mantine-color-orange-filled)',
                  display: 'inline-block',
                }}
              />
              <span>
                {t('metric_evolution_gleba') || 'Глеба'} (
                {t('metric_pollution_production') || 'Производство'})
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                setSurfaceFilter((prev) => (prev === 'gleba' ? 'all' : 'gleba'))
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: 'var(--mantine-color-text)',
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 3,
                  borderRadius: 2,
                  borderBottom: '2px dashed var(--mantine-color-cyan-filled)',
                  display: 'inline-block',
                }}
              />
              <span>
                {t('metric_evolution_gleba') || 'Глеба'} (
                {t('metric_pollution_absorption') || 'Поглощение'})
              </span>
            </button>
          </>
        )}
      </div>

      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{
            width: '100%',
            height: 'auto',
            minWidth: '600px',
            display: 'block',
            overflow: 'visible',
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient
              id="gradPollutionNauvis"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="var(--mantine-color-grape-filled)"
                stopOpacity="0.25"
              />
              <stop
                offset="100%"
                stopColor="var(--mantine-color-grape-filled)"
                stopOpacity="0.0"
              />
            </linearGradient>
            <linearGradient id="gradPollutionGleba" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--mantine-color-orange-filled)"
                stopOpacity="0.25"
              />
              <stop
                offset="100%"
                stopColor="var(--mantine-color-orange-filled)"
                stopOpacity="0.0"
              />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((val, idx) => {
            const y = paddingTop + val * chartHeight;
            const gridVal = yMax * (1 - val);
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="var(--mantine-color-dark-4)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  fill="var(--mantine-color-dimmed)"
                  fontSize="11"
                  textAnchor="end"
                >
                  {Math.round(gridVal).toLocaleString()} /мин
                </text>
              </g>
            );
          })}

          {/* X axis line */}
          <line
            x1={paddingLeft}
            y1={height - paddingBottom}
            x2={width - paddingRight}
            y2={height - paddingBottom}
            stroke="var(--mantine-color-dark-4)"
            strokeWidth="1.5"
          />

          {/* X axis labels */}
          {timeLabels.map((lbl, idx) => (
            <text
              key={idx}
              x={lbl.x}
              y={height - 15}
              fill="var(--mantine-color-dimmed)"
              fontSize="12"
              textAnchor="middle"
            >
              {lbl.text}
            </text>
          ))}

          {/* Area fill for active primary surface */}
          {showNauvis && (
            <motion.path
              d={nauvisAreaPath}
              fill="url(#gradPollutionNauvis)"
              animate={{ d: nauvisAreaPath }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
          {!showNauvis && showGleba && (
            <motion.path
              d={glebaAreaPath}
              fill="url(#gradPollutionGleba)"
              animate={{ d: glebaAreaPath }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          )}

          {/* Nauvis Curves */}
          {showNauvis && (
            <>
              {/* Absorption (dashed line) */}
              <motion.path
                d={nauvisAbsPath}
                fill="none"
                stroke="var(--mantine-color-teal-filled)"
                strokeWidth="2"
                strokeDasharray="4 3"
                animate={{ d: nauvisAbsPath }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
              {/* Production (solid line) */}
              <motion.path
                d={nauvisProdPath}
                fill="none"
                stroke="var(--mantine-color-grape-filled)"
                strokeWidth="2.5"
                animate={{ d: nauvisProdPath }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            </>
          )}

          {/* Gleba Curves */}
          {showGleba && (
            <>
              {/* Absorption (dashed line) */}
              <motion.path
                d={glebaAbsPath}
                fill="none"
                stroke="var(--mantine-color-cyan-filled)"
                strokeWidth="2"
                strokeDasharray="4 3"
                animate={{ d: glebaAbsPath }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
              {/* Production (solid line) */}
              <motion.path
                d={glebaProdPath}
                fill="none"
                stroke="var(--mantine-color-orange-filled)"
                strokeWidth="2.5"
                animate={{ d: glebaProdPath }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            </>
          )}

          {/* Hover helper elements */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                y1={paddingTop}
                x2={activePoint.x}
                y2={height - paddingBottom}
                stroke="var(--mantine-color-dark-3)"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />

              {showNauvis && (
                <>
                  {/* Nauvis Absorption Dot */}
                  <circle
                    cx={activePoint.x}
                    cy={activePoint.yNauvisAbs}
                    r={
                      Number(activePoint.raw.pollutionAbsorbed ?? 0) >
                      Number(activePoint.raw.pollution ?? 0)
                        ? 6
                        : 4
                    }
                    fill="var(--mantine-color-dark-9)"
                    stroke="var(--mantine-color-teal-filled)"
                    strokeWidth="2"
                  />
                  {/* Nauvis Production Dot */}
                  <circle
                    cx={activePoint.x}
                    cy={activePoint.yNauvisProd}
                    r={
                      Number(activePoint.raw.pollution ?? 0) >=
                      Number(activePoint.raw.pollutionAbsorbed ?? 0)
                        ? 6
                        : 4
                    }
                    fill="var(--mantine-color-dark-9)"
                    stroke="var(--mantine-color-grape-filled)"
                    strokeWidth="2.5"
                  />
                </>
              )}

              {showGleba && (
                <>
                  {/* Gleba Absorption Dot */}
                  <circle
                    cx={activePoint.x}
                    cy={activePoint.yGlebaAbs}
                    r={
                      Number(activePoint.raw.pollutionGlebaAbsorbed ?? 0) >
                      Number(activePoint.raw.pollutionGleba ?? 0)
                        ? 6
                        : 4
                    }
                    fill="var(--mantine-color-dark-9)"
                    stroke="var(--mantine-color-cyan-filled)"
                    strokeWidth="2"
                  />
                  {/* Gleba Production Dot */}
                  <circle
                    cx={activePoint.x}
                    cy={activePoint.yGlebaProd}
                    r={
                      Number(activePoint.raw.pollutionGleba ?? 0) >=
                      Number(activePoint.raw.pollutionGlebaAbsorbed ?? 0)
                        ? 6
                        : 4
                    }
                    fill="var(--mantine-color-dark-9)"
                    stroke="var(--mantine-color-orange-filled)"
                    strokeWidth="2.5"
                  />
                </>
              )}
            </g>
          )}
        </svg>
      </div>

      {/* Pop-up Interactive HTML Tooltip with highlight for the greater metric */}
      {activePoint && (
        <div
          style={{
            position: 'absolute',
            left: tooltipPos.x,
            top: tooltipPos.y,
            backgroundColor: 'var(--mantine-color-dark-6)',
            border: '1px solid var(--mantine-color-dark-4)',
            borderRadius: '6px',
            padding: '10px 14px',
            boxShadow: 'var(--mantine-shadow-md)',
            pointerEvents: 'none',
            zIndex: 100,
            minWidth: '220px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '0.82rem',
          }}
        >
          <div
            style={{
              fontWeight: 600,
              color: 'var(--mantine-color-white)',
              borderBottom: '1px solid var(--mantine-color-dark-4)',
              paddingBottom: '4px',
            }}
          >
            {new Date(activePoint.raw.timestamp).toLocaleString([], {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>

          {showNauvis &&
            (() => {
              const p = Number(activePoint.raw.pollution ?? 0);
              const a = Number(activePoint.raw.pollutionAbsorbed ?? 0);
              const diff = p - a;
              const prodHigher = p > a;
              const absHigher = a > p;
              return (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                  }}
                >
                  {surfaceFilter === 'all' && (
                    <div
                      style={{
                        fontWeight: 600,
                        color: 'var(--mantine-color-grape-filled)',
                        fontSize: '0.78rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {t('metric_evolution_nauvis') || 'Наувис'}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '16px',
                    }}
                  >
                    <span
                      style={{
                        color: prodHigher
                          ? 'var(--mantine-color-white)'
                          : 'var(--mantine-color-dimmed)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: 'var(--mantine-color-grape-filled)',
                          display: 'inline-block',
                        }}
                      />
                      {t('metric_pollution_production') || 'Производство'}:
                    </span>
                    <span
                      style={{
                        fontWeight: prodHigher ? 700 : 500,
                        color: prodHigher
                          ? 'var(--mantine-color-grape-light-color, #e599f7)'
                          : 'var(--mantine-color-text)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {Math.round(p).toLocaleString()} /мин
                      {prodHigher && (
                        <span style={{ fontSize: '0.72rem' }}>▲</span>
                      )}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '16px',
                    }}
                  >
                    <span
                      style={{
                        color: absHigher
                          ? 'var(--mantine-color-white)'
                          : 'var(--mantine-color-dimmed)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: 'var(--mantine-color-teal-filled)',
                          display: 'inline-block',
                        }}
                      />
                      {t('metric_pollution_absorption') || 'Поглощение'}:
                    </span>
                    <span
                      style={{
                        fontWeight: absHigher ? 700 : 500,
                        color: absHigher
                          ? 'var(--mantine-color-teal-light-color, #63e6be)'
                          : 'var(--mantine-color-text)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {Math.round(a).toLocaleString()} /мин
                      {absHigher && (
                        <span style={{ fontSize: '0.72rem' }}>▼</span>
                      )}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '16px',
                      paddingTop: '2px',
                      borderTop: '1px dashed var(--mantine-color-dark-4)',
                    }}
                  >
                    <span
                      style={{
                        color: 'var(--mantine-color-dimmed)',
                        fontSize: '0.76rem',
                      }}
                    >
                      {t('metric_pollution_net') || 'Баланс'}:
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.78rem',
                        color:
                          diff > 0
                            ? 'var(--mantine-color-grape-light-color, #e599f7)'
                            : diff < 0
                              ? 'var(--mantine-color-teal-light-color, #63e6be)'
                              : 'var(--mantine-color-dimmed)',
                      }}
                    >
                      {diff > 0
                        ? `+${Math.round(diff).toLocaleString()}`
                        : `${Math.round(diff).toLocaleString()}`}{' '}
                      /мин
                    </span>
                  </div>
                </div>
              );
            })()}

          {showGleba &&
            (() => {
              const p = Number(activePoint.raw.pollutionGleba ?? 0);
              const a = Number(activePoint.raw.pollutionGlebaAbsorbed ?? 0);
              const diff = p - a;
              const prodHigher = p > a;
              const absHigher = a > p;
              return (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                    paddingTop: showNauvis ? '6px' : 0,
                    borderTop: showNauvis
                      ? '1px solid var(--mantine-color-dark-4)'
                      : 'none',
                  }}
                >
                  {surfaceFilter === 'all' && (
                    <div
                      style={{
                        fontWeight: 600,
                        color: 'var(--mantine-color-orange-filled)',
                        fontSize: '0.78rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {t('metric_evolution_gleba') || 'Глеба'}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '16px',
                    }}
                  >
                    <span
                      style={{
                        color: prodHigher
                          ? 'var(--mantine-color-white)'
                          : 'var(--mantine-color-dimmed)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: 'var(--mantine-color-orange-filled)',
                          display: 'inline-block',
                        }}
                      />
                      {t('metric_pollution_production') || 'Производство'}:
                    </span>
                    <span
                      style={{
                        fontWeight: prodHigher ? 700 : 500,
                        color: prodHigher
                          ? 'var(--mantine-color-orange-light-color, #ffc078)'
                          : 'var(--mantine-color-text)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {Math.round(p).toLocaleString()} /мин
                      {prodHigher && (
                        <span style={{ fontSize: '0.72rem' }}>▲</span>
                      )}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '16px',
                    }}
                  >
                    <span
                      style={{
                        color: absHigher
                          ? 'var(--mantine-color-white)'
                          : 'var(--mantine-color-dimmed)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: 'var(--mantine-color-cyan-filled)',
                          display: 'inline-block',
                        }}
                      />
                      {t('metric_pollution_absorption') || 'Поглощение'}:
                    </span>
                    <span
                      style={{
                        fontWeight: absHigher ? 700 : 500,
                        color: absHigher
                          ? 'var(--mantine-color-cyan-light-color, #66d9e8)'
                          : 'var(--mantine-color-text)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {Math.round(a).toLocaleString()} /мин
                      {absHigher && (
                        <span style={{ fontSize: '0.72rem' }}>▼</span>
                      )}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '16px',
                      paddingTop: '2px',
                      borderTop: '1px dashed var(--mantine-color-dark-4)',
                    }}
                  >
                    <span
                      style={{
                        color: 'var(--mantine-color-dimmed)',
                        fontSize: '0.76rem',
                      }}
                    >
                      {t('metric_pollution_net') || 'Баланс'}:
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.78rem',
                        color:
                          diff > 0
                            ? 'var(--mantine-color-orange-light-color, #ffc078)'
                            : diff < 0
                              ? 'var(--mantine-color-cyan-light-color, #66d9e8)'
                              : 'var(--mantine-color-dimmed)',
                      }}
                    >
                      {diff > 0
                        ? `+${Math.round(diff).toLocaleString()}`
                        : `${Math.round(diff).toLocaleString()}`}{' '}
                      /мин
                    </span>
                  </div>
                </div>
              );
            })()}
        </div>
      )}
    </section>
  );
}

interface EvolutionChartCardProps {
  metrics: MetricPoint[];
  range: RangeOption;
  isUpdating?: boolean;
  t: (key: string, ...args: (string | number)[]) => string;
}

function EvolutionChartCard({
  metrics,
  range,
  isUpdating = false,
  t,
}: EvolutionChartCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [surfaceFilter, setSurfaceFilter] = useState<
    'all' | 'nauvis' | 'gleba'
  >('all');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const showMax = range !== '1h' && range !== '6h' && range !== '24h';

  // Latest metrics for header badge
  const latestMetric = useMemo(() => {
    if (metrics.length === 0) return null;
    return metrics[metrics.length - 1];
  }, [metrics]);

  const latestStats = useMemo(() => {
    if (!latestMetric) return null;
    const nEvo = Number(latestMetric.evolution ?? 0);
    const gEvo = Number(latestMetric.evolutionGleba ?? 0);
    return { nEvo, gEvo };
  }, [latestMetric]);

  const yMax = 100;

  // Chart coordinates calculations
  const width = 1000;
  const height = 180;
  const paddingLeft = 110;
  const paddingRight = 45;
  const paddingTop = 15;
  const paddingBottom = 35;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const targetPointsCount = 120;

  const resampledMetrics = useMemo(() => {
    if (metrics.length === 0) return [];
    if (metrics.length === 1) {
      return Array.from({ length: targetPointsCount }, () => ({
        ...metrics[0],
      }));
    }

    const result: MetricPoint[] = [];
    for (let i = 0; i < targetPointsCount; i++) {
      const progress = i / (targetPointsCount - 1);
      const rawIndex = progress * (metrics.length - 1);
      const indexLow = Math.floor(rawIndex);
      const indexHigh = Math.ceil(rawIndex);
      const weight = rawIndex - indexLow;

      const pLow = metrics[indexLow];
      const pHigh = metrics[indexHigh];

      const evolution =
        (pLow.evolution ?? 0) +
        ((pHigh.evolution ?? 0) - (pLow.evolution ?? 0)) * weight;
      const evolutionMax =
        pLow.evolutionMax !== undefined && pHigh.evolutionMax !== undefined
          ? pLow.evolutionMax +
            (pHigh.evolutionMax - pLow.evolutionMax) * weight
          : (pLow.evolutionMax ?? evolution);

      const evolutionGleba =
        (pLow.evolutionGleba ?? 0) +
        ((pHigh.evolutionGleba ?? 0) - (pLow.evolutionGleba ?? 0)) * weight;
      const evolutionGlebaMax =
        pLow.evolutionGlebaMax !== undefined &&
        pHigh.evolutionGlebaMax !== undefined
          ? pLow.evolutionGlebaMax +
            (pHigh.evolutionGlebaMax - pLow.evolutionGlebaMax) * weight
          : (pLow.evolutionGlebaMax ?? evolutionGleba);

      const timestamp = weight < 0.5 ? pLow.timestamp : pHigh.timestamp;

      result.push({
        timestamp,
        cpu: 0,
        memory: 0,
        players: 0,
        ups: 0,
        saveSize: 0,
        spm: 0,
        evolution,
        evolutionMax,
        evolutionGleba,
        evolutionGlebaMax,
      });
    }
    return result;
  }, [metrics, targetPointsCount]);

  const timeWindow = useMemo(() => {
    const right =
      metrics.length > 0
        ? new Date(metrics[metrics.length - 1].timestamp)
        : new Date();
    let leftMs = 24 * 60 * 60 * 1000;
    switch (range) {
      case '1h':
        leftMs = 1 * 60 * 60 * 1000;
        break;
      case '6h':
        leftMs = 6 * 60 * 60 * 1000;
        break;
      case '24h':
        leftMs = 24 * 60 * 60 * 1000;
        break;
      case '7d':
        leftMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case '30d':
        leftMs = 30 * 24 * 60 * 60 * 1000;
        break;
      case '90d':
        leftMs = 90 * 24 * 60 * 60 * 1000;
        break;
      case '180d':
        leftMs = 180 * 24 * 60 * 60 * 1000;
        break;
      case '365d':
        leftMs = 365 * 24 * 60 * 60 * 1000;
        break;
    }
    const left = new Date(right.getTime() - leftMs);
    return { left, right, duration: leftMs };
  }, [range, metrics]);

  const points = useMemo(() => {
    const { left, duration } = timeWindow;
    return resampledMetrics.map((m) => {
      const itemTime = new Date(m.timestamp).getTime();
      const relativeTime = itemTime - left.getTime();
      const ratio =
        duration > 0 ? Math.max(0, Math.min(1, relativeTime / duration)) : 0;
      const x = paddingLeft + ratio * chartWidth;

      const ne = Number(m.evolution ?? 0);
      const neMax = Number(m.evolutionMax ?? ne);
      const ge = Number(m.evolutionGleba ?? 0);
      const geMax = Number(m.evolutionGlebaMax ?? ge);

      const yNauvis = height - paddingBottom - (ne / yMax) * chartHeight;
      const yNauvisMax = height - paddingBottom - (neMax / yMax) * chartHeight;
      const yGleba = height - paddingBottom - (ge / yMax) * chartHeight;
      const yGlebaMax = height - paddingBottom - (geMax / yMax) * chartHeight;

      return {
        x,
        yNauvis,
        yNauvisMax,
        yGleba,
        yGlebaMax,
        raw: m,
      };
    });
  }, [resampledMetrics, chartWidth, chartHeight, timeWindow]);

  const nauvisPath = useMemo(
    () =>
      points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yNauvis}`)
        .join(' '),
    [points],
  );
  const nauvisMaxPath = useMemo(
    () =>
      points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yNauvisMax}`)
        .join(' '),
    [points],
  );
  const glebaPath = useMemo(
    () =>
      points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yGleba}`)
        .join(' '),
    [points],
  );
  const glebaMaxPath = useMemo(
    () =>
      points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yGlebaMax}`)
        .join(' '),
    [points],
  );

  const nauvisAreaPath = useMemo(() => {
    if (points.length === 0) return '';
    const first = points[0];
    const last = points[points.length - 1];
    return `${nauvisPath} L ${last.x} ${height - paddingBottom} L ${first.x} ${height - paddingBottom} Z`;
  }, [points, nauvisPath]);

  const glebaAreaPath = useMemo(() => {
    if (points.length === 0) return '';
    const first = points[0];
    const last = points[points.length - 1];
    return `${glebaPath} L ${last.x} ${height - paddingBottom} L ${first.x} ${height - paddingBottom} Z`;
  }, [points, glebaPath]);

  function handleMouseMove(ev: React.MouseEvent<SVGSVGElement, MouseEvent>) {
    if (!containerRef.current || points.length === 0) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const mouseX = ((ev.clientX - rect.left) / rect.width) * width;

    let nearestIdx = 0;
    let minDiff = Infinity;
    points.forEach((p, idx) => {
      const diff = Math.abs(p.x - mouseX);
      if (diff < minDiff) {
        minDiff = diff;
        nearestIdx = idx;
      }
    });

    setHoverIndex(nearestIdx);

    const containerRect = containerRef.current.getBoundingClientRect();
    const isRightHalf =
      ev.clientX - containerRect.left > containerRect.width / 2;
    const tooltipX = isRightHalf
      ? ev.clientX - containerRect.left - 210
      : ev.clientX - containerRect.left + 15;
    const tooltipY = ev.clientY - containerRect.top - 70;
    setTooltipPos({ x: tooltipX, y: tooltipY });
  }

  // Time labels for X axis
  const gridTicks = 5;
  const timeLabels = useMemo(() => {
    const { left, duration } = timeWindow;
    const labels = [];
    for (let i = 0; i < gridTicks; i++) {
      const ratio = i / (gridTicks - 1);
      const tickTime = new Date(left.getTime() + ratio * duration);

      let text = '';
      if (range === '1h' || range === '6h' || range === '24h') {
        text = tickTime.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
      } else if (
        range === '7d' ||
        range === '30d' ||
        range === '90d' ||
        range === '180d'
      ) {
        text = tickTime.toLocaleDateString([], {
          day: '2-digit',
          month: '2-digit',
        });
      } else {
        text = tickTime.toLocaleDateString([], {
          month: 'short',
          year: '2-digit',
        });
      }

      const x = paddingLeft + ratio * chartWidth;
      labels.push({ x, text });
    }
    return labels;
  }, [timeWindow, range, chartWidth]);

  const activePoint = hoverIndex !== null ? points[hoverIndex] : null;

  const showNauvis = surfaceFilter === 'all' || surfaceFilter === 'nauvis';
  const showGleba = surfaceFilter === 'all' || surfaceFilter === 'gleba';

  return (
    <section
      className="players-tab__card"
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-4)',
        borderRadius: '8px',
        padding: '16px',
        opacity: isUpdating ? 0.6 : 1,
        transition: 'opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <header
        className="players-tab__card-header"
        style={{
          marginBottom: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                color: 'var(--mantine-color-red-filled)',
                flexShrink: 0,
              }}
            >
              <IconBug size={18} />
            </span>
            <h3
              className="players-tab__card-title"
              style={{
                margin: 0,
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--mantine-color-text)',
              }}
            >
              {t('metric_evolution') || 'Эволюция врагов (%)'}
            </h3>
          </div>

          {/* Current evolution badge */}
          {latestStats && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '3px 10px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              {showNauvis && (
                <span
                  style={{
                    color: 'var(--mantine-color-red-light-color, #ff8787)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: 'var(--mantine-color-red-filled)',
                    }}
                  />
                  {t('metric_evolution_nauvis') || 'Наувис'}:{' '}
                  {latestStats.nEvo.toFixed(1)}%
                </span>
              )}
              {showNauvis && showGleba && (
                <span style={{ color: 'var(--mantine-color-dimmed)' }}>•</span>
              )}
              {showGleba && (
                <span
                  style={{
                    color: 'var(--mantine-color-teal-light-color, #63e6be)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: 'var(--mantine-color-teal-filled)',
                    }}
                  />
                  {t('metric_evolution_gleba') || 'Глеба'}:{' '}
                  {latestStats.gEvo.toFixed(1)}%
                </span>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          {/* Surface Filter Controls: Click Nauvis or Gleba to show only them */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              background: 'var(--mantine-color-dark-8)',
              padding: '3px',
              borderRadius: '6px',
              border: '1px solid var(--mantine-color-dark-5)',
            }}
          >
            <button
              type="button"
              onClick={() => setSurfaceFilter('all')}
              style={{
                background:
                  surfaceFilter === 'all'
                    ? 'var(--mantine-color-dark-5)'
                    : 'transparent',
                color:
                  surfaceFilter === 'all'
                    ? '#fff'
                    : 'var(--mantine-color-dimmed)',
                border: 'none',
                borderRadius: '4px',
                padding: '3px 10px',
                fontSize: '0.78rem',
                fontWeight: surfaceFilter === 'all' ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {t('metric_pollution_all') || 'Все'}
            </button>
            <button
              type="button"
              onClick={() =>
                setSurfaceFilter((prev) =>
                  prev === 'nauvis' ? 'all' : 'nauvis',
                )
              }
              style={{
                background:
                  surfaceFilter === 'nauvis'
                    ? 'rgba(250, 82, 82, 0.2)'
                    : 'transparent',
                color:
                  surfaceFilter === 'nauvis'
                    ? '#ff8787'
                    : 'var(--mantine-color-dimmed)',
                border:
                  surfaceFilter === 'nauvis'
                    ? '1px solid rgba(250, 82, 82, 0.45)'
                    : '1px solid transparent',
                borderRadius: '4px',
                padding: '3px 10px',
                fontSize: '0.78rem',
                fontWeight: surfaceFilter === 'nauvis' ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {t('metric_evolution_nauvis') || 'Наувис'}
            </button>
            <button
              type="button"
              onClick={() =>
                setSurfaceFilter((prev) => (prev === 'gleba' ? 'all' : 'gleba'))
              }
              style={{
                background:
                  surfaceFilter === 'gleba'
                    ? 'rgba(32, 201, 151, 0.2)'
                    : 'transparent',
                color:
                  surfaceFilter === 'gleba'
                    ? '#63e6be'
                    : 'var(--mantine-color-dimmed)',
                border:
                  surfaceFilter === 'gleba'
                    ? '1px solid rgba(32, 201, 151, 0.45)'
                    : '1px solid transparent',
                borderRadius: '4px',
                padding: '3px 10px',
                fontSize: '0.78rem',
                fontWeight: surfaceFilter === 'gleba' ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {t('metric_evolution_gleba') || 'Глеба'}
            </button>
          </div>
        </div>
      </header>

      {/* Interactive Legend with click actions to filter */}
      <div
        style={{
          display: 'flex',
          gap: '14px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '8px',
          fontSize: '0.78rem',
        }}
      >
        {showNauvis && (
          <button
            type="button"
            onClick={() =>
              setSurfaceFilter((prev) => (prev === 'nauvis' ? 'all' : 'nauvis'))
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              color: 'var(--mantine-color-text)',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: 'var(--mantine-color-red-filled)',
              }}
            />
            <span style={{ fontWeight: 500 }}>
              {t('metric_evolution_nauvis') || 'Наувис'}
            </span>
          </button>
        )}

        {showGleba && (
          <button
            type="button"
            onClick={() =>
              setSurfaceFilter((prev) => (prev === 'gleba' ? 'all' : 'gleba'))
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              color: 'var(--mantine-color-text)',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: 'var(--mantine-color-teal-filled)',
              }}
            />
            <span style={{ fontWeight: 500 }}>
              {t('metric_evolution_gleba') || 'Глеба'}
            </span>
          </button>
        )}
      </div>

      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{
            width: '100%',
            height: 'auto',
            minWidth: '600px',
            display: 'block',
            overflow: 'visible',
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient
              id="gradEvolutionNauvis"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="var(--mantine-color-red-filled)"
                stopOpacity="0.25"
              />
              <stop
                offset="100%"
                stopColor="var(--mantine-color-red-filled)"
                stopOpacity="0.0"
              />
            </linearGradient>
            <linearGradient id="gradEvolutionGleba" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--mantine-color-teal-filled)"
                stopOpacity="0.25"
              />
              <stop
                offset="100%"
                stopColor="var(--mantine-color-teal-filled)"
                stopOpacity="0.0"
              />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((val, idx) => {
            const y = paddingTop + val * chartHeight;
            const gridVal = yMax * (1 - val);
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="var(--mantine-color-dark-4)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  fill="var(--mantine-color-dimmed)"
                  fontSize="11"
                  textAnchor="end"
                >
                  {gridVal.toFixed(0)}%
                </text>
              </g>
            );
          })}

          {/* X axis line */}
          <line
            x1={paddingLeft}
            y1={height - paddingBottom}
            x2={width - paddingRight}
            y2={height - paddingBottom}
            stroke="var(--mantine-color-dark-4)"
            strokeWidth="1.5"
          />

          {/* X axis labels */}
          {timeLabels.map((lbl, idx) => (
            <text
              key={idx}
              x={lbl.x}
              y={height - 15}
              fill="var(--mantine-color-dimmed)"
              fontSize="12"
              textAnchor="middle"
            >
              {lbl.text}
            </text>
          ))}

          {/* Area fill for primary surface */}
          {showNauvis && (
            <motion.path
              d={nauvisAreaPath}
              fill="url(#gradEvolutionNauvis)"
              animate={{ d: nauvisAreaPath }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
          {!showNauvis && showGleba && (
            <motion.path
              d={glebaAreaPath}
              fill="url(#gradEvolutionGleba)"
              animate={{ d: glebaAreaPath }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          )}

          {/* Nauvis Curves */}
          {showNauvis && (
            <>
              {showMax && (
                <motion.path
                  d={nauvisMaxPath}
                  fill="none"
                  stroke="var(--mantine-color-red-filled)"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  opacity="0.5"
                  animate={{ d: nauvisMaxPath }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <motion.path
                d={nauvisPath}
                fill="none"
                stroke="var(--mantine-color-red-filled)"
                strokeWidth="2.5"
                animate={{ d: nauvisPath }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            </>
          )}

          {/* Gleba Curves */}
          {showGleba && (
            <>
              {showMax && (
                <motion.path
                  d={glebaMaxPath}
                  fill="none"
                  stroke="var(--mantine-color-teal-filled)"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  opacity="0.5"
                  animate={{ d: glebaMaxPath }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <motion.path
                d={glebaPath}
                fill="none"
                stroke="var(--mantine-color-teal-filled)"
                strokeWidth="2.5"
                animate={{ d: glebaPath }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            </>
          )}

          {/* Hover helper elements */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                y1={paddingTop}
                x2={activePoint.x}
                y2={height - paddingBottom}
                stroke="var(--mantine-color-dark-3)"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />

              {showNauvis && (
                <>
                  {showMax && (
                    <circle
                      cx={activePoint.x}
                      cy={activePoint.yNauvisMax}
                      r="4"
                      fill="var(--mantine-color-dark-1)"
                      stroke="var(--mantine-color-red-filled)"
                      strokeWidth="1.5"
                    />
                  )}
                  <circle
                    cx={activePoint.x}
                    cy={activePoint.yNauvis}
                    r="6"
                    fill="var(--mantine-color-dark-9)"
                    stroke="var(--mantine-color-red-filled)"
                    strokeWidth="2.5"
                  />
                </>
              )}

              {showGleba && (
                <>
                  {showMax && (
                    <circle
                      cx={activePoint.x}
                      cy={activePoint.yGlebaMax}
                      r="4"
                      fill="var(--mantine-color-dark-1)"
                      stroke="var(--mantine-color-teal-filled)"
                      strokeWidth="1.5"
                    />
                  )}
                  <circle
                    cx={activePoint.x}
                    cy={activePoint.yGleba}
                    r="6"
                    fill="var(--mantine-color-dark-9)"
                    stroke="var(--mantine-color-teal-filled)"
                    strokeWidth="2.5"
                  />
                </>
              )}
            </g>
          )}
        </svg>
      </div>

      {/* Tooltip */}
      {activePoint && (
        <div
          style={{
            position: 'absolute',
            left: tooltipPos.x,
            top: tooltipPos.y,
            backgroundColor: 'var(--mantine-color-dark-6)',
            border: '1px solid var(--mantine-color-dark-4)',
            borderRadius: '6px',
            padding: '8px 12px',
            boxShadow: 'var(--mantine-shadow-md)',
            pointerEvents: 'none',
            zIndex: 100,
            minWidth: '170px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            fontSize: '0.82rem',
          }}
        >
          <div
            style={{
              fontWeight: 600,
              color: 'var(--mantine-color-white)',
              borderBottom: '1px solid var(--mantine-color-dark-4)',
              paddingBottom: '4px',
              marginBottom: '2px',
            }}
          >
            {new Date(activePoint.raw.timestamp).toLocaleString([], {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>

          {showNauvis && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '16px',
              }}
            >
              <span
                style={{
                  color: 'var(--mantine-color-dimmed)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: 'var(--mantine-color-red-filled)',
                    display: 'inline-block',
                  }}
                />
                {t('metric_evolution_nauvis') || 'Наувис'}:
              </span>
              <span
                style={{
                  fontWeight: 600,
                  color: 'var(--mantine-color-red-light-color, #ff8787)',
                }}
              >
                {Number(activePoint.raw.evolution ?? 0).toFixed(1)}%
              </span>
            </div>
          )}

          {showNauvis &&
            showMax &&
            activePoint.raw.evolutionMax !== undefined && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '16px',
                  fontSize: '0.76rem',
                }}
              >
                <span style={{ color: 'var(--mantine-color-dimmed)' }}>
                  {t('stats_max') || 'Пиковое'} (Наувис):
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: 'var(--mantine-color-red-filled)',
                  }}
                >
                  {Number(activePoint.raw.evolutionMax).toFixed(1)}%
                </span>
              </div>
            )}

          {showGleba && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '16px',
              }}
            >
              <span
                style={{
                  color: 'var(--mantine-color-dimmed)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: 'var(--mantine-color-teal-filled)',
                    display: 'inline-block',
                  }}
                />
                {t('metric_evolution_gleba') || 'Глеба'}:
              </span>
              <span
                style={{
                  fontWeight: 600,
                  color: 'var(--mantine-color-teal-light-color, #63e6be)',
                }}
              >
                {Number(activePoint.raw.evolutionGleba ?? 0).toFixed(1)}%
              </span>
            </div>
          )}

          {showGleba &&
            showMax &&
            activePoint.raw.evolutionGlebaMax !== undefined && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '16px',
                  fontSize: '0.76rem',
                }}
              >
                <span style={{ color: 'var(--mantine-color-dimmed)' }}>
                  {t('stats_max') || 'Пиковое'} (Глеба):
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: 'var(--mantine-color-teal-filled)',
                  }}
                >
                  {Number(activePoint.raw.evolutionGlebaMax).toFixed(1)}%
                </span>
              </div>
            )}
        </div>
      )}
    </section>
  );
}
