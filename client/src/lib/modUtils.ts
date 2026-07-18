import type { ModRow, ModSortColumn } from '../types/mods';
import { formatPanelActorName } from './actorUtils';

export function versionTuple(s: string): number[] {
  const out: number[] = [];
  if (!s) return out;
  for (const part of String(s).trim().split('.')) {
    const n = parseInt(part, 10);
    if (Number.isFinite(n)) out.push(n);
    else return out;
  }
  return out;
}

export function compareModVersionDesc(a: string, b: string): number {
  const pa = versionTuple(String(a || ''));
  const pb = versionTuple(String(b || ''));
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return db - da;
  }
  return 0;
}

export function compareModVersionAsc(a: string, b: string): number {
  return compareModVersionDesc(b, a);
}

export function portalVersionNewer(portal: string, local: string): boolean {
  const sp = String(portal || '').trim();
  if (!sp || !sp[0] || sp[0] < '0' || sp[0] > '9') return false;
  const sl = String(local || '').trim();
  if (!sl) return true;
  const pa = versionTuple(sp);
  const pb = versionTuple(sl);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const a = pa[i] || 0;
    const b = pb[i] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

export function maxInstalledModVersion(m: ModRow): string {
  const av = Array.isArray(m.available_versions) ? m.available_versions : [];
  const cleaned = av.map((x) => String(x || '').trim()).filter(Boolean);
  if (!cleaned.length) return String(m.local_version || '').trim();
  let best = cleaned[0];
  for (let i = 1; i < cleaned.length; i++) {
    const v = cleaned[i];
    if (portalVersionNewer(v, best)) best = v;
  }
  return best;
}

export function modAuthorPlain(m: ModRow): string {
  const authorRaw = m.author || m.owner || m.publisher || m.username || m.user || m.authors;
  if (Array.isArray(authorRaw)) return authorRaw.filter(Boolean).join(', ') || '';
  return authorRaw ? String(authorRaw) : '';
}

export function modAuthorParts(author: string): string[] {
  const s = String(author || '').trim();
  if (!s || s === '—') return [];
  return s.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
}

/** Shortens long comma-separated author lists for table cells. */
export function formatModAuthorDisplay(
  author: string,
  maxAuthors = 2,
): { display: string; full: string; truncated: boolean } {
  const full = String(author || '').trim() || '—';
  if (full === '—') return { display: full, full, truncated: false };

  const parts = modAuthorParts(full);
  if (parts.length <= maxAuthors) return { display: full, full, truncated: false };

  const display = `${parts.slice(0, maxAuthors).join(', ')} +${parts.length - maxAuthors}`;
  return { display, full, truncated: true };
}

function installDateTs(m: ModRow): number {
  const s = m.install_date;
  if (s == null || s === '' || s === '—') return NaN;
  const t = Date.parse(String(s));
  return Number.isFinite(t) ? t : NaN;
}

export function modsDefaultAscForColumn(key: ModSortColumn): boolean {
  return key === 'name' || key === 'author' || key === 'installed_by';
}

export function formatModpackSizeBytes(sizeBytes: unknown): string {
  if (sizeBytes == null || sizeBytes === '') return '—';
  const n = Number(sizeBytes);
  if (Number.isNaN(n) || n < 0) return '—';
  if (n === 0) return '0 MB';
  const gib = 1024 * 1024 * 1024;
  if (n >= gib) return `${(n / gib).toFixed(2)} GB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatModpackFactorioDisplay(ver: unknown, requiresSpaceAge?: boolean): string {
  const v = String(ver || '').trim();
  const sa = !!requiresSpaceAge;
  if (v && sa) return `${v} SA`;
  if (v) return v;
  return '';
}

export function getModPortalUrl(name: string): string {
  const modName = String(name || '').trim();
  if (!modName) return '';
  return `https://mods.factorio.com/mod/${encodeURIComponent(modName)}`;
}

export const BUILTIN_MOD_CONTENT_URL = 'https://factorio.com/space-age/content';

export function getModOpenUrl(name: string, isBuiltin?: boolean): string {
  if (isBuiltin) return BUILTIN_MOD_CONTENT_URL;
  return getModPortalUrl(name);
}

export function sortModRows(
  rows: ModRow[],
  listOrder: string[],
  sortColumn: ModSortColumn | '',
  sortAsc: boolean,
): ModRow[] {
  const idx = new Map(listOrder.map((n, i) => [n, i]));
  const ordList = (a: ModRow, b: ModRow) => (idx.get(a.name) ?? 1e9) - (idx.get(b.name) ?? 1e9);
  const out = rows.slice();

  if (!sortColumn) {
    out.sort(ordList);
    return out;
  }

  out.sort((a, b) => {
    let r = 0;
    if (sortColumn === 'enabled') {
      const ea = a.enabled ? 0 : 1;
      const eb = b.enabled ? 0 : 1;
      if (ea !== eb) r = ea - eb;
    } else if (sortColumn === 'name') {
      r = String(a.display_name || a.name || '')
        .toLowerCase()
        .localeCompare(String(b.display_name || b.name || '').toLowerCase(), undefined, { sensitivity: 'base' });
    } else if (sortColumn === 'author') {
      const sa = modAuthorPlain(a).toLowerCase();
      const sb = modAuthorPlain(b).toLowerCase();
      if (!sa && sb) r = 1;
      else if (sa && !sb) r = -1;
      else r = sa.localeCompare(sb, undefined, { sensitivity: 'base' });
    } else if (sortColumn === 'size') {
      const za = Number(a.zip_size_bytes);
      const zb = Number(b.zip_size_bytes);
      const ma = Number.isFinite(za);
      const mb = Number.isFinite(zb);
      if (!ma && mb) r = 1;
      else if (ma && !mb) r = -1;
      else if (ma && mb) r = za === zb ? 0 : za < zb ? -1 : 1;
    } else if (sortColumn === 'version') {
      r = compareModVersionAsc(String(a.local_version || '').trim(), String(b.local_version || '').trim());
    } else if (sortColumn === 'portal') {
      let va = String(a.portal_version || '').trim();
      let vb = String(b.portal_version || '').trim();
      if (va === '-' || va === '—') va = '';
      if (vb === '-' || vb === '—') vb = '';
      if (!va && vb) r = 1;
      else if (va && !vb) r = -1;
      else r = compareModVersionAsc(va, vb);
    } else if (sortColumn === 'installed') {
      const ta = installDateTs(a);
      const tb = installDateTs(b);
      const fa = Number.isFinite(ta);
      const fb = Number.isFinite(tb);
      if (!fa && !fb) r = 0;
      else if (!fa) r = 1;
      else if (!fb) r = -1;
      else r = ta === tb ? 0 : ta < tb ? -1 : 1;
      if (r !== 0) return sortAsc ? r : -r;
      return ordList(a, b);
    } else if (sortColumn === 'installed_by') {
      const sa = formatPanelActorName(a.installed_by).toLowerCase();
      const sb = formatPanelActorName(b.installed_by).toLowerCase();
      if (!sa && sb) r = 1;
      else if (sa && !sb) r = -1;
      else r = sa.localeCompare(sb, undefined, { sensitivity: 'base' });
    }

    const mul = sortAsc ? 1 : -1;
    if (r !== 0) return mul * r;
    return ordList(a, b);
  });

  return out;
}

export function filterModRows(rows: ModRow[], query: string): ModRow[] {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((m) => {
    const hay = [m.display_name || '', m.name || '', m.local_version || '', m.portal_version || '']
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}
