import { reformatFactorioLogTimestamps } from '@fcc/shared/factorio-log-timestamps';

export function escapeHtmlText(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface FormatManagerLogOptions {
  reformatTimestamps?: boolean;
  colorize?: boolean;
}

/** Replace Factorio tick prefixes with readable timestamps (client-side fallback for legacy lines). */
export { reformatFactorioLogTimestamps } from '@fcc/shared/factorio-log-timestamps';

function colorizeFactorioLogLineHtml(raw: string): string {
  const line = String(raw).replace(/\r$/, '');
  const esc = escapeHtmlText;

  function panelBannerMilestoneClass(t: string): string | null {
    const panelBanner = String(t || '').trim();
    const panelLow = panelBanner.toLowerCase();
    const isTripleStarBanner =
      panelBanner.startsWith('***') &&
      (panelBanner.endsWith('***') ||
        panelBanner.endsWith('**') ||
        /\*{2,3}\s*$/.test(panelBanner));
    if (!isTripleStarBanner) return null;
    if (
      panelLow.includes('save') ||
      panelLow.includes('сохран') ||
      panelLow.includes('saved') ||
      panelLow.includes('успешн')
    ) {
      return 'log-syntax-started';
    }
    if (
      panelLow.includes('shutdown') ||
      panelLow.includes('останов') ||
      panelLow.includes('stopped') ||
      (panelLow.includes('complete') && panelLow.includes('server'))
    ) {
      return 'log-syntax-stopped';
    }
    if (panelLow.includes('running') || panelLow.includes('запущен'))
      return 'log-syntax-started';
    return 'log-syntax-msg';
  }

  function bodyHtml(rest: string): string {
    if (rest.startsWith('[headless]')) {
      return `<span class="log-syntax-headless">${esc('[headless]')}</span>${esc(rest.slice(10))}`;
    }
    if (rest.startsWith('[multi]')) {
      return `<span class="log-syntax-multi">${esc('[multi]')}</span>${esc(rest.slice(7))}`;
    }
    const panelClsDirect = panelBannerMilestoneClass(rest);
    if (panelClsDirect)
      return `<span class="${panelClsDirect}">${esc(rest)}</span>`;
    const mLb = /^(\[[^\]]+\])\s*(.*)$/.exec(rest);
    if (mLb) {
      const msg = mLb[2];
      let innerHtml: string;
      if (msg.startsWith('[multi]')) {
        innerHtml = `<span class="log-syntax-multi">${esc('[multi]')}</span>${esc(msg.slice(7))}`;
      } else if (msg.startsWith('[headless]')) {
        innerHtml = `<span class="log-syntax-headless">${esc('[headless]')}</span>${esc(msg.slice(10))}`;
      } else {
        const low = msg.toLowerCase();
        let cls = 'log-syntax-msg';
        if (low.includes('запущен') || low.includes('running'))
          cls = 'log-syntax-started';
        else if (low.includes('останов') || low.includes('stopped'))
          cls = 'log-syntax-stopped';
        else {
          const bannerCls = panelBannerMilestoneClass(msg);
          if (bannerCls) cls = bannerCls;
        }
        innerHtml = `<span class="${cls}">${esc(msg)}</span>`;
      }
      return `<span class="log-syntax-bracket">${esc(mLb[1])}</span>${innerHtml}`;
    }
    if (rest.startsWith('Loading mod ')) {
      return `<span class="log-syntax-loading">${esc('Loading mod ')}</span>${esc(rest.slice('Loading mod '.length))}`;
    }
    const mCkScript = /^Checksum\s+for\s+script\s+([^:]+:\s*)(\d+)\s*$/.exec(
      rest,
    );
    if (mCkScript) {
      return `<span class="log-syntax-script-kw">${esc('Checksum')}</span> <span class="log-syntax-path">${esc('for script ' + mCkScript[1])}</span>${esc(mCkScript[2])}`;
    }
    const mCkOf = /^Checksum\s+of\s+([^:]+:\s*)(\d+)\s*$/.exec(rest);
    if (mCkOf) {
      return `<span class="log-syntax-script-kw">${esc('Checksum')}</span> <span class="log-syntax-path">${esc('of ' + mCkOf[1])}</span>${esc(mCkOf[2])}`;
    }
    const mCk = /^(Checksum\s+(?:for|of)\s+[^:]+:\s*)(\d+)\s*$/.exec(rest);
    if (mCk) {
      return `<span class="log-syntax-checksum">${esc(mCk[1])}</span><span class="log-syntax-checksum-num">${esc(mCk[2])}</span>`;
    }
    const mPl = /^(Prototype list checksum:\s*)(\d+)\s*$/.exec(rest);
    if (mPl) {
      return `<span class="log-syntax-checksum">${esc(mPl[1])}</span><span class="log-syntax-checksum-num">${esc(mPl[2])}</span>`;
    }
    const mInf = /^(Info\s+)(\S+\.cpp:\d+:)(.*)$/.exec(rest);
    if (mInf) {
      return `<span class="log-syntax-info-kw">${esc(mInf[1])}</span><span class="log-syntax-info-file">${esc(mInf[2])}</span>${esc(mInf[3])}`;
    }
    const mInf2 = /^(Info\s+)(\S+:\d+:)(.*)$/.exec(rest);
    if (mInf2) {
      return `<span class="log-syntax-info-kw">${esc(mInf2[1])}</span><span class="log-syntax-info-file">${esc(mInf2[2])}</span>${esc(mInf2[3])}`;
    }
    if (/^Warning\b/.test(rest))
      return `<span class="log-syntax-warn">${esc(rest)}</span>`;
    if (/^(Error|Fatal)\b/.test(rest))
      return `<span class="log-syntax-err">${esc(rest)}</span>`;
    if (rest.startsWith('Quitting:'))
      return `<span class="log-syntax-quit">${esc(rest)}</span>`;
    if (rest.startsWith('Script ')) {
      const sub = rest.slice('Script '.length);
      const mPath = /^(@__[^/]+__\/[^:]+:\d+:)(.*)$/.exec(sub);
      if (mPath) {
        return `<span class="log-syntax-script-kw">${esc('Script')}</span> <span class="log-syntax-path">${esc(mPath[1])}</span>${esc(mPath[2])}`;
      }
      return `<span class="log-syntax-script-kw">${esc('Script')}</span> ${esc(sub)}`;
    }
    return esc(rest);
  }

  const trimmed = line.trim();
  if (!trimmed) return '';
  const mCal =
    /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{3})?)(\s+)(.*)$/.exec(
      trimmed,
    );
  if (mCal) {
    return `<span class="log-syntax-tick">${esc(mCal[1])}</span>${esc(mCal[2])}${bodyHtml(mCal[3])}`;
  }
  const mTick = /^(\s*)(\d+\.\d+)(\s+)(.*)$/.exec(line);
  if (mTick) {
    return `${esc(mTick[1])}<span class="log-syntax-tick">${esc(mTick[2])}</span>${esc(mTick[3])}${bodyHtml(mTick[4])}`;
  }
  return bodyHtml(trimmed);
}

