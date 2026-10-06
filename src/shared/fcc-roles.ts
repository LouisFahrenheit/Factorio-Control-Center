/** User roles supported by Factorio Control Center. */

export const ALL_ROLES = [
  'administrator',
  'server_engineer',
  'moderator',
] as const;

export type UserRole = (typeof ALL_ROLES)[number];

export const ROLE_I18N: Record<UserRole, string> = {
  administrator: 'web_role_administrator',
  server_engineer: 'web_role_server_engineer',
  moderator: 'web_role_moderator',
};
