import type { CSSProperties, ReactNode } from 'react';

/**
 * Standard named colors supported by Factorio rich text engine.
 */
const FACTORIO_NAMED_COLORS: Record<string, string> = {
  default: 'inherit',
  red: '#ff5959',
  green: '#59ff59',
  blue: '#70b5ff',
  orange: '#ff9f38',
  yellow: '#ffe853',
  pink: '#ff8ae2',
  purple: '#c97eff',
  white: '#ffffff',
  black: '#101010',
  gray: '#a0a0a0',
  grey: '#a0a0a0',
  brown: '#b87840',
  cyan: '#4deeea',
  acid: '#b0ff22',
};

/**
 * Parse [color=...] attribute value into valid CSS color string.
 * Supports:
 * - Hex: #rrggbb, #aarrggbb, rrggbb, etc.
 * - RGB(A) 0-255: e.g. "128,206,240" or "128, 206, 240, 255"
 * - RGB(A) 0-1 float: e.g. "0.5, 0.8, 0.94"
 * - Named colors: "red", "cyan", "acid", etc.
 */
export function parseFactorioColor(rawColor: string): string | null {
  const c = rawColor.trim().toLowerCase();
  if (!c) return null;

  if (FACTORIO_NAMED_COLORS[c]) {
    return FACTORIO_NAMED_COLORS[c];
  }

  // Hex color
  if (c.startsWith('#') || /^[0-9a-f]{3,8}$/i.test(c)) {
    const hex = c.startsWith('#') ? c : `#${c}`;
    // #aarrggbb to #rrggbbaa if 8 chars
    if (hex.length === 9) {
      const aa = hex.slice(1, 3);
      const rrggbb = hex.slice(3);
      return `#${rrggbb}${aa}`;
    }
    return hex;
  }

  // Comma separated RGB / RGBA
  if (c.includes(',')) {
    const parts = c
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => Number(p));

    if (parts.length >= 3 && parts.every((n) => !Number.isNaN(n))) {
      const isFloat = parts.slice(0, 3).some((n) => n > 0 && n <= 1 && n % 1 !== 0);
      const to255 = (n: number) => {
        if (isFloat) return Math.max(0, Math.min(255, Math.round(n * 255)));
        return Math.max(0, Math.min(255, Math.round(n)));
      };
      const r = to255(parts[0]!);
      const g = to255(parts[1]!);
      const b = to255(parts[2]!);

      if (parts.length >= 4) {
        const rawA = parts[3]!;
        const a = rawA > 1 ? Math.max(0, Math.min(1, rawA / 255)) : Math.max(0, Math.min(1, rawA));
        return `rgba(${r}, ${g}, ${b}, ${a})`;
      }
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  return null;
}

/**
 * Maps Factorio [font=...] names to inline CSS style object.
 */
export function getFactorioFontStyle(fontName: string): CSSProperties | null {
  const f = fontName.trim().toLowerCase();
  if (!f) return null;

  if (f.includes('semibold')) {
    return { fontWeight: 600 };
  }
  if (f.includes('bold')) {
    return { fontWeight: 700 };
  }
  if (f.includes('mono') || f.includes('code')) {
    return { fontFamily: 'var(--font-mono, monospace)', fontSize: '0.92em' };
  }
  if (f.includes('italic') || f.includes('oblique')) {
    return { fontStyle: 'italic' };
  }
  if (f.includes('small') || f.includes('tiny')) {
    return { fontSize: '0.85em' };
  }
  if (f.includes('large') || f.includes('heading')) {
    return { fontSize: '1.15em', fontWeight: 650 };
  }

  return null;
}

/**
 * Humanizes technical prototype identifiers, e.g. "iron-gear-wheel" -> "Iron gear wheel"
 */
export function humanizeFactorioId(id: string): string {
  const raw = String(id || '').trim();
  if (!raw) return raw;
  const withSpaces = raw.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

/**
 * Strips all Factorio rich text formatting tags and __ITEM__name__ parameters, leaving pure text.
 * Ideal for search filters, HTML title tooltips, and accessibility labels.
 */
export function stripFactorioRichText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\\n/g, '\n')
    .replace(/__([A-Z_]+)__([^_\s]+(?:-[^_\s]+)*)__/g, (_m, _type, id: string) => humanizeFactorioId(id))
    .replace(/\[(?:item|entity|fluid|recipe|technology)=([^\]|]+)(?:\|([^\]]+))?\]/gi, (_m, id, label) => label || humanizeFactorioId(id))
    .replace(/\[\/?(?:font|color)[^\]]*\]/gi, '')
    .replace(
      /\[(?:item|entity|fluid|recipe|virtual-signal|technology|achievement|tile|item-group|gps|special-item|utility|img)[^\]]*\]/gi,
      '',
    )
    .trim();
}

interface FormatState {
  color?: string;
  fontStyle?: CSSProperties;
}

/**
 * Safely parses and renders Factorio rich text into React nodes with nested styles and badges.
 *
 * @param text Factorio rich text string
 * @param instanceId Optional instance ID to resolve mod-specific icons from the current server
 */
