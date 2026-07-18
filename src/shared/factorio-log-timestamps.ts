export const FACTORIO_SESSION_START_RE =
  /^\s*([\d.]+)\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2});\s+Factorio\s+/;
export const FACTORIO_SESSION_START_FORMATTED_RE =
  /^\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{3})?)\s+Factorio\s+/;
const FACTORIO_TICK_CAL_RE =
  /^\s*([\d.]+)\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2});?\s+(.*)$/;
const FACTORIO_TICK_LINE_RE = /^(\s*)(\d+\.\d+)(\s+)(.*)$/;
const FACTORIO_CAL_LINE_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(\s+)(.*)$/;
const PANEL_BRACKET_TS_RE =
  /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]\s*(.*)$/;

export interface LogSessionAnchor {
  baseTick: number;
  baseMs: number;
}

export function isFactorioSessionStartLine(raw: string): boolean {
  const trimmed = String(raw || '').trimStart();
  return (
    FACTORIO_SESSION_START_RE.test(trimmed) ||
    FACTORIO_SESSION_START_FORMATTED_RE.test(trimmed)
  );
}

function parseFactorioLocalTime(raw: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    String(raw || '').trim(),
  );
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], 0).getTime();
}

function tickFractionMs(tick: number): number {
  const frac = tick - Math.floor(tick);
  return Math.min(999, Math.round(frac * 1000));
}

function formatFactorioLogTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function formatRelativeTickTime(tick: number): string {
  const totalSec = Math.max(0, Math.floor(tick));
  const ms = tickFractionMs(tick);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}.${p(ms, 3)}`;
}

function findLogSessionAnchor(lines: string[]): LogSessionAnchor | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = FACTORIO_SESSION_START_RE.exec(lines[i].trimStart());
    if (!m) continue;
    const baseMs = parseFactorioLocalTime(m[2]);
    if (!Number.isFinite(baseMs)) continue;
    const baseTick = parseFloat(m[1]);
    if (!Number.isFinite(baseTick)) continue;
    return { baseTick, baseMs };
  }
  return null;
}

function reformatSingleLine(
  raw: string,
  anchor: LogSessionAnchor | null,
): string {
  const line = String(raw).replace(/\r$/, '');
  const trimmed = line.trimStart();
  if (!trimmed || trimmed.startsWith('***')) return line;

  const mPanel = PANEL_BRACKET_TS_RE.exec(trimmed);
  if (mPanel) {
    const baseMs = parseFactorioLocalTime(mPanel[1]);
    if (Number.isFinite(baseMs)) {
      return `${formatFactorioLogTime(baseMs)}  ${mPanel[2]}`;
    }
  }

  const mCalTick = FACTORIO_TICK_CAL_RE.exec(trimmed);
  if (mCalTick) {
    const baseMs = parseFactorioLocalTime(mCalTick[2]);
    const tick = parseFloat(mCalTick[1]);
    if (Number.isFinite(baseMs) && Number.isFinite(tick)) {
      return `${formatFactorioLogTime(baseMs + tickFractionMs(tick))}  ${mCalTick[3]}`;
    }
  }

  const mCal = FACTORIO_CAL_LINE_RE.exec(trimmed);
  if (mCal) {
    const baseMs = parseFactorioLocalTime(mCal[1]);
    if (Number.isFinite(baseMs)) {
      return `${formatFactorioLogTime(baseMs)}  ${mCal[3]}`;
    }
  }

  const mTick = FACTORIO_TICK_LINE_RE.exec(line);
  if (mTick) {
    const tick = parseFloat(mTick[2]);
    if (!Number.isFinite(tick)) return line;
    let ts: string;
    if (anchor) {
      ts = formatFactorioLogTime(
        anchor.baseMs + (tick - anchor.baseTick) * 1000,
      );
    } else {
      ts = formatRelativeTickTime(tick);
    }
    return `${ts}  ${mTick[4]}`;
  }

  return line;
}

/** Mutable session state for streaming log lines (one Factorio launch). */
export class FactorioLogSessionState {
  anchor: LogSessionAnchor | null = null;
  /** Formatted session-start line — kept when the live ring buffer is trimmed. */
  anchorLine: string | null = null;

  formatLine(raw: string): string {
    const trimmed = String(raw || '')
      .replace(/\r$/, '')
      .trimStart();
    const sessionMatch = FACTORIO_SESSION_START_RE.exec(trimmed);
    if (sessionMatch) {
      const baseMs = parseFactorioLocalTime(sessionMatch[2]);
      const baseTick = parseFloat(sessionMatch[1]);
      if (Number.isFinite(baseMs) && Number.isFinite(baseTick)) {
        this.anchor = { baseTick, baseMs };
      }
    }

    const formatted = reformatSingleLine(raw, this.anchor);
    if (sessionMatch && this.anchor) {
      this.anchorLine = formatted;
    }
    return formatted;
  }
}

/** Replace Factorio tick prefixes with readable `YYYY-MM-DD HH:mm:ss.mmm` timestamps. */
export function reformatFactorioLogTimestamps(lines: string[]): string[] {
  if (!lines.length) return lines;
  const anchor = findLogSessionAnchor(lines);

  return lines.map((raw) => {
    const line = String(raw).replace(/\r$/, '');
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('***')) return line;

    const sessionMatch = FACTORIO_SESSION_START_RE.exec(trimmed);
    if (sessionMatch) {
      const baseMs = parseFactorioLocalTime(sessionMatch[2]);
      const baseTick = parseFloat(sessionMatch[1]);
      if (Number.isFinite(baseMs) && Number.isFinite(baseTick)) {
        return reformatSingleLine(raw, { baseTick, baseMs });
      }
    }

    return reformatSingleLine(raw, anchor);
  });
}

export const LIVE_LOG_RING_MAX = 500;

/** Trim formatted live log ring; always retain the session anchor line. */
export function trimLiveLogRing(
  lines: string[],
  anchorLine: string | null,
  max = LIVE_LOG_RING_MAX,
): string[] {
  if (lines.length <= max) return lines;
  let ring = lines.slice(-max);
  if (!anchorLine) return ring;
  if (
    ring.some((line) => line === anchorLine || isFactorioSessionStartLine(line))
  )
    return ring;
  ring = [anchorLine, ...lines.slice(-(max - 1))];
  if (ring.length > max) ring = [ring[0], ...ring.slice(ring.length - max + 1)];
  return ring;
}

/** Prepend session anchor to tail when the ring was trimmed without it. */
export function liveLogTail(
  lines: string[],
  anchorLine: string | null,
  tail = LIVE_LOG_RING_MAX,
): string[] {
  const n = Math.max(1, Math.min(tail, LIVE_LOG_RING_MAX));
  const slice = lines.slice(-n);
  if (!anchorLine) return slice;
  if (
    slice.some(
      (line) => line === anchorLine || isFactorioSessionStartLine(line),
    )
  )
    return slice;
  return [anchorLine, ...slice.slice(-(n - 1))];
}
