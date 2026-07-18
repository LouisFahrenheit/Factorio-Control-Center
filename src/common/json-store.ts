import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';

export function readJsonFile<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback;
    const raw = readFileSync(path, 'utf-8');
    const data = JSON.parse(raw) as T;
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}
