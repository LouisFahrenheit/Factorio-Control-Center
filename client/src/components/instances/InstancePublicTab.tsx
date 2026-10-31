import { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  IconWorld,
  IconPalette,
  IconNetwork,
  IconExternalLink,
  IconCopy,
  IconCheck,
  IconPencil,
  IconEye,
  IconEyeOff,
  IconDownload,
  IconUsers,
  IconBrandDiscord,
  IconBrandTelegram,
  IconBrandGithub,
  IconRefresh,
} from '@tabler/icons-react';
import type { InstanceItem } from '../../types/instance';
import type { useInstances } from '../../hooks/useInstances';
import type { useProgramSettings } from '../../hooks/useProgramSettings';
import { FCC_THEMES } from '../../theme/themes';
import { FccSwitch } from '../FccSwitch';
import { SearchField } from '../SearchField';
import { InstanceListBadges } from './InstanceListBadges';
import { PublicServerEditModal } from './PublicServerEditModal';
import { useServerListIconsProbe } from '../../lib/serverListIcons';
import { useUserShowServerListModBadges } from '../../hooks/useUserShowServerListModBadges';
import { useUserShowServerListSpaceAgeBadge } from '../../hooks/useUserShowServerListSpaceAgeBadge';
import {
  LIST_CONTAINER_VARIANTS,
  LIST_ROW_VARIANTS,
  listWrapVariants,
} from '../../lib/motionPresets';
import { webEffectsReduced } from '../../theme/webEffects';
import { notifyOk } from '../../lib/notify';
import { api } from '../../api/client';

interface InstancePublicTabProps {
  instances: InstanceItem[];
  instancesApi: ReturnType<typeof useInstances>;
  settings: ReturnType<typeof useProgramSettings>;
  t: (key: string, ...args: (string | number)[]) => string;
}

type ServerFilterType = 'all' | 'public' | 'hidden';
type PublicSortCol = 'name' | 'address' | 'description';

function getContactLinkIcon(url: string) {
  const norm = url.toLowerCase();
  if (norm.includes('discord')) return <IconBrandDiscord size={18} />;
  if (norm.includes('t.me') || norm.includes('telegram'))
    return <IconBrandTelegram size={18} />;
  if (norm.includes('github')) return <IconBrandGithub size={18} />;
  return <IconWorld size={18} />;
}

/* ─── Settings Popover ────────────────────────────────────────────────── */

interface PublicSettingsPanelProps {
  settings: ReturnType<typeof useProgramSettings>;
  t: (key: string, ...args: (string | number)[]) => string;
  currentRoute: string;
}

