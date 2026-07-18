import { detectServerListModBadges } from './server-list-mod-badges';

describe('detectServerListModBadges', () => {
  it('detects single-mod badges', () => {
    expect(detectServerListModBadges(['Krastorio2'])).toEqual(['krastorio']);
    expect(detectServerListModBadges(['nullius'])).toEqual(['nullius']);
    expect(detectServerListModBadges(['space-exploration'])).toEqual([
      'space_exploration',
    ]);
    expect(detectServerListModBadges(['Ultracube'])).toEqual(['ultracube']);
  });

  it('detects Pyanodons from any suite mod', () => {
    expect(detectServerListModBadges(['pyindustry', 'base'])).toEqual([
      'pyanodons',
    ]);
    expect(detectServerListModBadges(['pyraworesgraphics'])).toEqual([
      'pyanodons',
    ]);
  });

  it('detects Angel mods by prefix', () => {
    expect(detectServerListModBadges(['angelsrefining'])).toEqual(['angels']);
    expect(
      detectServerListModBadges(['angelspetrochem', 'angelssmelting']),
    ).toEqual(['angels']);
  });

  it('returns badges in stable order without duplicates', () => {
    expect(
      detectServerListModBadges([
        'Krastorio2',
        'nullius',
        'angelsrefining',
        'pyindustry',
      ]),
    ).toEqual(['krastorio', 'nullius', 'pyanodons', 'angels']);
  });
});
