import {
  isPrivateIPv4,
  listHostIPv4,
  listLanIPv4,
  listPublicIPv4,
} from './lan-address.util';

describe('lan-address.util', () => {
  describe('isPrivateIPv4', () => {
    it('identifies RFC1918 10.0.0.0/8 addresses as private', () => {
      expect(isPrivateIPv4('10.0.0.1')).toBe(true);
      expect(isPrivateIPv4('10.255.255.255')).toBe(true);
    });

    it('identifies RFC1918 172.16.0.0/12 addresses as private', () => {
      expect(isPrivateIPv4('172.16.0.1')).toBe(true);
      expect(isPrivateIPv4('172.31.255.255')).toBe(true);
      expect(isPrivateIPv4('172.15.0.1')).toBe(false);
      expect(isPrivateIPv4('172.32.0.1')).toBe(false);
    });

    it('identifies RFC1918 192.168.0.0/16 addresses as private', () => {
      expect(isPrivateIPv4('192.168.1.1')).toBe(true);
      expect(isPrivateIPv4('192.168.254.254')).toBe(true);
    });

    it('identifies link-local 169.254.0.0/16 addresses as private', () => {
      expect(isPrivateIPv4('169.254.1.1')).toBe(true);
    });

    it('identifies public IPv4 addresses as non-private', () => {
      expect(isPrivateIPv4('8.8.8.8')).toBe(false);
      expect(isPrivateIPv4('1.1.1.1')).toBe(false);
      expect(isPrivateIPv4('142.250.180.206')).toBe(false);
    });

    it('rejects invalid, malformed or out-of-range IP strings', () => {
      expect(isPrivateIPv4('not.an.ip')).toBe(false);
      expect(isPrivateIPv4('10.0.0')).toBe(false);
      expect(isPrivateIPv4('10.0.0.1.1')).toBe(false);
      expect(isPrivateIPv4('256.0.0.1')).toBe(false);
      expect(isPrivateIPv4('-1.0.0.1')).toBe(false);
    });
  });

  describe('listLanIPv4, listPublicIPv4, and listHostIPv4', () => {
    it('returns arrays of strings without throwing', () => {
      const lan = listLanIPv4();
      const pub = listPublicIPv4();
      const host = listHostIPv4();
      expect(Array.isArray(lan)).toBe(true);
      expect(Array.isArray(pub)).toBe(true);
      expect(Array.isArray(host)).toBe(true);
    });
  });
});