export function shouldDisplayManagerLogLine(line: unknown): boolean {
  const text = String(line || '');
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^\[multi\]\s+\/quit sent via rcon$/i.test(trimmed)) return false;
  const low = trimmed.toLowerCase();
  if (
    low.includes(
      'remotecommandprocessor.cpp:316: rcon connection read failed',
    ) &&
    low.includes("can't read socket: error code 10054")
  ) {
    return false;
  }
  return true;
}

export { colorizeFactorioLogLineHtml };

export function formatManagerLogHtml(
  lines: string[],
  options?: FormatManagerLogOptions,
): string {
  const src = options?.reformatTimestamps
    ? reformatFactorioLogTimestamps(lines)
    : lines;
  const shouldColorize = options?.colorize !== false;
  return src
    .filter(shouldDisplayManagerLogLine)
    .map((line) =>
      shouldColorize ? colorizeFactorioLogLineHtml(line) : escapeHtmlText(line),
    )
    .join('\n');
}

export interface LogMatchRange {
  start: number;
  end: number;
  globalIndex: number;
}

export interface PreparedLogEntry {
  raw: string;
  rawLower: string;
  colorize: boolean;
  html: string | null;
  plainLower: string | null;
}

export interface LogHistorySearchMatch {
  lineIndex: number;
  rangeIndex: number;
}

