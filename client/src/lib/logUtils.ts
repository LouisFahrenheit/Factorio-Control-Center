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
      (panelBanner.endsWith('***') || panelBanner.endsWith('**') || /\*{2,3}\s*$/.test(panelBanner));
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
    if (panelLow.includes('running') || panelLow.includes('запущен')) return 'log-syntax-started';
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
    if (panelClsDirect) return `<span class="${panelClsDirect}">${esc(rest)}</span>`;
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
        if (low.includes('запущен') || low.includes('running')) cls = 'log-syntax-started';
        else if (low.includes('останов') || low.includes('stopped')) cls = 'log-syntax-stopped';
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
    const mCkScript = /^Checksum\s+for\s+script\s+([^:]+:\s*)(\d+)\s*$/.exec(rest);
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
    if (/^Warning\b/.test(rest)) return `<span class="log-syntax-warn">${esc(rest)}</span>`;
    if (/^(Error|Fatal)\b/.test(rest)) return `<span class="log-syntax-err">${esc(rest)}</span>`;
    if (rest.startsWith('Quitting:')) return `<span class="log-syntax-quit">${esc(rest)}</span>`;
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
  const mCal = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{3})?)(\s+)(.*)$/.exec(trimmed);
  if (mCal) {
    return `<span class="log-syntax-tick">${esc(mCal[1])}</span>${esc(mCal[2])}${bodyHtml(mCal[3])}`;
  }
  const mTick = /^(\s*)(\d+\.\d+)(\s+)(.*)$/.exec(line);
  if (mTick) {
    return `${esc(mTick[1])}<span class="log-syntax-tick">${esc(mTick[2])}</span>${esc(mTick[3])}${bodyHtml(mTick[4])}`;
  }
  return bodyHtml(trimmed);
}

export function formatManagerLogHtml(lines: string[], options?: FormatManagerLogOptions): string {
  const src = options?.reformatTimestamps ? reformatFactorioLogTimestamps(lines) : lines;
  return src
    .filter((line) => {
      const text = String(line || '');
      const trimmed = text.trim();
      if (!trimmed) return false;
      if (/^\[multi\]\s+\/quit sent via rcon$/i.test(trimmed)) return false;
      const low = trimmed.toLowerCase();
      if (
        low.includes('remotecommandprocessor.cpp:316: rcon connection read failed') &&
        low.includes("can't read socket: error code 10054")
      ) {
        return false;
      }
      return true;
    })
    .map((line) => colorizeFactorioLogLineHtml(line))
    .join('\n');
}

function escapeRegExp(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightLogFindInElement(root: HTMLElement, rawQuery: string): void {
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
      mark.appendChild(document.createTextNode(text.slice(m.index, re2.lastIndex)));
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
  if (!el || typeof window === 'undefined' || typeof window.getSelection !== 'function') return false;
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
