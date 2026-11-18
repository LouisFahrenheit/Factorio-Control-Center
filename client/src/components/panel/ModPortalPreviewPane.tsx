import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../../api/client';
import {
  formatPanelDateOnly,
  formatRelativeAge,
} from '../../lib/datetimeUtils';
import { localizeModError } from '../../lib/modErrorUtils';
import { getModPortalUrl } from '../../lib/modUtils';
import { SPACE_AGE_LIST_ICON_URL } from '../../lib/serverListIcons';
import type {
  ModPortalDependencyEntry,
  ModPortalDetailsResponse,
  ModPortalFullDetails,
  ModPortalFullImage,
  ModPortalSearchItem,
} from '../../types/modJob';
import { AppIcon } from '../AppIcon';

type PreviewSubTab = 'description' | 'dependencies' | 'changelog' | 'faq';

const MAX_MD_CHARS = 50_000;
const MAX_MD_BLOCKS = 350;
const MAX_INLINE_TOKENS = 100;
const MAX_VISIBLE_GALLERY_IMAGES = 16;
const MAX_INITIAL_CHANGELOG_ENTRIES = 25;
const MAX_RAW_CHANGELOG_CHARS = 60_000;
const MAX_INITIAL_DEPS_GROUP = 30;

interface ModPortalPreviewPaneProps {
  seedItem: ModPortalSearchItem;
  initialSubTab?: PreviewSubTab;
  instanceId: string;
  thumbUrl: string;
  localVersion: string;
  hasUpdate: boolean;
  isBookmarked: boolean;
  bookmarkBusy: boolean;
  canUseBookmarks: boolean;
  serverBusy: boolean;
  blockUpdates: boolean;
  onBack: () => void;
  onOpenMod: (modName: string, modTitle?: string) => void;
  onSelectOwner: (owner: string) => void;
  onToggleBookmark: () => void;
  onPickVersion: () => void;
  onInstall: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

function formatCompactDownloads(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function sanitizeSafeExternalUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (s.startsWith('/assets/')) {
    return `https://assets-mod.factorio.com${s}`;
  }
  if (s.startsWith('/')) {
    return `https://mods.factorio.com${s}`;
  }
  if (/^https?:\/\//i.test(s)) {
    return s;
  }
  return '';
}

function renderInlineMarkdown(
  text: string,
  keyPrefix: string,
  depth = 0,
): ReactNode[] {
  if (!text || depth > 2) return [text];

  const out: ReactNode[] = [];
  const tokenRe =
    /(\[!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\]\(([^)\s]+)(?:\s+"[^"]*")?\))|(!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\))|(\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*\n]+)\*)|(~~([^~]+)~~)|(https?:\/\/[^\s<)]+)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRe.exec(text)) !== null) {
    if (idx >= MAX_INLINE_TOKENS) {
      break;
    }
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }
    const k = `${keyPrefix}-${idx++}`;

    if (match[1]) {
      const alt = match[2] || '';
      const imgUrl = sanitizeSafeExternalUrl(match[3] || '');
      const linkUrl = sanitizeSafeExternalUrl(match[4] || '');
      if (imgUrl && linkUrl) {
        out.push(
          <a
            key={k}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mod-portal-md__img-link"
          >
            <img
              src={imgUrl}
              alt={alt}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(ev) => {
                ev.currentTarget.style.display = 'none';
              }}
            />
          </a>,
        );
      } else {
        out.push(match[0]);
      }
    } else if (match[5]) {
      const alt = match[6] || '';
      const imgUrl = sanitizeSafeExternalUrl(match[7] || '');
      if (imgUrl) {
        out.push(
          <img
            key={k}
            src={imgUrl}
            alt={alt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="mod-portal-md__inline-img"
            onError={(ev) => {
              ev.currentTarget.style.display = 'none';
            }}
          />,
        );
      } else {
        out.push(match[0]);
      }
    } else if (match[8]) {
      const label = match[9] || '';
      const linkUrl = sanitizeSafeExternalUrl(match[10] || '');
      if (linkUrl) {
        out.push(
          <a key={k} href={linkUrl} target="_blank" rel="noopener noreferrer">
            {renderInlineMarkdown(label, `${k}-lbl`, depth + 1)}
          </a>,
        );
      } else {
        out.push(label);
      }
    } else if (match[11]) {
      out.push(<code key={k}>{match[12]}</code>);
    } else if (match[13]) {
      out.push(
        <strong key={k}>
          {renderInlineMarkdown(match[14] || '', `${k}-b`, depth + 1)}
        </strong>,
      );
    } else if (match[15]) {
      out.push(<em key={k}>{match[16]}</em>);
    } else if (match[17]) {
      out.push(<del key={k}>{match[18]}</del>);
    } else if (match[19]) {
      const bareUrl = sanitizeSafeExternalUrl(match[19]);
      if (bareUrl) {
        out.push(
          <a key={k} href={bareUrl} target="_blank" rel="noopener noreferrer">
            {bareUrl}
          </a>,
        );
      } else {
        out.push(match[0]);
      }
    }

    lastIndex = tokenRe.lastIndex;
  }

  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }

  return out;
}

