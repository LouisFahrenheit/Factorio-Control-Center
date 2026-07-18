import type { QueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const SPACE_AGE_MOD_NAMES = new Set(['space-age', 'elevated-rails', 'quality', 'recycler']);

function normalizeModName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

export function modAffectsSpaceAgeMode(name: string): boolean {
  return SPACE_AGE_MOD_NAMES.has(normalizeModName(name));
}

export interface MapGenSchemaResponse {
  ok?: boolean;
  space_age?: boolean;
  planets?: { id: string; previewId: string }[];
}

export async function fetchMapGenSchema(): Promise<MapGenSchemaResponse> {
  const r = await api<MapGenSchemaResponse>('/api/server/map-gen/schema');
  if (r?.ok === false) throw new Error('schema_failed');
  return r;
}

export function mapGenSchemaQueryKey(instanceId: string): readonly ['map-gen', 'schema', string] {
  return ['map-gen', 'schema', instanceId];
}

export async function invalidateSpaceAgeDependentQueries(qc: QueryClient): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['map-gen', 'schema'] }),
    qc.invalidateQueries({ queryKey: ['instances'] }),
  ]);
}