function PublicSettingsPanel({
  settings,
  t,
  currentRoute,
}: PublicSettingsPanelProps) {
  const handleRouteSave = (route: string) => {
    settings.setPublicPageRoute(route || '/servers');
  };

  return (
    <aside
      className="pub-settings-sidebar"
      aria-label={t('public_page_settings') || 'Настройки публичной страницы'}
    >
      {/* ── Card 1: Appearance ── */}
      <div className="pub-settings-card">
        <div className="pub-settings-card__header">
          <IconPalette size={15} />
          <span>{t('public_page_appearance_title') || 'Оформление'}</span>
        </div>

        <div className="pub-settings-card__body">
          <div className="pub-settings-field">
            <label
              htmlFor="selPublicTheme"
              className="pub-settings-field__label"
            >
              {t('public_page_theme') || 'Тема страницы'}
            </label>
            <select
              id="selPublicTheme"
              className="input"
              value={settings.settings.public_page_theme || ''}
              onChange={(e) => settings.setPublicPageTheme(e.target.value)}
            >
              <option value="">
                {t('theme_default') || 'Как в панели (По умолчанию)'}
              </option>
              {FCC_THEMES.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {t('ui_theme_' + theme.id) || theme.label}
                </option>
              ))}
            </select>
          </div>


          <div className="pub-settings-option">
            <FccSwitch
              id="pub-hide-title"
              checked={settings.settings.public_page_hide_title === true}
              onChange={(checked) => settings.setPublicPageHideTitle(checked)}
              label={
                <span className="pub-settings-option__label-inner">
                  {settings.settings.public_page_hide_title ? (
                    <IconEyeOff size={15} />
                  ) : (
                    <IconEye size={15} />
                  )}
                  <span>
                    {t('public_page_hide_title') || 'Скрыть заголовок'}
                  </span>
                </span>
              }
              labelClassName="pub-settings-option__label"
            />
          </div>

          <div className="pub-settings-option">
            <FccSwitch
              id="pub-hide-subtitle"
              checked={settings.settings.public_page_hide_subtitle === true}
              onChange={(checked) =>
                settings.setPublicPageHideSubtitle(checked)
              }
              label={
                <span className="pub-settings-option__label-inner">
                  {settings.settings.public_page_hide_subtitle ? (
                    <IconEyeOff size={15} />
                  ) : (
                    <IconEye size={15} />
                  )}
                  <span>
                    {t('public_page_hide_subtitle') || 'Скрыть подзаголовок'}
                  </span>
                </span>
              }
              labelClassName="pub-settings-option__label"
            />
          </div>

          {!settings.settings.public_page_hide_title && (
            <div className="pub-settings-field">
              <label
                htmlFor="txtPublicTitle"
                className="pub-settings-field__label"
              >
                {t('public_page_title') || 'Заголовок страницы'}
              </label>
              <input
                id="txtPublicTitle"
                type="text"
                className="input"
                defaultValue={settings.settings.public_page_title || ''}
                placeholder={
                  t('public_servers_page_title') || 'Серверы Factorio'
                }
                onBlur={(e) => settings.setPublicPageTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')
                    settings.setPublicPageTitle(e.currentTarget.value);
                }}
              />
            </div>
          )}

          {!settings.settings.public_page_hide_subtitle && (
            <div className="pub-settings-field">
              <label
                htmlFor="txtPublicSubtitle"
                className="pub-settings-field__label"
              >
                {t('public_page_subtitle') || 'Подзаголовок страницы'}
              </label>
              <textarea
                id="txtPublicSubtitle"
                className="input"
                rows={2}
                defaultValue={settings.settings.public_page_subtitle || ''}
                placeholder={
                  t('public_servers_page_desc') ||
                  'Выберите сервер, чтобы просмотреть подробности или подключиться.'
                }
                onBlur={(e) => settings.setPublicPageSubtitle(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Card 2: Network & Contacts ── */}
      <div className="pub-settings-card">
        <div className="pub-settings-card__header">
          <IconNetwork size={15} />
          <span>{t('public_page_network_title') || 'Сеть и контакты'}</span>
        </div>

        <div className="pub-settings-card__body">
          <div className="pub-settings-field">
            <label
              htmlFor="txtPublicRoute"
              className="pub-settings-field__label"
            >
              {t('public_page_route') || 'Маршрут страницы (URL path)'}
            </label>
            <input
              id="txtPublicRoute"
              type="text"
              className="input"
              defaultValue={currentRoute}
              onBlur={(e) => handleRouteSave(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRouteSave(e.currentTarget.value);
              }}
              placeholder="/servers"
            />
            <span className="pub-settings-field__hint">
              {t('public_page_route_hint') ||
                'Относительный путь (например: /servers или /public)'}
            </span>
          </div>
          <div className="pub-settings-field">
            <label
              htmlFor="txtPublicHost"
              className="pub-settings-field__label"
            >
              {t('default_connection_address') ||
                'Общий IP-адрес для подключения'}
            </label>
            <input
              id="txtPublicHost"
              type="text"
              className="input"
              defaultValue={settings.settings.public_host || ''}
              placeholder={t('auto') || 'Авто (Hostname)'}
              onBlur={(e) => settings.setPublicHost(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter')
                  settings.setPublicHost(e.currentTarget.value);
              }}
            />
            <span className="pub-settings-field__hint">
              {t('default_connection_address_desc') ||
                'Используется, если локальный IP сервера 0.0.0.0. Оставьте пустым для автоопределения.'}
            </span>
          </div>

          <div className="pub-settings-field">
            <label
              htmlFor="txtPublicContactLink"
              className="pub-settings-field__label"
            >
              {t('public_page_contact_link') ||
                'Ссылка на сообщество / контакты'}
            </label>
            <div className="public-input-with-icon">
              <span className="public-input-icon">
                {getContactLinkIcon(
                  settings.settings.public_page_contact_link || '',
                )}
              </span>
              <input
                id="txtPublicContactLink"
                type="text"
                className="input"
                defaultValue={settings.settings.public_page_contact_link || ''}
                placeholder="https://discord.gg/... или https://t.me/..."
                onBlur={(e) =>
                  settings.setPublicPageContactLink(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter')
                    settings.setPublicPageContactLink(e.currentTarget.value);
                }}
              />
            </div>
            <span className="pub-settings-field__hint">
              {t('public_page_contact_link_desc') ||
                'Discord, Telegram или сайт сообщества в шапке публичной страницы.'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ─── Main Tab Component ──────────────────────────────────────────────── */

export function InstancePublicTab({
  instances,
  instancesApi,
  settings,
  t,
}: InstancePublicTabProps) {
  const [filter, setFilter] = useState<ServerFilterType>('all');
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<PublicSortCol>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [editingServer, setEditingServer] = useState<InstanceItem | null>(null);
  const [copied, setCopied] = useState(false);

  const { ready: listIconsReady, isAvailable: isListIconAvailable } =
    useServerListIconsProbe();
  const showModBadges = useUserShowServerListModBadges();
  const showSABadge = useUserShowServerListSpaceAgeBadge();
  const reduced = webEffectsReduced();
  const wrapVariants = reduced ? undefined : listWrapVariants(0);
  const [isEntering, setIsEntering] = useState(!reduced);

  useEffect(() => {
    if (reduced) return;
    if (instancesApi.loading) {
      setIsEntering(true);
      return;
    }
    const timer = window.setTimeout(() => {
      setIsEntering(false);
    }, 750);
    return () => window.clearTimeout(timer);
  }, [filter, search, instancesApi.loading, reduced]);

  const isEnabled = Boolean(settings.settings.public_page_enabled);
  const currentRoute = settings.settings.public_page_route || '/servers';
  const fullPublicUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${currentRoute}`
      : currentRoute;

  const publicCount = useMemo(
    () => instances.filter((it) => it.isPublic).length,
    [instances],
  );
  const hiddenCount = instances.length - publicCount;

  const handleSort = (col: PublicSortCol) => {
    if (sortCol === col) {
      setSortAsc((prev) => !prev);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  const filteredInstances = useMemo(() => {
    let list = instances;
    if (filter === 'public') {
      list = list.filter((it) => Boolean(it.isPublic));
    } else if (filter === 'hidden') {
      list = list.filter((it) => !it.isPublic);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((it) => {
        const name = String(it.name || '').toLowerCase();
        const desc = String(it.publicDescription || '').toLowerCase();
        const addr = String(it.publicConnectionAddress || '').toLowerCase();
        return name.includes(q) || desc.includes(q) || addr.includes(q);
      });
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'name') {
        cmp = String(a.name || '').localeCompare(
          String(b.name || ''),
          undefined,
          {
            numeric: true,
            sensitivity: 'base',
          },
        );
      } else if (sortCol === 'address') {
        const addrA =
          a.publicConnectionAddress ||
          (a.ip === '0.0.0.0'
            ? `Auto:${a.port || 34197}`
            : `${a.ip || '0.0.0.0'}:${a.port || 34197}`);
        const addrB =
          b.publicConnectionAddress ||
          (b.ip === '0.0.0.0'
            ? `Auto:${b.port || 34197}`
            : `${b.ip || '0.0.0.0'}:${b.port || 34197}`);
        cmp = addrA.localeCompare(addrB, undefined, { numeric: true });
      } else if (sortCol === 'description') {
        cmp = String(a.publicDescription || '').localeCompare(
          String(b.publicDescription || ''),
        );
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [instances, filter, search, sortCol, sortAsc]);

  const handleCopyUrl = () => {
    void navigator.clipboard.writeText(fullPublicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleToggleInstance = async (item: InstanceItem, checked: boolean) => {
    try {
      await api(`/api/instances/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ isPublic: checked }),
      });
      await instancesApi.reload();
    } catch (e) {
      instancesApi.handleError(e);
    }
  };

  const handleToggleAll = async (makePublic: boolean) => {
    try {
      await Promise.all(
        instances.map((item) => {
          if (Boolean(item.isPublic) === makePublic) return Promise.resolve();
          return api(`/api/instances/${encodeURIComponent(item.id)}`, {
            method: 'PUT',
            body: JSON.stringify({ isPublic: makePublic }),
          });
        }),
      );
      await instancesApi.reload();
      notifyOk(
        t('updated_successfully') || 'Обновлено',
        makePublic
          ? t('public_all_enabled_msg') ||
              'Все серверы теперь отображаются на публичной странице'
          : t('public_all_disabled_msg') ||
              'Все серверы скрыты с публичной страницы',
      );
    } catch (e) {
      instancesApi.handleError(e);
    }
  };

  const handleSaveServer = async (
    item: InstanceItem,
    isPublic: boolean,
    description: string,
    address: string,
  ) => {
    try {
      await api(`/api/instances/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          isPublic,
          publicDescription: description,
          publicConnectionAddress: address,
        }),
      });
      await instancesApi.reload();
      notifyOk(t('updated_successfully') || 'Настройки сохранены');
    } catch (e) {
      instancesApi.handleError(e);
      throw e;
    }
  };

  return (
    <div
      id="instanceTabPublic"
      className="sub-tab-panel sub-tab-panel--active"
      role="tabpanel"
      aria-label={t('instances_tab_public') || 'Публичная страница'}
    >
      <div className="access-layout pub-tab-layout">
        {/* 30% Left: Settings Panel */}
        <PublicSettingsPanel
          settings={settings}
          t={t}
          currentRoute={currentRoute}
        />

        {/* 70% Right: Servers Panel */}
        <div className="pub-servers-panel">
          {/* Main Toolbar */}
          <div
            className="access-users-bar pub-bar"
            role="toolbar"
            aria-label={t('instances_tab_public') || 'Публичная страница'}
          >
            {/* 1. Search */}
            <SearchField
              type="search"
              id="publicServersSearch"
              className="access-users-bar__search"
              placeholder={t('search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />

            {/* 2. Filter select (matching other FCC screens) */}
            <div className="access-users-bar__filters">
              <select
                id="publicServersVisibilityFilter"
                className="input access-users-bar__select"
                value={filter}
                onChange={(e) => setFilter(e.target.value as ServerFilterType)}
                aria-label={t('visibility') || 'Видимость'}
              >
                <option value="all">
                  {t('filter_all') || 'Все'} ({instances.length})
                </option>
                <option value="public">
                  {t('filter_public') || 'Публичные'} ({publicCount})
                </option>
                <option value="hidden">
                  {t('filter_hidden') || 'Скрытые'} ({hiddenCount})
                </option>
              </select>
            </div>

            {/* 3. Refresh button */}
            <button
              type="button"
              className="btn access-users-bar__refresh-btn"
              id="btnPublicRefresh"
              title={t('update_list_btn') || 'Обновить'}
              aria-label={t('update_list_btn') || 'Обновить'}
              onClick={() => {
                setSearch('');
                void instancesApi.reload();
              }}
            >
              <IconRefresh size={18} />
            </button>

            {/* 4. Actions on the right */}
            <div className="access-users-bar__actions pub-bar__actions">
              {/* Show all / Hide all buttons */}
              <button
                type="button"
                id="btnPublicEnableAll"
                className="btn access-users-bar__create-btn"
                onClick={() => void handleToggleAll(true)}
                title={
                  t('public_enable_all_hint') ||
                  'Показать все серверы на публичной странице'
                }
              >
                <IconEye size={17} />
                <span>{t('public_enable_all_btn') || 'Показать все'}</span>
              </button>
              <button
                type="button"
                id="btnPublicDisableAll"
                className="btn access-users-bar__create-btn"
                onClick={() => void handleToggleAll(false)}
                title={
                  t('public_disable_all_hint') ||
                  'Скрыть все серверы с публичной страницы'
                }
              >
                <IconEyeOff size={17} />
                <span>{t('public_disable_all_btn') || 'Скрыть все'}</span>
              </button>
            </div>
          </div>

          {/* ═══ Options strip (inline switches directly above table) ═══ */}
          <div className="pub-options-strip">
            {/* Master page toggle */}
            <div className="pub-options-strip__item pub-options-strip__item--master">
              <FccSwitch
                id="cbPublicPageEnabled"
                checked={isEnabled}
                onChange={(checked) => settings.setPublicPageEnabled(checked)}
                label=""
              />
              <label
                htmlFor="cbPublicPageEnabled"
                className="pub-options-strip__label pub-options-strip__label--master"
              >
                <IconWorld size={15} />
                <span>
                  {t('enable_public_page') || 'Включить публичную страницу'}
                </span>
              </label>
            </div>

            {/* Quick URL badge */}
            <div
              className={`pub-bar__url ${!isEnabled ? 'pub-bar__url--disabled' : ''}`}
            >
              <span className="pub-bar__url-text" title={fullPublicUrl}>
                {fullPublicUrl}
              </span>
              <button
                type="button"
                className="pub-bar__url-btn"
                onClick={handleCopyUrl}
                title={t('copy_url') || 'Скопировать ссылку'}
                aria-label={t('copy_url') || 'Скопировать ссылку'}
                disabled={!isEnabled}
              >
                {copied ? (
                  <IconCheck size={14} color="var(--online-green, #40c057)" />
                ) : (
                  <IconCopy size={14} />
                )}
              </button>
              <a
                href={currentRoute}
                target="_blank"
                rel="noopener noreferrer"
                className={`pub-bar__url-btn ${!isEnabled ? 'pub-bar__url-btn--disabled' : ''}`}
                title={t('open_public_page') || 'Открыть'}
                aria-label={t('open_public_page') || 'Открыть'}
                tabIndex={!isEnabled ? -1 : undefined}
                onClick={(e) => {
                  if (!isEnabled) e.preventDefault();
                }}
              >
                <IconExternalLink size={14} />
              </a>
            </div>

            <div className="pub-options-strip__divider" />

            <div className="pub-options-strip__item">
              <FccSwitch
                id="cbPublicPageAllowModDownloads"
                checked={Boolean(
                  settings.settings.public_page_allow_mod_downloads,
                )}
                onChange={(checked) =>
                  settings.setPublicPageAllowModDownloads(checked)
                }
                label=""
              />
              <label
                htmlFor="cbPublicPageAllowModDownloads"
                className="pub-options-strip__label"
              >
                <IconDownload size={14} />
                <span>
                  {t('public_page_allow_mod_downloads') || 'Скачивание модов'}
                </span>
              </label>
            </div>

            <div className="pub-options-strip__item">
              <FccSwitch
                id="cbPublicPageShowPlayers"
                checked={Boolean(settings.settings.public_page_show_players)}
                onChange={(checked) =>
                  settings.setPublicPageShowPlayers(checked)
                }
                label=""
              />
              <label
                htmlFor="cbPublicPageShowPlayers"
                className="pub-options-strip__label"
              >
                <IconUsers size={14} />
                <span>
                  {t('public_page_show_players') || 'Показывать список игроков'}
                </span>
              </label>
            </div>
          </div>

          {/* ═══ Table ═══ */}
          <motion.div
            className={`table-wrap table-wrap--motion-list pub-tab__table-wrap ${
              isEntering || instancesApi.loading
                ? 'pub-tab__table-wrap--entering'
                : ''
            }`}
            variants={wrapVariants}
            initial={reduced ? false : 'hidden'}
            animate={reduced ? undefined : 'show'}
            key={`${filter}_${search ? 's' : 'a'}`}
          >
            {filteredInstances.length === 0 ? (
              <div className="public-empty-state">
                <p className="public-empty-state__title">
                  {search
                    ? t('search_no_results') || 'Серверы не найдены'
                    : t('no_servers') || 'Нет серверов в выбранной категории'}
                </p>
                {search && (
                  <button
                    type="button"
                    className="btn btn--compact"
                    onClick={() => setSearch('')}
                  >
                    {t('clear_search_btn') || 'Сбросить поиск'}
                  </button>
                )}
              </div>
            ) : (
              <div className="pub-servers-table-container">
                <table className="data access-users-table" id="tblPublicServers">
                <thead>
                  <tr>
                    <th
                      className={`access-sort-th ${sortCol === 'name' ? 'access-sort-th--active' : ''} ${sortCol === 'name' && sortAsc ? 'access-sort-th--asc' : ''}`}
                      onClick={() => handleSort('name')}
                    >
                      {t('server_name') || 'Сервер'}
                    </th>
                    <th
                      className={`access-sort-th ${sortCol === 'address' ? 'access-sort-th--active' : ''} ${sortCol === 'address' && sortAsc ? 'access-sort-th--asc' : ''}`}
                      onClick={() => handleSort('address')}
                    >
                      {t('connection_address') || 'Адрес'}
                    </th>
                    <th
                      className={`access-sort-th ${sortCol === 'description' ? 'access-sort-th--active' : ''} ${sortCol === 'description' && sortAsc ? 'access-sort-th--asc' : ''}`}
                      onClick={() => handleSort('description')}
                    >
                      {t('description') || 'Описание'}
                    </th>
                    <th
                      className="access-sort-th pub-col-actions"
                      style={{ textAlign: 'right', width: 125 }}
                    >
                      {t('actions') || 'Действия'}
                    </th>
                  </tr>
                </thead>
                <motion.tbody
                  id="tblPublicServersBody"
                  variants={reduced ? undefined : LIST_CONTAINER_VARIANTS}
                  initial={reduced ? false : 'hidden'}
                  animate={reduced ? undefined : 'show'}
                >
                  {filteredInstances.map((item) => {
                    const isPublic = Boolean(item.isPublic);
                    const isRunning = item.status === 'running';
                    const effectiveAddr =
                      item.publicConnectionAddress ||
                      (item.ip === '0.0.0.0'
                        ? `Auto:${item.port || 34197}`
                        : `${item.ip || '0.0.0.0'}:${item.port || 34197}`);
                    const isAutoAddr = !item.publicConnectionAddress;
                    const isSelected = selectedServerId === item.id;

                    return (
                      <motion.tr
                        key={item.id}
                        className={`access-users-row ${isSelected ? 'access-users-row--selected' : ''} ${!isPublic ? 'pub-row--hidden' : ''}`}
                        variants={reduced ? undefined : LIST_ROW_VARIANTS}
                        onClick={() => setSelectedServerId(item.id)}
                        onDoubleClick={(ev) => {
                          ev.preventDefault();
                          setEditingServer(item);
                        }}
                      >
                        {/* 1. Server Name & Badges */}
                        <td>
                          <div className="pub-server-cell">
                            {isRunning && (
                              <span
                                className="instance-run-dot instance-run-dot--on"
                                title={t('server_status_running') || 'Запущен'}
                              />
                            )}
                            <span className="pub-server-name">
                              {item.name}
                              <InstanceListBadges
                                hasSpaceAge={item.hasSpaceAge}
                                modBadges={item.modBadges}
                                showModBadges={showModBadges}
                                showSpaceAgeBadge={showSABadge}
                                iconsReady={listIconsReady}
                                isIconAvailable={isListIconAvailable}
                                t={t}
                              />
                            </span>
                          </div>
                        </td>

                        {/* 2. Connection Address */}
                        <td>
                          <span
                            className={`pub-address-badge ${isAutoAddr ? 'pub-address-badge--auto' : ''}`}
                            title={
                              isAutoAddr
                                ? t('public_addr_auto_tooltip') ||
                                  'Адрес определяется автоматически'
                                : t('public_addr_custom_tooltip') ||
                                  'Задан статический адрес'
                            }
                          >
                            {effectiveAddr}
                          </span>
                        </td>

                        {/* 3. Description */}
                        <td>
                          {item.publicDescription ? (
                            <span
                              className="pub-desc-text"
                              title={item.publicDescription}
                            >
                              {item.publicDescription}
                            </span>
                          ) : (
                            <span className="pub-desc-text pub-desc-text--empty">
                              {t('no_description') || 'Нет описания'}
                            </span>
                          )}
                        </td>

                        {/* 4. Actions */}
                        <td
                          className="pub-col-actions"
                          style={{ textAlign: 'right' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="pub-table-actions">
                            <FccSwitch
                              id={`toggle_public_${item.id}`}
                              checked={isPublic}
                              onChange={(checked) =>
                                void handleToggleInstance(item, checked)
                              }
                              label={
                                <span
                                  className="pub-table-action-vis-icon"
                                  title={
                                    isPublic
                                      ? t('public_server_visible_tooltip') ||
                                        'Отображается на публичной странице'
                                      : t('public_server_hidden_tooltip') ||
                                        'Скрыт с публичной страницы'
                                  }
                                >
                                  {isPublic ? (
                                    <IconEye size={16} />
                                  ) : (
                                    <IconEyeOff size={16} />
                                  )}
                                </span>
                              }
                              labelClassName="pub-table-visibility-label"
                              title={
                                isPublic
                                  ? t('public_server_visible_tooltip') ||
                                    'Отображается на публичной странице'
                                  : t('public_server_hidden_tooltip') ||
                                    'Скрыт с публичной страницы'
                              }
                            />
                            <button
                              type="button"
                              id={`btnEditPublic_${item.id}`}
                              className="btn btn--toolbar-icon pub-table-action-btn"
                              onClick={() => setEditingServer(item)}
                              title={t('edit_btn') || 'Редактировать'}
                              aria-label={t('edit_btn') || 'Редактировать'}
                            >
                              <IconPencil size={15} />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </motion.tbody>
              </table>
            </div>
          )}
        </motion.div>
        </div>
      </div>

      {/* Public Server Edit Modal */}
      <PublicServerEditModal
        server={editingServer}
        onClose={() => setEditingServer(null)}
        onSave={handleSaveServer}
        t={t}
      />
    </div>
  );
}