function isBlockStarter(trimmed: string): boolean {
  return (
    !trimmed ||
    trimmed.startsWith('```') ||
    /^#{1,6}(?:\s|$|[^#])/.test(trimmed) ||
    trimmed.startsWith('>') ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+[.)]\s+/.test(trimmed) ||
    /^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)
  );
}

function renderPortalMarkdown(
  raw: string,
  expandAll: boolean,
): {
  node: ReactNode;
  truncated: boolean;
} {
  const truncatedByChars = !expandAll && raw.length > MAX_MD_CHARS;
  const source = truncatedByChars ? raw.slice(0, MAX_MD_CHARS) : raw;
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let blockIdx = 0;
  let truncatedByBlocks = false;

  while (i < lines.length) {
    if (!expandAll && blockIdx >= MAX_MD_BLOCKS) {
      truncatedByBlocks = true;
      break;
    }

    const startIdx = i;
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith('```')) {
        codeLines.push(lines[i] ?? '');
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(
        <pre key={`b-${blockIdx++}`} className="mod-portal-md__pre">
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={`b-${blockIdx++}`} className="mod-portal-md__hr" />);
      i += 1;
      continue;
    }

    const headingMatch = /^(#{1,6})\s*(.*)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1]?.length || 2;
      const headingText = (headingMatch[2] || '').trim();
      i += 1;
      if (!headingText) continue;
      const content = renderInlineMarkdown(headingText, `h-${blockIdx}`);
      const k = `b-${blockIdx++}`;
      if (level === 1) {
        blocks.push(
          <h2 key={k} className="mod-portal-md__h1">
            {content}
          </h2>,
        );
      } else if (level === 2) {
        blocks.push(
          <h3 key={k} className="mod-portal-md__h2">
            {content}
          </h3>,
        );
      } else {
        blocks.push(
          <h4 key={k} className="mod-portal-md__h3">
            {content}
          </h4>,
        );
      }
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('>')) {
        quoteLines.push((lines[i] ?? '').trim().replace(/^>\s?/, ''));
        i += 1;
      }
      const k = `b-${blockIdx++}`;
      blocks.push(
        <blockquote key={k} className="mod-portal-md__quote">
          {renderInlineMarkdown(quoteLines.join(' '), k)}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test((lines[i] ?? '').trim())) {
        items.push((lines[i] ?? '').trim().replace(/^[-*+]\s+/, ''));
        i += 1;
      }
      const k = `b-${blockIdx++}`;
      blocks.push(
        <ul key={k} className="mod-portal-md__list">
          {items.map((it, idx) => (
            <li key={`${k}-${idx}`}>
              {renderInlineMarkdown(it, `${k}-${idx}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test((lines[i] ?? '').trim())) {
        items.push((lines[i] ?? '').trim().replace(/^\d+[.)]\s+/, ''));
        i += 1;
      }
      const k = `b-${blockIdx++}`;
      blocks.push(
        <ol
          key={k}
          className="mod-portal-md__list mod-portal-md__list--ordered"
        >
          {items.map((it, idx) => (
            <li key={`${k}-${idx}`}>
              {renderInlineMarkdown(it, `${k}-${idx}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = (lines[i] ?? '').trim();
      if (paraLines.length > 0 && isBlockStarter(cur)) {
        break;
      }
      paraLines.push(cur);
      i += 1;
      if (paraLines.length >= 40) break;
    }
    if (i <= startIdx) {
      i = startIdx + 1;
    }
    const k = `b-${blockIdx++}`;
    blocks.push(
      <p key={k} className="mod-portal-md__p">
        {renderInlineMarkdown(paraLines.join(' '), k)}
      </p>,
    );
  }

  return {
    node: <div className="mod-portal-md">{blocks}</div>,
    truncated: truncatedByChars || truncatedByBlocks,
  };
}

interface ParsedChangelogEntry {
  version: string;
  date: string;
  body: string;
}

function parseFactorioChangelog(raw: string): ParsedChangelogEntry[] {
  const capped =
    raw.length > MAX_RAW_CHANGELOG_CHARS * 3
      ? raw.slice(0, MAX_RAW_CHANGELOG_CHARS * 3)
      : raw;
  const parts = capped
    .replace(/\r\n/g, '\n')
    .split(/^-{10,}\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);

  const entries: ParsedChangelogEntry[] = [];
  for (const block of parts) {
    const lines = block.split('\n');
    let version = '';
    let date = '';
    const rest: string[] = [];
    for (const line of lines) {
      const vMatch = /^Version:\s*(.+)$/i.exec(line.trim());
      if (vMatch && !version) {
        version = vMatch[1]?.trim() || '';
        continue;
      }
      const dMatch = /^Date:\s*(.+)$/i.exec(line.trim());
      if (dMatch && !date) {
        date = dMatch[1]?.trim() || '';
        continue;
      }
      rest.push(line);
    }
    if (version || rest.length > 0) {
      entries.push({
        version,
        date,
        body: rest.join('\n').trim(),
      });
    }
  }
  return entries;
}

function PreviewBookmarkIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: 16, height: 16, flexShrink: 0, display: 'block' }}
      aria-hidden="true"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function formatOperatorLabel(op: string, ver: string): string {
  if (!ver) return '';
  const sym = op === '>=' ? '≥' : op === '<=' ? '≤' : op === '!=' ? '≠' : op;
  return sym ? `${sym} ${ver}` : ver;
}

function DependencyRow({
  dep,
  onOpenMod,
  t,
}: {
  dep: ModPortalDependencyEntry;
  onOpenMod: (name: string, title?: string) => void;
  t: (key: string, ...args: (string | number)[]) => string;
}) {
  const reqText = formatOperatorLabel(dep.operator, dep.version);

  let statusClass = 'mod-portal-dep-badge--neutral';
  let statusText = '';

  switch (dep.status) {
    case 'installed_ok':
      statusClass = 'mod-portal-dep-badge--ok';
      statusText = t(
        'mod_portal_dep_status_installed_ok',
        dep.local_version || '—',
      );
      break;
    case 'installed_disabled':
      statusClass = 'mod-portal-dep-badge--warn';
      statusText = t(
        'mod_portal_dep_status_installed_disabled',
        dep.local_version || '—',
      );
      break;
    case 'needs_update':
      statusClass = 'mod-portal-dep-badge--warn';
      statusText = t(
        'mod_portal_dep_status_needs_update',
        dep.local_version || '—',
      );
      break;
    case 'missing_dlc':
      statusClass = 'mod-portal-dep-badge--danger';
      statusText = t('mod_portal_dep_status_missing_dlc');
      break;
    case 'will_download':
      statusClass = 'mod-portal-dep-badge--info';
      statusText = t('mod_portal_dep_status_will_download');
      break;
    case 'conflict_active':
      statusClass = 'mod-portal-dep-badge--danger';
      statusText = t(
        'mod_portal_dep_status_conflict_active',
        dep.local_version || '—',
      );
      break;
    case 'conflict_inactive':
      statusClass = 'mod-portal-dep-badge--neutral';
      statusText = t('mod_portal_dep_status_conflict_inactive');
      break;
    default:
      statusClass = 'mod-portal-dep-badge--neutral';
      statusText = t('mod_portal_dep_status_not_installed');
      break;
  }

  return (
    <div
      className={
        'mod-portal-dep-row' +
        (dep.status === 'conflict_active' || dep.status === 'missing_dlc'
          ? ' mod-portal-dep-row--danger'
          : '')
      }
    >
      <div className="mod-portal-dep-row__main">
        {dep.is_builtin ? (
          <span className="mod-portal-dep-row__name">{dep.title}</span>
        ) : (
          <button
            type="button"
            className="mod-portal-dep-row__link"
            onClick={() => onOpenMod(dep.name, dep.title)}
          >
            {dep.title}
          </button>
        )}
        {dep.title.toLowerCase() !== dep.name.toLowerCase() ? (
          <span className="mod-portal-dep-row__id">{dep.name}</span>
        ) : null}
        {reqText ? (
          <span className="mod-portal-dep-row__req">{reqText}</span>
        ) : null}
      </div>
      <span className={`mod-portal-dep-badge ${statusClass}`}>
        {statusText}
      </span>
    </div>
  );
}

export function ModPortalPreviewPane({
  seedItem,
  initialSubTab = 'description',
  instanceId,
  thumbUrl,
  localVersion,
  hasUpdate,
  isBookmarked,
  bookmarkBusy,
  canUseBookmarks,
  serverBusy,
  blockUpdates,
  onBack,
  onOpenMod,
  onSelectOwner,
  onToggleBookmark,
  onPickVersion,
  onInstall,
  t,
}: ModPortalPreviewPaneProps) {
  const [details, setDetails] = useState<ModPortalFullDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subTab, setSubTab] = useState<PreviewSubTab>('description');
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const [expandMd, setExpandMd] = useState(false);
  const [expandGallery, setExpandGallery] = useState(false);
  const [expandChangelog, setExpandChangelog] = useState(false);
  const [expandOptionalDeps, setExpandOptionalDeps] = useState(false);
  const [expandConflictDeps, setExpandConflictDeps] = useState(false);
  const [localChangelog, setLocalChangelog] = useState<string | null>(null);
  const [localChangelogLoading, setLocalChangelogLoading] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError('');
    setDetails(null);
    setSubTab(initialSubTab);
    setLocalChangelog(null);
    setLocalChangelogLoading(false);
    setLightboxIdx(null);
    setExpandMd(false);
    setExpandGallery(false);
    setExpandChangelog(false);
    setExpandOptionalDeps(false);
    setExpandConflictDeps(false);

    const qs = new URLSearchParams({ name: seedItem.name });
    if (instanceId) qs.set('instance_id', instanceId);

    api<ModPortalDetailsResponse>(`/api/mods/portal-details?${qs.toString()}`, {
      signal: ctrl.signal,
    })
      .then((res) => {
        if (ctrl.signal.aborted) return;
        if (res.ok === false || !res.mod) {
          setError(
            localizeModError(res.error || 'fetch_failed', seedItem.name, t),
          );
          return;
        }
        setDetails(res.mod);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(localizeModError(msg, seedItem.name, t));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [seedItem.name, instanceId, initialSubTab, t]);

  const images: ModPortalFullImage[] = useMemo(
    () => details?.images ?? [],
    [details?.images],
  );

  useEffect(() => {
    if (lightboxIdx === null || images.length === 0) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        setLightboxIdx(null);
      } else if (ev.key === 'ArrowRight') {
        setLightboxIdx((prev) =>
          prev === null ? null : (prev + 1) % images.length,
        );
      } else if (ev.key === 'ArrowLeft') {
        setLightboxIdx((prev) =>
          prev === null ? null : (prev - 1 + images.length) % images.length,
        );
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [lightboxIdx, images.length]);

  const title = details?.title || seedItem.title;
  const owner = details?.owner || seedItem.owner;
  const summary = details?.summary || seedItem.summary;
  const latestVer = details?.latest_version || seedItem.latest_version;
  const releasedAt = details?.released_at || seedItem.released_at;
  const downloads = details?.downloads_count ?? seedItem.downloads_count;
  const requiresSpaceAge =
    details?.requires_space_age ?? Boolean(seedItem.requires_space_age);
  const portalUrl = getModPortalUrl(seedItem.name);

  const resolvedThumb = useMemo(() => {
    const raw = details?.thumbnail || thumbUrl || seedItem.thumbnail;
    return sanitizeSafeExternalUrl(raw);
  }, [details?.thumbnail, thumbUrl, seedItem.thumbnail]);

  const sourceHref = useMemo(() => {
    if (details?.source_url) return sanitizeSafeExternalUrl(details.source_url);
    if (details?.github_path) {
      const cleanGh = details.github_path.replace(/^\/+/, '');
      if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleanGh)) {
        return `https://github.com/${cleanGh}`;
      }
    }
    return '';
  }, [details?.github_path, details?.source_url]);

  const homepageHref = useMemo(
    () => (details?.homepage ? sanitizeSafeExternalUrl(details.homepage) : ''),
    [details?.homepage],
  );

  const depsInfo = details?.dependencies_info;
  const activeConflicts = depsInfo?.active_conflicts ?? [];
  const missingDlc = depsInfo?.missing_dlc ?? [];
  const requiredDeps = depsInfo?.required ?? [];
  const optionalDeps = depsInfo?.optional ?? [];
  const inactiveConflicts = depsInfo?.conflicts ?? [];

  const totalDepsCount =
    activeConflicts.length +
    requiredDeps.length +
    optionalDeps.length +
    inactiveConflicts.length;
  const hasDepWarning = activeConflicts.length > 0 || missingDlc.length > 0;

  const portalChangelog = details?.changelog?.trim() || '';
  const hasChangelog = Boolean(portalChangelog);
  const hasFaq = Boolean(details?.faq?.trim());

  const needsLocalChangelog =
    !loading && subTab === 'changelog' && !portalChangelog;

  useEffect(() => {
    if (!needsLocalChangelog || localChangelog !== null) return;
    const ctrl = new AbortController();
    setLocalChangelogLoading(true);
    api<{ ok?: boolean; text?: string }>(
      `/api/mods/changelog?name=${encodeURIComponent(seedItem.name)}`,
      { signal: ctrl.signal },
    )
      .then((res) => {
        if (ctrl.signal.aborted) return;
        setLocalChangelog(
          res && res.ok !== false ? String(res.text || '').trim() : '',
        );
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setLocalChangelog('');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLocalChangelogLoading(false);
      });
    return () => ctrl.abort();
  }, [needsLocalChangelog, localChangelog, seedItem.name]);

  const changelogText = portalChangelog || localChangelog || '';
  const changelogIsLocal = !portalChangelog && Boolean(localChangelog);
  const changelogLoading =
    loading ||
    localChangelogLoading ||
    (needsLocalChangelog && localChangelog === null);

  const parsedChangelog = useMemo(
    () => (changelogText ? parseFactorioChangelog(changelogText) : []),
    [changelogText],
  );

  const renderedDescription = useMemo(() => {
    if (!details?.description?.trim()) return null;
    return renderPortalMarkdown(details.description, expandMd);
  }, [details?.description, expandMd]);

  const renderedFaq = useMemo(() => {
    if (!details?.faq?.trim()) return null;
    return renderPortalMarkdown(details.faq, expandMd);
  }, [details?.faq, expandMd]);

  const visibleImages = expandGallery
    ? images
    : images.slice(0, MAX_VISIBLE_GALLERY_IMAGES);
  const hiddenImagesCount = Math.max(0, images.length - visibleImages.length);

  const visibleChangelog = expandChangelog
    ? parsedChangelog
    : parsedChangelog.slice(0, MAX_INITIAL_CHANGELOG_ENTRIES);

  const visibleOptionalDeps = expandOptionalDeps
    ? optionalDeps
    : optionalDeps.slice(0, MAX_INITIAL_DEPS_GROUP);
  const visibleInactiveConflicts = expandConflictDeps
    ? inactiveConflicts
    : inactiveConflicts.slice(0, MAX_INITIAL_DEPS_GROUP);

  const activeLightboxImage =
    lightboxIdx !== null ? images[lightboxIdx] || null : null;

  return (
    <div className="mod-portal-preview">
      <div className="mod-portal-preview__topbar">
        <button
          type="button"
          className="btn btn--with-icon mod-portal-preview__back-btn"
          onClick={onBack}
        >
          <AppIcon name="arrow_back" size={15} />
          <span>{t('mod_portal_preview_back')}</span>
        </button>

        <div className="mod-portal-preview__ext-links">
          {homepageHref ? (
            <a
              href={homepageHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mod-portal-preview__ext-link"
            >
              <span>{t('mod_portal_preview_homepage')}</span>
              <AppIcon name="external_link" size={13} />
            </a>
          ) : null}
          {sourceHref && sourceHref !== homepageHref ? (
            <a
              href={sourceHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mod-portal-preview__ext-link"
            >
              <span>{t('mod_portal_preview_source')}</span>
              <AppIcon name="external_link" size={13} />
            </a>
          ) : null}
          {portalUrl ? (
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mod-portal-preview__ext-link"
            >
              <span>mods.factorio.com</span>
              <AppIcon name="external_link" size={13} />
            </a>
          ) : null}
        </div>
      </div>

      <div className="mod-portal-preview__scroll">
        <div className="mod-portal-preview__hero">
          <div className="mod-portal-preview__thumb" aria-hidden="true">
            {resolvedThumb ? (
              <img
                src={resolvedThumb}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            ) : (
              <AppIcon name="package" size={32} />
            )}
          </div>

          <div className="mod-portal-preview__hero-main">
            <div className="mod-portal-preview__title-row">
              <h3 className="mod-portal-preview__title">{title}</h3>
              {latestVer ? (
                <span className="mod-install-card__id">v{latestVer}</span>
              ) : null}
              {requiresSpaceAge ? (
                <span className="mod-install-card__sa-pill">
                  <img
                    src={SPACE_AGE_LIST_ICON_URL}
                    alt=""
                    width={12}
                    height={12}
                    style={{ display: 'block', objectFit: 'contain' }}
                  />
                  Space Age
                </span>
              ) : null}
              {localVersion ? (
                <span
                  className={
                    'mod-install-card__badge' +
                    (hasUpdate
                      ? ' mod-install-card__badge--update'
                      : ' mod-install-card__badge--installed')
                  }
                >
                  <AppIcon name={hasUpdate ? 'update' : 'check'} size={12} />
                  {t('mod_install_search_installed_badge', localVersion)}
                </span>
              ) : null}
            </div>

            {summary ? (
              <p className="mod-portal-preview__summary">{summary}</p>
            ) : null}

            <div className="mod-portal-preview__meta">
              {owner ? (
                <button
                  type="button"
                  className="mod-install-card__owner-btn"
                  title={t('mod_portal_filter_by_owner_tip', owner)}
                  onClick={() => onSelectOwner(owner)}
                >
                  <AppIcon name="users" size={13} />
                  <span>{owner}</span>
                </button>
              ) : null}
              <span className="mod-install-card__stat">
                <AppIcon name="download" size={13} />
                {formatCompactDownloads(downloads)}
              </span>
              {releasedAt ? (
                <span
                  className="mod-install-card__stat"
                  title={formatPanelDateOnly(releasedAt)}
                >
                  <AppIcon name="schedule" size={13} />
                  {formatRelativeAge(releasedAt)}
                </span>
              ) : null}
              {details?.created_at ? (
                <span className="mod-install-card__stat">
                  {t(
                    'mod_portal_preview_created',
                    formatPanelDateOnly(details.created_at),
                  )}
                </span>
              ) : null}
              {details?.license ? (
                details.license.url &&
                sanitizeSafeExternalUrl(details.license.url) ? (
                  <a
                    href={sanitizeSafeExternalUrl(details.license.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mod-portal-preview__license-link"
                  >
                    {t('mod_portal_preview_license', details.license.title)}
                  </a>
                ) : (
                  <span className="mod-install-card__stat">
                    {t('mod_portal_preview_license', details.license.title)}
                  </span>
                )
              ) : null}
            </div>

            {details?.tags && details.tags.length > 0 ? (
              <div className="mod-portal-preview__tags">
                {details.tags.map((tag) => (
                  <span key={tag} className="mod-portal-preview__tag">
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mod-portal-preview__hero-actions">
            <button
              type="button"
              className={
                'btn btn--toolbar-icon mod-install-card__bookmark-btn' +
                (isBookmarked ? ' is-bookmarked' : '')
              }
              title={
                !canUseBookmarks
                  ? t('mod_list_portal_credentials_missing')
                  : isBookmarked
                    ? t('mod_portal_bookmark_remove')
                    : t('mod_portal_bookmark_add')
              }
              aria-pressed={isBookmarked}
              disabled={!canUseBookmarks || bookmarkBusy}
              onClick={onToggleBookmark}
            >
              <PreviewBookmarkIcon active={isBookmarked} />
            </button>
            <button
              type="button"
              className="btn btn--toolbar-icon"
              title={
                !canUseBookmarks
                  ? t('mod_list_portal_credentials_missing')
                  : t('mod_install_search_pick_version_btn')
              }
              disabled={serverBusy || !canUseBookmarks}
              onClick={onPickVersion}
            >
              <AppIcon name="history" size={15} />
            </button>
            <button
              type="button"
              className={
                'btn btn--with-icon mod-install-card__install-btn' +
                (hasUpdate ? ' btn--update-available' : '') +
                (localVersion && !hasUpdate ? ' is-installed' : '')
              }
              title={
                !canUseBookmarks
                  ? t('mod_list_portal_credentials_missing')
                  : undefined
              }
              disabled={
                (Boolean(localVersion) && !hasUpdate) ||
                serverBusy ||
                blockUpdates ||
                !canUseBookmarks
              }
              onClick={onInstall}
            >
              <AppIcon
                name={
                  hasUpdate
                    ? 'package_update'
                    : localVersion
                      ? 'check'
                      : 'download'
                }
                size={15}
              />
              {hasUpdate
                ? t('mod_install_search_update_btn')
                : localVersion
                  ? t('mod_install_search_installed_btn')
                  : t('mod_install_search_install_btn')}
            </button>
          </div>
        </div>

        {missingDlc.length > 0 ? (
          <div className="mod-portal-dep-alert mod-portal-dep-alert--danger">
            <AppIcon name="warning" size={16} />
            <span>
              {t('mod_portal_dep_missing_dlc_banner', missingDlc.join(', '))}
            </span>
          </div>
        ) : null}

        {activeConflicts.length > 0 ? (
          <div className="mod-portal-dep-alert mod-portal-dep-alert--danger">
            <AppIcon name="warning" size={16} />
            <div className="mod-portal-dep-alert__body">
              <span>{t('mod_portal_dep_conflict_banner')}</span>
              <div className="mod-portal-dep-alert__chips">
                {activeConflicts.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    className="mod-portal-dep-alert__chip"
                    onClick={() => {
                      if (!c.is_builtin) onOpenMod(c.name, c.title);
                    }}
                  >
                    {c.title}
                    {c.local_version ? ` (v${c.local_version})` : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {visibleImages.length > 0 ? (
          <div className="mod-portal-preview__gallery">
            <div className="mod-portal-preview__gallery-strip">
              {visibleImages.map((img, i) => {
                const safeThumb = sanitizeSafeExternalUrl(
                  img.thumbnail || img.url,
                );
                if (!safeThumb) return null;
                return (
                  <button
                    key={img.id}
                    type="button"
                    className="mod-portal-preview__gallery-item"
                    onClick={() => setLightboxIdx(i)}
                  >
                    <img
                      src={safeThumb}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={(ev) => {
                        const btn = ev.currentTarget.closest('button');
                        if (btn) btn.style.display = 'none';
                      }}
                    />
                  </button>
                );
              })}
              {hiddenImagesCount > 0 ? (
                <button
                  type="button"
                  className="mod-portal-preview__gallery-more"
                  onClick={() => setExpandGallery(true)}
                >
                  +{hiddenImagesCount}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mod-portal-preview__tabs">
          <button
            type="button"
            className={
              'mod-install-search__sort-btn' +
              (subTab === 'description' ? ' is-active' : '')
            }
            onClick={() => setSubTab('description')}
          >
            {t('mod_portal_preview_tab_description')}
          </button>
          {totalDepsCount > 0 || !loading ? (
            <button
              type="button"
              className={
                'mod-install-search__sort-btn mod-portal-preview__dep-tab' +
                (subTab === 'dependencies' ? ' is-active' : '') +
                (hasDepWarning ? ' has-warning' : '')
              }
              onClick={() => setSubTab('dependencies')}
            >
              <span>{t('mod_portal_preview_tab_dependencies')}</span>
              {!loading ? (
                <span className="mod-portal-preview__tab-count">
                  {requiredDeps.length + activeConflicts.length}
                </span>
              ) : null}
            </button>
          ) : null}
          {hasChangelog || Boolean(localVersion) || subTab === 'changelog' ? (
            <button
              type="button"
              className={
                'mod-install-search__sort-btn' +
                (subTab === 'changelog' ? ' is-active' : '')
              }
              onClick={() => setSubTab('changelog')}
            >
              {t('mod_portal_preview_tab_changelog')}
            </button>
          ) : null}
          {hasFaq ? (
            <button
              type="button"
              className={
                'mod-install-search__sort-btn' +
                (subTab === 'faq' ? ' is-active' : '')
              }
              onClick={() => setSubTab('faq')}
            >
              {t('mod_portal_preview_tab_faq')}
            </button>
          ) : null}
        </div>

        <div className="mod-portal-preview__content">
          {loading ? (
            <div className="mod-portal-preview__loading">
              <div className="mod-install-skeleton" style={{ height: 96 }} />
              <div className="mod-install-skeleton" style={{ height: 140 }} />
            </div>
          ) : subTab === 'changelog' ? (
            changelogLoading ? (
              <div className="mod-portal-preview__loading">
                <div className="mod-install-skeleton" style={{ height: 96 }} />
              </div>
            ) : !changelogText ? (
              <p className="mod-portal-preview__muted">
                {t('mod_list_changelog_not_found')}
              </p>
            ) : (
              <>
                {changelogIsLocal ? (
                  <p className="mod-portal-changelog__source">
                    <AppIcon name="package" size={13} />
                    {t('mod_portal_changelog_local_source')}
                  </p>
                ) : null}
                {parsedChangelog.length > 0 ? (
                  <div className="mod-portal-changelog">
                    {visibleChangelog.map((entry, idx) => (
                      <div
                        key={`${entry.version}-${idx}`}
                        className="mod-portal-changelog__entry"
                      >
                        <div className="mod-portal-changelog__head">
                          {entry.version ? (
                            <span className="mod-portal-changelog__ver">
                              v{entry.version}
                            </span>
                          ) : null}
                          {entry.date ? (
                            <span className="mod-portal-changelog__date">
                              {entry.date}
                            </span>
                          ) : null}
                        </div>
                        {entry.body ? (
                          <pre className="mod-portal-changelog__body">
                            {entry.body}
                          </pre>
                        ) : null}
                      </div>
                    ))}
                    {!expandChangelog &&
                    parsedChangelog.length > visibleChangelog.length ? (
                      <button
                        type="button"
                        className="btn mod-portal-preview__more-btn"
                        onClick={() => setExpandChangelog(true)}
                      >
                        {t('mod_portal_show_more', parsedChangelog.length)}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <pre className="mod-portal-changelog__body">
                    {changelogText.slice(0, MAX_RAW_CHANGELOG_CHARS)}
                  </pre>
                )}
              </>
            )
          ) : error ? (
            <div className="mod-install-search__empty mod-install-search__empty--error">
              <AppIcon name="warning" size={24} />
              <span>{error}</span>
            </div>
          ) : subTab === 'dependencies' ? (
            totalDepsCount === 0 ? (
              <p className="mod-portal-preview__muted">
                {t('mod_portal_dep_none')}
              </p>
            ) : (
              <div className="mod-portal-deps">
                {activeConflicts.length > 0 ? (
                  <div className="mod-portal-deps__group">
                    <h4 className="mod-portal-deps__heading mod-portal-deps__heading--danger">
                      {t('mod_portal_dep_section_conflicts')} (
                      {activeConflicts.length})
                    </h4>
                    <div className="mod-portal-deps__list">
                      {activeConflicts.map((dep) => (
                        <DependencyRow
                          key={`ac-${dep.name}`}
                          dep={dep}
                          onOpenMod={onOpenMod}
                          t={t}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {requiredDeps.length > 0 ? (
                  <div className="mod-portal-deps__group">
                    <h4 className="mod-portal-deps__heading">
                      {t('mod_portal_dep_section_required')} (
                      {requiredDeps.length})
                    </h4>
                    <div className="mod-portal-deps__list">
                      {requiredDeps.map((dep) => (
                        <DependencyRow
                          key={`req-${dep.name}`}
                          dep={dep}
                          onOpenMod={onOpenMod}
                          t={t}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {optionalDeps.length > 0 ? (
                  <div className="mod-portal-deps__group">
                    <h4 className="mod-portal-deps__heading">
                      {t('mod_portal_dep_section_optional')} (
                      {optionalDeps.length})
                    </h4>
                    <div className="mod-portal-deps__list">
                      {visibleOptionalDeps.map((dep) => (
                        <DependencyRow
                          key={`opt-${dep.name}`}
                          dep={dep}
                          onOpenMod={onOpenMod}
                          t={t}
                        />
                      ))}
                    </div>
                    {!expandOptionalDeps &&
                    optionalDeps.length > visibleOptionalDeps.length ? (
                      <button
                        type="button"
                        className="btn mod-portal-preview__more-btn"
                        onClick={() => setExpandOptionalDeps(true)}
                      >
                        {t('mod_portal_show_more', optionalDeps.length)}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {inactiveConflicts.length > 0 ? (
                  <div className="mod-portal-deps__group">
                    <h4 className="mod-portal-deps__heading">
                      {t('mod_portal_dep_section_incompatible')} (
                      {inactiveConflicts.length})
                    </h4>
                    <div className="mod-portal-deps__list">
                      {visibleInactiveConflicts.map((dep) => (
                        <DependencyRow
                          key={`inc-${dep.name}`}
                          dep={dep}
                          onOpenMod={onOpenMod}
                          t={t}
                        />
                      ))}
                    </div>
                    {!expandConflictDeps &&
                    inactiveConflicts.length >
                      visibleInactiveConflicts.length ? (
                      <button
                        type="button"
                        className="btn mod-portal-preview__more-btn"
                        onClick={() => setExpandConflictDeps(true)}
                      >
                        {t('mod_portal_show_more', inactiveConflicts.length)}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          ) : subTab === 'faq' && renderedFaq ? (
            <>
              {renderedFaq.node}
              {renderedFaq.truncated ? (
                <button
                  type="button"
                  className="btn mod-portal-preview__more-btn"
                  onClick={() => setExpandMd(true)}
                >
                  {t('mod_portal_show_more', '100%')}
                </button>
              ) : null}
            </>
          ) : renderedDescription ? (
            <>
              {renderedDescription.node}
              {renderedDescription.truncated ? (
                <button
                  type="button"
                  className="btn mod-portal-preview__more-btn"
                  onClick={() => setExpandMd(true)}
                >
                  {t('mod_portal_show_more', '100%')}
                </button>
              ) : null}
            </>
          ) : summary ? (
            <p className="mod-portal-md__p">{summary}</p>
          ) : (
            <p className="mod-portal-preview__muted">
              {t('mod_portal_preview_no_description')}
            </p>
          )}
        </div>
      </div>

      {activeLightboxImage ? (
        <div
          className="mod-portal-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxIdx(null)}
        >
          <div
            className="mod-portal-lightbox__inner"
            onClick={(ev) => ev.stopPropagation()}
          >
            {images.length > 1 ? (
              <button
                type="button"
                className="mod-portal-lightbox__nav mod-portal-lightbox__nav--prev"
                onClick={() =>
                  setLightboxIdx((prev) =>
                    prev === null
                      ? 0
                      : (prev - 1 + images.length) % images.length,
                  )
                }
              >
                ‹
              </button>
            ) : null}
            <img
              src={sanitizeSafeExternalUrl(activeLightboxImage.url)}
              alt=""
              decoding="async"
              referrerPolicy="no-referrer"
              className="mod-portal-lightbox__img"
            />
            {images.length > 1 ? (
              <button
                type="button"
                className="mod-portal-lightbox__nav mod-portal-lightbox__nav--next"
                onClick={() =>
                  setLightboxIdx((prev) =>
                    prev === null ? 0 : (prev + 1) % images.length,
                  )
                }
              >
                ›
              </button>
            ) : null}
            <button
              type="button"
              className="mod-portal-lightbox__close"
              aria-label={t('close')}
              onClick={() => setLightboxIdx(null)}
            >
              <AppIcon name="close" size={18} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
