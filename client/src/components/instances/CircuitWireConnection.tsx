import {
  useEffect,
  useState,
  useRef,
  useCallback,
  type RefObject,
  type CSSProperties,
} from 'react';
import { webEffectsReduced } from '../../theme/webEffects';

// Constant physical speed of the pulse(in px/s)
const PULSE_SPEED_PX_PER_SEC = 400;
// Constant calm pause between pulses after reaching the destination (in seconds)
const PULSE_PAUSE_SEC = 5.5;

interface CircuitWireCoords {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  path: string;
  length: number;
  key: string;
}

interface CircuitWireConnectionProps {
  activeTab: string;
  containerRef: RefObject<HTMLElement | null>;
}

function buildOrthogonalPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius = 8,
): { path: string; length: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const yMid = Math.round(y1 + dy * 0.5);
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const r = Math.min(radius, absDx / 2, absDy / 2);

  if (r < 1 || absDx < 2) {
    const length = Math.round(absDy);
    return {
      path: `M ${x1} ${y1} L ${x2} ${y2}`,
      length,
    };
  }

  const dir = dx > 0 ? 1 : -1;
  const path = [
    `M ${x1} ${y1}`,
    `L ${x1} ${yMid - r}`,
    `Q ${x1} ${yMid} ${x1 + dir * r} ${yMid}`,
    `L ${x2 - dir * r} ${yMid}`,
    `Q ${x2} ${yMid} ${x2} ${yMid + r}`,
    `L ${x2} ${y2}`,
  ].join(' ');

  const length = Math.round(
    Math.abs(yMid - r - y1) +
    Math.abs(x2 - dir * r - (x1 + dir * r)) +
    Math.PI * r +
    Math.abs(y2 - (yMid + r)),
  );

  return { path, length };
}

