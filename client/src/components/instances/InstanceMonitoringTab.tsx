import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQueries, keepPreviousData } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { IconActivity, IconBug, IconCloudFog } from '@tabler/icons-react';
import { api } from '../../api/client';
import { AppIcon } from '../AppIcon';
import { TabLoadingPlaceholder } from '../TabLoadingPlaceholder';
import type { InstanceItem } from '../../types/instance';

interface MetricPoint {
  timestamp: string;
  cpu: number;
  memory: number;
  players: number;
  ups: number;
  saveSize: number;
  spm: number;
  espm?: number;
  evolution?: number;
  evolutionGleba?: number;
  pollution?: number;
  pollutionAbsorbed?: number;
  pollutionGleba?: number;
  pollutionGlebaAbsorbed?: number;
}

interface InstanceMonitoringTabProps {
  instances: InstanceItem[];
  t: (key: string, ...args: (string | number)[]) => string;
}

type RangeOption = '1h' | '6h' | '24h' | '7d' | '30d' | '90d' | '180d' | '365d';
type MetricKey =
  | 'cpu'
  | 'memory'
  | 'ups'
  | 'spm'
  | 'espm'
  | 'players'
  | 'saveSize'
  | 'evolution'
  | 'evolutionGleba'
  | 'pollution'
  | 'pollutionAbsorbed'
  | 'pollutionGleba'
  | 'pollutionGlebaAbsorbed';

const COLORS = [
  '#38bdf8', // Sky
  '#34d399', // Emerald
  '#fbbf24', // Amber
  '#f472b6', // Pink
  '#a78bfa', // Purple
  '#fb923c', // Orange
  '#4ade80', // Lime
  '#f87171', // Red
  '#2dd4bf', // Teal
  '#818cf8', // Indigo
];

