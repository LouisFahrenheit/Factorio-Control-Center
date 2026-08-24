import { useState, useRef, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { api } from '../../api/client';
import { TabLoadingPlaceholder, tabInitialLoad } from '../TabLoadingPlaceholder';

interface MetricPoint {
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
}

interface MonitoringTabProps {
  instanceId: string;
  serverRunning: boolean;
  t: (key: string, ...args: (string | number)[]) => string;
}

type RangeOption = '1h' | '6h' | '24h' | '7d' | '30d' | '90d' | '180d' | '365d';

export function MonitoringTab({ instanceId, serverRunning, t }: MonitoringTabProps) {
  const [range, setRange] = useState<RangeOption>('24h');

  // Query to fetch metrics
  const { data: metrics = [], isLoading, isPlaceholderData } = useQuery<MetricPoint[]>({
    queryKey: ['metrics', instanceId, range],
    queryFn: () => api<MetricPoint[]>(`/api/metrics/${instanceId}?range=${range}`),
    refetchInterval: range === '1h' || range === '6h' || range === '24h' ? 30000 : false, // Poll active ranges every 30s
    enabled: !!instanceId,
    placeholderData: keepPreviousData,
  });

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

  return (
    <div id="tabPanelMonitoring" className="tab-panel tab-panel--active monitoring-tab" role="tabpanel" aria-labelledby="tabBtnMonitoring">
      <div className="monitoring-tab__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600, color: 'var(--mantine-color-text)' }}>
            {t('web_tab_monitoring') || 'Мониторинг ресурсов'}
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--mantine-color-dimmed)' }}>
            {serverRunning ? (t('server_running_metrics') || 'Показатели работающего сервера') : (t('server_stopped_metrics') || 'Сервер выключен. Отображаются исторические данные.')}
          </span>
        </div>
        <div className="btn-group" style={{ display: 'flex', background: 'var(--mantine-color-dark-6)', borderRadius: '6px', padding: '4px' }}>
          {rangeButtons.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className="btn btn--compact"
              style={{
                position: 'relative',
                background: 'transparent',
                color: range === opt.key ? '#fff' : 'var(--mantine-color-text)',
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
                    background: 'var(--mantine-color-blue-filled)',
                    borderRadius: '4px',
                    zIndex: 1,
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span style={{ position: 'relative', zIndex: 2 }}>
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {initialLoading ? (
        <TabLoadingPlaceholder variant="dashboard" label={t('tab_data_loading') || 'Загрузка данных...'} />
      ) : metrics.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', background: 'var(--mantine-color-dark-7)', borderRadius: '8px', border: '1px dashed var(--mantine-color-dark-4)', padding: '24px', color: 'var(--mantine-color-dimmed)' }}>
          <span style={{ fontSize: '1.1rem', marginBottom: '8px' }}>{t('no_metrics_title') || 'Нет данных для отображения'}</span>
          <span style={{ fontSize: '0.85rem', textAlign: 'center', maxWidth: '400px' }}>
            {t('no_metrics_desc') || 'Метрики появятся после запуска сервера инстанса и сбора первых отсчетов (каждую минуту).'}
          </span>
        </div>
      ) : (
        <div className="monitoring-grid">
          {/* Chart 1: CPU Usage */}
          <ChartCard
            title={t('metric_cpu_usage') || 'Использование CPU (%)'}
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

          {/* Chart 2: Memory Usage */}
          <ChartCard
            title={t('metric_memory_usage') || 'Использование оперативной памяти'}
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

          {/* Chart 3: UPS */}
          <ChartCard
            title={t('metric_ups') || 'UPS (Тактов в секунду)'}
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

          {/* Chart 4: SPM */}
          <ChartCard
            title={t('metric_spm') || 'SPM (Наука в минуту)'}
            metrics={metrics}
            metricKey="spm"
            yMaxDefault={100}
            color="var(--mantine-color-cyan-filled)"
            gradientId="gradSpm"
            valueFormatter={(v) => `${Math.round(v)}`}
            showMax={range !== '1h' && range !== '6h' && range !== '24h'}
            t={t}
            range={range}
            isUpdating={isPlaceholderData}
          />

          {/* Chart 5: Players Online */}
          <ChartCard
            title={t('metric_players_online') || 'Онлайн игроков'}
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

          {/* Chart 6: Save File Size */}
          <ChartCard
            title={t('metric_save_size') || 'Размер файла сохранения'}
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
        </div>
      )}
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
  metrics: MetricPoint[];
  metricKey: 'cpu' | 'memory' | 'players' | 'ups' | 'saveSize' | 'spm';
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
  metrics,
  metricKey,
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
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const hasSecondary = showMax || showMin;
  const secondaryKey = useMemo(() => {
    if (showMax) {
      if (metricKey === 'cpu') return 'cpuMax';
      if (metricKey === 'memory') return 'memoryMax';
      if (metricKey === 'saveSize') return 'saveSizeMax';
      if (metricKey === 'spm') return 'spmMax';
    }
    if (showMin) return 'upsMin';
    return null;
  }, [showMax, showMin, metricKey]);

  // Get max values for Y scaling
  const maxAvgValue = useMemo(() => {
    return Math.max(...metrics.map((m) => m[metricKey]), 0.1);
  }, [metrics, metricKey]);

  const maxSecondaryValue = useMemo(() => {
    if (!hasSecondary || !secondaryKey) return 0;
    return Math.max(...metrics.map((m) => ((m as any)[secondaryKey] !== undefined ? Number((m as any)[secondaryKey]) : 0)), 0.1);
  }, [metrics, secondaryKey, hasSecondary]);

  const yMax = Math.max(yMaxDefault, maxAvgValue, maxSecondaryValue) * 1.15; // Add 15% padding at top

  // Chart coordinates calculations
  const width = 1000;
  const height = 180;
  const paddingLeft = 75;
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
      return Array.from({ length: targetPointsCount }, () => ({ ...metrics[0] }));
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
      const saveSize = pLow.saveSize + (pHigh.saveSize - pLow.saveSize) * weight;
      const spm = pLow.spm + (pHigh.spm - pLow.spm) * weight;

      // Handle optional properties
      const cpuMax = (pLow.cpuMax !== undefined && pHigh.cpuMax !== undefined)
        ? pLow.cpuMax + (pHigh.cpuMax - pLow.cpuMax) * weight
        : (pLow.cpuMax !== undefined ? pLow.cpuMax : pLow.cpu);

      const memoryMax = (pLow.memoryMax !== undefined && pHigh.memoryMax !== undefined)
        ? pLow.memoryMax + (pHigh.memoryMax - pLow.memoryMax) * weight
        : (pLow.memoryMax !== undefined ? pLow.memoryMax : pLow.memory);

      const upsMin = (pLow.upsMin !== undefined && pHigh.upsMin !== undefined)
        ? pLow.upsMin + (pHigh.upsMin - pLow.upsMin) * weight
        : (pLow.upsMin !== undefined ? pLow.upsMin : pLow.ups);

      const saveSizeMax = (pLow.saveSizeMax !== undefined && pHigh.saveSizeMax !== undefined)
        ? pLow.saveSizeMax + (pHigh.saveSizeMax - pLow.saveSizeMax) * weight
        : (pLow.saveSizeMax !== undefined ? pLow.saveSizeMax : pLow.saveSize);

      const spmMax = (pLow.spmMax !== undefined && pHigh.spmMax !== undefined)
        ? pLow.spmMax + (pHigh.spmMax - pLow.spmMax) * weight
        : (pLow.spmMax !== undefined ? pLow.spmMax : pLow.spm);

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
      });
    }
    return result;
  }, [metrics, targetPointsCount]);

  const timeWindow = useMemo(() => {
    const right = metrics.length > 0 ? new Date(metrics[metrics.length - 1].timestamp) : new Date();
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
      const ratio = duration > 0 ? Math.max(0, Math.min(1, relativeTime / duration)) : 0;

      const x = paddingLeft + ratio * chartWidth;
      const y = height - paddingBottom - (m[metricKey] / yMax) * chartHeight;
      
      let ySecVal = y;
      if (hasSecondary && secondaryKey) {
        const mSec = (m as any)[secondaryKey] !== undefined ? Number((m as any)[secondaryKey]) : m[metricKey];
        ySecVal = height - paddingBottom - (mSec / yMax) * chartHeight;
      }
      return { x, y, ySecondary: ySecVal, raw: m };
    });
  }, [resampledMetrics, metricKey, yMax, chartWidth, chartHeight, hasSecondary, secondaryKey, timeWindow]);

  // Path string for the line
  const linePath = useMemo(() => {
    if (points.length === 0) return '';
    return points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }, [points]);

  // Path string for the secondary line (peaks / drops)
  const secondaryLinePath = useMemo(() => {
    if (!hasSecondary || points.length === 0) return '';
    return points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.ySecondary}`).join(' ');
  }, [points, hasSecondary]);

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
    const isRightHalf = (ev.clientX - containerRect.left) > (containerRect.width / 2);
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
        text = tickTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (range === '7d' || range === '30d' || range === '90d' || range === '180d') {
        text = tickTime.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
      } else {
        text = tickTime.toLocaleDateString([], { month: 'short', year: '2-digit' });
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
      <header className="players-tab__card-header" style={{ marginBottom: '12px' }}>
        <h3 className="players-tab__card-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--mantine-color-text)' }}>
          {title}
        </h3>
      </header>
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', minWidth: '600px', display: 'block', overflow: 'visible' }}
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
                  x={paddingLeft - 10}
                  y={y + 4}
                  fill="var(--mantine-color-dimmed)"
                  fontSize="12"
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
          <div style={{ fontWeight: 600, color: 'var(--mantine-color-white)', borderBottom: '1px solid var(--mantine-color-dark-4)', paddingBottom: '4px', marginBottom: '4px' }}>
            {new Date(activePoint.raw.timestamp).toLocaleString([], {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span style={{ color: 'var(--mantine-color-dimmed)' }}>
              {hasSecondary ? (t('stats_avg') || 'Среднее') : (t('stats_value') || 'Значение')}:
            </span>
            <span style={{ fontWeight: 600, color }}>
              {valueFormatter(activePoint.raw[metricKey])}
            </span>
          </div>
          {hasSecondary && secondaryKey && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ color: 'var(--mantine-color-dimmed)' }}>
                {showMax ? (t('stats_max') || 'Пиковое') : (t('stats_min') || 'Минимальное')}:
              </span>
              <span style={{ fontWeight: 600, color }}>
                {valueFormatter(
                  Number((activePoint.raw as any)[secondaryKey] || 0)
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