export function CircuitWireConnection({
  activeTab,
  containerRef,
}: CircuitWireConnectionProps) {
  const hasSubTabs = activeTab === 'maintenance' || activeTab === 'settings';
  const [coords, setCoords] = useState<CircuitWireCoords | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isReduced = webEffectsReduced();

  useEffect(() => {
    if (!hasSubTabs) {
      setCoords(null);
    }
  }, [hasSubTabs]);

  const updateCoords = useCallback(() => {
    if (!hasSubTabs) {
      setCoords(null);
      return;
    }

    const container = containerRef.current;
    if (!container) {
      setCoords(null);
      return;
    }

    const panelId =
      activeTab === 'maintenance'
        ? 'instanceTabMaintenance'
        : 'instanceTabSettings';
    const activePanel = container.querySelector<HTMLElement>(`#${panelId}`);
    if (!activePanel) {
      setCoords(null);
      return;
    }

    const mainBtn = container.querySelector<HTMLElement>(
      activeTab === 'maintenance'
        ? '#instanceTabMaintenanceBtn'
        : '#instanceTabSettingsBtn',
    );
    const subBtn = activePanel.querySelector<HTMLElement>(
      '.sub-tabs .sub-tabs__tab--active',
    );

    if (!mainBtn || !subBtn) {
      setCoords(null);
      return;
    }

    const cRect = container.getBoundingClientRect();
    const mRect = mainBtn.getBoundingClientRect();
    const sRect = subBtn.getBoundingClientRect();

    const x1 = Math.round(mRect.left + mRect.width / 2 - cRect.left);
    const y1 = Math.round(mRect.bottom - cRect.top);
    const x2 = Math.round(sRect.left + sRect.width / 2 - cRect.left);
    const y2 = Math.round(sRect.top - cRect.top);

    // Guard against hidden elements or invalid geometry
    if (mRect.width === 0 || sRect.width === 0 || y2 <= y1) {
      setCoords(null);
      return;
    }

    const { path, length } = buildOrthogonalPath(x1, y1, x2, y2, 8);
    const key = `${activeTab}-${x1}-${y1}-${x2}-${y2}`;

    setCoords((prev) => {
      if (
        prev &&
        prev.x1 === x1 &&
        prev.y1 === y1 &&
        prev.x2 === x2 &&
        prev.y2 === y2 &&
        prev.key === key
      ) {
        return prev;
      }
      return { x1, y1, x2, y2, path, length, key };
    });
  }, [hasSubTabs, activeTab, containerRef]);

  useEffect(() => {
    if (!hasSubTabs) {
      return;
    }

    updateCoords();

    const t1 = window.setTimeout(updateCoords, 60);
    const t2 = window.setTimeout(updateCoords, 180);
    const t3 = window.setTimeout(updateCoords, 320);

    const onResize = () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
      animFrameRef.current = requestAnimationFrame(updateCoords);
    };

    window.addEventListener('resize', onResize, { passive: true });

    const container = containerRef.current;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.sub-tabs__tab')) {
        setTimeout(updateCoords, 20);
        setTimeout(updateCoords, 120);
      }
    };

    if (container) {
      container.addEventListener('click', onClick, { passive: true });
    }

    let observer: MutationObserver | null = null;
    if (container) {
      observer = new MutationObserver(() => {
        updateCoords();
      });
      observer.observe(container, {
        attributes: true,
        subtree: true,
        attributeFilter: ['class', 'aria-selected'],
      });
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
      window.removeEventListener('resize', onResize);
      if (container) {
        container.removeEventListener('click', onClick);
      }
      if (observer) {
        observer.disconnect();
      }
    };
  }, [hasSubTabs, updateCoords, containerRef]);

  if (!hasSubTabs || !coords) {
    return null;
  }

  const { x1, y1, x2, y2, path, length, key } = coords;

  // Calculate constant speed timing regardless of wire length
  const travelDistance = length + 16;
  const travelTime = travelDistance / PULSE_SPEED_PX_PER_SEC;
  const totalTime = travelTime + PULSE_PAUSE_SEC;
  const travelPct = (travelTime / totalTime) * 100;
  const fadePct = Math.min(travelPct * 0.12, 2.5);
  const animName = `cwp-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  return (
    <svg
      className="circuit-wire-svg"
      aria-hidden="true"
      style={{ '--wire-length': `${length}px` } as CSSProperties}
    >
      <defs>
        <style>{`
          @keyframes ${animName} {
            0% {
              stroke-dashoffset: 16px;
              opacity: 0;
            }
            ${fadePct.toFixed(2)}% {
              opacity: 0.85;
            }
            ${(travelPct - fadePct).toFixed(2)}% {
              opacity: 0.85;
            }
            ${travelPct.toFixed(2)}% {
              stroke-dashoffset: -${length}px;
              opacity: 0;
            }
            100% {
              stroke-dashoffset: -${length}px;
              opacity: 0;
            }
          }
        `}</style>
      </defs>

      <g key={key} className="circuit-wire__group">
        {/* Wire body*/}
        <path
          d={path}
          className="circuit-wire__wire"
          style={{
            strokeDasharray: length,
            strokeDashoffset: isReduced ? 0 : length,
          }}
        />

        {/* Subtle upper metallic highlight sheen with matching draw-in */}
        <path
          d={path}
          className="circuit-wire__sheen"
          style={{
            strokeDasharray: length,
            strokeDashoffset: isReduced ? 0 : length,
          }}
        />

        {/* Running electrical energy pulse packet */}
        {!isReduced && (
          <path
            d={path}
            className="circuit-wire__pulse"
            style={{
              animation: `${animName} ${totalTime.toFixed(2)}s linear infinite`,
            }}
          />
        )}

        {/* Main tab terminal lug */}
        <g
          className="circuit-wire__terminal circuit-wire__terminal--start"
          transform={`translate(${x1}, ${y1})`}
        >
          <circle
            r={3.5}
            fill="color-mix(in srgb, var(--accent) 16%, var(--bg-widget) 84%)"
            stroke="color-mix(in srgb, var(--accent) 36%, transparent)"
            strokeWidth={1.2}
          />
          <circle
            r={1.5}
            fill="color-mix(in srgb, var(--accent) 55%, var(--bg-widget) 45%)"
          />
        </g>

        {/* Sub-tab terminal lug */}
        <g
          className="circuit-wire__terminal circuit-wire__terminal--end"
          transform={`translate(${x2}, ${y2})`}
        >
          <circle
            r={3.5}
            fill="color-mix(in srgb, var(--accent) 16%, var(--bg-widget) 84%)"
            stroke="color-mix(in srgb, var(--accent) 36%, transparent)"
            strokeWidth={1.2}
          />
          <circle
            r={1.5}
            fill="color-mix(in srgb, var(--accent) 55%, var(--bg-widget) 45%)"
          />
        </g>
      </g>
    </svg>
  );
}