export function InstanceMonitoringTab({
  instances,
  t,
}: InstanceMonitoringTabProps) {
  const [range, setRange] = useState<RangeOption>('24h');
  const [metricKey, setMetricKey] = useState<MetricKey>('cpu');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredLegendId, setHoveredLegendId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleServerSelectChange = (serverId: string) => {
    if (serverId === 'all') {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set([serverId]));
    }
    setHoverIndex(null);
  };

  const handleLegendClick = (instId: string, ev: React.MouseEvent) => {
    const idStr = String(instId);
    const isMeta = ev.ctrlKey || ev.metaKey || ev.shiftKey;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isMeta) {
        if (next.has(idStr)) {
          next.delete(idStr);
        } else {
          next.add(idStr);
        }
      } else {
        if (next.size === 1 && next.has(idStr)) {
          next.clear(); // Toggle off solo
        } else {
          next.clear();
          next.add(idStr);
        }
      }
      return next;
    });
    setHoverIndex(null);
  };

  // Parallel fetch metrics for all instances using React Query
  const queries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ['metrics', inst.id, range],
      queryFn: () =>
        api<MetricPoint[]>(`/api/metrics/${inst.id}?range=${range}`),
      enabled: !!inst.id,
      refetchInterval: (range === '1h' || range === '6h' || range === '24h'
        ? 30000
        : false) as number | false,
      placeholderData: keepPreviousData,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);

  const rangeOptions: { key: RangeOption; label: string }[] = useMemo(
    () => [
      { key: '1h', label: t('range_1h') || '1 час' },
      { key: '6h', label: t('range_6h') || '6 часов' },
      { key: '24h', label: t('range_24h') || '24 часа' },
      { key: '7d', label: t('range_7d') || '7 дней' },
      { key: '30d', label: t('range_30d') || '30 дней' },
      { key: '90d', label: t('range_90d') || '90 дней' },
      { key: '180d', label: t('range_180d') || '180 дней' },
      { key: '365d', label: t('range_365d') || '1 год' },
    ],
    [t],
  );

  const metricOptions: {
    key: MetricKey;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }[] = useMemo(
    () => [
      {
        key: 'cpu',
        label: t('metric_cpu_usage') || 'Использование CPU',
        icon: <AppIcon name="cpu" size={14} />,
      },
      {
        key: 'memory',
        label: t('metric_memory_usage') || 'Использование памяти',
        icon: <AppIcon name="memory" size={14} />,
      },
      {
        key: 'ups',
        label: t('metric_ups') || 'UPS',
        icon: <IconActivity size={14} />,
      },
      {
        key: 'spm',
        label: t('metric_spm') || 'SPM',
        icon: <AppIcon name="science" size={14} />,
      },
      {
        key: 'espm',
        label: t('metric_espm') || 'ESPM',
        icon: <AppIcon name="science" size={14} />,
        badge: 'E',
      },
      {
        key: 'players',
        label: t('metric_players_online') || 'Онлайн игроков',
        icon: <AppIcon name="users" size={14} />,
      },
      {
        key: 'saveSize',
        label: t('metric_save_size') || 'Размер файла сохранения',
        icon: <AppIcon name="save" size={14} />,
      },
      {
        key: 'evolution',
        label: `${t('metric_evolution') || 'Эволюция кусак (%)'} (${t('metric_evolution_nauvis') || 'Наувис'})`,
        icon: <IconBug size={14} />,
        badge: 'N',
      },
      {
        key: 'evolutionGleba',
        label: `${t('metric_evolution') || 'Эволюция кусак (%)'} (${t('metric_evolution_gleba') || 'Глеба'})`,
        icon: <IconBug size={14} />,
        badge: 'G',
      },
      {
        key: 'pollution',
        label: `${t('metric_pollution_production') || t('metric_pollution') || 'Загрязнение'} (${t('metric_evolution_nauvis') || 'Наувис'})`,
        icon: <IconCloudFog size={14} />,
        badge: 'N',
      },
      {
        key: 'pollutionAbsorbed',
        label: `${t('metric_pollution_absorption') || 'Поглощение'} (${t('metric_evolution_nauvis') || 'Наувис'})`,
        icon: <IconCloudFog size={14} />,
        badge: 'N↓',
      },
      {
        key: 'pollutionGleba',
        label: `${t('metric_pollution_production') || t('metric_pollution') || 'Загрязнение'} (${t('metric_evolution_gleba') || 'Глеба'})`,
        icon: <IconCloudFog size={14} />,
        badge: 'G',
      },
      {
        key: 'pollutionGlebaAbsorbed',
        label: `${t('metric_pollution_absorption') || 'Поглощение'} (${t('metric_evolution_gleba') || 'Глеба'})`,
        icon: <IconCloudFog size={14} />,
        badge: 'G↓',
      },
    ],
    [t],
  );

  // Map each server ID to a distinct color
  const instanceColors = useMemo(() => {
    const map: Record<string, string> = {};
    instances.forEach((inst, idx) => {
      map[String(inst.id)] = COLORS[idx % COLORS.length];
    });
    return map;
  }, [instances]);

  // Find the latest timestamp across all metrics to align the right edge of the chart
  const timeWindow = useMemo(() => {
    let maxTime = 0;
    queries.forEach((q) => {
      const data = q.data || [];
      if (data.length > 0) {
        const tVal = new Date(data[data.length - 1].timestamp).getTime();
        if (tVal > maxTime) maxTime = tVal;
      }
    });
    const right = maxTime > 0 ? new Date(maxTime) : new Date();

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
  }, [range, queries]);

  const valueFormatter = useCallback(
    (val: number) => {
      if (
        metricKey === 'cpu' ||
        metricKey === 'evolution' ||
        metricKey === 'evolutionGleba'
      ) {
        return `${val.toFixed(1)}%`;
      }
      if (
        metricKey === 'pollution' ||
        metricKey === 'pollutionGleba' ||
        metricKey === 'pollutionAbsorbed' ||
        metricKey === 'pollutionGlebaAbsorbed'
      ) {
        return `${Math.round(val).toLocaleString()} /мин`;
      }
      if (metricKey === 'memory' || metricKey === 'saveSize')
        return formatBytes(val);
      if (metricKey === 'players') return `${Math.round(val)}`;
      if (metricKey === 'ups') return `${val.toFixed(1)}`;
      if (metricKey === 'spm' || metricKey === 'espm')
        return `${Math.round(val)}`;
      return `${val}`;
    },
    [metricKey],
  );

  // Resample all server datasets to exactly 120 points to support smooth morphing coordinates
  const targetPointsCount = 120;
  const resampledQueriesData = useMemo(() => {
    return queries.map((q, qIdx) => {
      const inst = instances[qIdx];
      const data = q.data || [];
      if (data.length === 0) return { instance: inst, points: [] };

      let resampled: MetricPoint[] = [];
      if (data.length === 1) {
        resampled = Array.from({ length: targetPointsCount }, () => ({
          ...data[0],
        }));
      } else {
        for (let i = 0; i < targetPointsCount; i++) {
          const progress = i / (targetPointsCount - 1);
          const rawIndex = progress * (data.length - 1);
          const indexLow = Math.floor(rawIndex);
          const indexHigh = Math.ceil(rawIndex);
          const weight = rawIndex - indexLow;

          const pLow = data[indexLow];
          const pHigh = data[indexHigh];

          const cpu = pLow.cpu + (pHigh.cpu - pLow.cpu) * weight;
          const memory = pLow.memory + (pHigh.memory - pLow.memory) * weight;
          const players =
            pLow.players + (pHigh.players - pLow.players) * weight;
          const ups = pLow.ups + (pHigh.ups - pLow.ups) * weight;
          const saveSize =
            pLow.saveSize + (pHigh.saveSize - pLow.saveSize) * weight;
          const spm = pLow.spm + (pHigh.spm - pLow.spm) * weight;
          const espm =
            (pLow.espm ?? 0) + ((pHigh.espm ?? 0) - (pLow.espm ?? 0)) * weight;
          const evolution =
            (pLow.evolution ?? 0) +
            ((pHigh.evolution ?? 0) - (pLow.evolution ?? 0)) * weight;
          const evolutionGleba =
            (pLow.evolutionGleba ?? 0) +
            ((pHigh.evolutionGleba ?? 0) - (pLow.evolutionGleba ?? 0)) * weight;
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

          resampled.push({
            timestamp,
            cpu,
            memory,
            players,
            ups,
            saveSize,
            spm,
            espm,
            evolution,
            evolutionGleba,
            pollution,
            pollutionAbsorbed,
            pollutionGleba,
            pollutionGlebaAbsorbed,
          });
        }
      }
      return { instance: inst, points: resampled };
    });
  }, [queries, instances]);

  const hasData = useMemo(() => {
    return resampledQueriesData.some((rqd) => rqd.points.length > 0);
  }, [resampledQueriesData]);

  const chartWrapRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  }>({
    width: 1000,
    height: 330,
  });

  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      if (w > 100 && h > 100) {
        setDimensions({
          width: Math.max(700, w),
          height: Math.max(260, h),
        });
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Dynamic chart coordinates based on measured container size
  const width = dimensions.width;
  const height = dimensions.height;
  const paddingLeft = 110;
  const paddingRight = 45;
  const paddingTop = 20;
  const paddingBottom = 35;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Global Y scale scaling (only consider selected/visible instances)
  const maxVal = useMemo(() => {
    let max = 0.1;
    resampledQueriesData.forEach((rqd) => {
      if (selectedIds.size > 0 && !selectedIds.has(String(rqd.instance.id))) {
        return;
      }
      rqd.points.forEach((p) => {
        const val = p[metricKey] || 0;
        if (val > max) max = val;
      });
    });
    return max;
  }, [resampledQueriesData, metricKey, selectedIds]);

  const yMaxDefault = useMemo(() => {
    if (
      metricKey === 'cpu' ||
      metricKey === 'evolution' ||
      metricKey === 'evolutionGleba'
    )
      return 100;
    if (metricKey === 'pollution' || metricKey === 'pollutionGleba') return 500;
    if (metricKey === 'memory') return 1024 * 1024 * 1024;
    if (metricKey === 'ups') return 60;
    if (metricKey === 'spm' || metricKey === 'espm') return 100;
    if (metricKey === 'saveSize') return 1024 * 1024;
    return 5;
  }, [metricKey]);

  const yMax = useMemo(() => {
    if (metricKey === 'evolution' || metricKey === 'evolutionGleba') return 100;
    if (metricKey === 'ups') {
      if (maxVal <= 61) return 60;
      return Math.ceil(maxVal / 60) * 60;
    }
    return Math.max(yMaxDefault, maxVal) * 1.15;
  }, [metricKey, yMaxDefault, maxVal]);

  const svgPathsData = useMemo(() => {
    const { left, duration } = timeWindow;
    return resampledQueriesData.map((rqd) => {
      const points = rqd.points.map((m) => {
        const itemTime = new Date(m.timestamp).getTime();
        const relativeTime = itemTime - left.getTime();
        const ratio =
          duration > 0 ? Math.max(0, Math.min(1, relativeTime / duration)) : 0;

        const x = paddingLeft + ratio * chartWidth;
        const y =
          height - paddingBottom - ((m[metricKey] || 0) / yMax) * chartHeight;
        return { x, y, raw: m };
      });

      const pathStr =
        points.length === 0
          ? ''
          : points
              .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
              .join(' ');

      const first = points[0];
      const last = points[points.length - 1];
      const areaPath =
        pathStr && first && last
          ? `${pathStr} L ${last.x} ${height - paddingBottom} L ${first.x} ${height - paddingBottom} Z`
          : '';

      return {
        instance: rqd.instance,
        points,
        pathStr,
        areaPath,
      };
    });
  }, [
    resampledQueriesData,
    timeWindow,
    metricKey,
    yMax,
    chartWidth,
    chartHeight,
    height,
    paddingBottom,
  ]);

  // SVG paths filtered by visibility
  const visiblePathsData = useMemo(() => {
    return svgPathsData.filter((d) => {
      if (selectedIds.size === 0) return true;
      return selectedIds.has(String(d.instance.id));
    });
  }, [svgPathsData, selectedIds]);

  function handleMouseMove(ev: React.MouseEvent<SVGSVGElement, MouseEvent>) {
    if (!hasData) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const mouseX = ((ev.clientX - rect.left) / rect.width) * width;

    const ratio = Math.max(0, Math.min(1, (mouseX - paddingLeft) / chartWidth));
    const idx = Math.round(ratio * (targetPointsCount - 1));

    setHoverIndex(idx);

    const cardRect = containerRef.current?.getBoundingClientRect();
    if (cardRect) {
      const isRightHalf = ev.clientX - cardRect.left > cardRect.width / 2;
      const tooltipX = isRightHalf
        ? Math.max(10, ev.clientX - cardRect.left - 245)
        : Math.min(cardRect.width - 245, ev.clientX - cardRect.left + 15);
      const tooltipY = Math.max(
        10,
        Math.min(cardRect.height - 180, ev.clientY - cardRect.top - 60),
      );
      setTooltipPos({ x: tooltipX, y: tooltipY });
    }
  }

  const gridTicks = width > 1600 ? 7 : 5;
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
  }, [timeWindow, range, chartWidth, gridTicks]);

  // Construct active points lists sorted by value for tooltip presentation
  const tooltipRows = useMemo(() => {
    if (hoverIndex === null) return [];
    return visiblePathsData
      .map((d) => {
        const pt = d.points[hoverIndex];
        const val = Number(pt?.raw[metricKey] ?? 0);
        return {
          instance: d.instance,
          value: val,
          color:
            instanceColors[String(d.instance.id)] ||
            'var(--mantine-color-blue-filled)',
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [hoverIndex, visiblePathsData, metricKey, instanceColors]);

  const activeTimestamp = useMemo(() => {
    if (hoverIndex === null) return null;
    for (const d of visiblePathsData) {
      const pt = d.points[hoverIndex];
      if (pt) return pt.raw.timestamp;
    }
    return null;
  }, [hoverIndex, visiblePathsData]);

  const activeMetricOption = useMemo(() => {
    return (
      metricOptions.find((opt) => opt.key === metricKey) || metricOptions[0]
    );
  }, [metricOptions, metricKey]);

  return (
    <div
      id="instanceTabMonitoring"
      ref={containerRef}
      className="sub-tab-panel sub-tab-panel--active instance-monitoring-tab animate-show"
      role="tabpanel"
    >
      {/* ── Toolbar: Metric Select, Server Filter, Refresh, Range Switcher ── */}
      <div
        className="access-users-bar instance-monitoring-bar"
        role="toolbar"
        aria-label={t('instances_tab_monitoring')}
      >
        <div className="instance-monitoring-bar__filters">
          {/* 1. Переключатель метрик (иконки) */}
          <div
            className="instance-monitoring-metric-group"
            role="group"
            aria-label={t('monitoring_metric_label')}
          >
            {metricOptions.map((opt) => {
              const isActive = metricKey === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  id={`btnMetric_${opt.key}`}
                  className={
                    'instance-monitoring-metric-btn' +
                    (isActive ? ' instance-monitoring-metric-btn--active' : '')
                  }
                  title={opt.label}
                  aria-label={opt.label}
                  onClick={() => {
                    setMetricKey(opt.key);
                    setHoverIndex(null);
                  }}
                >
                  {opt.icon}
                  {opt.badge && (
                    <span className="instance-monitoring-metric-btn__badge">
                      {opt.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 2. Фильтр серверов */}
          <select
            id="instanceMonitoringServerSelect"
            className="input access-users-bar__select instance-monitoring-bar__select"
            value={selectedIds.size === 1 ? Array.from(selectedIds)[0] : 'all'}
            onChange={(e) => handleServerSelectChange(e.target.value)}
            aria-label={t('instances_tab_servers')}
          >
            <option value="all">
              {t('instances_filter_all_servers') || 'Все серверы'} (
              {instances.length})
            </option>
            {instances.map((inst) => (
              <option key={String(inst.id)} value={String(inst.id)}>
                {inst.name}
              </option>
            ))}
          </select>
        </div>

        {/* 4. Переключатель диапазона времени (справа) */}
        <div className="instance-monitoring-bar__actions">
          <div
            className="instance-monitoring-range"
            role="group"
            aria-label={t('range_label')}
          >
            {rangeOptions.map((opt) => {
              const isRangeActive = range === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  className={
                    'instance-monitoring-range__btn' +
                    (isRangeActive
                      ? ' instance-monitoring-range__btn--active'
                      : '')
                  }
                  onClick={() => {
                    setRange(opt.key);
                    setHoverIndex(null);
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {isLoading ? (
        <TabLoadingPlaceholder
          variant="dashboard"
          label={t('tab_data_loading') || 'Загрузка данных...'}
        />
      ) : !hasData ? (
        <div className="instance-monitoring-empty">
          <span className="instance-monitoring-empty__title">
            {t('no_metrics_title') || 'Нет данных'}
          </span>
          <span className="instance-monitoring-empty__desc">
            {t('no_active_servers_metrics') ||
              'Нет доступных серверов с историей метрик для отображения.'}
          </span>
        </div>
      ) : (
        <div className="instance-monitoring-card">
          <header className="instance-monitoring-card__header">
            <div className="instance-monitoring-card__title-box">
              <span className="instance-monitoring-card__icon">
                {activeMetricOption.icon}
              </span>
              <h3 className="instance-monitoring-card__title">
                {activeMetricOption.label}
              </h3>
            </div>
            <div className="instance-monitoring-card__meta">
              <span className="instance-monitoring-card__meta-dot" />
              <span>
                {selectedIds.size > 0
                  ? `${selectedIds.size} / ${instances.length} ${t('servers_selected_count') || 'выбрано'}`
                  : `${instances.length} ${t('all_servers_label') || 'все серверы'}`}
              </span>
            </div>
          </header>

          <div
            ref={chartWrapRef}
            className="instance-monitoring-card__chart-wrap"
          >
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="instance-monitoring-chart-svg"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <defs>
                {visiblePathsData.map((d) => {
                  const color =
                    instanceColors[String(d.instance.id)] || '#38bdf8';
                  const isSolo = visiblePathsData.length === 1;
                  const isHovered = hoveredLegendId === String(d.instance.id);
                  const topOpacity = isHovered ? 0.35 : isSolo ? 0.3 : 0.18;
                  return (
                    <linearGradient
                      key={`grad-${d.instance.id}`}
                      id={`grad-inst-${d.instance.id}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={color}
                        stopOpacity={topOpacity}
                      />
                      <stop offset="100%" stopColor={color} stopOpacity="0.0" />
                    </linearGradient>
                  );
                })}
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
                      stroke="var(--border-dark, rgba(255, 255, 255, 0.08))"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={paddingLeft - 8}
                      y={y + 4}
                      fill="var(--text-muted, #8b949e)"
                      fontSize="11"
                      fontFamily="inherit"
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
                stroke="var(--border-dark, rgba(255, 255, 255, 0.12))"
                strokeWidth="1.5"
              />

              {/* X axis labels */}
              {timeLabels.map((lbl, idx) => (
                <text
                  key={idx}
                  x={lbl.x}
                  y={height - 15}
                  fill="var(--text-muted, #8b949e)"
                  fontSize="12"
                  fontFamily="inherit"
                  textAnchor="middle"
                >
                  {lbl.text}
                </text>
              ))}

              {/* Area fills under curves */}
              {visiblePathsData.map((d) => {
                if (!d.areaPath) return null;
                const isHovered = hoveredLegendId === String(d.instance.id);
                const opacity = hoveredLegendId ? (isHovered ? 1 : 0.25) : 1;
                return (
                  <motion.path
                    key={`area-${d.instance.id}`}
                    d={d.areaPath}
                    fill={`url(#grad-inst-${d.instance.id})`}
                    opacity={opacity}
                    animate={{ d: d.areaPath }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                );
              })}

              {/* Server Stroke Lines */}
              {visiblePathsData.map((d) => {
                if (!d.pathStr) return null;
                const color =
                  instanceColors[String(d.instance.id)] || '#38bdf8';
                const isHovered = hoveredLegendId === String(d.instance.id);
                const strokeWidth = isHovered ? 3.5 : 2.5;
                const opacity = hoveredLegendId ? (isHovered ? 1 : 0.35) : 1;
                return (
                  <motion.path
                    key={`stroke-${d.instance.id}`}
                    d={d.pathStr}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={opacity}
                    animate={{ d: d.pathStr }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                );
              })}

              {/* Hover guide elements */}
              {hoverIndex !== null && activeTimestamp && (
                <g>
                  {/* Vertical line indicator */}
                  <line
                    x1={
                      paddingLeft +
                      (hoverIndex / (targetPointsCount - 1)) * chartWidth
                    }
                    y1={paddingTop}
                    x2={
                      paddingLeft +
                      (hoverIndex / (targetPointsCount - 1)) * chartWidth
                    }
                    y2={height - paddingBottom}
                    stroke="var(--accent)"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    opacity={0.8}
                  />

                  {/* Dots for each server */}
                  {visiblePathsData.map((d) => {
                    const pt = d.points[hoverIndex];
                    if (!pt) return null;
                    const color =
                      instanceColors[String(d.instance.id)] || '#38bdf8';
                    const isHovered = hoveredLegendId === String(d.instance.id);
                    return (
                      <circle
                        key={String(d.instance.id)}
                        cx={pt.x}
                        cy={pt.y}
                        r={isHovered ? 7 : 6}
                        fill="var(--bg-widget)"
                        stroke={color}
                        strokeWidth={isHovered ? 3 : 2.5}
                      />
                    );
                  })}
                </g>
              )}
            </svg>
          </div>

          {/* Interactive Multi-Server Tooltip */}
          {hoverIndex !== null && activeTimestamp && tooltipRows.length > 0 && (
            <div
              className="instance-monitoring-tooltip"
              style={{
                left: tooltipPos.x,
                top: tooltipPos.y,
              }}
            >
              <div className="instance-monitoring-tooltip__time">
                {new Date(activeTimestamp).toLocaleString([], {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              <div className="instance-monitoring-tooltip__rows">
                {tooltipRows.map((row) => (
                  <div
                    key={String(row.instance.id)}
                    className="instance-monitoring-tooltip__row"
                  >
                    <div className="instance-monitoring-tooltip__item">
                      <span
                        className="instance-monitoring-tooltip__dot"
                        style={{ backgroundColor: row.color }}
                      />
                      <span
                        className="instance-monitoring-tooltip__name"
                        title={row.instance.name}
                      >
                        {row.instance.name}
                      </span>
                    </div>
                    <span className="instance-monitoring-tooltip__val">
                      {valueFormatter(row.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Card Footer: Legend & Help Hint integrated into card */}
          {hasData && (
            <footer className="instance-monitoring-card__footer">
              <div className="instance-monitoring-card__legend-row">
                <div className="instance-monitoring-legend__list">
                  {instances.map((inst) => {
                    const hasHistory = resampledQueriesData.some(
                      (rqd) =>
                        String(rqd.instance.id) === String(inst.id) &&
                        rqd.points.length > 0,
                    );
                    if (!hasHistory) return null;
                    const isSelected =
                      selectedIds.size === 0 ||
                      selectedIds.has(String(inst.id));
                    const color = instanceColors[String(inst.id)] || '#38bdf8';
                    return (
                      <div
                        key={String(inst.id)}
                        className={
                          'instance-monitoring-chip' +
                          (isSelected
                            ? ' instance-monitoring-chip--active'
                            : ' instance-monitoring-chip--dimmed')
                        }
                        onMouseEnter={() => setHoveredLegendId(String(inst.id))}
                        onMouseLeave={() => setHoveredLegendId(null)}
                        onClick={(ev) => handleLegendClick(String(inst.id), ev)}
                        title={
                          t('legend_help') ||
                          'Клик — соло, Ctrl+Клик — мультивыбор'
                        }
                      >
                        <span
                          className="instance-monitoring-chip__dot"
                          style={{
                            backgroundColor: isSelected
                              ? color
                              : 'var(--text-muted)',
                            boxShadow: isSelected ? `0 0 6px ${color}` : 'none',
                          }}
                        />
                        <span>{inst.name}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="instance-monitoring-legend__hint">
                  <AppIcon name="help" size={14} />
                  <span>
                    {t('legend_help') ||
                      'Клик по серверу в легенде — показать только его. Ctrl + Клик — выбрать несколько.'}
                  </span>
                </div>
              </div>
            </footer>
          )}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
