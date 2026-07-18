import type { WebAccessInstance, WebUserRole } from '../types/webUser';
import type { AppIconName } from './appIcons';
import { ALL_TABS, ENGINEER_TABS, MODERATOR_TABS, WEB_USER_TAB_I18N } from '@fcc/shared/fcc-tabs';

export { ALL_TABS, ENGINEER_TABS, MODERATOR_TABS } from '@fcc/shared/fcc-tabs';

export const ADMIN_TABS = new Set(ALL_TABS);

/** Configurable panel permissions (flat list). */
export const WEB_USER_TABS: { value: string; i18n: string }[] = ALL_TABS.map((value) => ({
  value,
  i18n: WEB_USER_TAB_I18N[value],
}));

const TAB_I18N = Object.fromEntries(WEB_USER_TABS.map((tab) => [tab.value, tab.i18n]));
const TAB_ORDER = WEB_USER_TABS.map((tab) => tab.value);

export function normalizeUserTabs(tabs: string[]): string[] {
  const set = new Set(tabs.filter(Boolean));
  return Array.from(set);
}

const ROLE_I18N: Record<string, string> = {
  administrator: 'web_role_administrator',
  server_engineer: 'web_role_server_engineer',
  moderator: 'web_role_moderator',
};

function sortedNormalizedTabs(tabs: string[] | undefined): string[] {
  const normalized = normalizeUserTabs(Array.isArray(tabs) ? tabs : []);
  return normalized.slice().sort((a, b) => {
    const ia = TAB_ORDER.indexOf(a);
    const ib = TAB_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function tabLabel(tab: string, t: (key: string) => string): string {
  const key = TAB_I18N[tab];
  if (!key) return tab;
  const loc = t(key);
  return loc === key ? tab : loc;
}

export function listUserTabLabels(tabs: string[] | undefined, t: (key: string) => string): string[] {
  return sortedNormalizedTabs(tabs).map((tab) => tabLabel(tab, t));
}

export function formatUserTabs(tabs: string[] | undefined, t: (key: string) => string): string {
  return listUserTabLabels(tabs, t).join(', ');
}

function sortedInstanceIds(instanceIds: string[] | undefined): string[] {
  return Array.isArray(instanceIds) ? instanceIds.map((x) => String(x).trim()).filter(Boolean) : [];
}

export function isAllUserInstances(
  instanceIds: string[] | undefined,
  instances: WebAccessInstance[],
): boolean {
  const ids = sortedInstanceIds(instanceIds);
  if (!ids.length) return false;
  if (ids.includes('*')) return true;
  const allIds = instances.map((it) => String(it.id || '').trim()).filter(Boolean);
  if (!allIds.length) return false;
  const idSet = new Set(ids);
  return allIds.every((id) => idSet.has(id));
}

export function listUserInstanceLabels(
  instanceIds: string[] | undefined,
  instances: WebAccessInstance[],
  t: (key: string) => string,
): string[] {
  const ids = sortedInstanceIds(instanceIds);
  if (!ids.length) return [];
  if (isAllUserInstances(ids, instances)) return [t('web_user_instances_all')];

  const idSet = new Set(ids);
  const nameById = new Map(
    instances.map((it) => [String(it.id || '').trim(), String(it.name || it.id || '').trim()]),
  );
  const ordered = instances
    .map((it) => String(it.id || '').trim())
    .filter((id) => idSet.has(id));
  const unknown = ids.filter((id) => id !== '*' && !nameById.has(id));
  return [...ordered, ...unknown].map((id) => nameById.get(id) || id);
}

export function formatUserInstances(
  instanceIds: string[] | undefined,
  instances: WebAccessInstance[],
  t: (key: string) => string,
): string {
  const labels = listUserInstanceLabels(instanceIds, instances, t);
  return labels.length ? labels.join(', ') : '—';
}

export function userRoleClass(role: string | undefined): string {
  const r = String(role || 'moderator');
  if (r === 'administrator') return 'access-users-role--admin';
  if (r === 'server_engineer') return 'access-users-role--engineer';
  return 'access-users-role--moderator';
}

export function userRoleIcon(role: string | undefined): AppIconName {
  const r = String(role || 'moderator');
  if (r === 'administrator') return 'supervisor';
  if (r === 'server_engineer') return 'engineering';
  return 'person_shield';
}

export function roleLabel(role: string | undefined, t: (key: string) => string): string {
  const r = String(role || 'moderator');
  const key = ROLE_I18N[r] || 'web_role_moderator';
  return t(key);
}

export function defaultTabsForRole(role: WebUserRole | string): Set<string> {
  const r = String(role || 'moderator');
  if (r === 'administrator') return ADMIN_TABS;
  if (r === 'server_engineer') return new Set(ENGINEER_TABS);
  return new Set(MODERATOR_TABS);
}

export function resolveUserTabs(role: string, preferred?: string[]): string[] {
  if (Array.isArray(preferred) && preferred.length) return normalizeUserTabs(preferred);
  return Array.from(defaultTabsForRole(role));
}

export function tabsDisabledForRole(role: string): boolean {
  return String(role || '') === 'administrator';
}

export function isEnabledAdminUser(user: { role?: string; enabled?: boolean }): boolean {
  return user.role === 'administrator' && user.enabled !== false;
}

export function isLastEnabledAdmin(
  users: { username?: string; role?: string; enabled?: boolean }[],
  username: string,
): boolean {
  const needle = String(username || '').trim().toLowerCase();
  if (!needle) return false;
  const target = users.find((u) => String(u.username || '').trim().toLowerCase() === needle);
  if (!target || !isEnabledAdminUser(target)) return false;
  return users.filter(isEnabledAdminUser).length <= 1;
}

export function localizeWebUserError(err: string, t: (key: string) => string): string {
  const code = String(err || '').trim();
  if (code === 'last_admin') {
    const msg = t('web_last_admin_forbidden');
    return msg !== 'web_last_admin_forbidden' ? msg : code;
  }
  if (code === 'admin_required') {
    const msg = t('web_access_admin_only');
    return msg !== 'web_access_admin_only' ? msg : code;
  }
  const mapped = t(code);
  return mapped !== code ? mapped : code;
}
