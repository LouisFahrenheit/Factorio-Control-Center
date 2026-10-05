import { describe, it, expect } from 'vitest';
import {
  normalizeGameBindIp,
  resolveGameBindIp,
  validateGameBindIp,
  validateGamePort,
  isNetworkConfigValid,
} from './networkValidation';

describe('networkValidation lib', () => {
  describe('normalizeGameBindIp and resolveGameBindIp', () => {
    it('should trim whitespace', () => {
      expect(normalizeGameBindIp('  127.0.0.1  ')).toBe('127.0.0.1');
      expect(normalizeGameBindIp('')).toBe('');
    });

    it('should resolve empty IP to 0.0.0.0', () => {
      expect(resolveGameBindIp('')).toBe('0.0.0.0');
      expect(resolveGameBindIp('   ')).toBe('0.0.0.0');
      expect(resolveGameBindIp('192.168.1.1')).toBe('192.168.1.1');
    });
  });

  describe('validateGameBindIp', () => {
    it('should allow empty, 0.0.0.0 and ::', () => {
      expect(validateGameBindIp('')).toBeNull();
      expect(validateGameBindIp('0.0.0.0')).toBeNull();
      expect(validateGameBindIp('::')).toBeNull();
    });

    it('should allow valid IPv4 addresses', () => {
      expect(validateGameBindIp('127.0.0.1')).toBeNull();
      expect(validateGameBindIp('192.168.1.100')).toBeNull();
      expect(validateGameBindIp('255.255.255.255')).toBeNull();
    });

    it('should reject invalid IPs', () => {
      expect(validateGameBindIp('256.0.0.1')).toBe('invalid_ip');
      expect(validateGameBindIp('1.2.3')).toBe('invalid_ip');
      expect(validateGameBindIp('not-an-ip')).toBe('invalid_ip');
      expect(validateGameBindIp('1.2.3.4.5')).toBe('invalid_ip');
    });
  });

  describe('validateGamePort', () => {
    it('should accept valid ports 1..65535', () => {
      expect(validateGamePort('34197')).toBeNull();
      expect(validateGamePort('1')).toBeNull();
      expect(validateGamePort('65535')).toBeNull();
      expect(validateGamePort('  8080 ')).toBeNull();
    });

    it('should reject out of range or non-numeric ports', () => {
      expect(validateGamePort('')).toBe('invalid_port');
      expect(validateGamePort('0')).toBe('invalid_port');
      expect(validateGamePort('65536')).toBe('invalid_port');
      expect(validateGamePort('-10')).toBe('invalid_port');
      expect(validateGamePort('abc')).toBe('invalid_port');
      expect(validateGamePort('34197.5')).toBe('invalid_port');
    });
  });

  describe('isNetworkConfigValid', () => {
    it('should return true for valid ip and port combo', () => {
      expect(isNetworkConfigValid('0.0.0.0', '34197')).toBe(true);
      expect(isNetworkConfigValid('127.0.0.1', '27015')).toBe(true);
    });

    it('should return false if either ip or port is invalid', () => {
      expect(isNetworkConfigValid('invalid', '34197')).toBe(false);
      expect(isNetworkConfigValid('0.0.0.0', '70000')).toBe(false);
      expect(isNetworkConfigValid('invalid', '70000')).toBe(false);
    });
  });
});
