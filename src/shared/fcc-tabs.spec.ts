import {
  ALL_TABS,
  ENGINEER_TABS,
  MODERATOR_TABS,
  WEB_USER_TAB_I18N,
  type FccTab,
} from './fcc-tabs';

describe('fcc-tabs', () => {
  it('WEB_USER_TAB_I18N covers every tab exactly once', () => {
    const i18nKeys = Object.keys(WEB_USER_TAB_I18N) as FccTab[];
    expect(i18nKeys.slice().sort()).toEqual([...ALL_TABS].slice().sort());
    for (const tab of ALL_TABS) {
      expect(WEB_USER_TAB_I18N[tab]).toMatch(/^[a-z0-9_]+$/i);
    }
  });

  it('role tab sets only reference known tabs', () => {
    const known = new Set<string>(ALL_TABS);
    for (const tab of [...ENGINEER_TABS, ...MODERATOR_TABS]) {
      expect(known.has(tab)).toBe(true);
    }
  });

  it('engineer and moderator tabs do not overlap', () => {
    const engineer = new Set(ENGINEER_TABS);
    for (const tab of MODERATOR_TABS) {
      expect(engineer.has(tab)).toBe(false);
    }
  });
});
