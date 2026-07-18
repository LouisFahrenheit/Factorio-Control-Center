/** Panel tab ids shared between server auth and client user editor. */

export const ALL_TABS = [
  'control',
  'serverSettings',
  'mods',
  'modpacks',
  'maintenance',
  'commands',
  'players',
  'history',
] as const;

export type FccTab = (typeof ALL_TABS)[number];

export const ENGINEER_TABS: readonly FccTab[] = [
  'control',
  'serverSettings',
  'maintenance',
  'mods',
  'modpacks',
];

export const MODERATOR_TABS: readonly FccTab[] = ['players', 'history'];

/** i18n keys for configurable user tab permissions (client UI). */
export const WEB_USER_TAB_I18N: Record<FccTab, string> = {
  control: 'web_tab_main',
  serverSettings: 'settings_btn',
  maintenance: 'web_tab_maintenance',
  mods: 'mods_btn',
  modpacks: 'modpack_tab_modpacks',
  commands: 'commands_btn',
  players: 'players_btn',
  history: 'players_tab_history',
};
