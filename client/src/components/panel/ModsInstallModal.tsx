import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../../api/client';
import type { ModCardTab, ModsApi } from '../../hooks/useMods';
import {
  formatPanelDateOnly,
  formatRelativeAge,
} from '../../lib/datetimeUtils';
import { goToProgramSettings } from '../../lib/goToServers';
import { localizeModError } from '../../lib/modErrorUtils';
import {
  getModPortalUrl,
  maxInstalledModVersion,
  portalVersionNewer,
} from '../../lib/modUtils';
import { notifyErr, notifyWarn } from '../../lib/notify';
import { SPACE_AGE_LIST_ICON_URL } from '../../lib/serverListIcons';
import type {
  ModPortalBookmarkResponse,
  ModPortalSearchFacets,
  ModPortalSearchItem,
  ModPortalSearchResponse,
  ModPortalSortBy,
  ModPortalThumbnailsResponse,
} from '../../types/modJob';
import { webEffectsReduced } from '../../theme/webEffects';
import { AppIcon } from '../AppIcon';
import { FactorioPortalUsername } from '../FactorioPortalUsername';
import { SearchField } from '../SearchField';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import { ModPortalPreviewPane } from './ModPortalPreviewPane';

type FilterTriState = 'neutral' | 'include' | 'exclude';

interface ModsInstallModalProps {
  mods: ModsApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

const PORTAL_ASSETS_BASE = 'https://assets-mod.factorio.com';

const PORTAL_CATEGORIES: { slug: string; labelKey: string }[] = [
  { slug: 'content', labelKey: 'mod_portal_cat_content' },
  { slug: 'overhaul', labelKey: 'mod_portal_cat_overhaul' },
  { slug: 'tweaks', labelKey: 'mod_portal_cat_tweaks' },
  { slug: 'utilities', labelKey: 'mod_portal_cat_utilities' },
  { slug: 'scenarios', labelKey: 'mod_portal_cat_scenarios' },
  { slug: 'mod-packs', labelKey: 'mod_portal_cat_mod_packs' },
  { slug: 'localizations', labelKey: 'mod_portal_cat_localizations' },
  { slug: 'internal', labelKey: 'mod_portal_cat_internal' },
  { slug: 'no-category', labelKey: 'mod_portal_cat_no_category' },
];

const DEFAULT_CATEGORY_STATES: Record<string, FilterTriState> = {
  internal: 'exclude',
};

const BASE_FACTORIO_VERSIONS = [
  '2.1',
  '2.0',
  '1.1',
  '1.0',
  '0.18',
  '0.17',
  '0.16',
  '0.15',
  '0.14',
  '0.13',
];

const PAGE_SIZE = 20;

const PORTAL_SORT_OPTIONS: { id: ModPortalSortBy; labelKey: string }[] = [
  { id: 'relevance', labelKey: 'mod_portal_sort_relevance' },
  { id: 'downloads', labelKey: 'mod_portal_sort_downloads' },
  { id: 'updated', labelKey: 'mod_portal_sort_updated' },
  { id: 'trending', labelKey: 'mod_portal_sort_trending' },
];

type PageToken = number | 'ellipsis-start' | 'ellipsis-end';

function buildPageItems(current: number, total: number): PageToken[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const items: PageToken[] = [1];
  let start = Math.max(2, current - 1);
  let end = Math.min(total - 1, current + 1);
  if (current <= 3) {
    start = 2;
    end = Math.min(total - 1, 4);
  } else if (current >= total - 2) {
    start = Math.max(2, total - 3);
    end = total - 1;
  }
  if (start > 2) items.push('ellipsis-start');
  for (let p = start; p <= end; p += 1) {
    items.push(p);
  }
  if (end < total - 1) items.push('ellipsis-end');
  items.push(total);
  return items;
}

function ExcludeIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="5.7" y1="5.7" x2="18.3" y2="18.3" />
    </svg>
  );
}

function BookmarkIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function formatCompactDownloads(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(count >= 100_000 ? 0 : 1)}K`;
  }
  return String(count);
}

function resolvePortalThumbUrl(thumbnail: string): string {
  const clean = String(thumbnail || '').trim();
  if (!clean) return '';
  if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
  if (clean.startsWith('/')) return `${PORTAL_ASSETS_BASE}${clean}`;
  return `${PORTAL_ASSETS_BASE}/${clean}`;
}

function ModThumb({ thumbnail, title }: { thumbnail: string; title: string }) {
  const src = resolvePortalThumbUrl(thumbnail);
  const [failedSrc, setFailedSrc] = useState('');
  const [loadedSrc, setLoadedSrc] = useState('');
  const failed = Boolean(src) && failedSrc === src;
  const loaded = Boolean(src) && loadedSrc === src;

  if (!src || failed) {
    return (
      <div
        className="mod-install-card__thumb mod-install-card__thumb--fallback"
        aria-hidden="true"
      >
        <AppIcon name="package" size={22} />
      </div>
    );
  }
  return (
    <div className="mod-install-card__thumb">
      {!loaded ? (
        <span
          className="mod-install-card__thumb-placeholder"
          aria-hidden="true"
        >
          <AppIcon name="package" size={22} />
        </span>
      ) : null}
      <img
        src={src}
        alt={title}
        loading="lazy"
        className={loaded ? 'is-loaded' : ''}
        onLoad={() => setLoadedSrc(src)}
        onError={() => setFailedSrc(src)}
      />
    </div>
  );
}

function TriStateFilterRow({
  id,
  label,
  count,
  state,
  excludeTip,
  badgeIcon,
  onToggleInclude,
  onToggleExclude,
}: {
  id: string;
  label: string;
  count: number;
  state: FilterTriState;
  excludeTip: string;
  badgeIcon?: boolean;
  onToggleInclude: () => void;
  onToggleExclude: () => void;
}) {
  const isIncluded = state === 'include';
  const isExcluded = state === 'exclude';

  return (
    <div
      className={
        'mod-portal-filter-row' +
        (isIncluded ? ' is-included' : '') +
        (isExcluded ? ' is-excluded' : '')
      }
    >
      <label className="mod-portal-filter-row__label" htmlFor={id}>
        <input
          type="checkbox"
          id={id}
          className="mod-portal-filter-row__check"
          checked={isIncluded}
          onChange={onToggleInclude}
        />
        <span className="mod-portal-filter-row__box" aria-hidden="true">
          {isIncluded ? <AppIcon name="check" size={11} /> : null}
        </span>
        <span className="mod-portal-filter-row__text">{label}</span>
        {badgeIcon ? (
          <span className="mod-portal-filter-row__sa-icon" aria-hidden="true">
            <img
              src={SPACE_AGE_LIST_ICON_URL}
              alt=""
              width={14}
              height={14}
              style={{ display: 'block', objectFit: 'contain' }}
            />
          </span>
        ) : null}
        <span className="mod-portal-filter-row__count">{count}</span>
      </label>
      <button
        type="button"
        className={
          'mod-portal-filter-row__exclude' + (isExcluded ? ' is-active' : '')
        }
        title={excludeTip}
        aria-label={`${excludeTip}: ${label}`}
        aria-pressed={isExcluded}
        onClick={onToggleExclude}
      >
        <ExcludeIcon />
      </button>
    </div>
  );
}

export function ModsInstallModal({ mods, t }: ModsInstallModalProps) {
  const open = mods.installModalOpen;
  const reduced = webEffectsReduced();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [selectedFv, setSelectedFv] = useState('');
  const [serverFv, setServerFv] = useState('');
  const [spaceAgeState, setSpaceAgeState] = useState<FilterTriState>('neutral');
  const [categoryStates, setCategoryStates] = useState<
    Record<string, FilterTriState>
  >(() => ({ ...DEFAULT_CATEGORY_STATES }));
  const [onlyBookmarked, setOnlyBookmarked] = useState(false);
  const [searchInDescription, setSearchInDescription] = useState(false);
  const [includeDeprecated, setIncludeDeprecated] = useState(false);
  const [hideInstalled, setHideInstalled] = useState(false);
  const [onlyInstalled, setOnlyInstalled] = useState(false);
  const [onlyUpdates, setOnlyUpdates] = useState(false);
  const [selectedUpdates, setSelectedUpdates] = useState<Set<string>>(
    () => new Set(),
  );
  const [matchedNames, setMatchedNames] = useState<string[]>([]);
  const [matchedPortalVersions, setMatchedPortalVersions] = useState<
    Record<string, string>
  >({});

  const updatesModeRequest = mods.updatesModeRequest;
  const clearUpdatesModeRequest = mods.clearUpdatesModeRequest;
  useEffect(() => {
    if (!open || updatesModeRequest === null) return;
    setSelectedUpdates(new Set());
    if (updatesModeRequest.onlyUpdates) {
      setPreviewStack([]);
      setPage(1);
      setHideInstalled(false);
      setOnlyInstalled(false);
      setOnlyUpdates(true);
    } else {
      setOnlyUpdates(false);
    }
    clearUpdatesModeRequest();
  }, [open, updatesModeRequest, clearUpdatesModeRequest]);
  const [ownerFilter, setOwnerFilter] = useState('');
  const [sortBy, setSortBy] = useState<ModPortalSortBy>('relevance');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const forceRefreshRef = useRef(false);

  const [previewStack, setPreviewStack] = useState<ModPortalSearchItem[]>([]);
  const previewItem =
    previewStack.length > 0
      ? previewStack[previewStack.length - 1] || null
      : null;
  const [previewInitialTab, setPreviewInitialTab] = useState<{
    name: string;
    tab: ModCardTab;
  } | null>(null);
  const modCardRequest = mods.modCardRequest;
  const clearModCardRequest = mods.clearModCardRequest;

  useEffect(() => {
    if (!open || !modCardRequest) return;
    setPreviewStack([
      {
        name: modCardRequest.name,
        title: modCardRequest.title,
        summary: '',
        owner: '',
        downloads_count: 0,
        thumbnail: '',
        category: 'no-category',
        latest_version: '',
        factorio_version: '',
        released_at: '',
      },
    ]);
    setPreviewInitialTab({
      name: modCardRequest.name.toLowerCase(),
      tab: modCardRequest.tab,
    });
    clearModCardRequest();
  }, [open, modCardRequest, clearModCardRequest]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dragDepthRef = useRef(0);

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState<ModPortalSearchItem[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [facets, setFacets] = useState<ModPortalSearchFacets>({
    space_age: 0,
    categories: {},
  });
  const [hasCredentials, setHasCredentials] = useState<boolean | null>(null);
  const [bookmarksCount, setBookmarksCount] = useState(0);

  const [thumbMap, setThumbMap] = useState<Record<string, string>>({});
  const requestedThumbsRef = useRef<Set<string>>(new Set());
  const [bookmarkOverrides, setBookmarkOverrides] = useState<
    Record<string, boolean>
  >({});
  const [bookmarkPending, setBookmarkPending] = useState<
    Record<string, boolean>
  >({});

  const archiveInputRef = useRef<HTMLInputElement>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchQuery.trim();
      setDebouncedQuery((prev) => {
        if (prev !== next) setPage(1);
        return next;
      });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!open) {
      dragDepthRef.current = 0;
      setIsDraggingFiles(false);
      setOnlyUpdates(false);
      setSelectedUpdates(new Set());
    }
  }, [open]);

  const installedByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of mods.rawRows) {
      if (!row || row.is_builtin) continue;
      const key = String(row.name || '')
        .trim()
        .toLowerCase();
      if (!key) continue;
      const ver =
        String(row.local_version || row.pinned_version || '').trim() ||
        maxInstalledModVersion(row);
      if (ver) map.set(key, ver);
    }
    return map;
  }, [mods.rawRows]);

  const installedSignature = useMemo(
    () =>
      Array.from(installedByName.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join(','),
    [installedByName],
  );
  const updatesRefreshKey =
    onlyUpdates || hideInstalled ? installedSignature : '';

  const visibleSearchResults = useMemo(() => {
    if (!onlyUpdates) return searchResults;
    return searchResults.filter((item) => {
      const key = item.name.toLowerCase();
      const localVer = installedByName.get(key) || item.installed_version || '';
      const targetVer = item.target_release_version || item.latest_version;
      return (
        Boolean(localVer) &&
        Boolean(targetVer) &&
        portalVersionNewer(targetVer, localVer)
      );
    });
  }, [onlyUpdates, searchResults, installedByName]);

  const visibleMatchedNames = useMemo(() => {
    if (!onlyUpdates) return matchedNames;
    return matchedNames.filter((name) => {
      const key = name.toLowerCase();
      const localVer = installedByName.get(key) || '';
      const targetVer = matchedPortalVersions[key] || '';
      if (!localVer) return false;
      if (!targetVer) return true;
      return portalVersionNewer(targetVer, localVer);
    });
  }, [onlyUpdates, matchedNames, installedByName, matchedPortalVersions]);

  const allMatchedSelected =
    visibleMatchedNames.length > 0 &&
    visibleMatchedNames.every((n) => selectedUpdates.has(n));

  const displayTotal = onlyUpdates
    ? Math.max(
        0,
        searchTotal - (matchedNames.length - visibleMatchedNames.length),
      )
    : searchTotal;

  useEffect(() => {
    setSelectedUpdates(new Set());
  }, [updatesRefreshKey]);

  const { includeCatsCsv, excludeCatsCsv } = useMemo(() => {
    const inc: string[] = [];
    const exc: string[] = [];
    for (const [slug, st] of Object.entries(categoryStates)) {
      if (st === 'include') inc.push(slug);
      else if (st === 'exclude') exc.push(slug);
    }
    return {
      includeCatsCsv: inc.sort().join(','),
      excludeCatsCsv: exc.sort().join(','),
    };
  }, [categoryStates]);

  const versionOptions = useMemo(() => {
    const set = new Set<string>(BASE_FACTORIO_VERSIONS);
    if (serverFv && serverFv !== 'any' && serverFv !== 'all') set.add(serverFv);
    if (selectedFv && selectedFv !== 'any' && selectedFv !== 'all') {
      set.add(selectedFv);
    }
    return Array.from(set).sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true }),
    );
  }, [serverFv, selectedFv]);

  const hasCustomFilters = useMemo(() => {
    if (spaceAgeState !== 'neutral') return true;
    if (
      onlyBookmarked ||
      includeDeprecated ||
      hideInstalled ||
      onlyInstalled ||
      onlyUpdates
    )
      return true;
    if (ownerFilter) return true;
    if (selectedFv && serverFv && selectedFv !== serverFv) return true;
    for (const { slug } of PORTAL_CATEGORIES) {
      const cur = categoryStates[slug] || 'neutral';
      const def = DEFAULT_CATEGORY_STATES[slug] || 'neutral';
      if (cur !== def) return true;
    }
    return false;
  }, [
    spaceAgeState,
    onlyBookmarked,
    includeDeprecated,
    hideInstalled,
    onlyInstalled,
    onlyUpdates,
    ownerFilter,
    selectedFv,
    serverFv,
    categoryStates,
  ]);

  const resetFilters = useCallback(() => {
    setSpaceAgeState('neutral');
    setCategoryStates({ ...DEFAULT_CATEGORY_STATES });
    setOnlyBookmarked(false);
    setIncludeDeprecated(false);
    setHideInstalled(false);
    setOnlyInstalled(false);
    setOnlyUpdates(false);
    setOwnerFilter('');
    setSelectedFv(serverFv || '');
    setPage(1);
  }, [serverFv]);

  const handleSelectOwner = useCallback((owner: string) => {
    const clean = owner.trim();
    if (!clean) return;
    setPreviewStack([]);
    setPage(1);
    setOwnerFilter((prev) =>
      prev.toLowerCase() === clean.toLowerCase() ? '' : clean,
    );
  }, []);

  const handleOpenNestedMod = useCallback(
    (modName: string, modTitle?: string) => {
      const cleanName = modName.trim();
      if (!cleanName) return;
      const existingInResults = searchResults.find(
        (r) => r.name.toLowerCase() === cleanName.toLowerCase(),
      );
      const nextSeed: ModPortalSearchItem = existingInResults || {
        name: cleanName,
        title: modTitle?.trim() || cleanName,
        summary: '',
        owner: '',
        downloads_count: 0,
        thumbnail: thumbMap[cleanName.toLowerCase()] || '',
        category: 'no-category',
        latest_version: '',
        factorio_version: selectedFv || serverFv || '',
        released_at: '',
      };
      setPreviewStack((prev) => {
        const top = prev[prev.length - 1];
        if (top && top.name.toLowerCase() === cleanName.toLowerCase()) {
          return prev;
        }
        const next = [...prev, nextSeed];
        return next.length > 10 ? next.slice(next.length - 10) : next;
      });
    },
    [searchResults, selectedFv, serverFv, thumbMap],
  );

  const handleForceRefresh = useCallback(() => {
    forceRefreshRef.current = true;
    requestedThumbsRef.current.clear();
    setRefreshNonce((n) => n + 1);
  }, []);

  const applyPortalVersions = mods.applyPortalVersions;

  useEffect(() => {
    if (!open || updatesModeRequest !== null) return;
    const ctrl = new AbortController();
    setSearchLoading(true);
    setSearchError('');

    const isRefresh = forceRefreshRef.current;
    forceRefreshRef.current = false;

    const qs = new URLSearchParams({
      q: debouncedQuery,
      page: String(page),
      limit: String(PAGE_SIZE),
      sort: sortBy,
      space_age: spaceAgeState,
      include_deprecated: includeDeprecated ? '1' : '0',
      only_bookmarked: onlyBookmarked ? '1' : '0',
      search_in_description: searchInDescription ? '1' : '0',
      hide_installed: hideInstalled ? '1' : '0',
      only_installed: onlyInstalled ? '1' : '0',
      only_updates: onlyUpdates ? '1' : '0',
    });
    if (ownerFilter) {
      qs.set('owner', ownerFilter);
    }
    if (isRefresh) {
      qs.set('refresh', '1');
    }
    if (selectedFv) {
      qs.set('version', selectedFv);
    }
    if (includeCatsCsv) {
      qs.set('include_categories', includeCatsCsv);
    }
    if (excludeCatsCsv) {
      qs.set('exclude_categories', excludeCatsCsv);
    }

    api<ModPortalSearchResponse>(`/api/mods/portal-search?${qs.toString()}`, {
      signal: ctrl.signal,
    })
      .then((res) => {
        if (ctrl.signal.aborted) return;
        if (res.ok === false) {
          setSearchError(
            localizeModError(String(res.error || 'fetch_failed'), undefined, t),
          );
          setSearchResults([]);
          setMatchedNames([]);
          setMatchedPortalVersions({});
          setSearchTotal(0);
          setTotalPages(1);
          return;
        }
        const nextResults = Array.isArray(res.results) ? res.results : [];
        setSearchResults(nextResults);
        setMatchedNames(Array.isArray(res.all_names) ? res.all_names : []);
        const pvMap: Record<string, string> = {};
        if (res.portal_versions) {
          for (const [k, v] of Object.entries(res.portal_versions)) {
            if (k && v) pvMap[k.toLowerCase()] = v;
          }
          applyPortalVersions(res.portal_versions);
        }
        for (const item of nextResults) {
          const k = item.name.toLowerCase();
          const tv = item.target_release_version || item.latest_version;
          if (k && tv && !pvMap[k]) pvMap[k] = tv;
        }
        setMatchedPortalVersions(pvMap);
        setSearchTotal(Number(res.total || 0));
        setTotalPages(Math.max(1, Number(res.total_pages || 1)));
        if (typeof res.page === 'number' && res.page !== page) {
          setPage(res.page);
        }
        if (res.facets) setFacets(res.facets);
        const srvVer =
          res.server_factorio_version || res.factorio_version || '';
        if (srvVer) {
          setServerFv(srvVer);
          setSelectedFv((prev) => prev || srvVer);
        }
        setHasCredentials(Boolean(res.has_credentials));
        if (typeof res.bookmarks_count === 'number') {
          setBookmarksCount(res.bookmarks_count);
        }
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const rawMsg = err instanceof Error ? err.message : String(err);
        setSearchError(localizeModError(rawMsg, undefined, t));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setSearchLoading(false);
      });

    return () => ctrl.abort();
  }, [
    open,
    updatesModeRequest,
    page,
    sortBy,
    selectedFv,
    spaceAgeState,
    includeCatsCsv,
    excludeCatsCsv,
    onlyBookmarked,
    searchInDescription,
    includeDeprecated,
    hideInstalled,
    onlyInstalled,
    onlyUpdates,
    updatesRefreshKey,
    ownerFilter,
    refreshNonce,
    debouncedQuery,
    mods.instanceId,
    applyPortalVersions,
    t,
  ]);

  useEffect(() => {
    if (!open || searchResults.length === 0) return;
    const missing: string[] = [];
    for (const item of searchResults) {
      const key = item.name.toLowerCase();
      if (item.thumbnail || requestedThumbsRef.current.has(key)) continue;
      requestedThumbsRef.current.add(key);
      missing.push(item.name);
    }
    if (missing.length === 0) return;

    const ctrl = new AbortController();
    api<ModPortalThumbnailsResponse>('/api/mods/portal-thumbnails', {
      method: 'POST',
      body: JSON.stringify({ names: missing }),
      signal: ctrl.signal,
    })
      .then((res) => {
        if (ctrl.signal.aborted || !res.thumbnails) return;
        const updates: Record<string, string> = {};
        let hasUpdates = false;
        for (const [modName, thumb] of Object.entries(res.thumbnails)) {
          if (thumb) {
            updates[modName.toLowerCase()] = thumb;
            hasUpdates = true;
          }
        }
        if (hasUpdates) {
          setThumbMap((prev) => ({ ...prev, ...updates }));
        }
      })
      .catch(() => {
        /* non-critical thumbnail enrichment */
      });

    return () => {
      ctrl.abort();
    };
  }, [open, searchResults]);

  if (!open) return null;

  const hasOverlayModal =
    mods.portalVersionsModalOpen ||
    mods.modJob.open ||
    Boolean(mods.fromSaveState);

  const changePage = (nextPage: number) => {
    const clamped = Math.max(1, Math.min(totalPages, nextPage));
    if (clamped === page) return;
    setPage(clamped);
    listRef.current?.scrollTo({
      top: 0,
      behavior: reduced ? 'auto' : 'smooth',
    });
  };

  const toggleCategoryInclude = (slug: string) => {
    setPage(1);
    setCategoryStates((prev) => {
      const cur = prev[slug] || 'neutral';
      return { ...prev, [slug]: cur === 'include' ? 'neutral' : 'include' };
    });
  };

  const toggleCategoryExclude = (slug: string) => {
    setPage(1);
    setCategoryStates((prev) => {
      const cur = prev[slug] || 'neutral';
      return { ...prev, [slug]: cur === 'exclude' ? 'neutral' : 'exclude' };
    });
  };

  const handleToggleBookmark = async (
    modName: string,
    currentlyBookmarked: boolean,
  ) => {
    if (!hasCredentials && !mods.portalUsername) {
      notifyWarn(t('mod_list_portal_credentials_missing'));
      return;
    }
    const key = modName.toLowerCase();
    if (bookmarkPending[key]) return;

    const nextState = !currentlyBookmarked;
    setBookmarkOverrides((prev) => ({ ...prev, [key]: nextState }));
    setBookmarkPending((prev) => ({ ...prev, [key]: true }));

    try {
      const res = await api<ModPortalBookmarkResponse>(
        '/api/mods/portal-bookmark',
        {
          method: 'POST',
          body: JSON.stringify({ mod: modName, bookmarked: nextState }),
        },
      );
      if (res.ok === false) {
        setBookmarkOverrides((prev) => ({
          ...prev,
          [key]: currentlyBookmarked,
        }));
        notifyErr(
          localizeModError(String(res.error || 'fetch_failed'), modName, t),
        );
        return;
      }
      if (typeof res.bookmarks_count === 'number') {
        setBookmarksCount(res.bookmarks_count);
      } else {
        setBookmarksCount((c) => Math.max(0, c + (nextState ? 1 : -1)));
      }
      if (!nextState && onlyBookmarked) {
        setSearchResults((prev) =>
          prev.filter((r) => r.name.toLowerCase() !== key),
        );
      }
    } catch (err: unknown) {
      setBookmarkOverrides((prev) => ({
        ...prev,
        [key]: currentlyBookmarked,
      }));
      const rawMsg = err instanceof Error ? err.message : String(err);
      notifyErr(localizeModError(rawMsg, modName, t));
    } finally {
      setBookmarkPending((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleArchiveFiles = (files: FileList | null) => {
    if (!files || files.length === 0 || mods.serverBusy) return;
    mods.closeInstallModal();
    void mods.uploadArchives(files);
  };

  const handleSaveFile = (file: File | undefined | null) => {
    if (!file || mods.serverBusy) return;
    mods.closeInstallModal();
    void mods.previewFromSave(file);
  };

  const hasFilePayload = (ev: DragEvent<HTMLElement>): boolean =>
    Array.from(ev.dataTransfer?.types || []).includes('Files');

  const handleShellDragEnter = (ev: DragEvent<HTMLDivElement>) => {
    if (mods.serverBusy || mods.blockUpdates || !hasFilePayload(ev)) return;
    ev.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  };

  const handleShellDragOver = (ev: DragEvent<HTMLDivElement>) => {
    if (mods.serverBusy || mods.blockUpdates || !hasFilePayload(ev)) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    if (!isDraggingFiles) setIsDraggingFiles(true);
  };

  const handleShellDragLeave = (ev: DragEvent<HTMLDivElement>) => {
    if (!hasFilePayload(ev)) return;
    ev.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFiles(false);
    }
  };

  const handleShellDrop = (ev: DragEvent<HTMLDivElement>) => {
    if (mods.serverBusy || mods.blockUpdates || !hasFilePayload(ev)) return;
    ev.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    handleArchiveFiles(ev.dataTransfer.files);
  };

  const sidebarMotionProps = reduced
    ? {}
    : {
        initial: { opacity: 0, x: -12 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -12 },
        transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const },
      };

  const canUseBookmarks =
    hasCredentials !== null ? hasCredentials : Boolean(mods.portalUsername);

  const previewKey = previewItem ? previewItem.name.toLowerCase() : '';
  const previewLocalVer = previewItem
    ? installedByName.get(previewKey) || previewItem.installed_version || ''
    : '';
  const previewTargetVer =
    previewItem?.target_release_version || previewItem?.latest_version || '';
  const previewHasUpdate =
    Boolean(previewItem) &&
    Boolean(previewLocalVer) &&
    Boolean(previewTargetVer) &&
    portalVersionNewer(previewTargetVer, previewLocalVer);
  const previewThumb = previewItem
    ? previewItem.thumbnail || thumbMap[previewKey] || ''
    : '';
  const previewIsBookmarked = previewItem
    ? previewKey in bookmarkOverrides
      ? bookmarkOverrides[previewKey]
      : Boolean(previewItem.bookmarked)
    : false;

  return (
    <ModalBackdrop
      open
      id="modsInstallModalBackdrop"
      onClose={() => {
        if (previewStack.length > 0) {
          setPreviewStack((prev) => prev.slice(0, -1));
          return;
        }
        mods.closeInstallModal();
      }}
      closeOnEscape={!hasOverlayModal}
      closeOnBackdropClick={!hasOverlayModal}
    >
      <div
        className="mod-install-shell"
        onDragEnter={handleShellDragEnter}
        onDragOver={handleShellDragOver}
        onDragLeave={handleShellDragLeave}
        onDrop={handleShellDrop}
        onClick={(ev) => {
          if (!hasOverlayModal && ev.target === ev.currentTarget) {
            mods.closeInstallModal();
          }
        }}
      >
        <AnimatePresence initial={false}>
          <motion.aside
            key="portal-sidebar"
            className="fu-modal mod-install-sidebar"
            aria-label={t('mod_portal_filter_categories')}
            {...sidebarMotionProps}
          >
            <div className="mod-install-sidebar__scroll">
              <section className="mod-install-sidebar__section">
                <h3 className="mod-install-sidebar__heading">
                  {t('mod_portal_filter_expansion')}
                </h3>
                <TriStateFilterRow
                  id="modFilterSpaceAge"
                  label={t('mod_portal_filter_space_age')}
                  count={facets.space_age || 0}
                  state={spaceAgeState}
                  excludeTip={t('mod_portal_filter_exclude_tip')}
                  badgeIcon
                  onToggleInclude={() => {
                    setPage(1);
                    setSpaceAgeState((s) =>
                      s === 'include' ? 'neutral' : 'include',
                    );
                  }}
                  onToggleExclude={() => {
                    setPage(1);
                    setSpaceAgeState((s) =>
                      s === 'exclude' ? 'neutral' : 'exclude',
                    );
                  }}
                />
              </section>

              <section className="mod-install-sidebar__section">
                <h3 className="mod-install-sidebar__heading">
                  {t('mod_portal_filter_categories')}
                </h3>
                <div className="mod-install-sidebar__list">
                  {PORTAL_CATEGORIES.map((cat) => (
                    <TriStateFilterRow
                      key={cat.slug}
                      id={`modFilterCat-${cat.slug}`}
                      label={t(cat.labelKey)}
                      count={facets.categories?.[cat.slug] || 0}
                      state={categoryStates[cat.slug] || 'neutral'}
                      excludeTip={t('mod_portal_filter_exclude_tip')}
                      onToggleInclude={() => toggleCategoryInclude(cat.slug)}
                      onToggleExclude={() => toggleCategoryExclude(cat.slug)}
                    />
                  ))}
                </div>
              </section>

              <section className="mod-install-sidebar__section">
                <h3 className="mod-install-sidebar__heading">
                  {t('mod_portal_filter_factorio_version')}
                </h3>
                <select
                  id="modFilterFactorioVersion"
                  className="input mod-install-sidebar__version-select"
                  value={selectedFv || serverFv || 'any'}
                  onChange={(e) => {
                    setPage(1);
                    setSelectedFv(e.target.value);
                  }}
                >
                  {versionOptions.map((ver) => (
                    <option key={ver} value={ver}>
                      {ver}
                    </option>
                  ))}
                  <option value="any">
                    {t('mod_portal_filter_version_all')}
                  </option>
                </select>
              </section>

              <section className="mod-install-sidebar__section mod-install-sidebar__section--flags">
                <label
                  className={
                    'mod-portal-filter-row__label mod-portal-filter-row__label--flag' +
                    (!canUseBookmarks ? ' is-disabled' : '')
                  }
                  htmlFor="modFilterOnlyBookmarked"
                  title={
                    !canUseBookmarks
                      ? t('mod_list_portal_credentials_missing')
                      : undefined
                  }
                >
                  <input
                    type="checkbox"
                    id="modFilterOnlyBookmarked"
                    className="mod-portal-filter-row__check"
                    checked={onlyBookmarked}
                    disabled={!canUseBookmarks}
                    onChange={(e) => {
                      setPage(1);
                      setOnlyBookmarked(e.target.checked);
                    }}
                  />
                  <span
                    className="mod-portal-filter-row__box"
                    aria-hidden="true"
                  >
                    {onlyBookmarked ? <AppIcon name="check" size={11} /> : null}
                  </span>
                  <span className="mod-portal-filter-row__text">
                    {t('mod_portal_filter_only_bookmarked')}
                  </span>
                  {canUseBookmarks ? (
                    <span className="mod-portal-filter-row__count">
                      {facets.bookmarked ?? bookmarksCount}
                    </span>
                  ) : null}
                </label>

                <label
                  className="mod-portal-filter-row__label mod-portal-filter-row__label--flag"
                  htmlFor="modFilterIncludeDeprecated"
                >
                  <input
                    type="checkbox"
                    id="modFilterIncludeDeprecated"
                    className="mod-portal-filter-row__check"
                    checked={includeDeprecated}
                    onChange={(e) => {
                      setPage(1);
                      setIncludeDeprecated(e.target.checked);
                    }}
                  />
                  <span
                    className="mod-portal-filter-row__box"
                    aria-hidden="true"
                  >
                    {includeDeprecated ? (
                      <AppIcon name="check" size={11} />
                    ) : null}
                  </span>
                  <span className="mod-portal-filter-row__text">
                    {t('mod_portal_filter_include_deprecated')}
                  </span>
                </label>

                <label
                  className="mod-portal-filter-row__label mod-portal-filter-row__label--flag"
                  htmlFor="modFilterHideInstalled"
                >
                  <input
                    type="checkbox"
                    id="modFilterHideInstalled"
                    className="mod-portal-filter-row__check"
                    checked={hideInstalled}
                    onChange={(e) => {
                      setPreviewStack([]);
                      setPage(1);
                      setHideInstalled(e.target.checked);
                      if (e.target.checked) {
                        setOnlyInstalled(false);
                        setOnlyUpdates(false);
                      }
                    }}
                  />
                  <span
                    className="mod-portal-filter-row__box"
                    aria-hidden="true"
                  >
                    {hideInstalled ? <AppIcon name="check" size={11} /> : null}
                  </span>
                  <span className="mod-portal-filter-row__text">
                    {t('mod_portal_filter_hide_installed')}
                  </span>
                </label>

                <label
                  className="mod-portal-filter-row__label mod-portal-filter-row__label--flag"
                  htmlFor="modFilterOnlyInstalled"
                >
                  <input
                    type="checkbox"
                    id="modFilterOnlyInstalled"
                    className="mod-portal-filter-row__check"
                    checked={onlyInstalled}
                    onChange={(e) => {
                      setPreviewStack([]);
                      setPage(1);
                      setOnlyInstalled(e.target.checked);
                      if (e.target.checked) {
                        setHideInstalled(false);
                        setOnlyUpdates(false);
                      }
                    }}
                  />
                  <span
                    className="mod-portal-filter-row__box"
                    aria-hidden="true"
                  >
                    {onlyInstalled ? <AppIcon name="check" size={11} /> : null}
                  </span>
                  <span className="mod-portal-filter-row__text">
                    {t('mod_portal_filter_only_installed')}
                  </span>
                </label>

                <label
                  className="mod-portal-filter-row__label mod-portal-filter-row__label--flag"
                  htmlFor="modFilterOnlyUpdates"
                >
                  <input
                    type="checkbox"
                    id="modFilterOnlyUpdates"
                    className="mod-portal-filter-row__check"
                    checked={onlyUpdates}
                    onChange={(e) => {
                      setPreviewStack([]);
                      setPage(1);
                      setSelectedUpdates(new Set());
                      setOnlyUpdates(e.target.checked);
                      if (e.target.checked) {
                        setHideInstalled(false);
                        setOnlyInstalled(false);
                      }
                    }}
                  />
                  <span
                    className="mod-portal-filter-row__box"
                    aria-hidden="true"
                  >
                    {onlyUpdates ? <AppIcon name="check" size={11} /> : null}
                  </span>
                  <span className="mod-portal-filter-row__text">
                    {t('mod_portal_filter_only_updates')}
                  </span>
                </label>
              </section>

              {hasCustomFilters ? (
                <button
                  type="button"
                  className="btn btn--with-icon mod-install-sidebar__reset"
                  onClick={resetFilters}
                >
                  <AppIcon name="reset" size={14} />
                  {t('mod_portal_filter_reset_btn')}
                </button>
              ) : null}

              <section className="mod-install-sidebar__section mod-install-sidebar__actions">
                <input
                  ref={archiveInputRef}
                  type="file"
                  accept=".zip,.dat,application/zip,application/octet-stream"
                  multiple
                  hidden
                  onChange={(e) => {
                    handleArchiveFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={saveInputRef}
                  type="file"
                  accept=".zip"
                  hidden
                  onChange={(e) => {
                    handleSaveFile(e.target.files?.[0] || null);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="btn btn--with-icon mod-install-sidebar__action-btn"
                  disabled={
                    mods.serverBusy || mods.blockUpdates || !canUseBookmarks
                  }
                  title={
                    !canUseBookmarks
                      ? t('mod_list_portal_credentials_missing')
                      : undefined
                  }
                  onClick={() => saveInputRef.current?.click()}
                >
                  <AppIcon name="save" size={15} />
                  <span>{t('mod_install_tab_save')}</span>
                </button>
                <div
                  className={
                    'mod-install-sidebar__upload-card' +
                    (isDraggingFiles ? ' is-dragover' : '')
                  }
                >
                  <button
                    type="button"
                    className="btn btn--with-icon mod-install-sidebar__action-btn"
                    disabled={mods.serverBusy || mods.blockUpdates}
                    onClick={() => archiveInputRef.current?.click()}
                  >
                    <AppIcon name="upload" size={15} />
                    <span>{t('mod_install_tab_archive')}</span>
                  </button>
                  <p className="mod-install-sidebar__upload-hint">
                    {t('mod_install_archive_sidebar_hint')}
                  </p>
                </div>
              </section>
            </div>
          </motion.aside>
        </AnimatePresence>

        <div
          className="fu-modal mod-install-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modsInstallModalHeading"
        >
          <div className="mod-install-dialog__header mod-install-dialog__header--compact">
            <div className="mod-install-dialog__header-left">
              <a
                href="https://mods.factorio.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="mod-install-dialog__portal-title-link"
                title={t('mod_list_portal_website_link')}
              >
                <span>{t('mod_install_tab_search')}</span>
                <AppIcon name="external_link" size={15} />
              </a>
              {canUseBookmarks && mods.portalUsername ? (
                <FactorioPortalUsername
                  username={mods.portalUsername}
                  source={mods.portalUsernameSource}
                  t={t}
                  className="mod-install-dialog__portal-user"
                />
              ) : (
                <button
                  type="button"
                  className="factorio-portal-username mod-install-dialog__portal-login-btn"
                  title={t('mod_list_portal_credentials_missing')}
                  onClick={() => {
                    mods.closeInstallModal();
                    goToProgramSettings('inpFactorioServiceUsername');
                  }}
                >
                  {t('mod_portal_login_badge')}
                </button>
              )}
            </div>
            <div className="mod-install-dialog__header-right">
              <button
                type="button"
                className="mod-install-dialog__close"
                aria-label={t('close')}
                title={t('close')}
                onClick={mods.closeInstallModal}
              >
                <AppIcon name="close" size={18} />
              </button>
            </div>
          </div>

          {mods.serverBusy ? (
            <div className="mod-install-dialog__busy-banner" role="status">
              <AppIcon name="warning" size={16} />
              <span>{t('mod_install_modal_server_busy_banner')}</span>
            </div>
          ) : null}

          <div className="fu-modal__body mod-install-dialog__body">
            {isDraggingFiles ? (
              <div className="mod-install-drop-overlay" aria-hidden="true">
                <div className="mod-install-drop-overlay__box">
                  <AppIcon name="upload" size={32} />
                  <span className="mod-install-drop-overlay__title">
                    {t('mod_portal_drop_title')}
                  </span>
                  <span className="mod-install-drop-overlay__sub">
                    {t('mod_portal_drop_subtitle')}
                  </span>
                </div>
              </div>
            ) : null}

            {previewItem ? (
              <ModPortalPreviewPane
                seedItem={previewItem}
                initialSubTab={
                  previewInitialTab?.name === previewKey
                    ? previewInitialTab.tab
                    : 'description'
                }
                instanceId={mods.instanceId || ''}
                thumbUrl={previewThumb}
                localVersion={previewLocalVer}
                hasUpdate={previewHasUpdate}
                isBookmarked={previewIsBookmarked}
                bookmarkBusy={Boolean(bookmarkPending[previewKey])}
                canUseBookmarks={canUseBookmarks}
                serverBusy={mods.serverBusy}
                blockUpdates={mods.blockUpdates}
                onBack={() => setPreviewStack((prev) => prev.slice(0, -1))}
                onOpenMod={handleOpenNestedMod}
                onSelectOwner={handleSelectOwner}
                onToggleBookmark={() =>
                  void handleToggleBookmark(
                    previewItem.name,
                    previewIsBookmarked,
                  )
                }
                onPickVersion={() => mods.openVersionPicker(previewItem.name)}
                onInstall={() => void mods.installFromUrl(previewItem.name)}
                t={t}
              />
            ) : (
              <div className="mod-install-pane mod-install-pane--search">
                <div className="mod-install-search__bar">
                  <SearchField
                    type="search"
                    id="modPortalSearchInput"
                    className="mod-install-search__input"
                    placeholder={t('mod_install_search_placeholder')}
                    autoComplete="off"
                    spellCheck={false}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {ownerFilter ? (
                    <button
                      type="button"
                      className="mod-install-search__owner-chip"
                      onClick={() => {
                        setPage(1);
                        setOwnerFilter('');
                      }}
                    >
                      <AppIcon name="users" size={13} />
                      <span>
                        {t('mod_portal_owner_chip_label', ownerFilter)}
                      </span>
                      <AppIcon name="close" size={12} />
                    </button>
                  ) : null}
                  <label
                    htmlFor="modPortalSearchInDesc"
                    className="mod-install-search__desc-check"
                  >
                    <input
                      type="checkbox"
                      id="modPortalSearchInDesc"
                      className="mod-portal-filter-row__check"
                      checked={searchInDescription}
                      onChange={(e) => {
                        setPage(1);
                        setSearchInDescription(e.target.checked);
                      }}
                    />
                    <span
                      className="mod-portal-filter-row__box"
                      aria-hidden="true"
                    >
                      {searchInDescription ? (
                        <AppIcon name="check" size={11} />
                      ) : null}
                    </span>
                    <span>{t('mod_portal_search_in_description')}</span>
                  </label>
                </div>

                <div className="mod-install-search__controls">
                  <div
                    className="mod-install-search__sorts"
                    role="group"
                    aria-label="Sort"
                  >
                    {PORTAL_SORT_OPTIONS.map((opt) => {
                      const active = sortBy === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={
                            'mod-install-search__sort-btn' +
                            (active ? ' is-active' : '')
                          }
                          aria-pressed={active}
                          onClick={() => {
                            if (sortBy !== opt.id) {
                              setPage(1);
                              setSortBy(opt.id);
                            }
                          }}
                        >
                          {t(opt.labelKey)}
                        </button>
                      );
                    })}
                  </div>

                  {onlyUpdates ? (
                    <div className="mod-install-search__bulk">
                      <button
                        type="button"
                        className="btn btn--with-icon mod-install-search__bulk-btn"
                        disabled={visibleMatchedNames.length === 0}
                        onClick={() =>
                          setSelectedUpdates(
                            allMatchedSelected
                              ? new Set()
                              : new Set(visibleMatchedNames),
                          )
                        }
                      >
                        <AppIcon
                          name={allMatchedSelected ? 'close' : 'check'}
                          size={14}
                        />
                        {allMatchedSelected
                          ? t('mod_portal_deselect_all_btn')
                          : t('mod_portal_select_all_btn')}
                      </button>
                      <button
                        type="button"
                        className="btn btn--with-icon mod-install-search__bulk-btn"
                        disabled={
                          selectedUpdates.size === 0 ||
                          mods.serverBusy ||
                          mods.blockUpdates
                        }
                        onClick={() => {
                          const names = Array.from(selectedUpdates);
                          void mods.updateMany(names);
                        }}
                      >
                        <AppIcon name="package_update" size={14} />
                        {t(
                          'mod_portal_update_selected_btn',
                          selectedUpdates.size,
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn btn--with-icon btn--update-available mod-install-search__bulk-btn"
                        disabled={
                          visibleMatchedNames.length === 0 ||
                          mods.serverBusy ||
                          mods.blockUpdates
                        }
                        onClick={() =>
                          void mods.updateMany(visibleMatchedNames)
                        }
                      >
                        <AppIcon name="package_update" size={14} />
                        {t(
                          'mod_portal_update_all_btn',
                          visibleMatchedNames.length,
                        )}
                      </button>
                    </div>
                  ) : null}

                  <div className="mod-install-search__total">
                    {searchLoading ? (
                      <span
                        className="spinner spinner--sm"
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="mod-install-search__total-text">
                      {t(
                        'mod_portal_total_mods',
                        displayTotal.toLocaleString(),
                      )}
                    </span>
                    <button
                      type="button"
                      className={
                        'mod-install-search__refresh-btn' +
                        (searchLoading ? ' is-spinning' : '')
                      }
                      title={t('mod_portal_refresh_catalog_tip')}
                      aria-label={t('mod_portal_refresh_catalog_tip')}
                      disabled={searchLoading}
                      onClick={handleForceRefresh}
                    >
                      <AppIcon name="refresh" size={14} />
                    </button>
                  </div>
                </div>

                {searchError ? (
                  <div className="mod-install-search__state mod-install-search__state--error">
                    <AppIcon name="warning" size={20} />
                    <span>{searchError}</span>
                  </div>
                ) : searchLoading && visibleSearchResults.length === 0 ? (
                  <div className="mod-install-search__list" aria-hidden="true">
                    {Array.from({ length: 6 }, (_, idx) => (
                      <div
                        key={idx}
                        className="mod-install-card mod-install-card--skeleton"
                      >
                        <div className="mod-install-card__thumb mod-install-card__skeleton-box" />
                        <div className="mod-install-card__main">
                          <div className="mod-install-card__skeleton-line mod-install-card__skeleton-line--title" />
                          <div className="mod-install-card__skeleton-line mod-install-card__skeleton-line--sub" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : visibleSearchResults.length === 0 ? (
                  <div className="mod-install-search__state">
                    <AppIcon
                      name={
                        onlyUpdates && !debouncedQuery && !ownerFilter
                          ? 'check'
                          : 'search'
                      }
                      size={22}
                    />
                    <span>
                      {onlyUpdates && !debouncedQuery && !ownerFilter
                        ? t('mod_portal_no_updates')
                        : t('mod_install_search_empty')}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="mod-install-search__list" ref={listRef}>
                      {visibleSearchResults.map((item) => {
                        const key = item.name.toLowerCase();
                        const localVer =
                          installedByName.get(key) ||
                          item.installed_version ||
                          '';
                        const targetVer =
                          item.target_release_version || item.latest_version;
                        const hasUpdate =
                          Boolean(localVer) &&
                          Boolean(targetVer) &&
                          portalVersionNewer(targetVer, localVer);
                        const portalModUrl = getModPortalUrl(item.name);
                        const resolvedThumb =
                          item.thumbnail || thumbMap[key] || '';
                        const isBookmarked =
                          key in bookmarkOverrides
                            ? bookmarkOverrides[key]
                            : Boolean(item.bookmarked);

                        return (
                          <div
                            key={item.name}
                            className={
                              'mod-install-card' +
                              (onlyUpdates && selectedUpdates.has(item.name)
                                ? ' is-selected'
                                : '')
                            }
                          >
                            {onlyUpdates ? (
                              <label
                                className="mod-install-card__select"
                                title={t('mod_portal_select_for_update')}
                              >
                                <input
                                  type="checkbox"
                                  className="mod-portal-filter-row__check"
                                  checked={selectedUpdates.has(item.name)}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setSelectedUpdates((prev) => {
                                      const next = new Set(prev);
                                      if (checked) next.add(item.name);
                                      else next.delete(item.name);
                                      return next;
                                    });
                                  }}
                                />
                                <span
                                  className="mod-portal-filter-row__box"
                                  aria-hidden="true"
                                >
                                  {selectedUpdates.has(item.name) ? (
                                    <AppIcon name="check" size={11} />
                                  ) : null}
                                </span>
                              </label>
                            ) : null}
                            <button
                              type="button"
                              className="mod-install-card__thumb-btn"
                              onClick={() => setPreviewStack([item])}
                              aria-label={item.title}
                            >
                              <ModThumb
                                thumbnail={resolvedThumb}
                                title={item.title}
                              />
                            </button>
                            <div className="mod-install-card__main">
                              <div className="mod-install-card__head">
                                <button
                                  type="button"
                                  className="mod-install-card__title mod-install-card__title--btn"
                                  title={item.title}
                                  onClick={() => setPreviewStack([item])}
                                >
                                  {item.title}
                                </button>
                                {targetVer ? (
                                  <span
                                    className="mod-install-card__id"
                                    title={
                                      item.latest_version &&
                                      item.latest_version !== targetVer
                                        ? `v${item.latest_version}`
                                        : undefined
                                    }
                                  >
                                    v{targetVer}
                                  </span>
                                ) : null}
                                {item.requires_space_age ? (
                                  <span className="mod-install-card__sa-pill">
                                    <img
                                      src={SPACE_AGE_LIST_ICON_URL}
                                      alt=""
                                      width={12}
                                      height={12}
                                      style={{
                                        display: 'block',
                                        objectFit: 'contain',
                                      }}
                                    />
                                    Space Age
                                  </span>
                                ) : null}
                                {localVer ? (
                                  <span
                                    className={
                                      'mod-install-card__badge' +
                                      (hasUpdate
                                        ? ' mod-install-card__badge--update'
                                        : ' mod-install-card__badge--installed')
                                    }
                                  >
                                    <AppIcon
                                      name={hasUpdate ? 'update' : 'check'}
                                      size={12}
                                    />
                                    {t(
                                      'mod_install_search_installed_badge',
                                      localVer,
                                    )}
                                  </span>
                                ) : null}
                              </div>
                              {item.summary ? (
                                <p
                                  className="mod-install-card__summary"
                                  title={item.summary}
                                >
                                  {item.summary}
                                </p>
                              ) : null}
                              <div className="mod-install-card__stats">
                                {item.owner ? (
                                  <button
                                    type="button"
                                    className={
                                      'mod-install-card__owner-btn' +
                                      (ownerFilter.toLowerCase() ===
                                      item.owner.toLowerCase()
                                        ? ' is-active'
                                        : '')
                                    }
                                    title={t(
                                      'mod_portal_filter_by_owner_tip',
                                      item.owner,
                                    )}
                                    onClick={() =>
                                      handleSelectOwner(item.owner)
                                    }
                                  >
                                    <AppIcon name="users" size={13} />
                                    <span>{item.owner}</span>
                                  </button>
                                ) : null}
                                <span className="mod-install-card__stat">
                                  <AppIcon name="download" size={13} />
                                  {formatCompactDownloads(item.downloads_count)}
                                </span>
                                {item.released_at ? (
                                  <span
                                    className="mod-install-card__stat"
                                    title={formatPanelDateOnly(
                                      item.released_at,
                                    )}
                                  >
                                    <AppIcon name="schedule" size={13} />
                                    {formatRelativeAge(item.released_at)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="mod-install-card__actions">
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
                                aria-label={
                                  isBookmarked
                                    ? t('mod_portal_bookmark_remove')
                                    : t('mod_portal_bookmark_add')
                                }
                                aria-pressed={isBookmarked}
                                disabled={
                                  !canUseBookmarks ||
                                  Boolean(bookmarkPending[key])
                                }
                                onClick={() =>
                                  void handleToggleBookmark(
                                    item.name,
                                    isBookmarked,
                                  )
                                }
                              >
                                <BookmarkIcon active={isBookmarked} />
                              </button>
                              {portalModUrl ? (
                                <a
                                  href={portalModUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn--toolbar-icon"
                                  title={t('mod_list_open_portal_btn')}
                                  aria-label={t('mod_list_open_portal_btn')}
                                >
                                  <AppIcon name="open_portal" size={15} />
                                </a>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn--toolbar-icon"
                                title={
                                  !canUseBookmarks
                                    ? t('mod_list_portal_credentials_missing')
                                    : t('mod_install_search_pick_version_btn')
                                }
                                aria-label={t(
                                  'mod_install_search_pick_version_btn',
                                )}
                                disabled={
                                  mods.serverBusy ||
                                  mods.blockUpdates ||
                                  !canUseBookmarks
                                }
                                onClick={() =>
                                  mods.openVersionPicker(item.name)
                                }
                              >
                                <AppIcon name="history" size={15} />
                              </button>
                              <button
                                type="button"
                                className={
                                  'btn btn--with-icon mod-install-card__install-btn' +
                                  (hasUpdate ? ' btn--update-available' : '') +
                                  (localVer && !hasUpdate
                                    ? ' is-installed'
                                    : '')
                                }
                                title={
                                  !canUseBookmarks
                                    ? t('mod_list_portal_credentials_missing')
                                    : undefined
                                }
                                disabled={
                                  (Boolean(localVer) && !hasUpdate) ||
                                  mods.serverBusy ||
                                  mods.blockUpdates ||
                                  !canUseBookmarks
                                }
                                onClick={() =>
                                  void mods.installFromUrl(item.name)
                                }
                              >
                                <AppIcon
                                  name={
                                    hasUpdate
                                      ? 'package_update'
                                      : localVer
                                        ? 'check'
                                        : 'download'
                                  }
                                  size={15}
                                />
                                {hasUpdate
                                  ? t('mod_install_search_update_btn')
                                  : localVer
                                    ? t('mod_install_search_installed_btn')
                                    : t('mod_install_search_install_btn')}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {totalPages > 1 ? (
                      <div className="mod-install-pagination">
                        <span className="mod-install-pagination__range">
                          {t(
                            'mod_portal_page_range',
                            ((page - 1) * PAGE_SIZE + 1).toLocaleString(),
                            Math.min(
                              page * PAGE_SIZE,
                              displayTotal,
                            ).toLocaleString(),
                            displayTotal.toLocaleString(),
                          )}
                        </span>
                        <div className="mod-install-pagination__buttons">
                          <button
                            type="button"
                            className="mod-install-pagination__btn"
                            disabled={page <= 1 || searchLoading}
                            title={t('mod_portal_page_prev')}
                            aria-label={t('mod_portal_page_prev')}
                            onClick={() => changePage(page - 1)}
                          >
                            ‹
                          </button>
                          {buildPageItems(page, totalPages).map((tok) =>
                            typeof tok === 'number' ? (
                              <button
                                key={tok}
                                type="button"
                                className={
                                  'mod-install-pagination__btn' +
                                  (tok === page ? ' is-active' : '')
                                }
                                aria-current={tok === page ? 'page' : undefined}
                                disabled={searchLoading}
                                onClick={() => changePage(tok)}
                              >
                                {tok}
                              </button>
                            ) : (
                              <span
                                key={tok}
                                className="mod-install-pagination__ellipsis"
                                aria-hidden="true"
                              >
                                …
                              </span>
                            ),
                          )}
                          <button
                            type="button"
                            className="mod-install-pagination__btn"
                            disabled={page >= totalPages || searchLoading}
                            title={t('mod_portal_page_next')}
                            aria-label={t('mod_portal_page_next')}
                            onClick={() => changePage(page + 1)}
                          >
                            ›
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}
