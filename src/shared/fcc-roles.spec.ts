import { ALL_ROLES, ROLE_I18N, UserRole } from './fcc-roles';

describe('fcc-roles', () => {
  it('defines the 3 canonical roles', () => {
    expect(ALL_ROLES).toEqual([
      'administrator',
      'server_engineer',
      'moderator',
    ]);
  });

  it('provides i18n translation key mapping for all roles', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_I18N[role]).toBe(`web_role_${role}`);
    }
  });
});
