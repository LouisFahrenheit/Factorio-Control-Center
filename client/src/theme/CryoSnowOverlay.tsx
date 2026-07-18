import { motion } from 'motion/react';
import { useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { webEffectsReduced } from './webEffects';

function buildAmbientFlakes() {
  return Array.from({ length: 52 }, (_, id) => ({
    id,
    left: Math.random() * 100,
    size: 1.8 + Math.random() * 3.2,
    duration: 14 + Math.random() * 14,
    delay: Math.random() * 14,
    drift: -22 + Math.random() * 44,
    spin: Math.random() * 360,
    opacity: 0.3 + Math.random() * 0.45,
  }));
}

function AmbientSnowLayer() {
  const flakes = useMemo(() => buildAmbientFlakes(), []);

  return (
    <div className="cryo-snow-layer cryo-snow-layer--ambient" aria-hidden>
      {flakes.map((flake) => (
        <motion.span
          key={flake.id}
          className="cryo-snowflake"
          style={{
            left: `${flake.left}%`,
            width: flake.size,
            height: flake.size,
            opacity: flake.opacity,
          }}
          initial={{ y: '-8vh', x: 0, rotate: 0 }}
          animate={{
            y: '108vh',
            x: flake.drift,
            rotate: flake.spin + 90,
          }}
          transition={{
            duration: flake.duration,
            repeat: Infinity,
            delay: flake.delay,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
}

/** Light background snow after login (portal to body). */
export function CryoSnowOverlay({ portal = true }: { portal?: boolean }) {
  if (webEffectsReduced()) return null;
  if (document.documentElement.getAttribute('data-theme') !== 'cryogenics') return null;

  const layer = <AmbientSnowLayer />;
  if (!portal) return layer;

  let node: ReactNode = null;
  if (typeof document !== 'undefined') {
    node = createPortal(layer, document.body);
  }
  return node;
}
