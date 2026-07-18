import type { AuthUser } from '../types/instance';

export function isAdmin(user: AuthUser | null | undefined): boolean {
  return String(user?.role || '') === 'administrator';
}

export function userHasTab(user: AuthUser | null | undefined, tab: string): boolean {
  const tabs = user?.tabs;
  if (!Array.isArray(tabs)) return false;
  return tabs.includes(tab);
}

export function canEditServerAdminList(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (String(user.role || '') !== 'moderator') return true;
  return userHasTab(user, 'commands');
}

export type PanelTabKey =
  | 'main'
  | 'serverSettings'
  | 'saves'
  | 'mods'
  | 'modpacks'
  | 'commands'
  | 'stats'
  | 'history';

export const PANEL_TABS: { key: PanelTabKey; perm: string; i18n: string; btnId: string; panelId: string }[] = [
  { key: 'main', perm: 'control', i18n: 'web_tab_main', btnId: 'tabBtnMain', panelId: 'tabPanelMain' },
  {
    key: 'serverSettings',
    perm: 'serverSettings',
    i18n: 'settings_btn',
    btnId: 'tabBtnServerSettings',
    panelId: 'tabPanelServerSettings',
  },
  { key: 'saves', perm: 'control', i18n: 'saves_manager_btn', btnId: 'tabBtnSaves', panelId: 'tabPanelSaves' },
  { key: 'mods', perm: 'mods', i18n: 'mods_btn', btnId: 'tabBtnMods', panelId: 'tabPanelMods' },
  {
    key: 'modpacks',
    perm: 'modpacks',
    i18n: 'modpack_tab_modpacks',
    btnId: 'tabBtnModpacks',
    panelId: 'tabPanelModpacks',
  },
  { key: 'commands', perm: 'commands', i18n: 'commands_btn', btnId: 'tabBtnCommands', panelId: 'tabPanelCommands' },
  { key: 'stats', perm: 'players', i18n: 'players_btn', btnId: 'tabBtnStats', panelId: 'tabPanelStats' },
  {
    key: 'history',
    perm: 'history',
    i18n: 'players_tab_history',
    btnId: 'tabBtnHistory',
    panelId: 'tabPanelHistory',
  },
];

export function allowedPanelTabs(user: AuthUser | null | undefined) {
  return PANEL_TABS.filter((t) => userHasTab(user, t.perm));
}