export interface LogHistorySearchResult {
  query: string;
  matches: LogHistorySearchMatch[];
  lineRanges: Map<number, LogMatchRange[]>;
}

/** Decode visible plain text from a single-line HTML string produced by colorizeFactorioLogLineHtml / escapeHtmlText. */
export function decodeLogHtmlPlainText(html: string): string {
  let out = '';
  let i = 0;
  const len = html.length;
  while (i < len) {
    const ch = html.charCodeAt(i);
    if (ch === 60 /* < */) {
      const close = html.indexOf('>', i + 1);
      if (close === -1) break;
      i = close + 1;
      continue;
    }
    if (ch === 38 /* & */) {
      if (html.startsWith('&amp;', i)) {
        out += '&';
        i += 5;
        continue;
      }
      if (html.startsWith('&lt;', i)) {
        out += '<';
        i += 4;
        continue;
      }
      if (html.startsWith('&gt;', i)) {
        out += '>';
        i += 4;
        continue;
      }
      if (html.startsWith('&quot;', i)) {
        out += '"';
        i += 6;
        continue;
      }
    }
    out += html[i];
    i += 1;
  }
  return out;
}

export function prepareLogHistoryEntries(
  lines: string[],
  colorize: boolean,
): PreparedLogEntry[] {
  const out: PreparedLogEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = String(lines[i] ?? '').replace(/\r$/, '');
    if (!shouldDisplayManagerLogLine(raw)) continue;
    out.push({
      raw,
      rawLower: raw.toLowerCase(),
      colorize,
      html: null,
      plainLower: null,
    });
  }
  return out;
}

export function ensurePreparedLogEntryHtml(entry: PreparedLogEntry): {
  html: string;
  plainLower: string;
} {
  if (entry.html !== null && entry.plainLower !== null) {
    return { html: entry.html, plainLower: entry.plainLower };
  }
  const html = entry.colorize
    ? colorizeFactorioLogLineHtml(entry.raw)
    : escapeHtmlText(entry.raw.trim() ? entry.raw : '');
  const plainLower = decodeLogHtmlPlainText(html).toLowerCase();
  entry.html = html;
  entry.plainLower = plainLower;
  return { html, plainLower };
}

export function findLogHistoryMatches(
  entries: ReadonlyArray<PreparedLogEntry>,
  rawQuery: string,
): LogHistorySearchResult {
  const query = String(rawQuery || '').trim();
  const matches: LogHistorySearchMatch[] = [];
  const lineRanges = new Map<number, LogMatchRange[]>();
  if (!query || entries.length === 0) {
    return { query, matches, lineRanges };
  }
  const qLower = query.toLowerCase();
  const qLen = qLower.length;
  // Fast prefilter token: whitespace may collapse in formatted brackets, so precheck the longest non-whitespace part.
  const parts = qLower.split(/\s+/).filter(Boolean);
  let fastToken = '';
  for (const p of parts) {
    if (p.length > fastToken.length) fastToken = p;
  }

  for (let lineIdx = 0; lineIdx < entries.length; lineIdx++) {
    const entry = entries[lineIdx];
    if (fastToken && !entry.rawLower.includes(fastToken)) continue;
    const { plainLower } = ensurePreparedLogEntryHtml(entry);
    let pos = plainLower.indexOf(qLower);
    if (pos === -1) continue;
    const ranges: LogMatchRange[] = [];
    while (pos !== -1) {
      const globalIndex = matches.length;
      const rangeIndex = ranges.length;
      ranges.push({ start: pos, end: pos + qLen, globalIndex });
      matches.push({ lineIndex: lineIdx, rangeIndex });
      pos = plainLower.indexOf(qLower, pos + qLen);
    }
    lineRanges.set(lineIdx, ranges);
  }

  return { query, matches, lineRanges };
}

