import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  IconWorld,
  IconPalette,
  IconNetwork,
  IconExternalLink,
  IconCopy,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconRefresh,
} from '@tabler/icons-react';
import type { InstanceItem } from '../../types/instance';
import type { useInstances } from '../../hooks/useInstances';
import type { useProgramSettings } from '../../hooks/useProgramSettings';
import { FccSwitch } from '../FccSwitch';
import { SearchField } from '../SearchField';
import { SectionHelpButton } from '../SectionHelpModal';
import { PUBLIC_HELP } from '../../lib/instanceHelpContent';
import { PublicServerEditModal } from './PublicServerEditModal';
import { PublicAppearanceModal } from './PublicAppearanceModal';
import { PublicNetworkModal } from './PublicNetworkModal';
import { PublicServerRowMenu } from './PublicServerRowMenu';
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
type PublicSortCol =
  | 'name'
  | 'status'
  | 'visibility'
  | 'address'
  | 'description';

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
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [isNetworkOpen, setIsNetworkOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuItem, setMenuItem] = useState<InstanceItem | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

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
      } else if (sortCol === 'status') {
        cmp = Number(a.status === 'running') - Number(b.status === 'running');
      } else if (sortCol === 'visibility') {
        cmp = (a.isPublic ? 1 : 0) - (b.isPublic ? 1 : 0);
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
        t('instances_tab_public') || 'Публичная страница',
        makePublic
          ? t('public_all_enabled_notify') ||
              'Все серверы отображаются на публичной странице'
          : t('public_all_disabled_notify') ||
              'Все серверы скрыты с публичной страницы',
      );
    } catch (e) {
      instancesApi.handleError(e);
    }
  };

  const handleSaveServer = async (
    item: InstanceItem,
    isPub: boolean,
    desc: string,
    addr: string,
  ) => {
    try {
      await api(`/api/instances/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          isPublic: isPub,
          publicDescription: desc,
          publicConnectionAddress: addr,
        }),
      });
      await instancesApi.reload();
      notifyOk(
        item.name || t('instances_tab_public') || 'Публичная страница',
        t('public_server_saved_notify') || 'Настройки сохранены',
      );
    } catch (e) {
      instancesApi.handleError(e);
    }
  };

  const onRowClick = (
    item: InstanceItem,
    target: HTMLElement,
    ev: React.MouseEvent,
  ) => {
    setSelectedServerId(item.id);
    const rect = target.getBoundingClientRect();
    setMenuItem(item);
    setMenuPos({
      x: ev.clientX || rect.left + rect.width / 2,
      y: ev.clientY || rect.bottom,
    });
    setMenuOpen(true);
  };

  return (
    <div
      id="instanceTabPublic"
      className="sub-tab-panel sub-tab-panel--active"
      role="tabpanel"
      aria-label={t('instances_tab_public') || 'Публичная страница'}
    >
      <div className="pub-tab-layout">
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

          {/* 4. Master page toggle */}
          <div className="pub-bar__master-toggle">
            <FccSwitch
              id="cbPublicPageEnabled"
              checked={isEnabled}
              onChange={(checked) => settings.setPublicPageEnabled(checked)}
              label=""
            />
            <label
              htmlFor="cbPublicPageEnabled"
              className="pub-bar__master-label"
            >
              <IconWorld size={15} />
              <span>
                {t('enable_public_page') || 'Включить публичную страницу'}
              </span>
            </label>
          </div>

          {/* 5. Quick URL badge */}
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

          {/* 6. Actions on the right */}
          <div className="access-users-bar__actions pub-bar__actions">
            {/* Appearance Modal Button */}
            <button
              type="button"
              id="btnPublicAppearance"
              className="btn access-users-bar__create-btn"
              onClick={() => setIsAppearanceOpen(true)}
              title={t('public_page_appearance_title') || 'Оформление страницы'}
            >
              <IconPalette size={17} />
              <span>
                {t('public_page_appearance_title') || 'Оформление страницы'}
              </span>
            </button>

            {/* Network Modal Button */}
            <button
              type="button"
              id="btnPublicNetwork"
              className="btn access-users-bar__create-btn"
              onClick={() => setIsNetworkOpen(true)}
              title={t('public_page_network_title') || 'Сеть'}
            >
              <IconNetwork size={17} />
              <span>{t('public_page_network_title') || 'Сеть'}</span>
            </button>

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
            <SectionHelpButton
              idPrefix="public"
              content={PUBLIC_HELP}
              label={t('public_help_btn')}
              t={t}
            />
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
                      {t('instances_col_name') || 'Имя'}
                    </th>
                    <th
                      className={`access-sort-th ${sortCol === 'status' ? 'access-sort-th--active' : ''} ${sortCol === 'status' && sortAsc ? 'access-sort-th--asc' : ''}`}
                      onClick={() => handleSort('status')}
                    >
                      {t('web_user_status_label') || 'Статус'}
                    </th>
                    <th
                      className={`access-sort-th ${sortCol === 'visibility' ? 'access-sort-th--active' : ''} ${sortCol === 'visibility' && sortAsc ? 'access-sort-th--asc' : ''}`}
                      onClick={() => handleSort('visibility')}
                    >
                      {t('visibility') || 'Видимость'}
                    </th>
                    <th
                      className={`access-sort-th ${sortCol === 'address' ? 'access-sort-th--active' : ''} ${sortCol === 'address' && sortAsc ? 'access-sort-th--asc' : ''}`}
                      onClick={() => handleSort('address')}
                    >
                      {t('connection_address') || 'IP-адрес для подключения'}
                    </th>
                    <th
                      className={`access-sort-th ${sortCol === 'description' ? 'access-sort-th--active' : ''} ${sortCol === 'description' && sortAsc ? 'access-sort-th--asc' : ''}`}
                      onClick={() => handleSort('description')}
                    >
                      {t('description') || 'Описание'}
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
                        onClick={(ev) => onRowClick(item, ev.currentTarget, ev)}
                        onContextMenu={(ev) => {
                          ev.preventDefault();
                          onRowClick(item, ev.currentTarget, ev);
                        }}
                        onDoubleClick={(ev) => {
                          ev.preventDefault();
                          setMenuOpen(false);
                          setEditingServer(item);
                        }}
                      >
                        {/* 1. Server Name (Only text, no icons or badges) */}
                        <td>
                          <span className="pub-server-name">{item.name}</span>
                        </td>

                        {/* 2. Status */}
                        <td>
                          <span className="pub-visibility-badge">
                            <span
                              className={
                                'instance-run-dot' +
                                (item.status === 'running'
                                  ? ' instance-run-dot--on'
                                  : '')
                              }
                            />
                            {item.status === 'running'
                              ? t('status_running') || 'Запущен'
                              : t('status_stopped') || 'Остановлен'}
                          </span>
                        </td>

                        {/* 2. Visibility */}
                        <td>
                          <span
                            className={`pub-visibility-badge ${isPublic ? 'pub-visibility-badge--on' : 'pub-visibility-badge--off'}`}
                            title={
                              isPublic
                                ? t('public_server_visible_tooltip') ||
                                  'Отображается на публичной странице'
                                : t('public_server_hidden_tooltip') ||
                                  'Скрыт с публичной страницы'
                            }
                          >
                            {isPublic ? (
                              <>
                                <IconEye size={14} />
                                <span>
                                  {t('public_server_status_public') ||
                                    t('server_settings_visibility_public') ||
                                    'Публичный'}
                                </span>
                              </>
                            ) : (
                              <>
                                <IconEyeOff size={14} />
                                <span>
                                  {t('public_server_status_hidden') ||
                                    'Скрытый'}
                                </span>
                              </>
                            )}
                          </span>
                        </td>

                        {/* 3. Connection Address */}
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

                        {/* 4. Description */}
                        <td className="pub-col-desc">
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
                      </motion.tr>
                    );
                  })}
                </motion.tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>

      {/* Public Appearance Modal */}
      <PublicAppearanceModal
        open={isAppearanceOpen}
        onClose={() => setIsAppearanceOpen(false)}
        settings={settings}
        t={t}
      />

      {/* Public Network & Contacts Modal */}
      <PublicNetworkModal
        open={isNetworkOpen}
        onClose={() => setIsNetworkOpen(false)}
        settings={settings}
        currentRoute={currentRoute}
        t={t}
      />

      {/* Public Server Edit Modal */}
      <PublicServerEditModal
        server={editingServer}
        onClose={() => setEditingServer(null)}
        onSave={handleSaveServer}
        t={t}
      />

      {/* Public Server Row Menu */}
      <PublicServerRowMenu
        open={menuOpen}
        item={menuItem}
        position={menuPos}
        onClose={closeMenu}
        onEdit={(it) => {
          setEditingServer(it);
        }}
        onTogglePublic={(it, makePub) => void handleToggleInstance(it, makePub)}
        onCopyAddress={(it) => {
          const addr =
            it.publicConnectionAddress ||
            (it.ip === '0.0.0.0'
              ? `Auto:${it.port || 34197}`
              : `${it.ip || '0.0.0.0'}:${it.port || 34197}`);
          void navigator.clipboard.writeText(addr).then(() => {
            notifyOk(
              it.name || t('instances_tab_public') || 'Публичная страница',
              t('address_copied') || 'Адрес скопирован',
            );
          });
        }}
        onOpenPublicPage={() => {
          window.open(currentRoute, '_blank');
        }}
        isPublicPageEnabled={isEnabled}
        t={t}
      />
    </div>
  );
}