export function renderFactorioRichText(
  text: string,
  instanceId?: string,
): ReactNode {
  if (!text || typeof text !== 'string') return null;

  // First normalize literal "\n" to real newline and expand un-interpolated __ITEM__name__
  const normalized = text
    .replace(/\\n/g, '\n')
    .replace(
      /__([A-Z_]+)__([^_\s]+(?:-[^_\s]+)*)__/g,
      (_m, typeRaw: string, id: string) => `[${typeRaw.toLowerCase()}=${id}]`,
    );

  const nodes: ReactNode[] = [];
  const styleStack: FormatState[] = [];

  const getCurrentCombinedStyle = (): CSSProperties | undefined => {
    let combined: CSSProperties | undefined;
    for (const state of styleStack) {
      if (state.color) {
        combined = { ...(combined || {}), color: state.color };
      }
      if (state.fontStyle) {
        combined = { ...(combined || {}), ...state.fontStyle };
      }
    }
    return combined;
  };

  const pushTextSpan = (rawContent: string, keyPrefix: string | number) => {
    if (!rawContent) return;
    const style = getCurrentCombinedStyle();
    const lines = rawContent.split('\n');
    lines.forEach((line, idx) => {
      if (idx > 0) {
        nodes.push(<br key={`${keyPrefix}-br-${idx}`} />);
      }
      if (line) {
        if (!style) {
          nodes.push(line);
        } else {
          nodes.push(
            <span key={`${keyPrefix}-l-${idx}`} style={style}>
              {line}
            </span>,
          );
        }
      }
    });
  };

  // If there are no bracketed tags at all, return either direct string (if single line) or line-break nodes
  if (!normalized.includes('[') || !normalized.includes(']')) {
    if (!normalized.includes('\n')) {
      return normalized;
    }
    pushTextSpan(normalized, 'plain');
    return nodes;
  }

  const tagRegex = /\[(\/?[a-zA-Z_-]+)(?:=([^\]]+))?\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  let tokenIndex = 0;

  while ((match = tagRegex.exec(normalized)) !== null) {
    const [fullTag, tagNameRaw, tagValue] = match;
    const matchIndex = match.index;

    // Output any text before this tag
    if (matchIndex > lastIndex) {
      pushTextSpan(normalized.substring(lastIndex, matchIndex), `t-${tokenIndex++}`);
    }
    lastIndex = matchIndex + fullTag.length;

    const tagName = (tagNameRaw || '').toLowerCase();

    // Closing tags
    if (tagName.startsWith('/')) {
      const closingType = tagName.substring(1);
      if (closingType === 'color' || closingType === 'font') {
        // Pop the most recent matching state from styleStack
        for (let i = styleStack.length - 1; i >= 0; i--) {
          const entry = styleStack[i]!;
          if (closingType === 'color' && entry.color !== undefined) {
            styleStack.splice(i, 1);
            break;
          }
          if (closingType === 'font' && entry.fontStyle !== undefined) {
            styleStack.splice(i, 1);
            break;
          }
        }
      }
      continue;
    }

    // Opening tags
    if (tagName === 'color' && tagValue) {
      const colorVal = parseFactorioColor(tagValue);
      if (colorVal) {
        styleStack.push({ color: colorVal });
      }
    } else if (tagName === 'font' && tagValue) {
      const fontStyle = getFactorioFontStyle(tagValue);
      if (fontStyle) {
        styleStack.push({ fontStyle });
      }
    } else if (
      (tagName === 'item' ||
        tagName === 'entity' ||
        tagName === 'fluid' ||
        tagName === 'recipe' ||
        tagName === 'technology' ||
        tagName === 'img' ||
        tagName === 'tile' ||
        tagName === 'virtual-signal') &&
      tagValue
    ) {
      // Support [item=iron-gear-wheel], [item=iron-gear-wheel|Железная шестерня],
      // [tile=oil-ocean-shallow], and [img=item/aai-signal-receiver]
      let id = tagValue.trim();
      let customLabel: string | undefined;

      if (id.includes('|')) {
        const pipeIdx = id.indexOf('|');
        customLabel = id.slice(pipeIdx + 1).trim();
        id = id.slice(0, pipeIdx).trim();
      }

      if (tagName === 'img' && id.includes('/')) {
        const slashIdx = id.indexOf('/');
        id = id.slice(slashIdx + 1).trim();
      }

      const label = customLabel || humanizeFactorioId(id);
      const isTile = tagName === 'tile';

      // For tiles without separate prototype icon files, render styled readable text badge directly
      if (isTile) {
        nodes.push(
          <span
            key={`tag-${tokenIndex++}`}
            className="factorio-rich-badge factorio-rich-badge--tile"
            title={`${tagName}: ${label}`}
          >
            <span className="factorio-rich-badge__text-label">{label}</span>
          </span>,
        );
        continue;
      }

      const instParam = instanceId ? `&instance_id=${encodeURIComponent(instanceId)}` : '';
      const iconUrl = `/api/mod-settings/icon?id=${encodeURIComponent(id)}${instParam}`;

      nodes.push(
        <span
          key={`tag-${tokenIndex++}`}
          className={`factorio-rich-badge factorio-rich-badge--${tagName}`}
          title={`${tagName}: ${label}`}
        >
          <img
            src={iconUrl}
            alt={label}
            className="factorio-rich-badge__img"
            loading="lazy"
            onError={(e) => {
              // Hide broken image smoothly and show fallback icon
              (e.currentTarget as HTMLElement).style.display = 'none';
              const parent = e.currentTarget.parentElement;
              const fallback = parent?.querySelector<HTMLElement>('.factorio-rich-badge__icon');
              if (fallback) fallback.style.display = 'inline-block';
            }}
          />
          <span className="factorio-rich-badge__icon" aria-hidden="true" style={{ display: 'none' }} />
        </span>,
      );
    }
  }

  // Trailing text
  if (lastIndex < normalized.length) {
    pushTextSpan(normalized.substring(lastIndex), `t-${tokenIndex++}`);
  }

  return nodes;
}