/**
 * Wrap plain-text index ranges in `<mark>` tags inside a syntax-highlighted HTML line,
 * safely closing and reopening `<mark>` across `<span>` boundaries.
 */
export function highlightLogHtmlRanges(
  html: string,
  ranges: ReadonlyArray<LogMatchRange> | undefined,
  activeGlobalIndex: number,
): string {
  if (!ranges || ranges.length === 0 || !html) return html;
  let out = '';
  let i = 0;
  const len = html.length;
  let plainIdx = 0;
  let rIdx = 0;
  let markOpen = false;
  let activeAttrEmittedForRange = -1;

  while (i < len) {
    if (html.charCodeAt(i) === 60 /* < */) {
      if (markOpen) {
        out += '</mark>';
        markOpen = false;
      }
      const close = html.indexOf('>', i + 1);
      if (close === -1) {
        out += html.slice(i);
        break;
      }
      out += html.slice(i, close + 1);
      i = close + 1;
      continue;
    }

    while (rIdx < ranges.length && ranges[rIdx].end <= plainIdx) {
      rIdx += 1;
    }
    const inRange =
      rIdx < ranges.length &&
      plainIdx >= ranges[rIdx].start &&
      plainIdx < ranges[rIdx].end;

    if (inRange && !markOpen) {
      const isActive = ranges[rIdx].globalIndex === activeGlobalIndex;
      const activeCls = isActive ? ' log-search-highlight--active' : '';
      const activeAttr =
        isActive && activeAttrEmittedForRange !== rIdx
          ? ' data-active-log-match="1"'
          : '';
      if (isActive) activeAttrEmittedForRange = rIdx;
      out += `<mark class="log-search-highlight${activeCls}"${activeAttr}>`;
      markOpen = true;
    } else if (!inRange && markOpen) {
      out += '</mark>';
      markOpen = false;
    }

    let tokenLen = 1;
    if (html.charCodeAt(i) === 38 /* & */) {
      if (html.startsWith('&amp;', i)) tokenLen = 5;
      else if (html.startsWith('&lt;', i) || html.startsWith('&gt;', i))
        tokenLen = 4;
      else if (html.startsWith('&quot;', i)) tokenLen = 6;
    }
    out += html.slice(i, i + tokenLen);
    i += tokenLen;
    plainIdx += 1;

    if (markOpen && rIdx < ranges.length && plainIdx >= ranges[rIdx].end) {
      out += '</mark>';
      markOpen = false;
    }
  }

  if (markOpen) {
    out += '</mark>';
  }
  return out;
}

/** Fenwick tree (Binary Indexed Tree) for O(log N) prefix height sums and offset-to-line lookup. */
export class FenwickHeightIndex {
  readonly length: number;
  private readonly heights: Float32Array;
  private readonly bit: Float64Array;
  private total = 0;

  constructor(length: number, defaultHeight: number) {
    this.length = length;
    this.heights = new Float32Array(length);
    this.bit = new Float64Array(length + 1);
    if (length === 0) return;
    this.heights.fill(defaultHeight);
    this.total = length * defaultHeight;
    for (let i = 1; i <= length; i++) {
      this.bit[i] += defaultHeight;
      const parent = i + (i & -i);
      if (parent <= length) {
        this.bit[parent] += this.bit[i];
      }
    }
  }

  get totalHeight(): number {
    return this.total;
  }

  getHeight(index: number): number {
    return index >= 0 && index < this.length ? this.heights[index] : 0;
  }

