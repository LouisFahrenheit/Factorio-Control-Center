import AdmZip from 'adm-zip';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { openLiteZip } from './zip-lite.util';

describe('openLiteZip', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zip-lite-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function buildZip(): string {
    const zip = new AdmZip();
    zip.addFile('my-mod_1.0.0/', Buffer.alloc(0));
    zip.addFile(
      'my-mod_1.0.0/info.json',
      Buffer.from(JSON.stringify({ name: 'my-mod', version: '1.0.0' })),
    );
    zip.addFile(
      'my-mod_1.0.0/locale/ru/strings.cfg',
      Buffer.from('[mod-name]\nmy-mod=Мой мод\n'.repeat(50)),
    );
    // Factorio mods are mostly deflate; method 0 covers stored entries.
    zip.addFile('my-mod_1.0.0/tiny.txt', Buffer.from('abc'));
    const tiny = zip.getEntry('my-mod_1.0.0/tiny.txt');
    if (tiny) tiny.header.method = 0;
    const p = join(dir, 'my-mod_1.0.0.zip');
    zip.writeZip(p);
    return p;
  }

  it('lists file entries without directories', () => {
    const z = openLiteZip(buildZip());
    expect(z).not.toBeNull();
    expect(z!.names.sort()).toEqual([
      'my-mod_1.0.0/info.json',
      'my-mod_1.0.0/locale/ru/strings.cfg',
      'my-mod_1.0.0/tiny.txt',
    ]);
  });

  it('reads deflated and stored entries', () => {
    const z = openLiteZip(buildZip())!;
    const info = JSON.parse(z.readText('my-mod_1.0.0/info.json')) as {
      version: string;
    };
    expect(info.version).toBe('1.0.0');
    expect(z.readText('my-mod_1.0.0/locale/ru/strings.cfg')).toContain(
      'my-mod=Мой мод',
    );
    expect(z.readText('my-mod_1.0.0/tiny.txt')).toBe('abc');
  });

  it('throws for a missing entry', () => {
    const z = openLiteZip(buildZip())!;
    expect(() => z.readText('nope.txt')).toThrow('entry not found');
  });

  it('returns null for a non-zip file', () => {
    const p = join(dir, 'broken.zip');
    writeFileSync(p, Buffer.from('not a zip archive at all'));
    expect(openLiteZip(p)).toBeNull();
  });
});
