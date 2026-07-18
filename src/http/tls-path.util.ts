import { existsSync } from 'fs';
import { isAbsolute, resolve } from 'path';

export function resolveTlsPath(raw: string, rootDir: string): string {
  const p = String(raw || '').trim();
  if (!p) return '';
  if (isAbsolute(p)) return resolve(p);
  return resolve(rootDir, p);
}

export function tlsFilesExist(
  certPath: string,
  keyPath: string,
  rootDir: string,
): boolean {
  const cert = resolveTlsPath(certPath, rootDir);
  const key = resolveTlsPath(keyPath, rootDir);
  if (!cert || !key) return false;
  return existsSync(cert) && existsSync(key);
}