  setHeight(index: number, newHeight: number): number {
    if (index < 0 || index >= this.length || newHeight <= 0) return 0;
    const prev = this.heights[index];
    const delta = newHeight - prev;
    if (Math.abs(delta) < 0.5) return 0;
    this.heights[index] = newHeight;
    this.total += delta;
    for (let i = index + 1; i <= this.length; i += i & -i) {
      this.bit[i] += delta;
    }
    return delta;
  }

  /** Sum of heights strictly before `index` (i.e. offsetTop of line `index`). */
  getOffsetTop(index: number): number {
    if (index <= 0) return 0;
    const clamped = Math.min(index, this.length);
    let sum = 0;
    for (let i = clamped; i > 0; i -= i & -i) {
      sum += this.bit[i];
    }
    return sum;
  }

  /** Find 0-based line index covering `offset` in O(log N). */
  findIndexAtOffset(offset: number): number {
    if (this.length <= 1 || offset <= 0) return 0;
    if (offset >= this.total) return this.length - 1;
    let idx = 0;
    let bitMask = 1;
    while (bitMask << 1 <= this.length) {
      bitMask <<= 1;
    }
    let remaining = offset;
    for (let step = bitMask; step > 0; step >>= 1) {
      const next = idx + step;
      if (next <= this.length && this.bit[next] <= remaining) {
        idx = next;
        remaining -= this.bit[next];
      }
    }
    return Math.min(idx, this.length - 1);
  }
}

function escapeRegExp(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightLogFindInElement(
  root: HTMLElement,
  rawQuery: string,
): void {
  const q = String(rawQuery || '').trim();
  if (!q || !root) return;
  const pattern = escapeRegExp(q);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue) continue;
    let p: HTMLElement | null = node.parentElement;
    let skip = false;
    while (p && p !== root) {
      if (p.classList?.contains('log-search-highlight')) {
        skip = true;
        break;
      }
      p = p.parentElement;
    }
    if (!skip) textNodes.push(node as Text);
  }
  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    if (!text) continue;
    const re = new RegExp(pattern, 'gi');
    if (!re.test(text)) continue;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m: RegExpExecArray | null;
    const re2 = new RegExp(pattern, 'gi');
    while ((m = re2.exec(text)) !== null) {
      frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const mark = document.createElement('mark');
      mark.className = 'log-search-highlight';
      mark.appendChild(
        document.createTextNode(text.slice(m.index, re2.lastIndex)),
      );
      frag.appendChild(mark);
      last = re2.lastIndex;
    }
    frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.parentNode?.replaceChild(frag, textNode);
  }
}

const logStickyFollow = new WeakMap<HTMLElement, boolean>();
const logStickyBound = new WeakSet<HTMLElement>();

/** User scrolled away from bottom → pause autoscroll until they return. */
export function isLogNearBottom(el: HTMLElement, threshold = 24): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

export function ensureLogStickyFollow(el: HTMLElement | null): void {
  if (!el || logStickyBound.has(el)) return;
  logStickyBound.add(el);
  logStickyFollow.set(el, true);
  el.addEventListener(
    'scroll',
    () => {
      logStickyFollow.set(el, isLogNearBottom(el));
    },
    { passive: true },
  );
}

export function hasActiveSelectionInside(el: HTMLElement | null): boolean {
  if (
    !el ||
    typeof window === 'undefined' ||
    typeof window.getSelection !== 'function'
  )
    return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount <= 0 || sel.isCollapsed) return false;
  for (let i = 0; i < sel.rangeCount; i++) {
    const r = sel.getRangeAt(i);
    const sc = r.startContainer;
    const ec = r.endContainer;
    if ((sc && el.contains(sc)) || (ec && el.contains(ec))) return true;
  }
  return false;
}

/** Scroll to bottom when follow mode is on (default on until user scrolls up). */
export function scrollLogIfFollowing(el: HTMLElement | null): void {
  if (!el) return;
  if (logStickyFollow.get(el) === false) return;
  const run = () => {
    el.scrollTop = el.scrollHeight;
    logStickyFollow.set(el, true);
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run);
  } else {
    run();
  }
}
