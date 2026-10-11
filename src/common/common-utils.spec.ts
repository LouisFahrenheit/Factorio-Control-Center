import {
  normalizeGameBindIp,
  resolveGameBindIp,
  isValidGameBindIp,
  isValidGamePort,
} from './network-validation';
import { sanitizeStdinLine, validateBanPlayer } from './ban-sanitize';
import { normalizeBanlistEntries, ensureBanlistFile } from './banlist.util';
import { diffJsonObjects } from './json-diff.util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('common utils', () => {
  describe('network-validation', () => {
    it('normalizeGameBindIp trims input and handles falsy values', () => {
      expect(normalizeGameBindIp('  127.0.0.1  ')).toBe('127.0.0.1');
      expect(normalizeGameBindIp('')).toBe('');
      expect(normalizeGameBindIp(null as unknown as string)).toBe('');
      expect(normalizeGameBindIp(undefined as unknown as string)).toBe('');
    });

    it('resolveGameBindIp returns 0.0.0.0 for empty input', () => {
      expect(resolveGameBindIp('')).toBe('0.0.0.0');
      expect(resolveGameBindIp('   ')).toBe('0.0.0.0');
      expect(resolveGameBindIp('192.168.1.10')).toBe('192.168.1.10');
    });

    it('isValidGameBindIp validates IPv4 and IPv6 addresses', () => {
      expect(isValidGameBindIp('')).toBe(true);
      expect(isValidGameBindIp('0.0.0.0')).toBe(true);
      expect(isValidGameBindIp('::')).toBe(true);
      expect(isValidGameBindIp('127.0.0.1')).toBe(true);
      expect(isValidGameBindIp('192.168.0.1')).toBe(true);
      expect(isValidGameBindIp('2001:db8::1')).toBe(true);

      expect(isValidGameBindIp('999.999.999.999')).toBe(false);
      expect(isValidGameBindIp('not-an-ip')).toBe(false);
      expect(isValidGameBindIp('127.0.0.1:34197')).toBe(false);
    });

    it('isValidGamePort checks ports between 1 and 65535', () => {
      expect(isValidGamePort('34197')).toBe(true);
      expect(isValidGamePort('80')).toBe(true);
      expect(isValidGamePort('1')).toBe(true);
      expect(isValidGamePort('65535')).toBe(true);

      expect(isValidGamePort('0')).toBe(false);
      expect(isValidGamePort('65536')).toBe(false);
      expect(isValidGamePort('-1')).toBe(false);
      expect(isValidGamePort('abc')).toBe(false);
      expect(isValidGamePort('')).toBe(false);
      expect(isValidGamePort('34197.5')).toBe(false);
    });
  });

  describe('ban-sanitize', () => {
    it('sanitizeStdinLine strips line breaks and control characters and collapses whitespace', () => {
      const raw = '  hello\nworld\twith   multiple spaces  ';
      const clean = sanitizeStdinLine(raw);
      expect(clean).toBe('hello world with multiple spaces');
    });

    it('sanitizeStdinLine truncates lines longer than 512 characters', () => {
      const long = 'a'.repeat(600);
      const clean = sanitizeStdinLine(long);
      expect(clean.length).toBe(512);
    });

    it('validateBanPlayer validates player name', () => {
      expect(validateBanPlayer('')).toEqual({ error: 'empty' });
      expect(validateBanPlayer('   ')).toEqual({ error: 'empty' });
      expect(validateBanPlayer('Alice')).toEqual({ name: 'Alice' });

      const longName = 'x'.repeat(129);
      expect(validateBanPlayer(longName)).toEqual({
        error: 'invalid_ban_player',
      });

      expect(validateBanPlayer('Alice\nBob')).toEqual({
        error: 'invalid_ban_player',
      });
    });
  });

  describe('banlist.util', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-banlist-test-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });

    it('normalizeBanlistEntries normalizes strings and objects and deduplicates by lowercase username', () => {
      const raw = [
        'Player1',
        { username: 'Player2', reason: 'griefing', address: '1.2.3.4' },
        { player: 'Player3', reason: 'spam', ip: '5.6.7.8' },
        'player1', // duplicate
        '',
        null,
      ];

      const entries = normalizeBanlistEntries(raw);
      expect(entries).toHaveLength(3);
      expect(entries[0]).toEqual({
        username: 'Player1',
        reason: '',
        address: '',
      });
      expect(entries[1]).toEqual({
        username: 'Player2',
        reason: 'griefing',
        address: '1.2.3.4',
      });
      expect(entries[2]).toEqual({
        username: 'Player3',
        reason: 'spam',
        address: '5.6.7.8',
      });
    });

    it('ensureBanlistFile creates empty JSON array file if missing', () => {
      const p = path.join(tempDir, 'server-banlist.json');
      expect(fs.existsSync(p)).toBe(false);

      ensureBanlistFile(p);
      expect(fs.existsSync(p)).toBe(true);
      expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual([]);

      // Second run does not overwrite existing file
      fs.writeFileSync(p, JSON.stringify(['existing']));
      ensureBanlistFile(p);
      expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual(['existing']);
    });
  });

  describe('json-diff.util', () => {
    it('diffJsonObjects computes diffs between objects', () => {
      const before = {
        name: 'Server A',
        max_players: 10,
        tags: ['game'],
      };
      const after = {
        name: 'Server B',
        max_players: 10,
        tags: ['game', 'modded'],
        description: 'New Description',
      };

      const diffs = diffJsonObjects(before, after);
      expect(diffs).toEqual([
        { key: 'name', from: 'Server A', to: 'Server B' },
        { key: 'tags', from: '["game"]', to: '["game","modded"]' },
        { key: 'description', from: '—', to: 'New Description' },
      ]);
    });

    it('diffJsonObjects masks secret keys', () => {
      const before = {
        password: 'old_secret_pass',
        token: '',
        game_password: null,
      };
      const after = {
        password: 'new_secret_pass',
        token: 'new_token',
        game_password: 'room_pass',
      };

      const diffs = diffJsonObjects(before, after);
      expect(diffs).toEqual([
        { key: 'password', from: '***', to: '***' },
        { key: 'token', from: '—', to: '***' },
        { key: 'game_password', from: '—', to: '***' },
      ]);
    });

    it('diffJsonObjects handles null or undefined inputs', () => {
      expect(diffJsonObjects(null, null)).toEqual([]);
      expect(diffJsonObjects({ a: 1 }, undefined)).toEqual([
        { key: 'a', from: '1', to: '—' },
      ]);
    });
  });
});
